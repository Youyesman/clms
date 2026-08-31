# -*- coding: utf-8 -*-
"""P001: 영화 상영현황 보고서 — PDF 렌더러 (reportlab).

A001(0829) 개편: 첨부 샘플 PDF(A001 / A001(주요작X))의 페이지 구성을 그대로 따른다.
- 주요작 있음 3P: 상영 현황 / 상세 현황 / 주요작 vs 경쟁작
- 주요작 없음 1P + 일자수: 전체 요약 / 일자별 상세 현황(하루 한 장)
숫자는 aggregation.build_report_data 의 ViewModel만 사용한다.
- 기본 글씨 검정 / 전주 비교 빨강 / **모든 표 제목 행은 연한 연두**
  / 합계·주요작 강조 행은 연한 노랑 + ★
- 모든 페이지 우측 상단 CASTING LINE 로고
"""
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, Frame, KeepInFrame, PageTemplate,
                                Paragraph, Spacer, Table, TableStyle, PageBreak)

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


def _breakdown_table(block):
    """A001(0829): 포맷별 / 지역별 상세 현황.

    열 = [구분] + 일자별(총 좌석수·비중) + 합계(총 좌석수·비중) + 스크린(또는 극장)수 + 회차수
    마지막 '합계' 행만 연한 노랑으로 강조한다 (헤더는 다른 표와 같은 연한 연두).
    """
    dates = block["dates"]
    n = len(dates)

    head1 = [_p("구분", size=8.5, bold=True)]
    head2 = [_p("", size=8.5)]
    for d in dates:
        head1 += [_p(f"{_md(d)} ({_WEEKDAY_KOR[d.weekday()]})", size=8.5, bold=True), _p("")]
        head2 += [_p("총 좌석수", size=8, bold=True), _p("비중", size=8, bold=True)]
    head1 += [_p("합계", size=8.5, bold=True), _p(""),
              _p(block["count_label"], size=8.5, bold=True),
              _p("회차수", size=8.5, bold=True)]
    head2 += [_p("총 좌석수", size=8, bold=True), _p("비중", size=8, bold=True),
              _p(""), _p("")]

    rows = [head1, head2]
    style = _base_table_style(header_rows=2)
    for i, row in enumerate(block["rows"]):
        bold = bool(row.get("is_total"))
        cells = [_p(row["label"], size=8.5, bold=True)]
        for day in row["days"]:
            cells.append(_p(fmt_num(day["seats"], "석"), size=8.5, bold=bold))
            cells.append(_p(fmt_pct(day["share"]), size=8.5, bold=bold))
        cells += [_p(fmt_num(row["total_seats"], "석"), size=8.5, bold=bold),
                  _p(fmt_pct(row["total_share"]), size=8.5, bold=bold),
                  _p(fmt_num(row["count"]), size=8.5, bold=bold),
                  _p(fmt_num(row["shows"]), size=8.5, bold=bold)]
        rows.append(cells)
        if bold:
            style.append(("BACKGROUND", (0, 2 + i), (-1, 2 + i), CREAM))

    # 헤더 병합: 구분·스크린수·회차수는 세로, 일자·합계는 가로
    style.append(("SPAN", (0, 0), (0, 1)))
    col = 1
    for _ in dates:
        style.append(("SPAN", (col, 0), (col + 1, 0)))
        col += 2
    style.append(("SPAN", (col, 0), (col + 1, 0)))
    style.append(("SPAN", (col + 2, 0), (col + 2, 1)))
    style.append(("SPAN", (col + 3, 0), (col + 3, 1)))
    style += [("TOPPADDING", (0, 0), (-1, -1), 3.2),
              ("BOTTOMPADDING", (0, 0), (-1, -1), 3.2)]

    label_w = 74
    tail_w = 58 * 2
    val_w = (CONTENT_W - label_w - tail_w) / ((n + 1) * 2)
    widths = [label_w] + [val_w] * ((n + 1) * 2) + [58, 58]
    t = Table(rows, colWidths=widths)
    t.setStyle(TableStyle(style))
    return t


def _day_movies_table(rows, highlight_main):
    """A001(0829): 경쟁작 일별 상세 현황 — 그 날짜의 전 작품."""
    headers = ["#", "작품명", "총 좌석수", "전주比", "점유비중", "예매좌석수",
               "극장수", "스크린수", "회차수"]
    widths = [26, 168, 88, 128, 66, 82, 60, 62, 62]
    scale = CONTENT_W / sum(widths)
    widths = [w * scale for w in widths]

    out = [_header_cells(headers)]
    style = _base_table_style()
    style += [("TOPPADDING", (0, 0), (-1, -1), 3.0), ("BOTTOMPADDING", (0, 0), (-1, -1), 3.0)]
    for i, s in enumerate(rows, 1):
        star = highlight_main and s["is_main"]
        out.append([
            _p(s["rank"], size=8),
            _p(("★ " + s["title"]) if star else s["title"], size=8, bold=star),
            _p(fmt_num(s["total_seats"]), size=8),
            _cmp_cell(s["seats_cmp"], size=8),
            _p(fmt_pct(s["share"]), size=8),
            _p(fmt_num(s["reserved"]), size=8),
            _p(fmt_num(s["theaters"]), size=8),
            _p(fmt_num(s["screens"]), size=8),
            _p(fmt_num(s["shows"]), size=8),
        ])
        if star:
            style.append(("BACKGROUND", (0, i), (-1, i), CREAM))
    t = Table(out, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle(style))
    return t


def _rank_card_table(labels_rows):
    """경쟁 포지션 카드 표 — 행 목록을 그대로 그린다 (첫 행이 제목 행)."""
    w4 = CONTENT_W / 4
    t = Table(labels_rows, colWidths=[w4] * 4,
              rowHeights=[20] + [24 if i == 1 else 20 for i in range(1, len(labels_rows))])
    t.setStyle(TableStyle(_base_table_style()))
    return t


# ---------- 본문 구성 ----------
def build_pdf(data, out_path, scope=None):
    """A001(0829): 보고서 포맷 개편.

    주요작 있음 (3P)
      P.1 주요작 상영 현황  — 일별 상영 현황 / 멀티별 현황 / 시간대 회차 배정 비중 / 포맷별 상세
      P.2 주요작 상세 현황  — 지역별 상세 / 총 좌석수 기준 극장 TOP 10
      P.3 주요작 vs 경쟁작  — 경쟁 포지션 / 일별 전주 비교
    주요작 없음 (2P + 일자수)
      P.1 경쟁작 전체 상영 요약 — 전체 시장 일별 현황 / 경쟁 포지션 / TOP10 일별 전주 비교
      P.2 경쟁작 일별 상세 현황 — 조회한 일자마다 한 장씩 (그 날의 전 작품)

    scope: A003 시절의 출력 범위 옵션. 화면에서 더 이상 보내지 않고 페이지 구성이
    바뀌어 의미가 없어졌으므로 받기만 하고 쓰지 않는다.
    """
    _ensure_fonts()
    S = _styles()
    p = data["period"]
    cur_s, prev_s = _period_str(p)
    daily = data.get("daily") or {}
    story = []

    if data["mode"] == "main":
        main = data["main"]

        # ===== P.1 주요작 상영 현황 =====
        _page_header(story, S, "P.1 주요작 상영 현황",
                     f"작품명 {main['title']} | {cur_s} | {prev_s}")

        if daily.get("kpi_rows"):
            story.append(Paragraph(f"주요작 일별 상영 현황 - {main['title']}", S["section"]))
            story.append(Spacer(1, 5))
            story.append(_p4_kpi_daily_table(daily["kpi_rows"]))
            story.append(Spacer(1, 11))

        # 멀티별 현황
        story.append(Paragraph("멀티별 현황", S["section"]))
        story.append(Spacer(1, 5))
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
        t.setStyle(TableStyle(_base_table_style() + [
            ("TOPPADDING", (0, 0), (-1, -1), 3.2), ("BOTTOMPADDING", (0, 0), (-1, -1), 3.2)]))
        story.append(t)
        story.append(Spacer(1, 11))

        # 주요작 일자별 주요 시간대 회차 배정 비중
        if daily.get("slots"):
            story.append(Paragraph("주요작 일자별 주요 시간대 회차 배정 비중", S["section"]))
            story.append(Spacer(1, 5))
            story.append(_p4_slot_table(daily["slots"]))
            story.append(Spacer(1, 11))

        # 포맷별 상세 현황
        if data.get("main_formats", {}).get("rows"):
            story.append(Paragraph("포맷별 상세 현황", S["section"]))
            story.append(Spacer(1, 5))
            story.append(_breakdown_table(data["main_formats"]))

        story.append(PageBreak())

        # ===== P.2 주요작 상세 현황 =====
        _page_header(story, S, "P.2 주요작 상세 현황", f"{cur_s} | {prev_s}")

        if data.get("main_regions", {}).get("rows"):
            story.append(Paragraph("지역별 상세 현황", S["section"]))
            story.append(Spacer(1, 5))
            story.append(_breakdown_table(data["main_regions"]))
            story.append(Spacer(1, 14))

        story.append(Paragraph("총 좌석수 기준 극장 TOP 10", S["section"]))
        story.append(Spacer(1, 5))
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

        # ===== P.3 주요작 vs 경쟁작 =====
        _page_header(story, S, "P.3 주요작 vs 경쟁작", f"{cur_s} | {prev_s}")

        story.append(Paragraph(f"주요작 경쟁 포지션  (전체 {data['movie_count']}개 작품 중)",
                               S["section"]))
        story.append(Spacer(1, 5))
        rk = main["ranks"]
        cards = [("좌석수 순위", "seats", fmt_num(main["total_seats"], "석")),
                 ("예매좌석 순위", "reserved", fmt_num(main["reserved"], "석")),
                 ("점유율 순위", "occupancy", fmt_pct(main["occupancy"])),
                 ("회차 순위", "shows", fmt_num(main["shows"], "회"))]
        story.append(_rank_card_table([
            [_p(lbl, size=9, bold=True) for lbl, _, _ in cards],
            [_p(f"{rk[k]['cur']}위", size=13, bold=True) for _, k, _ in cards],
            [_p(v, size=10) for _, _, v in cards],
        ]))
        story.append(Spacer(1, 14))

        if daily.get("top"):
            story.append(Paragraph(
                f"주요작 일별 전주 비교  (경쟁작 총 {data['movie_count']}개 작품)", S["section"]))
            story.append(Spacer(1, 5))
            story.append(_p4_top_daily_table(daily["top"], daily["dates"], highlight_main=True))

    else:
        # ===== P.1 경쟁작 전체 상영 요약 =====
        _page_header(story, S, "P.1 경쟁작 전체 상영 요약",
                     f"주요 상영작 {data['movie_count']}개 작품 | {cur_s} | {prev_s}")

        if daily.get("kpi_rows"):
            story.append(Paragraph("전체 시장 일별 현황", S["section"]))
            story.append(Spacer(1, 5))
            story.append(_p4_kpi_daily_table(daily["kpi_rows"]))
            story.append(Spacer(1, 11))

        story.append(Paragraph("경쟁작 경쟁 포지션", S["section"]))
        story.append(Spacer(1, 5))
        L = data["leaders"]
        cards = [("좌석수 1위", L["seats"], "석"), ("예매좌석 1위", L["reserved"], "석"),
                 ("점유율 1위", L["occupancy"], "%"), ("회차 1위", L["shows"], "회")]
        row_val = []
        for _, c, unit in cards:
            row_val.append(_p(fmt_pct(c["value"]) if unit == "%"
                              else fmt_num(c["value"], unit), size=10))
        row_prev = []
        for _, c, _ in cards:
            txt, red = fmt_rank_cmp(c["prev_rank"], c["cur_rank"])
            row_prev.append(_p(txt, size=9, bold=red, color=RED if red else colors.black))
        story.append(_rank_card_table([
            [_p(lbl, size=9, bold=True) for lbl, _, _ in cards],
            [_p(c["title"], size=10, bold=True) for _, c, _ in cards],
            row_val,
            row_prev,
        ]))
        story.append(Spacer(1, 14))

        if daily.get("top"):
            story.append(Paragraph("총 좌석수 기준 TOP 10 작품 일별 전주 비교", S["section"]))
            story.append(Spacer(1, 5))
            story.append(_p4_top_daily_table(daily["top"], daily["dates"], highlight_main=False))

        # ===== P.2 경쟁작 일별 상세 현황 — 일자마다 한 장 =====
        for i, day in enumerate(daily.get("by_date_movies") or [], 1):
            story.append(PageBreak())
            suffix = "" if i == 1 else f"({i})"
            _page_header(story, S, f"P.2 경쟁작 일별 상세 현황 {suffix}".strip(),
                         f"주요 상영작 {data['movie_count']}개 작품 | {cur_s} | 총 좌석수 기준 내림차순")
            d = day["date"]
            story.append(Paragraph(
                f'<font color="#{COLOR_RED}">{d.strftime("%Y.%m.%d")}'
                f'({_WEEKDAY_KOR[d.weekday()]})</font>', S["section"]))
            story.append(Spacer(1, 6))
            story.append(_day_movies_table(day["rows"], highlight_main=False))

    # 페이지 넘침 방지: 표 행이 많거나(포맷 6종+합계) 전주比가 두 줄로 감기면
    # 내용이 다음 장으로 흘러 로고와 겹친 깨진 페이지가 생긴다. PageBreak 단위로
    # 묶어 KeepInFrame(shrink)으로 감싸면 넘치는 페이지만 살짝 축소돼
    # 샘플과 같은 고정 장수(주요작 있음 3P / 없음 1P+일자수)가 보장된다.
    avail_h = PAGE_SIZE[1] - M_TOP - M_BOTTOM
    pages, cur = [], []
    for fl in story:
        if isinstance(fl, PageBreak):
            pages.append(cur)
            cur = []
        else:
            cur.append(fl)
    if cur:
        pages.append(cur)
    story = []
    for i, pg in enumerate(pages):
        if i:
            story.append(PageBreak())
        story.append(KeepInFrame(CONTENT_W, avail_h, pg, mode="shrink"))

    doc = BaseDocTemplate(out_path, pagesize=PAGE_SIZE,
                          leftMargin=M_LEFT, rightMargin=M_RIGHT,
                          topMargin=M_TOP, bottomMargin=M_BOTTOM)
    frame = Frame(M_LEFT, M_BOTTOM, CONTENT_W, PAGE_SIZE[1] - M_TOP - M_BOTTOM,
                  leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([PageTemplate(id="page", frames=[frame], onPage=_draw_logo)])
    doc.build(story)
    return out_path
