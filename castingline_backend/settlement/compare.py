"""직영 체인(CGV/롯데/메가박스) 부금정산서 엑셀 파서 — 정산 대사(비교)용.

각 체인이 배급사에 보내주는 부금 엑셀을 파싱해 극장별
인원/공급가액/부가세/영화사지급금을 집계하고, ManageSettlement 화면(=Score 기반
get_processed_data 집계)과 비교할 수 있는 공통 구조로 변환한다.

양식(2026-06 샘플 기준):
  CGV   : 영화별 시트, 헤더 1행째 — 극장|영화명|정산기간|가격대별|관람객수|…|부금액|부금 부가세|부금총금액
  메가박스: '영화부금 내역' 시트, 헤더 6행째 — 지점명|…|영화명|…|관람객수|…|부금-공급가|부금-부가세
  롯데  : Sheet1, 헤더 4행째 — 배급사|영화명|대표영화관|…|입장객수|…|공급가액|VAT|합계
          (영화관/영화/배급사 소계 행은 배급사 컬럼이 비어 있어 스킵)
"""

import difflib
import math
import re

import pandas as pd


def _num(v):
    """'139,638,782' / '50%' / 12.0 / NaN → int."""
    if v is None:
        return 0
    if isinstance(v, float) and math.isnan(v):
        return 0
    s = str(v).replace(",", "").replace("%", "").strip()
    if not s:
        return 0
    try:
        return int(float(s))
    except ValueError:
        return 0


def _txt(v):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return ""
    return str(v).strip()


def norm_title(s):
    """영화명 비교용 정규화: 공백/특수문자 제거 + 소문자."""
    return re.sub(r"[^0-9a-zA-Z가-힣]", "", str(s or "")).lower()


_DATE_RE = re.compile(r"(20\d{2})[-./년\s]*(\d{1,2})[-./월\s]*(\d{1,2})")


def norm_date(v):
    """'2026-06-30' / '2026.6.30' / '20260630' / datetime → 'YYYY-MM-DD' (실패 시 '')."""
    s = _txt(v)
    m = _DATE_RE.search(s)
    if not m:
        return ""
    return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"


def norm_date_end(v):
    """기간 셀에서 종료일 → 'YYYY-MM-DD' (실패 시 '').

    롯데 상영일자는 '2026-07-01\\n~2026-07-28'처럼 From~To가 한 셀에 오므로
    첫 날짜만 읽으면 시작일이 종료일로 잘못 잡힌다 — 셀 안의 모든 날짜 중
    최댓값을 종료일로 본다. 날짜가 하나뿐인 셀은 그 날짜 그대로."""
    s = _txt(v)
    dates = [f"{y}-{int(m):02d}-{int(d):02d}" for y, m, d in _DATE_RE.findall(s)]
    return max(dates) if dates else ""


FUND_EXEMPT_SUFFIX = "(발전기금면제관)"

# 발전기금면제관을 본 극장과 합치지 않고 '따로' 대사할 극장 (브랜드 접두사 제거 후 이름).
# 부금계산서에는 지점명이 '코엑스' 하나로 오지만, CLMS 거래처·부금정산은
# 메가박스코엑스 / 메가박스코엑스(발전기금면제관) 두 곳으로 나뉘어 있어
# 합쳐서 대사하면 금액이 맞지 않는다.
FUND_EXEMPT_SPLIT_THEATERS = {"코엑스"}


def norm_theater(s, keep_fund_exempt=False):
    """극장명 매칭용 정규화: 상태 접두사·브랜드 접두사·공백 제거 + 소문자.

    예) 'CGV 강남'→'강남', '메가박스홍대(아니메)'→'홍대(아니메)',
        '롯데군산나운'→'군산나운', '(폐관)CGV 시흥'→'시흥'
    발전기금면제관은 시스템에 별도 거래처로 분리돼 있으나 정산서에는 본 극장 하나로
    오므로 기본적으로 접미사를 제거해 본 극장에 합산한다.
    keep_fund_exempt=True 이면 FUND_EXEMPT_SPLIT_THEATERS 에 한해 접미사를 남겨
    본관/면제관을 각각 따로 대사한다.
    """
    s = str(s or "").replace(" ", "")
    s = re.sub(r"^\((폐관|임시중단|휴관)\)", "", s)
    has_exempt = FUND_EXEMPT_SUFFIX in s
    s = s.replace(FUND_EXEMPT_SUFFIX, "")
    for prefix in ("CGV", "cgv", "메가박스", "롯데시네마", "롯데", "씨네큐", "CINEQ", "cineq"):
        if s.startswith(prefix):
            s = s[len(prefix):]
            break
    base = s.lower()
    if keep_fund_exempt and has_exempt and base in FUND_EXEMPT_SPLIT_THEATERS:
        return base + FUND_EXEMPT_SUFFIX
    return base


# ── 상영 포맷 버킷 ──
# 부금 대사를 (극장, 포맷) 단위로 쪼개기 위한 정규화. 파일 영화명("백룸(4DX SOUNDX 2D)",
# "백룸(DOLBY ATMOS mix 2D)")과 시스템 상영타입("디지털 2D 4-DX", "디지털 2D ATMOS Dolby")
# 양쪽에서 핵심 특수관 토큰만 뽑아 같은 버킷으로 맞춘다. (SOUNDX/Dolby/mix 등 수식어 무시)
# 포맷을 식별할 수 있는 체인만 포맷 분리 — CGV는 영화명 괄호 표기, 메가박스는
# 상영종류 컬럼(screen_kind). 롯데 정산서는 포맷 정보가 아예 없어 극장 단위 유지.
FORMAT_SPLIT_CHAINS = {"CGV", "메가박스"}

_FORMAT_TOKEN_PATTERNS = [
    ("4DX", re.compile(r"4\s*-?\s*DX", re.I)),
    ("IMAX", re.compile(r"IMAX", re.I)),
    ("SCREENX", re.compile(r"SCREEN\s*X", re.I)),
    ("SPHEREX", re.compile(r"SPHERE\s*X", re.I)),
    ("ATMOS", re.compile(r"ATMOS", re.I)),
    ("3D", re.compile(r"3\s*D", re.I)),
]

# 체인별로 버킷에서 무시할 토큰. 메가박스는 시스템 스코어가 ATMOS 상영분을 부분적으로만
# 분류해(같은 극장에서 일부는 2D 하위영화로 적재) 분리 시 가짜 인원차 불일치가 생기므로
# 기본관에 합산한다 — 부율/금액이 동일해 대사 정확도 손실 없음 (사용자 확정 2026-07-12).
_CHAIN_IGNORED_TOKENS = {"메가박스": {"ATMOS"}}


def format_bucket(text, chain=None):
    """상영타입/파일 영화명 → 포맷 버킷 문자열. 특수관 토큰이 없으면 '2D'(기본관)."""
    ignored = _CHAIN_IGNORED_TOKENS.get(chain, ())
    tokens = [name for name, pat in _FORMAT_TOKEN_PATTERNS
              if name not in ignored and pat.search(str(text or ""))]
    return " ".join(tokens) if tokens else "2D"


# 파일 극장명 → 시스템 극장명 병합 규칙 (norm_theater 정규화 키 기준).
# CGV 부금정산서의 씨네드쉐프 지점은 해당 CGV 지점 실적에 합산해 대사한다. (사용자 확정)
FILE_THEATER_MERGE = {
    "씨네드쉐프센텀": "센텀시티",        # → CGV 센텀시티
    "씨네드쉐프압구정": "압구정",        # → CGV 압구정
    "씨네드쉐프용산": "용산아이파크몰",  # → CGV 용산아이파크몰
}


def _find_header_row(df, first_cell, must_contain):
    """앞쪽 행에서 헤더 행 번호를 찾는다. (first_cell 일치 + must_contain 포함)"""
    for i in range(min(10, len(df))):
        row = [_txt(v) for v in df.iloc[i].tolist()]
        if row and row[0] == first_cell and all(any(m in c for c in row) for m in must_contain):
            return i
    return None


def _col_idx(header_cells, name):
    """헤더 셀 목록에서 name이 포함된 컬럼 인덱스."""
    for j, c in enumerate(header_cells):
        if name in c:
            return j
    raise KeyError(f"컬럼 '{name}' 을 찾을 수 없습니다.")


def parse_settlement_excel(file):
    """체인 자동 감지 + 파싱 → {chain, rows}.

    rows: [{theater, movie, visitors, supply, vat, payout}] (엑셀 원본 행 단위)
    """
    sheets = pd.read_excel(file, sheet_name=None, header=None)

    for sheet_name, df in sheets.items():
        if df.empty:
            continue
        # CGV: 헤더 1행째 (극장 | ... | 가격대별 | ... | 부금총금액)
        hi = _find_header_row(df, "극장", ["가격대별", "부금액"])
        if hi is not None:
            return {"chain": "CGV", "rows": _parse_cgv(sheets)}
        # 메가박스: 지점명 헤더
        hi = _find_header_row(df, "지점명", ["관람객수", "부금-공급가"])
        if hi is not None:
            return {"chain": "메가박스", "rows": _parse_megabox(df, hi)}
        # 롯데: 배급사 헤더
        hi = _find_header_row(df, "배급사", ["공급가액", "VAT", "입장객수"])
        if hi is not None:
            return {"chain": "롯데", "rows": _parse_lotte(df, hi)}

    raise ValueError("지원하지 않는 부금정산서 양식입니다. (CGV/롯데/메가박스 직영 엑셀만 지원)")


def _parse_cgv(sheets):
    """CGV: 모든 시트(영화별) 파싱. 공급가=부금액, 부가세=부금 부가세, 지급금=부금총금액."""
    rows = []
    for _sheet_name, df in sheets.items():
        if df.empty:
            continue
        hi = _find_header_row(df, "극장", ["가격대별", "부금액"])
        if hi is None:
            continue
        header = [_txt(v) for v in df.iloc[hi].tolist()]
        c_theater = _col_idx(header, "극장")
        c_movie = _col_idx(header, "영화명")
        c_vis = _col_idx(header, "관람객수")
        c_supply = _col_idx(header, "부금액")
        c_vat = _col_idx(header, "부금 부가세")
        c_payout = _col_idx(header, "부금총금액")
        c_date = _col_idx(header, "정산기간(From)")
        c_date_end = _col_idx(header, "정산기간(To)")
        c_fare = _col_idx(header, "가격대별")

        for i in range(hi + 1, len(df)):
            row = df.iloc[i]
            theater = _txt(row.iloc[c_theater])
            if not theater or "합계" in theater or "소계" in theater:
                continue
            rows.append({
                "theater": theater,
                "movie": _txt(row.iloc[c_movie]),
                "date": _txt(row.iloc[c_date]),
                "date_end": _txt(row.iloc[c_date_end]),
                "fare": _num(row.iloc[c_fare]),
                "visitors": _num(row.iloc[c_vis]),
                "supply": _num(row.iloc[c_supply]),
                "vat": _num(row.iloc[c_vat]),
                "payout": _num(row.iloc[c_payout]),
            })
    return rows


def _parse_megabox(df, hi):
    """메가박스: 공급가=부금-공급가, 부가세=부금-부가세, 지급금=합산.

    상영종류 컬럼('2D(자막)'/'2D ATMOS(자막)' 등)을 screen_kind로 보존 — 포맷 분리 대사용.
    """
    header = [_txt(v) for v in df.iloc[hi].tolist()]
    c_theater = _col_idx(header, "지점명")
    c_kind = _col_idx(header, "상영종류")
    c_movie = _col_idx(header, "영화명")
    c_date = _col_idx(header, "상영시작일")
    c_date_end = _col_idx(header, "상영종료일")
    c_fare = _col_idx(header, "티켓금액")
    c_danga = _col_idx(header, "부가단가")  # 기금차감 단가 (면제관은 티켓금액 그대로)
    c_vis = _col_idx(header, "관람객수")
    c_supply = _col_idx(header, "부금-공급가")
    c_vat = _col_idx(header, "부금-부가세")

    rows = []
    for i in range(hi + 1, len(df)):
        row = df.iloc[i]
        theater = _txt(row.iloc[c_theater])
        if not theater or "합계" in theater or "소계" in theater:
            continue
        supply = _num(row.iloc[c_supply])
        vat = _num(row.iloc[c_vat])
        fare = _num(row.iloc[c_fare])
        danga = _num(row.iloc[c_danga])
        # 발전기금면제관 판별: 부가단가(순매티켓-기금)가 티켓금액(순매출)과 같으면
        # 기금이 빠지지 않은 것 = 면제관 상영분. 정산서는 지점명이 하나로 오므로
        # 여기서 접미사를 붙여 본관/면제관을 갈라 놓는다. (대상 극장만)
        if (fare > 0 and danga == fare
                and norm_theater(theater) in FUND_EXEMPT_SPLIT_THEATERS):
            theater = theater + FUND_EXEMPT_SUFFIX

        rows.append({
            "theater": theater,
            "movie": _txt(row.iloc[c_movie]),
            "screen_kind": _txt(row.iloc[c_kind]),
            "date": _txt(row.iloc[c_date]),
            "date_end": _txt(row.iloc[c_date_end]),
            "fare": fare,
            "danga": danga,
            "visitors": _num(row.iloc[c_vis]),
            "supply": supply,
            "vat": vat,
            "payout": supply + vat,
        })
    return rows


def _parse_lotte(df, hi):
    """롯데: 인원=입장객수, 공급가=공급가액, 부가세=VAT, 지급금=합계.

    소계 행(영화관/영화/배급사 소계)은 배급사 컬럼이 비어 있어 자동 스킵된다.
    """
    header = [_txt(v) for v in df.iloc[hi].tolist()]
    c_dist = _col_idx(header, "배급사")
    c_movie = _col_idx(header, "영화명")
    c_theater = _col_idx(header, "대표영화관")
    c_date = _col_idx(header, "상영일자")
    c_fare = _col_idx(header, "발권금액")
    c_vis = _col_idx(header, "입장객수")
    c_supply = _col_idx(header, "공급가액")
    c_vat = _col_idx(header, "VAT")
    c_payout = _col_idx(header, "합계")

    rows = []
    for i in range(hi + 1, len(df)):
        row = df.iloc[i]
        if not _txt(row.iloc[c_dist]):  # 소계/빈 행
            continue
        theater = _txt(row.iloc[c_theater])
        if not theater:
            continue
        rows.append({
            "theater": theater,
            "movie": _txt(row.iloc[c_movie]),
            "date": _txt(row.iloc[c_date]),
            "fare": _num(row.iloc[c_fare]),
            "visitors": _num(row.iloc[c_vis]),
            "supply": _num(row.iloc[c_supply]),
            "vat": _num(row.iloc[c_vat]),
            "payout": _num(row.iloc[c_payout]),
        })
    return rows


# ── PDF(AI) 극장명 → 거래처 결정적 폴백 매칭 (A002/A003, 0902) ──
# 정규화 극장명 정확 일치에 실패한 극장을 AI 이름 매칭에 보내기 전에, 규칙으로
# 확실히 잡을 수 있는 경우를 먼저 처리한다. 사례:
#   · 시흥정왕(메가박스 위탁) PDF — 한글 텍스트가 추출되지 않아 극장명이 빈 값.
#     힌트에 사업자번호 220-85-46233 만 남음 → 거래처 사업자번호로 매칭
#   · 곡성작은영화관 팩스 PDF — 파일명이 '고성…' 이라 AI 가 '고성작은영화관'으로
#     읽음 → 시스템 '곡성작은영화관' 과 한 글자 차이(유사도 0.86) → 유사도 매칭
# 오매칭 방지: 파일명·유사도 매칭은 '그 달 해당 영화 실적이 있는 거래처'(month_client_ids)
# 로 후보를 제한한다 (예: 파일명 '고성…' 이 'CGV 고성' 에 붙는 사고 방지).
_BIZ_NO_RE = re.compile(r"(\d{3})\s*-?\s*(\d{2})\s*-?\s*(\d{5})")
FUZZY_THEATER_RATIO = 0.8


def _norm_stem(filename):
    """파일명(확장자 제거)을 극장명 포함 비교용으로 정규화."""
    stem = re.sub(r"\.[A-Za-z0-9]+$", "", str(filename or ""))
    return re.sub(r"\s+", "", stem).lower()


def _narrow(cands, chain, month_client_ids):
    """동명/다중 후보를 체인 → 월 실적 순으로 좁힌다 (좁혀지지 않으면 원래 목록)."""
    if len(cands) > 1 and chain and chain != "불명":
        filt = [c for c in cands if (c.theater_kind or "") == chain]
        cands = filt or cands
    if len(cands) > 1 and month_client_ids:
        filt = [c for c in cands if c.id in month_client_ids]
        cands = filt or cands
    return cands


def resolve_theater_fallback(theater_name, hint_text, filename, chain, clients, month_client_ids,
                             tie_breaker=None):
    """정확 일치 실패 극장의 규칙 매칭. 반환: Client 또는 None (→ AI 매칭으로).

    ① 사업자번호: hint 에서 000-00-00000 을 찾아 거래처 사업자번호와 대조.
       유일하면 채택(강한 신호), 여러 곳이 같은 번호면 체인·월 실적으로 좁혀 유일할 때만.
    ② 파일명 포함: 정규화 파일명이 거래처 정규화명(2자 이상)을 포함 — 가장 긴 이름.
       월 실적 거래처에 한함.
    ③ 유사도: 정규화명 difflib 유사도 ≥ FUZZY_THEATER_RATIO, 월 실적 거래처에 한함.
       후보가 여럿이면 tie_breaker(후보들) — 파일 금액(인원/지급금)과 시스템 값이
       일치하는 극장 — 로 판별하고, 그래도 못 가리면 최고점이 유일할 때만 채택.
       (곡성/보성/고흥작은영화관처럼 한 글자 차이 극장이 동점인 경우 대비)
    """
    # ① 사업자번호
    biz_nos = {"".join(m) for m in _BIZ_NO_RE.findall(str(hint_text or ""))}
    if biz_nos:
        cands = [c for c in clients
                 if (c.business_registration_number or "").replace("-", "").strip() in biz_nos]
        cands = _narrow(cands, chain, month_client_ids)
        if len(cands) == 1:
            return cands[0]

    if not month_client_ids:
        return None
    month_clients = [c for c in clients if c.id in month_client_ids]

    # ② 파일명 포함
    stem = _norm_stem(filename)
    if stem:
        hits = [(len(norm_theater(c.client_name)), c) for c in month_clients
                if len(norm_theater(c.client_name)) >= 2 and norm_theater(c.client_name) in stem]
        if hits:
            top = max(h[0] for h in hits)
            cands = _narrow([c for n, c in hits if n == top], chain, month_client_ids)
            if len(cands) == 1:
                return cands[0]
            if len(cands) > 1 and tie_breaker is not None:
                c = tie_breaker(cands)
                if c is not None:
                    return c

    # ③ 유사도
    target = norm_theater(theater_name)
    if len(target) >= 3:
        scored = sorted(
            ((difflib.SequenceMatcher(None, target, norm_theater(c.client_name)).ratio(), c)
             for c in month_clients), key=lambda x: -x[0])
        scored = [sc for sc in scored if sc[0] >= FUZZY_THEATER_RATIO]
        if len(scored) == 1:
            return scored[0][1]
        if len(scored) > 1:
            if tie_breaker is not None:
                c = tie_breaker([c for _, c in scored])
                if c is not None:
                    return c
            if scored[1][0] < scored[0][0]:
                return scored[0][1]
    return None
