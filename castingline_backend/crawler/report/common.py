# -*- coding: utf-8 -*-
"""P001 보고서 — PDF/엑셀 공용 표시 형식 유틸.

숫자 표기 규칙(개발요청서 §19):
- 좌석/회차/스크린/극장: 정수 + 천단위 콤마 (계산 중간 반올림 금지, 표시 시만)
- 좌석점유율·점유비중·증감률: 소수점 1자리
- 전주 비교: ▲ +58,228석 (+8.2%) / ▼ -27,863석 (-4.4%) — 빨간색 표기
- 점유율 전주 비교: ▲ 0.6%p
- 전주 데이터 없음: 신규 / 전주 기간 데이터 없음: -
"""
import os

ASSETS_DIR = os.path.join(os.path.dirname(__file__), "assets")
LOGO_PATH = os.path.join(ASSETS_DIR, "casting_line_logo.png")

# 샘플 디자인 색상 (엑셀 ARGB 기준)
COLOR_HEADER_GREEN = "E5F1D7"   # 표 제목 행 연한 연두
COLOR_MAIN_CREAM = "FFF2CC"     # 주요작 강조 행
COLOR_RED = "D83A34"            # 전주 비교 빨강


def fmt_num(n, unit=""):
    return f"{int(round(n)):,}{unit}"


def fmt_pct(v):
    return f"{v:.1f}%"


def fmt_cmp(cmp_dict):
    """전주 비교 dict(aggregation._cmp / _occ_cmp) → (표시문자열, 빨간색 여부)."""
    kind = cmp_dict.get("kind")
    if kind == "none":
        return "-", False
    if kind == "new":
        return "신규", True
    if kind == "occ":
        # 샘플 표기: '▲ 0.6%p' — 부호는 화살표로만 표현
        d = cmp_dict["diff"]
        arrow = "▲" if d >= 0 else "▼"
        return f"{arrow} {abs(d):.1f}%p", True
    # kind == "cmp"
    d = cmp_dict["diff"]
    unit = cmp_dict.get("unit", "")
    arrow = "▲" if d >= 0 else "▼"
    rate = cmp_dict.get("rate")
    rate_str = f" ({rate:+.1f}%)" if rate is not None else ""
    return f"{arrow} {d:+,d}{unit}{rate_str}", True


def fmt_rank_cmp(prev_rank, cur_rank=None):
    """전주 순위 표기: 순위가 오르면 ▲ 전주 2위, 내리면 ▼ 전주 2위 / (전주 없음) -"""
    if prev_rank is None:
        return "-", False
    if cur_rank is None or cur_rank == prev_rank:
        return f"전주 {prev_rank}위", True
    arrow = "▲" if cur_rank < prev_rank else "▼"
    return f"{arrow} 전주 {prev_rank}위", True


def find_korean_font():
    """PDF용 한글 폰트(TTF) 경로 (일반, 볼드). 우선순위:
    1) 번들 폰트(crawler/report/fonts/)  2) Windows 맑은고딕  3) Linux 나눔고딕
    """
    bundled = os.path.join(os.path.dirname(__file__), "fonts")
    candidates = [
        (os.path.join(bundled, "NanumGothic.ttf"), os.path.join(bundled, "NanumGothicBold.ttf")),
        (r"C:\Windows\Fonts\malgun.ttf", r"C:\Windows\Fonts\malgunbd.ttf"),
        ("/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
         "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf"),
        ("/usr/share/fonts/nanum/NanumGothic.ttf", "/usr/share/fonts/nanum/NanumGothicBold.ttf"),
    ]
    for regular, bold in candidates:
        if os.path.exists(regular):
            return regular, (bold if os.path.exists(bold) else regular)
    # 최후: glob 탐색 (리눅스 배포판별 경로 차이 대응)
    import glob
    for pattern in ("/usr/share/fonts/**/NanumGothic*.ttf", "/usr/share/fonts/**/*Gothic*.ttf"):
        found = sorted(glob.glob(pattern, recursive=True))
        if found:
            return found[0], found[0]
    raise RuntimeError("한글 TTF 폰트를 찾을 수 없습니다. crawler/report/fonts/에 NanumGothic.ttf를 넣어주세요.")
