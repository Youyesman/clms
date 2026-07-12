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


def norm_theater(s):
    """극장명 매칭용 정규화: 상태 접두사·브랜드 접두사·공백 제거 + 소문자.

    예) 'CGV 강남'→'강남', '메가박스홍대(아니메)'→'홍대(아니메)',
        '롯데군산나운'→'군산나운', '(폐관)CGV 시흥'→'시흥'
    발전기금면제관은 시스템에 별도 거래처로 분리돼 있으나(예: 메가박스코엑스(발전기금면제관))
    정산서에는 본 극장 하나로 오므로 접미사를 제거해 본 극장에 합산한다.
    """
    s = str(s or "").replace(" ", "")
    s = re.sub(r"^\((폐관|임시중단|휴관)\)", "", s)
    s = s.replace("(발전기금면제관)", "")
    for prefix in ("CGV", "cgv", "메가박스", "롯데시네마", "롯데", "씨네큐", "CINEQ", "cineq"):
        if s.startswith(prefix):
            s = s[len(prefix):]
            break
    return s.lower()


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
        rows.append({
            "theater": theater,
            "movie": _txt(row.iloc[c_movie]),
            "screen_kind": _txt(row.iloc[c_kind]),
            "date": _txt(row.iloc[c_date]),
            "date_end": _txt(row.iloc[c_date_end]),
            "fare": _num(row.iloc[c_fare]),
            "danga": _num(row.iloc[c_danga]),
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
