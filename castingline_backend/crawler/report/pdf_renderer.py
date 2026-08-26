# -*- coding: utf-8 -*-
"""P001: 영화 상영현황 보고서 — PDF 렌더러 (reportlab).

첨부 샘플 PDF(sample_pdf / sample_pdf_주요작X)를 디자인 기준으로 A4 가로 3페이지를
그린다. 숫자는 aggregation.build_report_data 의 ViewModel만 사용한다.
- 기본 글씨 검정 / 전주 비교 빨강 / 표 제목 행 연한 연두 / 주요작 행 연한 노랑 + ★
- 모든 페이지 우측 상단 CASTING LINE 로고
"""
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, Frame, PageTemplate, Paragraph,
                                Spacer, Table, TableStyle, PageBreak)

from .common import (COLOR_HEADER_GREEN, COLOR_MAIN_CREAM, COLOR_RED, LOGO_PATH,
                     find_korean_font, fmt_cmp, fmt_num, fmt_pct, fmt_rank_cmp)

PAGE_SIZE = landscape(A4)          # 841.89 x 595.28 pt
M_LEFT, M_RIGHT, M_TOP, M_BOTTOM = 46, 46, 40, 28
CONTENT_W = PAGE_SIZE[0] - M_LEFT - M_RIGHT

GREEN = colors.HexColor(f"#{COLOR_HEADER_GREEN}")
CREAM = colors.HexColor(f"#{COLOR_MAIN_CREAM}")
RED = colors.HexColor(f"#{COLOR_RED}")
GRID = colors.HexColor("#C9CFC2")

_FONT = "KR"
_FONT_B = "KR-B"
_registered = False


def _ensure_fonts():
    global _registered
    if _registered:
        return
    regular, bold = find_korean_font()
    pdfmetrics.registerFont(TTFont(_FONT, regular))
    pdfmetrics.registerFont(TTFont(_FONT_B, bold))
    _registered = True


# ---------- 스타일 ----------
def _styles():
    return {
        "title": ParagraphStyle("title", fontName=_FONT_B, fontSize=19, leading=24,
                                textColor=colors.black),
        "subtitle": ParagraphStyle("subtitle", fontName=_FONT, fontSize=9.5, leading=13,
                                   textColor=colors.HexColor("#333333")),
        "section": ParagraphStyle("section", fontName=_FONT_B, fontSize=12, leading=15,
                                  textColor=colors.black),
    }


def _p(txt, size=8.5, bold=False, color=colors.black, align="CENTER"):
    st = ParagraphStyle("c", fontName=_FONT_B if bold else _FONT, fontSize=size,
                        leading=size + 3, textColor=color, alignment={"LEFT": 0, "CENTER": 1, "RIGHT": 2}[align])
    return Paragraph(str(txt), st)


def _cmp_cell(cmp_dict, size=8.5):
    txt, red = fmt_cmp(cmp_dict)
    return _p(txt, size=size, bold=red, color=RED if red else colors.black)


def _base_table_style(header_rows=1):
    st = [
        ("FONTNAME", (0, 0), (-1, -1), _FONT),
        ("GRID", (0, 0), (-1, -1), 0.6, GRID),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    if header_rows:
        st += [("BACKGROUND", (0, 0), (-1, header_rows - 1), GREEN)]
    return st


def _header_cells(labels):
    return [_p(h, size=8.5, bold=True) for h in labels]


# ---------- 공통 블록 ----------
def _page_header(story, S, title, subtitle):
    story.append(Paragraph(title, S["title"]))
    story.append(Spacer(1, 4))
    story.append(Paragraph(subtitle, S["subtitle"]))
    story.append(Spacer(1, 12))


def _kpi_table(cols):
    """cols: [(라벨, 큰값, cmp_dict|None(='-'))]

    W001: 칸을 균등 분할하면 '총 좌석수'처럼 자릿수가 큰 값(5,129,505석)이 줄바꿈되고,
    행 높이가 고정이라 아래 증감 문구와 글자가 겹쳤다. 칸 폭을 내용 비례로 나누고,
    그래도 모자라면 값 글씨를 줄여 한 줄에 맞춘 뒤 행 높이는 자동으로 둔다.
    """
    n = len(cols)
    VALUE_SIZE = 17.0
    PAD = 5  # 셀 좌우 여백

    delta_texts = []
    for c in cols:
        delta_texts.append("-" if c[2] is None else fmt_cmp(c[2])[0])

    # 칸별 필요 폭 — 값은 한 줄, 증감 문구는 두 줄까지 허용
    need = []
    for (label, value, _), dtxt in zip(cols, delta_texts):
        need.append(max(
            pdfmetrics.stringWidth(str(value), _FONT_B, VALUE_SIZE),
            pdfmetrics.stringWidth(str(label), _FONT_B, 9),
            pdfmetrics.stringWidth(dtxt, _FONT, 9) * 0.6,
        ) + PAD * 2)

    total_need = sum(need)
    if total_need <= CONTENT_W:
        extra = (CONTENT_W - total_need) / n
        widths = [w + extra for w in need]
    else:
        widths = [CONTENT_W * w / total_need for w in need]

    value_size = VALUE_SIZE
    while value_size > 9.0 and any(
        pdfmetrics.stringWidth(str(c[1]), _FONT_B, value_size) > w - PAD * 2
        for c, w in zip(cols, widths)
    ):
        value_size -= 0.5

    label_row = [_p(c[0], size=9, bold=True) for c in cols]
    value_row = [_p(c[1], size=value_size, bold=True) for c in cols]
    delta_row = []
    for c in cols:
        delta_row.append(_p("-", size=9) if c[2] is None else _cmp_cell(c[2], size=9))

    # 행 높이는 지정하지 않는다 — 증감 문구가 두 줄이 돼도 칸이 늘어나 겹치지 않는다
    t = Table([label_row, value_row, delta_row], colWidths=widths)
    t.setStyle(TableStyle(_base_table_style(header_rows=1) + [
        ("TOPPADDING", (0, 0), (-1, 0), 5), ("BOTTOMPADDING", (0, 0), (-1, 0), 5),
        ("TOPPADDING", (0, 1), (-1, 1), 6), ("BOTTOMPADDING", (0, 1), (-1, 1), 6),
        ("TOPPADDING", (0, 2), (-1, 2), 4), ("BOTTOMPADDING", (0, 2), (-1, 2), 4),
    ]))
    return t


def _movie_row_cells(idx, s, cols, has_star, size=8.5):
    """경쟁작 상세/TOP10 표의 한 행. cols는 키 목록."""
    title_txt = ("★ " + s["title"]) if (has_star and s["is_main"]) else s["title"]
    mapping = {
        "no": _p(idx, size=size),
        "title": _p(title_txt, size=size, bold=s.get("is_main", False) and has_star),
        "total_seats": _p(fmt_num(s["total_seats"]), size=size),
        "seats_cmp": _cmp_cell(s["seats_cmp"], size=size),
        "share": _p(fmt_pct(s["share"]), size=size),
        "reserved": _p(fmt_num(s["reserved"]), size=size),
        "occupancy": _p(fmt_pct(s["occupancy"]), size=size),
        "screens": _p(fmt_num(s["screens"]), size=size),
        "theaters": _p(fmt_num(s["theaters"]), size=size),
        "shows": _p(fmt_num(s["shows"]), size=size),
    }
    return [mapping[c] for c in cols]


def _detail_compare_table(movies, highlight_main):
    """① 경쟁작 상세 비교 — TOP10 (작품·총좌석수·전주比·예매·점유율·스크린·극장·회차)"""
    headers = ["#", "작품", "총 좌석수", "전주比", "예매좌석수", "점유율", "스크린", "극장", "회차"]
    keys = ["no", "title", "total_seats", "seats_cmp", "reserved", "occupancy",
            "screens", "theaters", "shows"]
    widths = [26, 168, 88, 128, 82, 62, 62, 62, 64]
    scale = CONTENT_W / sum(widths)
    widths = [w * scale for w in widths]

    rows = [_header_cells(headers)]
    style = _base_table_style()
    for i, s in enumerate(movies[:10], 1):
        rows.append(_movie_row_cells(i, s, keys, highlight_main))
        if highlight_main and s["is_main"]:
            style.append(("BACKGROUND", (0, i), (-1, i), CREAM))
    t = Table(rows, colWidths=widths)
    t.setStyle(TableStyle(style))
    return t


def _p3_table(movies, highlight_main):
    """P.3 전체 작품 표 (작품명·총좌석수·전주比·점유비중·예매·극장수·스크린수·회차수)"""
    headers = ["#", "작품명", "총 좌석수", "전주比", "점유비중", "예매좌석수", "극장수", "스크린수", "회차수"]
    keys = ["no", "title", "total_seats", "seats_cmp", "share", "reserved",
            "theaters", "screens", "shows"]
    widths = [26, 168, 88, 128, 66, 82, 60, 62, 62]
    scale = CONTENT_W / sum(widths)
    widths = [w * scale for w in widths]

    rows = [_header_cells(headers)]
    style = _base_table_style()
    # 전체 작품을 한 페이지에 담기 위해 행 간격을 촘촘하게 (작품이 많으면 다음 장으로 이어짐)
    style += [("TOPPADDING", (0, 0), (-1, -1), 3.2), ("BOTTOMPADDING", (0, 0), (-1, -1), 3.2)]
    for i, s in enumerate(movies, 1):
        rows.append(_movie_row_cells(i, s, keys, highlight_main))
        if highlight_main and s["is_main"]:
            style.append(("BACKGROUND", (0, i), (-1, i), CREAM))
    t = Table(rows, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle(style))
    return t


# ---------- M001: P.4 일별 비교 ----------
_WEEKDAY_KOR = ["월", "화", "수", "목", "금", "토", "일"]


def _md(d):
    return f"{d.month}/{d.day}"


def _p4_kpi_daily_table(kpi_rows):
    """P.4 ① 일별 현황 — 행=지표, 열=날짜별 (값 / 전주 같은 요일 대비)"""
    headers = ["지표"]
    for r in kpi_rows:
        headers += [_md(r["date"]), f"전주 {_md(r['prev_date'])} 대비"]
    metric_rows = [
        ("총 좌석수", lambda r: fmt_num(r["total_seats"], "석"), "seats_cmp"),
        ("예매좌석수", lambda r: fmt_num(r["reserved"], "석"), "reserved_cmp"),
        ("좌석점유율", lambda r: fmt_pct(r["occupancy"]), "occ_cmp"),
        ("회차수", lambda r: fmt_num(r["shows"], "회"), "shows_cmp"),
    ]
    rows = [_header_cells(headers)]
    for label, val_fn, cmp_key in metric_rows:
        row = [_p(label, size=8.5, bold=True)]
        for r in kpi_rows:
            row.append(_p(val_fn(r), size=8.5))
            row.append(_cmp_cell(r[cmp_key]))
        rows.append(row)
    n = len(kpi_rows)
    label_w = 78
    val_w = (CONTENT_W - label_w) / (n * 2) if n else CONTENT_W - label_w
    t = Table(rows, colWidths=[label_w] + [val_w] * (n * 2))
    t.setStyle(TableStyle(_base_table_style() + [
        ("TOPPADDING", (0, 0), (-1, -1), 3.2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.2),
    ]))
    return t


def _p4_top_daily_table(top, dates, highlight_main):
    """P.4 ② 총 좌석수 기준 TOP10(+주요작) 일별 전주 비교"""
    headers = ["#", "작품명"]
    for d in dates:
        headers += [f"{_md(d)} 총 좌석수(좌점율)", "전주比"]
    rows = [_header_cells(headers)]
    style = _base_table_style()
    # 셀을 한 줄로 유지해 P.4 세 표가 한 페이지에 들어가게 폰트·여백을 줄인다
    style += [("TOPPADDING", (0, 0), (-1, -1), 2.6),
              ("BOTTOMPADDING", (0, 0), (-1, -1), 2.6)]
    for i, m in enumerate(top, 1):
        title_txt = ("★ " + m["title"]) if (highlight_main and m["is_main"]) else m["title"]
        row = [_p(m["rank"], size=7.5),
               _p(title_txt, size=7.5, bold=highlight_main and m["is_main"], align="LEFT")]
        for day in m["days"]:
            row.append(_p(f"{fmt_num(day['total_seats'])} ({fmt_pct(day['occupancy'])})", size=7.5))
            row.append(_cmp_cell(day["seats_cmp"], size=7.5))
        rows.append(row)
        if highlight_main and m["is_main"]:
            style.append(("BACKGROUND", (0, i), (-1, i), CREAM))
    n = len(dates)
    no_w, title_w = 24, 132
    val_w = (CONTENT_W - no_w - title_w) / (n * 2) if n else 100
    t = Table(rows, colWidths=[no_w, title_w] + [val_w] * (n * 2), repeatRows=1)
    t.setStyle(TableStyle(style))
    return t


def _p4_slot_table(slots):
    """P.4 ③ 주요작 일자별 주요 시간대 회차 배정 비중"""
    headers = ["구분"] + slots["labels"] + ["총 회차"]
    rows = [_header_cells(headers)]
    style = _base_table_style()
    for r in slots["rows"]:
        d = r["date"]
        cells = [_p(f"{_md(d)} ({_WEEKDAY_KOR[d.weekday()]})", size=8.5, bold=True)]
        for c in r["counts"]:
            pct = (c / r["total"] * 100) if r["total"] else 0.0
            cells.append(_p(f"{fmt_num(c)}회 ({fmt_pct(pct)})", size=8.5))
        cells.append(_p(f"{fmt_num(r['total'])}회 (100%)", size=8.5, bold=True))
        rows.append(cells)
    avg_cells = [_p("기간 평균 비중", size=8.5, bold=True)]
    for pct in slots["avg_pct"]:
        avg_cells.append(_p(fmt_pct(pct), size=8.5))
    avg_cells.append(_p("100.0%", size=8.5))
    rows.append(avg_cells)
    n = len(slots["labels"])
    label_w = 92
    val_w = (CONTENT_W - label_w) / (n + 1)
    t = Table(rows, colWidths=[label_w] + [val_w] * (n + 1))
    style += [("TOPPADDING", (0, 0), (-1, -1), 3.2),
              ("BOTTOMPADDING", (0, 0), (-1, -1), 3.2)]
    t.setStyle(TableStyle(style))
    return t


def _period_str(p):
    # C008: 특정 날짜(비연속) 선택 보고서는 범위(~) 대신 날짜를 나열해 표기한다
    if p.get("dates"):
        cur = ", ".join(d.strftime("%m.%d") for d in p["dates"])
        prev = ", ".join(d.strftime("%m.%d") for d in (p.get("prev_dates") or []))
        return (f"조사기간 {p['start'].strftime('%Y')}년 {cur}",
                f"전주 {prev}")
    return (f"조사기간 {p['start'].strftime('%Y.%m.%d')} - {p['end'].strftime('%Y.%m.%d')}",
            f"전주 {p['prev_start'].strftime('%Y.%m.%d')} - {p['prev_end'].strftime('%Y.%m.%d')}")


# ---------- 로고 ----------
_logo_cache = None


def _logo_image():
    """로고를 흰 배경에 합성하고 투명한 가장자리를 잘라낸 ImageReader.

    W001: 원본 PNG 맨 윗줄이 '완전 투명한 검정'이라, 이미지를 부드럽게 축소하는
    PDF 뷰어에서 그 줄이 번져 로고 위에 회색 선처럼 보였다. 알파를 없애면 사라진다.
    """
    global _logo_cache
    if _logo_cache is None:
        from PIL import Image
        from reportlab.lib.utils import ImageReader
        src = Image.open(LOGO_PATH).convert("RGBA")
        alpha = src.split()[3]
        bbox = alpha.getbbox()          # 완전 투명한 가장자리 제거
        if bbox:
            src = src.crop(bbox)
        flat = Image.new("RGB", src.size, (255, 255, 255))
        flat.paste(src, mask=src.split()[3])
        _logo_cache = ImageReader(flat)
    return _logo_cache


def _draw_logo(canvas, doc):
    try:
        img = _logo_image()
        iw, ih = img.getSize()
        h = 38.0
        w = iw * h / ih
        x = PAGE_SIZE[0] - M_RIGHT - w
        y = PAGE_SIZE[1] - M_TOP - h + 14
        canvas.drawImage(img, x, y, width=w, height=h,
                         preserveAspectRatio=True)
    except Exception:
        pass  # 로고가 없어도 보고서 생성은 계속


# ---------- 본문 구성 ----------
def build_pdf(data, out_path, scope=None):
    """scope (A003 출력 범위):
    - 'main_only': 주요작 상세 P.1 한 장만
    - 'main_comp': P.1 + 경쟁작 비교(P.2·P.3)
    - 'comp_only': 경쟁작 요약 P.1 한 장 (TOP 20)
    - None: 기존 전체 페이지 (P.1~P.4)
    """
    _ensure_fonts()
    S = _styles()
    p = data["period"]
    cur_s, prev_s = _period_str(p)
    story = []

    if data["mode"] == "main":
        main = data["main"]
        # ===== P.1 주요작 상영 현황 =====
        _page_header(story, S, "P.1 주요작 상영 현황",
                     f"작품명 {main['title']} | {cur_s} | {prev_s}")
        story.append(Paragraph("KEY SUMMARY", S["section"]))
        story.append(Spacer(1, 6))
        kc = main["kpi_cmp"]
        story.append(_kpi_table([
            ("총 좌석수", fmt_num(main["total_seats"], "석"), kc["total_seats"]),
            ("예매좌석수", fmt_num(main["reserved"], "석"), kc["reserved"]),
            ("좌석점유율", fmt_pct(main["occupancy"]), kc["occupancy"]),
            ("총 회차", fmt_num(main["shows"], "회"), kc["shows"]),
            ("총 극장수", fmt_num(main["theaters"], "개"), kc["theaters"]),
            ("총 스크린수", fmt_num(main["screens"], "개"), kc["screens"]),
        ]))
        story.append(Spacer(1, 13))

        # A003: 출력 유형 지정 시 주요작 상세(P.1)가 정확히 한 장에 담기도록 압축
        p1_compact = ([("TOPPADDING", (0, 0), (-1, -1), 3.2),
                       ("BOTTOMPADDING", (0, 0), (-1, -1), 3.2)]
                      if scope in ("main_only", "main_comp") else [])

        # ① 멀티별 현황
        story.append(Paragraph("① 멀티별 현황", S["section"]))
        story.append(Spacer(1, 6))
        headers = ["멀티", "총 좌석수", "전주比", "예매좌석수", "점유율", "스크린", "극장", "회차"]
        widths = [80, 100, 140, 100, 78, 78, 78, 78]
        scale = CONTENT_W / sum(widths)
        rows = [_header_cells(headers)]
        for m in data["main_multis"]:
            rows.append([
                _p(m["name"], size=8.5), _p(fmt_num(m["total_seats"]), size=8.5),
                _cmp_cell(m["seats_cmp"]), _p(fmt_num(m["reserved"]), size=8.5),
                _p(fmt_pct(m["occupancy"]), size=8.5), _p(fmt_num(m["screens"]), size=8.5),
                _p(fmt_num(m["theaters"]), size=8.5), _p(fmt_num(m["shows"]), size=8.5),
            ])
        t = Table(rows, colWidths=[w * scale for w in widths])
        t.setStyle(TableStyle(_base_table_style() + p1_compact))
        story.append(t)
        story.append(Spacer(1, 13))

        # ② 총 좌석수 기준 극장 TOP 10
        story.append(Paragraph("② 총 좌석수 기준 극장 TOP 10", S["section"]))
        story.append(Spacer(1, 6))
        headers = ["#", "멀티", "극장명", "총 좌석수", "전주比", "예매좌석수", "점유율", "스크린", "회차"]
        widths = [26, 62, 170, 88, 128, 88, 62, 58, 58]
        scale = CONTENT_W / sum(widths)
        rows = [_header_cells(headers)]
        for i, th in enumerate(data["main_theaters_top10"], 1):
            rows.append([
                _p(i, size=8.5), _p(th["multi"], size=8.5), _p(th["name"], size=8.5),
                _p(fmt_num(th["total_seats"]), size=8.5), _cmp_cell(th["seats_cmp"]),
                _p(fmt_num(th["reserved"]), size=8.5), _p(fmt_pct(th["occupancy"]), size=8.5),
                _p(fmt_num(th["screens"]), size=8.5), _p(fmt_num(th["shows"]), size=8.5),
            ])
        t = Table(rows, colWidths=[w * scale for w in widths])
        t.setStyle(TableStyle(_base_table_style() + p1_compact))
        story.append(t)
        p1_len = len(story)  # A003: 'main_only'면 P.1까지만 출력
        story.append(PageBreak())

        # ===== P.2 주요작 vs 경쟁작 =====
        _page_header(story, S, "P.2 주요작 vs 경쟁작",
                     f"{cur_s} | 총 좌석수 기준 TOP 10 | {prev_s}")
        story.append(Paragraph("주요작 경쟁 포지션", S["section"]))
        story.append(Spacer(1, 6))
        rk = main["ranks"]
        labels = [("좌석수 순위", "seats", fmt_num(main["total_seats"], "석")),
                  ("예매좌석 순위", "reserved", fmt_num(main["reserved"], "석")),
                  ("점유율 순위", "occupancy", fmt_pct(main["occupancy"])),
                  ("회차 순위", "shows", fmt_num(main["shows"], "회"))]
        w4 = CONTENT_W / 4
        row_label = [_p(l, size=9, bold=True) for l, _, _ in labels]
        row_rank = [_p(f"{rk[k]['cur']}위", size=13, bold=True) for _, k, _ in labels]
        row_val = [_p(v, size=10) for _, _, v in labels]
        row_prev = []
        for _, k, _ in labels:
            txt, red = fmt_rank_cmp(rk[k]["prev"], rk[k]["cur"])
            row_prev.append(_p(txt, size=9, bold=red, color=RED if red else colors.black))
        t = Table([row_label, row_rank, row_val, row_prev], colWidths=[w4] * 4,
                  rowHeights=[20, 24, 20, 20])
        t.setStyle(TableStyle(_base_table_style()))
        story.append(t)
        story.append(Spacer(1, 13))

        story.append(Paragraph("① 경쟁작 상세 비교", S["section"]))
        story.append(Spacer(1, 6))
        story.append(_detail_compare_table(data["movies"], highlight_main=True))
        story.append(PageBreak())

        # ===== P.3 전체 경쟁작 상영 현황 =====
        _page_header(story, S, "P.3 전체 경쟁작 상영 현황",
                     f"주요작 포함 {data['movie_count']}개 작품 | {cur_s} | 총 좌석수 기준 내림차순")
        story.append(_p3_table(data["movies"], highlight_main=True))

        # ===== P.4 주요작 일별 상영 추이 (M001) =====
        # A003: 'main_comp'(1P+비교 2P)는 P.4 제외 — 전체 출력일 때만 붙인다
        daily = data.get("daily") if scope is None else None
        if daily:
            story.append(PageBreak())
            _page_header(story, S, "P.4 주요작 일별 상영 추이",
                         f"작품명 {main['title']} | {cur_s} | 전주 동일요일 {prev_s.replace('전주 ', '')}")
            story.append(Paragraph(f"① 주요작 일별 상영 현황 - {main['title']}", S["section"]))
            story.append(Spacer(1, 5))
            story.append(_p4_kpi_daily_table(daily["kpi_rows"]))
            story.append(Spacer(1, 9))

            story.append(Paragraph("② 총 좌석수 TOP 10 + 주요작 일별 전주 비교", S["section"]))
            story.append(Spacer(1, 5))
            story.append(_p4_top_daily_table(daily["top"], daily["dates"], highlight_main=True))
            story.append(Spacer(1, 9))

            if daily.get("slots"):
                story.append(Paragraph("③ 주요작 일자별 주요 시간대 회차 배정 비중", S["section"]))
                story.append(Spacer(1, 5))
                story.append(_p4_slot_table(daily["slots"]))

        if scope == "main_only":
            del story[p1_len:]

    else:
        totals = data["totals"]
        # ===== P.1 경쟁작 전체 상영 요약 =====
        _page_header(story, S, "P.1 경쟁작 전체 상영 요약",
                     f"주요 상영작 {data['movie_count']}개 작품 | {cur_s} | {prev_s}")
        story.append(Paragraph("KEY SUMMARY", S["section"]))
        story.append(Spacer(1, 6))
        kc = totals["kpi_cmp"]
        story.append(_kpi_table([
            ("조사 작품수", f"{totals['movie_count']}편", None),
            ("총 좌석수", fmt_num(totals["total_seats"], "석"), kc["total_seats"]),
            ("예매좌석수", fmt_num(totals["reserved"], "석"), kc["reserved"]),
            ("좌석점유율", fmt_pct(totals["occupancy"]), kc["occupancy"]),
            ("총 회차", fmt_num(totals["shows"], "회"), kc["shows"]),
            ("총 극장수", fmt_num(totals["theaters"], "개"), kc["theaters"]),
            ("총 스크린수", fmt_num(totals["screens"], "개"), kc["screens"]),
        ]))
        story.append(Spacer(1, 13))

        # P.1 한 페이지에 표 2개(상위5+TOP10)를 담아야 하므로 행 간격을 촘촘하게
        compact = [("TOPPADDING", (0, 0), (-1, -1), 3.2), ("BOTTOMPADDING", (0, 0), (-1, -1), 3.2)]

        # A003: 'comp_only'(요약 1P)는 TOP 20 표만 담는다 — 상위권 현황 생략
        if scope != "comp_only":
            story.append(Paragraph("① 경쟁작 상위권 현황", S["section"]))
            story.append(Spacer(1, 6))
            headers = ["#", "작품명", "총 좌석수", "전주比", "예매좌석수", "점유율", "스크린", "극장", "회차"]
            keys = ["no", "title", "total_seats", "seats_cmp", "reserved", "occupancy",
                    "screens", "theaters", "shows"]
            widths = [26, 168, 88, 128, 82, 62, 62, 62, 64]
            scale = CONTENT_W / sum(widths)
            rows = [_header_cells(headers)]
            for i, s in enumerate(data["movies"][:5], 1):
                rows.append(_movie_row_cells(i, s, keys, has_star=False))
            t = Table(rows, colWidths=[w * scale for w in widths])
            t.setStyle(TableStyle(_base_table_style() + compact))
            story.append(t)
            story.append(Spacer(1, 11))

        # A003: 'comp_only'(경쟁작 요약 1P)는 실시간 예매율 요약용으로 TOP 20까지
        top_n = 20 if scope == "comp_only" else 10
        story.append(Paragraph(f"② 총 좌석수 기준 작품 TOP {top_n}", S["section"]))
        story.append(Spacer(1, 6))
        headers = ["#", "작품명", "총 좌석수", "전주比", "점유비중", "예매좌석수", "점유율", "스크린", "회차"]
        keys = ["no", "title", "total_seats", "seats_cmp", "share", "reserved",
                "occupancy", "screens", "shows"]
        widths = [26, 168, 88, 124, 64, 82, 62, 60, 62]
        scale = CONTENT_W / sum(widths)
        rows = [_header_cells(headers)]
        # comp_only는 21행(TOP20)을 한 장에 담아야 하므로 글씨·간격을 더 줄인다
        row_size = 7.5 if scope == "comp_only" else 8.5
        tight = ([("TOPPADDING", (0, 0), (-1, -1), 2.0),
                  ("BOTTOMPADDING", (0, 0), (-1, -1), 2.0)]
                 if scope == "comp_only" else compact)
        for i, s in enumerate(data["movies"][:top_n], 1):
            rows.append(_movie_row_cells(i, s, keys, has_star=False, size=row_size))
        t = Table(rows, colWidths=[w * scale for w in widths])
        t.setStyle(TableStyle(_base_table_style() + tight))
        story.append(t)
        p1_len = len(story)  # A003: 'comp_only'면 P.1까지만 출력
        story.append(PageBreak())

        # ===== P.2 경쟁작 경쟁 현황 =====
        _page_header(story, S, "P.2 경쟁작 경쟁 현황",
                     f"{cur_s} | 총 좌석수 기준 TOP 10 | {prev_s}")
        story.append(Paragraph("경쟁작 경쟁 포지션", S["section"]))
        story.append(Spacer(1, 6))
        L = data["leaders"]
        cards = [("좌석수 1위", L["seats"], "석"), ("예매좌석 1위", L["reserved"], "석"),
                 ("점유율 1위", L["occupancy"], "%"), ("회차 1위", L["shows"], "회")]
        w4 = CONTENT_W / 4
        row_label = [_p(lbl, size=9, bold=True) for lbl, _, _ in cards]
        row_title = [_p(c["title"], size=10, bold=True) for _, c, _ in cards]
        row_val = []
        for _, c, unit in cards:
            val = fmt_pct(c["value"]) if unit == "%" else fmt_num(c["value"], unit)
            row_val.append(_p(val, size=10))
        row_prev = []
        for _, c, _ in cards:
            txt, red = fmt_rank_cmp(c["prev_rank"], c["cur_rank"])
            row_prev.append(_p(txt, size=9, bold=red, color=RED if red else colors.black))
        t = Table([row_label, row_title, row_val, row_prev], colWidths=[w4] * 4,
                  rowHeights=[20, 24, 20, 20])
        t.setStyle(TableStyle(_base_table_style()))
        story.append(t)
        story.append(Spacer(1, 13))

        story.append(Paragraph("① 경쟁작 상세 비교", S["section"]))
        story.append(Spacer(1, 6))
        story.append(_detail_compare_table(data["movies"], highlight_main=False))
        story.append(PageBreak())

        # ===== P.3 전체 경쟁작 상영 현황 =====
        _page_header(story, S, "P.3 전체 경쟁작 상영 현황",
                     f"주요 상영작 {data['movie_count']}개 작품 | {cur_s} | 총 좌석수 기준 내림차순")
        story.append(_p3_table(data["movies"], highlight_main=False))

        # ===== P.4 일별 상영 추이 (M001, 주요작 없음) =====
        daily = data.get("daily") if scope is None else None
        if daily:
            story.append(PageBreak())
            _page_header(story, S, "P.4 일별 상영 추이",
                         f"{cur_s} | 전주 동일요일 {prev_s.replace('전주 ', '')}")
            story.append(Paragraph("① 전체 시장 일별 현황", S["section"]))
            story.append(Spacer(1, 6))
            story.append(_p4_kpi_daily_table(daily["kpi_rows"]))
            story.append(Spacer(1, 13))

            story.append(Paragraph("② 총 좌석수 기준 TOP 10 작품 일별 전주 비교", S["section"]))
            story.append(Spacer(1, 6))
            story.append(_p4_top_daily_table(daily["top"], daily["dates"], highlight_main=False))

        if scope == "comp_only":
            del story[p1_len:]

    doc = BaseDocTemplate(out_path, pagesize=PAGE_SIZE,
                          leftMargin=M_LEFT, rightMargin=M_RIGHT,
                          topMargin=M_TOP, bottomMargin=M_BOTTOM)
    frame = Frame(M_LEFT, M_BOTTOM, CONTENT_W, PAGE_SIZE[1] - M_TOP - M_BOTTOM,
                  leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([PageTemplate(id="page", frames=[frame], onPage=_draw_logo)])
    doc.build(story)
    return out_path
