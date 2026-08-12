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


def _movie_row_cells(idx, s, cols, has_star):
    """경쟁작 상세/TOP10 표의 한 행. cols는 키 목록."""
    title_txt = ("★ " + s["title"]) if (has_star and s["is_main"]) else s["title"]
    mapping = {
        "no": _p(idx, size=8.5),
        "title": _p(title_txt, size=8.5, bold=s.get("is_main", False) and has_star),
        "total_seats": _p(fmt_num(s["total_seats"]), size=8.5),
        "seats_cmp": _cmp_cell(s["seats_cmp"]),
        "share": _p(fmt_pct(s["share"]), size=8.5),
        "reserved": _p(fmt_num(s["reserved"]), size=8.5),
        "occupancy": _p(fmt_pct(s["occupancy"]), size=8.5),
        "screens": _p(fmt_num(s["screens"]), size=8.5),
        "theaters": _p(fmt_num(s["theaters"]), size=8.5),
        "shows": _p(fmt_num(s["shows"]), size=8.5),
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


def _period_str(p):
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
def build_pdf(data, out_path):
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
        t.setStyle(TableStyle(_base_table_style()))
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
        t.setStyle(TableStyle(_base_table_style()))
        story.append(t)
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

        story.append(Paragraph("② 총 좌석수 기준 작품 TOP 10", S["section"]))
        story.append(Spacer(1, 6))
        headers = ["#", "작품명", "총 좌석수", "전주比", "점유비중", "예매좌석수", "점유율", "스크린", "회차"]
        keys = ["no", "title", "total_seats", "seats_cmp", "share", "reserved",
                "occupancy", "screens", "shows"]
        widths = [26, 168, 88, 124, 64, 82, 62, 60, 62]
        scale = CONTENT_W / sum(widths)
        rows = [_header_cells(headers)]
        for i, s in enumerate(data["movies"][:10], 1):
            rows.append(_movie_row_cells(i, s, keys, has_star=False))
        t = Table(rows, colWidths=[w * scale for w in widths])
        t.setStyle(TableStyle(_base_table_style() + compact))
        story.append(t)
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

    doc = BaseDocTemplate(out_path, pagesize=PAGE_SIZE,
                          leftMargin=M_LEFT, rightMargin=M_RIGHT,
                          topMargin=M_TOP, bottomMargin=M_BOTTOM)
    frame = Frame(M_LEFT, M_BOTTOM, CONTENT_W, PAGE_SIZE[1] - M_TOP - M_BOTTOM,
                  leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([PageTemplate(id="page", frames=[frame], onPage=_draw_logo)])
    doc.build(story)
    return out_path
