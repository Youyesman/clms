"""IMAP 메일함 조회 서비스.

네이버 IMAP(imap.naver.com:993, SSL)에 접속해 폴더/메일 목록/본문/첨부를 읽는다.
모든 SELECT 는 readonly=True 로 수행하므로 메일함 상태(읽음표시 등)를 변경하지 않는다.
요청마다 연결을 새로 맺고 닫는 stateless 방식이다.
"""

import base64
import email
import imaplib
import re
import threading
from email.header import decode_header, make_header
from email.utils import parsedate_to_datetime

from django.conf import settings


# ──────────────────────────────────────────────────────────────────────────
# IMAP modified UTF-7 (RFC 3501 §5.1.3) 인코딩/디코딩
#   네이버 한글 폴더명("받은메일함" 등)은 modified UTF-7 로 인코딩되어 있다.
# ──────────────────────────────────────────────────────────────────────────
def imap_utf7_encode(text):
    """일반 문자열 → IMAP modified UTF-7 (폴더 SELECT 시 사용)."""
    res = []
    buf = ""

    def _flush():
        nonlocal buf
        if buf:
            b = base64.b64encode(buf.encode("utf-16-be")).decode("ascii")
            res.append("&" + b.replace("/", ",").rstrip("=") + "-")
            buf = ""

    for ch in text:
        o = ord(ch)
        if ch == "&":
            _flush()
            res.append("&-")
        elif 0x20 <= o <= 0x7E:
            _flush()
            res.append(ch)
        else:
            buf += ch
    _flush()
    return "".join(res)


def imap_utf7_decode(data):
    """IMAP modified UTF-7 → 일반 문자열 (폴더명 표시 시 사용)."""
    if isinstance(data, bytes):
        data = data.decode("ascii", errors="replace")
    res = []
    i, n = 0, len(data)
    while i < n:
        ch = data[i]
        if ch == "&":
            j = data.find("-", i)
            if j == -1:
                j = n
            chunk = data[i + 1:j]
            if chunk == "":
                res.append("&")
            else:
                b = chunk.replace(",", "/")
                b += "=" * (-len(b) % 4)
                try:
                    res.append(base64.b64decode(b).decode("utf-16-be"))
                except Exception:
                    res.append(data[i:j + 1])
            i = j + 1
        else:
            res.append(ch)
            i += 1
    return "".join(res)


def _dh(value):
    """MIME encoded-word(=?utf-8?B?...?=) 헤더를 사람이 읽을 수 있는 문자열로 디코딩."""
    if not value:
        return ""
    try:
        return str(make_header(decode_header(value)))
    except Exception:
        return str(value)


def _iso_date(value):
    """RFC2822 Date 헤더를 ISO 8601 문자열로. 실패 시 원본 반환."""
    if not value:
        return ""
    try:
        return parsedate_to_datetime(value).isoformat()
    except Exception:
        return value


# ── IMAP 연결 풀링 ──
# 네이버 IMAP 은 짧은 시간에 로그인이 잦으면 "UserAuth Server Is Checking" 으로
# 일시 차단한다. 요청마다 새 로그인하지 않도록 연결 하나를 재사용한다.
# (IMAP 연결은 스레드 안전하지 않으므로 락으로 직렬화)
_conn_lock = threading.RLock()
_conn = {"imap": None}


def _new_connection():
    cfg = settings.MAIL_IMAP
    conn = imaplib.IMAP4_SSL(cfg["HOST"], cfg["PORT"])
    conn.login(cfg["USER"], cfg["PASSWORD"])
    return conn


def _get_connection():
    c = _conn["imap"]
    if c is not None:
        try:
            c.noop()  # 살아있으면 재사용 (로그인 안 함)
            return c
        except Exception:
            try:
                c.logout()
            except Exception:
                pass
            _conn["imap"] = None
    c = _new_connection()
    _conn["imap"] = c
    return c


def _drop_connection():
    c = _conn["imap"]
    _conn["imap"] = None
    if c is not None:
        try:
            c.logout()
        except Exception:
            pass


def _with_imap(fn):
    """공유 IMAP 연결로 fn(conn) 실행. 연결이 끊긴 경우(abort)만 1회 재연결 후 재시도.

    인증 차단(throttle) 같은 오류는 재시도하지 않고 그대로 올린다(로그인 폭주 방지).
    """
    with _conn_lock:
        try:
            return fn(_get_connection())
        except (imaplib.IMAP4.abort, OSError):
            _drop_connection()
            return fn(_get_connection())


def _select(conn, folder):
    # folder 는 list_folders() 가 돌려준 IMAP 와이어 이름(이미 modified UTF-7)이므로
    # 재인코딩하지 않고 그대로 SELECT 한다. (재인코딩하면 한글 폴더명이 깨져 SELECT 실패)
    mb = folder or "INBOX"
    typ, data = conn.select('"%s"' % mb, readonly=True)
    if typ != "OK":
        detail = (data[0].decode(errors="replace") if data and data[0] else "")
        raise RuntimeError(f"폴더 선택 실패({folder}): {detail}")


# ── FETCH 응답 파싱용 정규식 ──
_UID_RE = re.compile(rb"UID (\d+)")
_FLAGS_RE = re.compile(rb"FLAGS \(([^)]*)\)")
_SIZE_RE = re.compile(rb"RFC822\.SIZE (\d+)")
_LIST_RE = re.compile(rb'^\((?P<flags>[^)]*)\) "?(?P<delim>[^" ]*)"? (?P<name>.+)$')


def list_folders():
    """메일함 폴더 목록. [{name(원본 utf7), display(디코딩), flags}] (선택 가능한 폴더만)."""
    def _do(conn):
        typ, boxes = conn.list()
        folders = []
        for raw in boxes or []:
            if not raw:
                continue
            m = _LIST_RE.match(raw if isinstance(raw, bytes) else str(raw).encode())
            if not m:
                continue
            flags = m.group("flags").decode("ascii", errors="replace")
            if "\\Noselect" in flags:
                continue
            name = m.group("name").decode("ascii", errors="replace").strip().strip('"')
            folders.append({
                "name": name,
                "display": imap_utf7_decode(name),
                "flags": flags,
            })
        return folders
    return _with_imap(_do)


def _parse_list_fetch(fetched):
    """uid('fetch', ...) 응답을 {uid: {flags, size, header_bytes}} 로 파싱.

    서버(네이버)는 한 메일을 tuple(meta, header_bytes) + bytes(나머지 meta) 두 조각으로
    나눠 보내며, UID/FLAGS/SIZE 가 어느 쪽에 올지는 정해져 있지 않다.
    그래서 tuple 의 meta 와 바로 뒤따르는 bytes 조각을 합쳐 메타데이터를 추출한다.
    """
    out = {}

    def _finalize(meta, header):
        um = _UID_RE.search(meta)
        if not um:
            return
        uid = int(um.group(1))
        fm = _FLAGS_RE.search(meta)
        sm = _SIZE_RE.search(meta)
        out[uid] = {
            "flags": fm.group(1) if fm else b"",
            "size": int(sm.group(1)) if sm else 0,
            "header": header,
        }

    pending = None  # (meta, header)
    for item in fetched or []:
        if isinstance(item, tuple) and len(item) >= 2:
            if pending is not None:
                _finalize(pending[0], pending[1])
            pending = (item[0] or b"", item[1] or b"")
        elif isinstance(item, (bytes, bytearray)):
            if pending is not None:
                _finalize(pending[0] + b" " + bytes(item), pending[1])
                pending = None
    if pending is not None:
        _finalize(pending[0], pending[1])
    return out


def list_messages(folder="INBOX", page=1, page_size=30):
    """폴더 내 메일을 최신순으로 페이지네이션해서 헤더만 반환."""
    page = max(1, int(page))
    page_size = max(1, min(100, int(page_size)))

    def _do(conn):
        _select(conn, folder)
        typ, data = conn.uid("search", None, "ALL")
        uids = data[0].split() if data and data[0] else []
        total = len(uids)

        # 최신순: 뒤에서부터 슬라이스
        start = max(0, total - page * page_size)
        end = max(0, total - (page - 1) * page_size)
        page_uids = uids[start:end][::-1]

        results = []
        if page_uids:
            uid_set = b",".join(page_uids)
            typ, fetched = conn.uid(
                "fetch",
                uid_set,
                "(FLAGS RFC822.SIZE BODY.PEEK[HEADER.FIELDS (SUBJECT FROM TO DATE)])",
            )
            parsed = _parse_list_fetch(fetched)
            for u in page_uids:
                uid = int(u)
                info = parsed.get(uid)
                if not info:
                    continue
                msg = email.message_from_bytes(info["header"])
                results.append({
                    "uid": uid,
                    "subject": _dh(msg.get("Subject")),
                    "from": _dh(msg.get("From")),
                    "to": _dh(msg.get("To")),
                    "date": _iso_date(msg.get("Date")),
                    "seen": b"\\Seen" in info["flags"],
                    "size": info["size"],
                })
        return {
            "folder": folder,
            "page": page,
            "page_size": page_size,
            "total": total,
            "results": results,
        }
    return _with_imap(_do)


def _decode_part(part):
    payload = part.get_payload(decode=True)
    if payload is None:
        return ""
    charset = part.get_content_charset() or "utf-8"
    try:
        return payload.decode(charset, errors="replace")
    except (LookupError, TypeError):
        return payload.decode("utf-8", errors="replace")


def _walk_bodies(msg):
    """메시지에서 (html, text, attachments[]) 추출. attachments index 는 walk() 순번."""
    html, text = None, None
    attachments = []
    for i, part in enumerate(msg.walk()):
        if part.is_multipart():
            continue
        ctype = part.get_content_type()
        disp = str(part.get("Content-Disposition") or "").lower()
        filename = part.get_filename()
        if filename:
            filename = _dh(filename)

        is_attachment = "attachment" in disp or (
            filename and ctype not in ("text/plain", "text/html")
        )
        if is_attachment:
            payload = part.get_payload(decode=True) or b""
            attachments.append({
                "index": i,
                "filename": filename or f"첨부-{i}",
                "content_type": ctype,
                "size": len(payload),
            })
            continue

        if ctype == "text/html" and html is None:
            html = _decode_part(part)
        elif ctype == "text/plain" and text is None:
            text = _decode_part(part)
    return html, text, attachments


def get_message(folder, uid):
    """단일 메일 상세(본문 html/text + 첨부 메타). readonly 라 읽음표시 안 됨."""
    def _do(conn):
        _select(conn, folder)
        typ, data = conn.uid("fetch", str(uid), "(BODY.PEEK[])")
        if not data or not isinstance(data[0], tuple):
            return None
        raw = data[0][1]
        msg = email.message_from_bytes(raw)
        html, text, attachments = _walk_bodies(msg)
        from . import lotte_report
        return {
            "uid": int(uid),
            "subject": _dh(msg.get("Subject")),
            "from": _dh(msg.get("From")),
            "to": _dh(msg.get("To")),
            "cc": _dh(msg.get("Cc")),
            "date": _iso_date(msg.get("Date")),
            "html": html,
            "text": text,
            "attachments": attachments,
            "report_links": lotte_report.find_report_links(
                _dh(msg.get("Subject")), html, text
            ),
        }
    return _with_imap(_do)


def get_attachment(folder, uid, index):
    """첨부파일 1개의 (filename, content_type, bytes) 반환. 없으면 None."""
    def _do(conn):
        _select(conn, folder)
        typ, data = conn.uid("fetch", str(uid), "(BODY.PEEK[])")
        if not data or not isinstance(data[0], tuple):
            return None
        msg = email.message_from_bytes(data[0][1])
        for i, part in enumerate(msg.walk()):
            if i != index:
                continue
            payload = part.get_payload(decode=True) or b""
            filename = _dh(part.get_filename() or f"attachment-{i}")
            return filename, part.get_content_type(), payload
        return None
    return _with_imap(_do)
