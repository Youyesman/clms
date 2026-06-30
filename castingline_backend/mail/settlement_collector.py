"""정산서(부금계산서) 첨부 자동 수집기.

지정한 메일함(folder)을 기간 단위로 스캔하여, 등록된 대상 영화(SettlementTargetMovie)의
제목/별칭이 메일 제목·본문·첨부파일명에 포함되면 그 메일의 '모든 첨부'를 저장한다.

- 매칭은 공백/특수문자를 제거한 정규화 비교(_norm)로 수행한다.
- (mail_folder, mail_uid, attachment_index) 유니크라 재스캔해도 중복 저장되지 않는다.
- 월(month)은 기본값으로 메일 수신월(YYYY-MM)을 쓰되, 호출 측에서 override 가능하다.
"""

import re
from datetime import datetime

from django.core.files.base import ContentFile
from django.utils.dateparse import parse_datetime

from . import services
from .models import CollectedSettlement, SettlementTargetMovie


# ── 매칭용 정규화 ──
_NORM_RE = re.compile(r"[^0-9a-z가-힣]")


def _norm(s):
    """소문자화 + 영숫자/한글 외 문자(공백·특수문자) 제거. 매칭 비교용."""
    if not s:
        return ""
    return _NORM_RE.sub("", str(s).lower())


_TAG_RE = re.compile(r"<[^>]+>")


def _strip_html(html):
    if not html:
        return ""
    return _TAG_RE.sub(" ", html)


# ── 인용(이전 메일) 영역 제거 ──
# 답장(Re:)/전달(Fwd:) 메일은 본문 아래에 '내가 보낸 원문'이 인용되어 붙는다.
# 인용부에 수집 대상 영화명이 들어 있으면 잘못 매칭되므로,
# '가장 최근 상대방이 작성한 본문'만 남기고 인용 이력은 잘라낸다.

# HTML: 인용 컨테이너가 시작되는 가장 앞 지점 이후를 모두 제거
_HTML_QUOTE_MARKERS = [
    "gmail_quote",        # Gmail 인용(blockquote 포함 컨테이너)
    "gmail_attr",         # Gmail 인용 머리말("...님이 작성:")
    "<blockquote",        # 표준 인용 블록
    "yahoo_quoted",       # Yahoo
    "x_msg-quote",        # 일부 클라이언트
    "moz-cite-prefix",    # Thunderbird
]

# TEXT(또는 HTML 제거 후): 아래 패턴이 처음 나타나는 위치부터 인용으로 보고 잘라냄.
# HTML 을 태그 제거하면 줄바꿈이 사라지므로 줄 단위가 아니라 '문자열 전체'에서 검색한다.
_TEXT_QUOTE_PATTERNS = [
    re.compile(r"-{2,}\s*원본\s*메일\s*-{2,}"),               # ---------- 원본 메일 ----------
    re.compile(r"-{2,}\s*Original\s*Message\s*-{2,}", re.I),
    re.compile(r"-{2,}\s*Forwarded\s*message\s*-{2,}", re.I),
    re.compile(r"보낸\s*사람\s*[:：]"),                        # Outlook 인용 머리말
    re.compile(r"님이\s*(작성|작성하였습니다)"),               # "...님이 작성:" (Gmail/한메일)
    re.compile(r"\d{4}년\s*\d{1,2}월\s*\d{1,2}일.{0,80}?작성", re.S),
    re.compile(r"On\s.{1,160}?\swrote\s*[:：]", re.I | re.S),  # "On ... wrote:"
]


def _cut_html_quote(html):
    """HTML 구조상 인용 컨테이너(blockquote, gmail_quote 등) 시작 이후를 제거."""
    low = html.lower()
    idx = len(html)
    for mk in _HTML_QUOTE_MARKERS:
        p = low.find(mk)
        if p != -1:
            idx = min(idx, p)
    return html[:idx]


def _cut_quote_text(text):
    """텍스트에서 인용 머리말이 처음 나타나는 지점 이후 + 인용(>) 줄 제거."""
    if not text:
        return ""
    idx = len(text)
    for pat in _TEXT_QUOTE_PATTERNS:
        m = pat.search(text)
        if m and m.start() < idx:
            idx = m.start()
    text = text[:idx]
    # 남은 부분에서 인용 표시(>)로 시작하는 줄이 나오면 그 이후도 제거
    out = []
    for ln in text.splitlines():
        if ln.lstrip().startswith(">"):
            break
        out.append(ln)
    return "\n".join(out)


def _latest_body(text, html):
    """답장/전달 인용을 제외한, 가장 최근 작성 본문만 추출."""
    if html:
        body = _cut_quote_text(_strip_html(_cut_html_quote(html)))
        if body.strip():
            return body
    return _cut_quote_text(text or "")


def _active_targets():
    """활성 대상 영화 + 정규화된 키워드 목록을 반환.

    [{target, movie_id, title, keywords: [(raw, norm)]}]
    """
    out = []
    qs = SettlementTargetMovie.objects.filter(is_active=True).select_related("movie")
    for t in qs:
        kws = []
        for raw in t.keywords():
            n = _norm(raw)
            if len(n) >= 2:  # 너무 짧은 키워드는 오매칭 위험이라 제외
                kws.append((raw, n))
        if kws:
            out.append(
                {
                    "target": t,
                    "movie": t.movie,
                    "title": t.movie.title_ko,
                    "keywords": kws,
                }
            )
    return out


def _match_filename(filename, targets):
    """첨부파일명에서 매칭되는 (target_info, raw_keyword) 반환. 없으면 None."""
    fn = _norm(filename)
    if not fn:
        return None
    for info in targets:
        for raw, kw in info["keywords"]:
            if kw in fn:
                return info, raw
    return None


def _match_filename_all(filename, targets):
    """첨부파일명에 포함된 '모든' 대상 영화를 [(target_info, raw_keyword)] 로 반환.

    한 파일에 여러 영화 정산서가 합쳐진 경우(파일명에 여러 영화명) 영화별로 저장하기 위함.
    """
    fn = _norm(filename)
    if not fn:
        return []
    out = []
    for info in targets:
        for raw, kw in info["keywords"]:
            if kw in fn:
                out.append((info, raw))
                break  # 한 영화당 한 번만
    return out


def _match_text(subject, body, targets):
    """제목>본문에서 첫 매칭되는 (target_info, raw_keyword, where) 반환. 없으면 None."""
    subj_n = _norm(subject)
    body_n = _norm(body)
    for info in targets:
        for raw, kw in info["keywords"]:
            if kw in subj_n:
                return info, raw, "subject"
            if kw in body_n:
                return info, raw, "body"
    return None


# 자동 수집(폴백) 대상이 되는 문서 확장자. 이미지(png/jpg 등)는 정산서 본문이 아니므로 제외.
_DOC_EXTS = (
    ".pdf", ".xls", ".xlsx", ".xlsm", ".doc", ".docx",
    ".hwp", ".hwpx", ".zip", ".csv",
)

# 파일명에서 제거할 정산서 상용어/포맷/날짜(이걸 지우고도 글자가 남으면 '영화명 있음').
# 주의: '세금계산서', '사업자등록증' 등 문서종류 단어는 일부러 제거하지 않는다
#       (그 자체가 영화명이 아닌 잡파일이므로 폴백 대상에서 빠지는 게 맞음).
_NAME_NOISE_RE = re.compile(
    "|".join([
        r"부금\s*계산서", r"부금", r"계산서", r"정산\s*내역", r"정산서", r"정산", r"명세서",
        r"송부", r"전달", r"요청", r"상영작", r"위탁관", r"상영",
        r"디지털", r"atmos", r"dolby", r"screen\s*x", r"스크린\s*엑스", r"imax",
        r"\d+\s*dx", r"\d+\s*d",            # 4DX/2D/3D
        r"주식회사", r"캐스팅라인", r"최종본?", r"수정본?", r"사본", r"copy", r"final",
        r"\d{1,2}\s*월", r"\d{1,2}\s*일", r"\d+",   # 날짜/숫자
    ]),
    re.I,
)


def _is_document(filename):
    return (filename or "").lower().endswith(_DOC_EXTS)


def _filename_has_name(filename):
    """파일명에서 정산서 상용어·날짜·숫자·괄호를 제거하고도 의미있는 글자가 남는지.

    남으면 '파일명에 (대상이 아니더라도) 영화명/고유명이 있다'고 보고 제목/본문 폴백을
    적용하지 않는다. 예) '은혼 6월.pdf' → '은혼' 이 남음 → 본문의 '눈동자'로 오수집 방지.
    """
    s = (filename or "").rsplit(".", 1)[0]
    s = re.sub(r"\([^)]*\)|\[[^\]]*\]", " ", s)  # 괄호 안(관/포맷/회사) 제거
    s = _NAME_NOISE_RE.sub(" ", s)
    return len(_norm(s)) >= 2


def _parse_date(iso):
    if not iso:
        return None
    try:
        return parse_datetime(iso)
    except Exception:
        return None


def _month_of(dt, fallback_month):
    if fallback_month:
        return fallback_month
    if dt:
        return dt.strftime("%Y-%m")
    return datetime.now().strftime("%Y-%m")


def _date_in_range(dt, since, until):
    """dt(aware/naive) 가 [since, until] 안에 있는지. since/until 은 date 문자열(YYYY-MM-DD) 또는 None."""
    if dt is None:
        return True
    d = dt.date()
    if since and d < since:
        return False
    if until and d > until:
        return False
    return True


def _to_date(s):
    if not s:
        return None
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except Exception:
        return None


def resolve_folder(folder):
    """입력 folder 가 IMAP 와이어 이름이 아니면 display 명으로 매칭해 와이어 이름으로 변환."""
    if not folder:
        return "INBOX"
    try:
        folders = services.list_folders()
    except Exception:
        return folder
    names = {f["name"] for f in folders}
    if folder in names:
        return folder
    for f in folders:
        if f["display"] == folder or f["display"].strip() == folder.strip():
            return f["name"]
    return folder


def save_collected(
    folder, uid, index, movie, movie_title, month,
    matched_keyword="", matched_in="", msg=None,
):
    """첨부 1개를 받아 CollectedSettlement 로 저장.

    반환: "duplicate"(이미 수집됨) | "notfound"(첨부 없음) | CollectedSettlement(성공).
    자동수집(scan)과 수동수집(뷰)에서 공통 사용.
    """
    if CollectedSettlement.objects.filter(
        mail_folder=folder,
        mail_uid=uid,
        attachment_index=index,
        movie=movie,
    ).exists():
        return "duplicate"
    fetched = services.get_attachment(folder, uid, index)
    if not fetched:
        return "notfound"
    filename, content_type, payload = fetched
    if msg is None:
        msg = services.get_message(folder, uid) or {}
    dt = _parse_date(msg.get("date"))
    rec = CollectedSettlement(
        movie=movie,
        movie_title=movie_title or (movie.title_ko if movie else ""),
        month=month or _month_of(dt, None),
        matched_keyword=matched_keyword,
        matched_in=matched_in,
        mail_folder=folder,
        mail_uid=uid,
        mail_subject=(msg.get("subject", "") or "")[:500],
        mail_from=(msg.get("from", "") or "")[:255],
        mail_date=dt,
        attachment_index=index,
        filename=filename[:500],
        content_type=(content_type or "")[:120],
        size=len(payload),
    )
    rec.file.save(filename, ContentFile(payload), save=False)
    rec.save()
    return rec


def scan_folder(folder, since=None, until=None, month=None, max_messages=2000):
    """folder 를 스캔해 매칭 메일의 모든 첨부를 저장.

    Args:
        folder: IMAP 와이어 이름 또는 display 명.
        since/until: "YYYY-MM-DD" 문자열(포함). None 이면 제한 없음.
        month: 저장 월("YYYY-MM") 강제 지정. None 이면 메일 수신월.
        max_messages: 안전장치(스캔 상한).

    Returns:
        dict 통계 + saved 레코드 요약 리스트.
    """
    folder = resolve_folder(folder)
    since_d = _to_date(since)
    until_d = _to_date(until)
    targets = _active_targets()

    stats = {
        "folder": folder,
        "scanned": 0,
        "matched": 0,
        "saved": 0,
        "skipped_duplicate": 0,
        "matched_no_attachment": 0,
        "saved_items": [],
    }
    if not targets:
        stats["error"] = "활성화된 대상 영화가 없습니다. 먼저 대상 영화를 등록하세요."
        return stats

    # 헤더 목록을 최신순으로 페이지네이션하며 기간 안의 uid 만 수집.
    page = 1
    page_size = 100
    uids_in_range = []
    stop = False
    while not stop and len(uids_in_range) < max_messages:
        resp = services.list_messages(folder, page=page, page_size=page_size)
        results = resp.get("results", [])
        if not results:
            break
        for m in results:
            dt = _parse_date(m.get("date"))
            # 최신순이므로 since 보다 과거가 나오면 이후는 더 볼 필요 없음
            if since_d and dt is not None and dt.date() < since_d:
                stop = True
                break
            if _date_in_range(dt, since_d, until_d):
                uids_in_range.append(m["uid"])
        if resp.get("page", page) * page_size >= resp.get("total", 0):
            break
        page += 1

    # 각 메일 상세를 받아 매칭 → 첨부 저장
    for uid in uids_in_range:
        if stats["scanned"] >= max_messages:
            break
        stats["scanned"] += 1
        try:
            msg = services.get_message(folder, uid)
        except Exception:
            continue
        if not msg:
            continue

        attachments = msg.get("attachments", [])
        # 답장/전달 메일의 인용된 이전 내용(내가 보낸 원문 등)은 제외하고
        # 가장 최근 작성된 본문만 매칭 대상으로 사용한다.
        body = _latest_body(msg.get("text") or "", msg.get("html") or "")

        # ── 첨부 → 영화 배정 ──
        # 1) 첨부파일명을 최우선으로 영화에 매칭(한 메일에 여러 영화가 와도 분리 저장).
        #    한 파일에 여러 영화명이 들어있으면 그 영화들 모두에 저장한다.
        # index -> [(movie, title, raw_kw, where), ...]
        assignments = {}
        for att in attachments:
            ms = _match_filename_all(att.get("filename", ""), targets)
            if ms:
                assignments[att["index"]] = [
                    (info["movie"], info["title"], raw_kw, "filename")
                    for info, raw_kw in ms
                ]

        # 2) 제목/본문 폴백: '파일명에 영화명이 없는' 첨부에만 적용.
        #    파일명에 (대상이 아니더라도) 영화명이 있으면 그 첨부는 다른 영화의 것이므로
        #    제목/본문으로 엉뚱하게 배정하지 않는다. (예: '은혼 6월.pdf' 를 본문의 '눈동자'로
        #    잘못 수집하던 문제 방지)
        th = _match_text(msg.get("subject", ""), body, targets)
        if th:
            info, raw_kw, where = th
            if not attachments:
                stats["matched"] += 1
                stats["matched_no_attachment"] += 1
                continue
            for att in attachments:
                idx = att["index"]
                if idx in assignments:
                    continue
                fn = att.get("filename", "")
                if not _is_document(fn):
                    continue  # 이미지 등은 정산서 본문이 아니므로 폴백 제외
                if _filename_has_name(fn):
                    continue  # 파일명에 영화명/고유명이 있음 → 제목/본문 폴백 미적용
                assignments[idx] = [(info["movie"], info["title"], raw_kw, where)]

        if not assignments:
            continue

        stats["matched"] += 1
        dt = _parse_date(msg.get("date"))
        save_month = _month_of(dt, month)

        for att in attachments:
            idx = att["index"]
            if idx not in assignments:
                continue  # 대상 영화와 무관한 첨부(사업자등록증 등)는 자동수집 제외
            for movie, movie_title, raw_kw, where in assignments[idx]:
                res = save_collected(
                    folder, uid, idx, movie, movie_title, save_month,
                    raw_kw, where, msg=msg,
                )
                if res == "duplicate":
                    stats["skipped_duplicate"] += 1
                    continue
                if res == "notfound":
                    continue
                stats["saved"] += 1
                stats["saved_items"].append(
                    {
                        "id": res.id,
                        "movie_title": res.movie_title,
                        "month": res.month,
                        "filename": res.filename,
                        "matched_in": res.matched_in,
                        "matched_keyword": res.matched_keyword,
                    }
                )

    return stats
