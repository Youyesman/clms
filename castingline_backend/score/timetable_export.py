# -*- coding: utf-8 -*-
"""T001·T003(0827): 시간표 조회 — 화면 그대로 엑셀/PDF 내보내기.

- '상영일자 추이' 그래프는 제외하고, 화면의 표들을 그대로 담는다.
- 두 출력물 모두 우측 상단에 캐스팅라인 로고를 넣는다.
- 숫자는 timetable_agg 의 화면용 데이터만 사용하므로 화면과 완전히 일치한다.
"""
import io

from openpyxl import Workbook
from openpyxl.drawing.image import Image as XlImage
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from crawler.report.common import LOGO_PATH, find_korean_font

# ---------- 엑셀 공통 ----------
FONT = "맑은 고딕"
_side = Side(style="thin", color="BFBFBF")
BORDER = Border(left=_side, right=_side, top=_side, bottom=_side)
HEAD_FILL = PatternFill(start_color="D9E1F2", end_color="D9E1F2", fill_type="solid")
TOTAL_FILL = PatternFill(start_color="FFE699", end_color="FFE699", fill_type="solid")
TITLE_FONT = Font(name=FONT, size=14, bold=True)
BOLD = Font(name=FONT, size=10, bold=True)
NORM = Font(name=FONT, size=10)
RED_BOLD = Font(name=FONT, size=9, bold=True, color="D83A34")
BLUE_BOLD = Font(name=FONT, size=9, bold=True, color="1D4ED8")
CENTER = Alignment(horizontal="center", vertical="center", wrap_text=True)


def _put(ws, r, c, v, font=NORM, fill=None, fmt=None, border=True):
    cell = ws.cell(row=r, column=c, value=v)
    cell.font = font
    cell.alignment = CENTER
    if border:
        cell.border = BORDER
    if fill:
        cell.fill = fill
    if fmt:
        cell.number_format = fmt
    return cell


def _row(ws, r, values, font=NORM, fill=None, fmts=None):
    for i, v in enumerate(values, 1):
        fmt = None
        if fmts:
            fmt = fmts.get(i)
        elif isinstance(v, int):
            fmt = "#,##0"
        _put(ws, r, i, v, font=font, fill=fill, fmt=fmt)
    return r + 1


def _logo(ws, last_col):
    """우측 상단 캐스팅라인 로고."""
    try:
        img = XlImage(LOGO_PATH)
        h = 40
        img.width = int(img.width * h / img.height)
        img.height = h
        ws.add_image(img, f"{get_column_letter(max(last_col - 1, 1))}1")
    except Exception:
        pass


def _autow(ws, min_width=8, max_width=30):
    for i, col in enumerate(ws.columns, 1):
        m = 0
        for c in col:
            if c.value is None:
                continue
            v = str(c.value)
            m = max(m, sum(2 if ord(ch) > 127 else 1 for ch in v.split("\n")[0]))
        ws.column_dimensions[get_column_letter(i)].width = min(max((m + 2) * 1.05, min_width), max_width)


def _cmp_txt(c, unit=""):
    if not c:
        return ""
    d = c.get("diff", 0)
    arrow = "▲" if d >= 0 else "▼"
    rate = c.get("rate")
    rate_s = f" ({rate:+.1f}%)" if rate is not None else ""
    return f"{arrow} {d:+,d}{unit}{rate_s}"


PCT = '0.0"%"'


# =====================================================================
# T001: 집계작 시간표 엑셀
# =====================================================================

def timetable_excel_bytes(data):
    meta = data["meta"]
    ks = data["key_summary"]
    wb = Workbook()
    ws = wb.active
    ws.title = "집계작 시간표"
    ws.sheet_view.showGridLines = False

    n_days = len(data["region_detail"]["dates"])
    last_col = max(7, 2 * n_days + 5)
    _put(ws, 1, 1, f"집계작 시간표 — {meta['movie_title']}", font=TITLE_FONT, border=False)
    _put(ws, 2, 1,
         f"조사기간 {meta['date_from']} ~ {meta['date_to']}  |  전주 {meta['prev_from']} ~ {meta['prev_to']}"
         f"  |  개봉일 {meta.get('release_date') or '-'}  |  수집 완료 {meta.get('last_crawled_at') or '-'}",
         font=NORM, border=False)
    _logo(ws, last_col)

    r = 4
    # ---- KEY SUMMARY ----
    r = _row(ws, r, ["KEY SUMMARY"], font=BOLD)
    headers = ["지표", "총 좌석수", "예매좌석수", "좌석점유율", "총 회차", "총 극장수", "총 스크린수"]
    r = _row(ws, r, headers, font=BOLD, fill=HEAD_FILL)
    t = ks["total"]

    def kpi_vals(row):
        return [row["total_seats"], row["sold_seats"], row["occupancy"],
                row["shows"], row["theaters"], row["screens"]]

    fmts = {2: "#,##0", 3: "#,##0", 4: PCT, 5: "#,##0", 6: "#,##0", 7: "#,##0"}
    r = _row(ws, r, [t["label"]] + kpi_vals(t), font=BOLD, fill=TOTAL_FILL, fmts=fmts)
    if t.get("cmp"):
        c = t["cmp"]
        vals = ["전주 대비",
                _cmp_txt(c["total_seats"], "석"), _cmp_txt(c["sold_seats"], "석"),
                ("▲" if c["occupancy"]["diff"] >= 0 else "▼") + f" {abs(c['occupancy']['diff']):.1f}%p",
                _cmp_txt(c["shows"], "회"), _cmp_txt(c["theaters"], "개"), _cmp_txt(c["screens"], "개")]
        for i, v in enumerate(vals, 1):
            _put(ws, r, i, v, font=RED_BOLD if i > 1 else BOLD)
        r += 1
    for day in ks["days"]:
        r = _row(ws, r, [day["label"]] + kpi_vals(day), fmts=fmts)
    r += 1

    # ---- 지역별 / 포맷별 상세 ----
    def detail_block(r, title, detail):
        r = _row(ws, r, [title], font=BOLD)
        labels = detail["labels"]
        head1 = ["구분"]
        for lb in labels:
            head1 += [lb, ""]
        head1 += ["합계", "", detail["count_label"], f"회차수\n({len(labels)}일 합계)"]
        head2 = [""]
        for _ in labels:
            head2 += ["총 좌석수", "비중"]
        head2 += ["총 좌석수", "비중", "", ""]
        hr1, hr2 = r, r + 1
        for i, v in enumerate(head1, 1):
            _put(ws, hr1, i, v, font=BOLD, fill=HEAD_FILL)
        for i, v in enumerate(head2, 1):
            _put(ws, hr2, i, v, font=BOLD, fill=HEAD_FILL)
        # 헤더 병합: 구분/극장수/회차수 세로, 날짜·합계 가로
        ws.merge_cells(start_row=hr1, start_column=1, end_row=hr2, end_column=1)
        col = 2
        for _ in labels:
            ws.merge_cells(start_row=hr1, start_column=col, end_row=hr1, end_column=col + 1)
            col += 2
        ws.merge_cells(start_row=hr1, start_column=col, end_row=hr1, end_column=col + 1)
        ws.merge_cells(start_row=hr1, start_column=col + 2, end_row=hr2, end_column=col + 2)
        ws.merge_cells(start_row=hr1, start_column=col + 3, end_row=hr2, end_column=col + 3)
        r = hr2 + 1
        for row in detail["rows"]:
            vals = [row["label"]]
            fmts_d = {}
            ci = 2
            for d in row["days"]:
                vals += [d["seats"], d["share"]]
                fmts_d[ci] = "#,##0"
                fmts_d[ci + 1] = PCT
                ci += 2
            vals += [row["total_seats"], row["total_share"], row["count"], row["shows"]]
            fmts_d[ci] = "#,##0"
            fmts_d[ci + 1] = PCT
            fmts_d[ci + 2] = "#,##0"
            fmts_d[ci + 3] = "#,##0"
            is_total = bool(row.get("is_total"))
            r = _row(ws, r, vals, font=BOLD if is_total else NORM,
                     fill=TOTAL_FILL if is_total else None, fmts=fmts_d)
        return r + 1

    r = detail_block(r, "지역별 상세 현황", data["region_detail"])
    r = detail_block(r, "포맷별 상세 현황", data["format_detail"])

    _autow(ws)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# =====================================================================
# T003: 경쟁작 엑셀
# =====================================================================

def competitor_excel_bytes(data):
    wb = Workbook()
    wb.remove(wb.active)
    meta = data["meta"]

    for tab in data["tabs"]:
        title = tab["label"].replace("/", ".")
        ws = wb.create_sheet(title[:28])
        ws.sheet_view.showGridLines = False
        _put(ws, 1, 1, f"경쟁작 성과 종합 — {tab['label']}", font=TITLE_FONT, border=False)
        _put(ws, 2, 1, f"조사기간 {meta['date_from']} ~ {meta['date_to']}"
                       f"  |  경쟁작 {meta['movie_count']}편  |  수집 완료 {meta.get('last_crawled_at') or '-'}",
             font=NORM, border=False)
        _logo(ws, 8)
        r = 4

        # ① 종합 요약
        r = _row(ws, r, [f"{meta['movie_count']}개 경쟁작 성과 종합 요약"], font=BOLD)
        r = _row(ws, r, ["순위", "영화명", "총 좌석수", "평균 좌석점유율", "총 상영회차",
                         "스크린수", "총 극장수"], font=BOLD, fill=HEAD_FILL)
        for i, s in enumerate(tab["summary"]):
            fill = TOTAL_FILL if i == 0 else None
            r = _row(ws, r, [s["rank"], ("★ " if i == 0 else "") + s["title"], s["total_seats"],
                             s["occupancy"], s["shows"], s["screens"], s["theaters"]],
                     font=BOLD if i == 0 else NORM, fill=fill,
                     fmts={3: "#,##0", 4: PCT, 5: "#,##0", 6: "#,##0", 7: "#,##0"})
        r += 1

        # ② 권역별
        r = _row(ws, r, ["서울 및 주요 권역별 좌석 점유 현황"], font=BOLD)
        r = _row(ws, r, ["영화명", "서울 좌석수", "서울 좌점율", "서울 비중",
                         "수도권(경강) 좌석수", "수도권 좌점율",
                         "그 외 지방 좌석수", "지방 좌점율"], font=BOLD, fill=HEAD_FILL)
        for row in tab["regions"]:
            r = _row(ws, r, [row["title"],
                             row["seoul"]["seats"], row["seoul"]["occupancy"], row["seoul"]["share"],
                             row["metro"]["seats"], row["metro"]["occupancy"],
                             row["local"]["seats"], row["local"]["occupancy"]],
                     fmts={2: "#,##0", 3: PCT, 4: PCT, 5: "#,##0", 6: PCT, 7: "#,##0", 8: PCT})
        r += 1

        # ③ 골든타임
        r = _row(ws, r, ["골든타임(14~21시) 집중도"], font=BOLD)
        r = _row(ws, r, ["영화명", "골든타임 좌석수", "골든타임 점유율", "골든타임 비중"],
                 font=BOLD, fill=HEAD_FILL)
        for row in tab["golden"]:
            r = _row(ws, r, [row["title"], row["seats"], row["occupancy"], row["share"]],
                     fmts={2: "#,##0", 3: PCT, 4: PCT})
        r += 1

        # ④ 특별관
        r = _row(ws, r, ["특별관 (IMAX/4DX/Dolby)"], font=BOLD)
        r = _row(ws, r, ["영화명", "특별관 회차", "특별관 좌석수"], font=BOLD, fill=HEAD_FILL)
        if tab["special"]:
            for row in tab["special"]:
                r = _row(ws, r, [row["title"], row["shows"], row["seats"]],
                         fmts={2: "#,##0", 3: "#,##0"})
        else:
            r = _row(ws, r, ["특별관 상영 데이터 없음", "", ""])
        r += 1

        # ⑤ 계열사별 세부 현황
        bb = tab["by_brand"]
        if bb["movies"]:
            r = _row(ws, r, ["계열사별 세부 현황"], font=BOLD)
            r = _row(ws, r, ["구분"] + bb["movies"], font=BOLD, fill=HEAD_FILL)
            for row in bb["rows"]:
                vals = [row["brand"]] + [
                    f"{c['seats']:,}석 ({c['share']:.1f}%)" if c["seats"] else "0석 (0.0%)"
                    for c in row["cells"]]
                r = _row(ws, r, vals)

        _autow(ws)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# =====================================================================
# PDF 공통 (reportlab)
# =====================================================================

def _pdf_doc(buf, title):
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.units import mm
    from reportlab.platypus import BaseDocTemplate, Frame, PageTemplate
    from reportlab.lib.utils import ImageReader

    page_size = landscape(A4)
    margins = dict(leftMargin=28, rightMargin=28, topMargin=34, bottomMargin=24)

    def on_page(canvas, doc):
        # 우측 상단 캐스팅라인 로고
        try:
            img = ImageReader(LOGO_PATH)
            iw, ih = img.getSize()
            h = 11 * mm
            w = iw * h / ih
            canvas.drawImage(img, page_size[0] - 28 - w, page_size[1] - 30 - 2,
                             width=w, height=h, mask='auto')
        except Exception:
            pass

    doc = BaseDocTemplate(buf, pagesize=page_size, title=title, **margins)
    frame = Frame(margins['leftMargin'], margins['bottomMargin'],
                  page_size[0] - margins['leftMargin'] - margins['rightMargin'],
                  page_size[1] - margins['topMargin'] - margins['bottomMargin'])
    doc.addPageTemplates([PageTemplate(id='page', frames=[frame], onPage=on_page)])
    content_w = page_size[0] - margins['leftMargin'] - margins['rightMargin']
    return doc, content_w


_FONT_REGISTERED = False
PDF_FONT = "KR"
PDF_FONT_B = "KR-B"


def _ensure_pdf_fonts():
    global _FONT_REGISTERED
    if _FONT_REGISTERED:
        return
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    regular, bold = find_korean_font()
    pdfmetrics.registerFont(TTFont(PDF_FONT, regular))
    pdfmetrics.registerFont(TTFont(PDF_FONT_B, bold))
    _FONT_REGISTERED = True


def _pp(txt, size=8, bold=False, color=None, align="CENTER"):
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.platypus import Paragraph
    from reportlab.lib import colors
    st = ParagraphStyle(
        "c", fontName=PDF_FONT_B if bold else PDF_FONT, fontSize=size,
        leading=size + 3, textColor=color or colors.black,
        alignment={"LEFT": 0, "CENTER": 1, "RIGHT": 2}[align])
    return Paragraph(str(txt), st)


def _pdf_table(rows, col_widths, header_rows=1, total_rows=()):
    from reportlab.platypus import Table, TableStyle
    from reportlab.lib import colors
    HEAD = colors.HexColor("#D9E1F2")
    TOTAL = colors.HexColor("#FFE699")
    GRID = colors.HexColor("#BFBFBF")
    st = [
        ("GRID", (0, 0), (-1, -1), 0.5, GRID),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("BACKGROUND", (0, 0), (-1, header_rows - 1), HEAD),
    ]
    for tr in total_rows:
        st.append(("BACKGROUND", (0, tr), (-1, tr), TOTAL))
    t = Table(rows, colWidths=col_widths, repeatRows=header_rows)
    t.setStyle(TableStyle(st))
    return t


def _fnum(n):
    return f"{int(round(n)):,}"


def _fpct(v):
    return f"{v:.1f}%"


# =====================================================================
# T001: 집계작 시간표 PDF
# =====================================================================

def timetable_pdf_bytes(data):
    from reportlab.lib import colors
    from reportlab.platypus import Spacer

    _ensure_pdf_fonts()
    meta = data["meta"]
    ks = data["key_summary"]
    RED = colors.HexColor("#D83A34")

    buf = io.BytesIO()
    doc, content_w = _pdf_doc(buf, f"집계작 시간표 — {meta['movie_title']}")
    story = []

    story.append(_pp(f"집계작 시간표 — {meta['movie_title']}", size=16, bold=True, align="LEFT"))
    story.append(Spacer(1, 3))
    story.append(_pp(
        f"조사기간 {meta['date_from']} ~ {meta['date_to']}  |  전주 {meta['prev_from']} ~ {meta['prev_to']}"
        f"  |  개봉일 {meta.get('release_date') or '-'}  |  배급사 {meta.get('distributor_name') or '-'}"
        f"  |  수집 완료 {meta.get('last_crawled_at') or '-'}",
        size=8.5, align="LEFT"))
    story.append(Spacer(1, 10))

    # ---- KEY SUMMARY ----
    story.append(_pp("KEY SUMMARY", size=11, bold=True, align="LEFT"))
    story.append(Spacer(1, 4))
    head = [_pp(h, bold=True) for h in
            ["지표", "총 좌석수", "예매좌석수", "좌석점유율", "총 회차", "총 극장수", "총 스크린수"]]
    rows = [head]
    t = ks["total"]

    def kpi_cells(row, bold=False):
        return [_pp(_fnum(row["total_seats"]) + "석", bold=bold),
                _pp(_fnum(row["sold_seats"]) + "석", bold=bold),
                _pp(_fpct(row["occupancy"]), bold=bold),
                _pp(_fnum(row["shows"]) + "회", bold=bold),
                _pp(_fnum(row["theaters"]) + "개", bold=bold),
                _pp(_fnum(row["screens"]) + "개", bold=bold)]

    rows.append([_pp(t["label"], bold=True)] + kpi_cells(t, bold=True))
    total_rows = [1]
    if t.get("cmp"):
        c = t["cmp"]
        occ_d = c["occupancy"]["diff"]
        rows.append([
            _pp("전주 대비", bold=True),
            _pp(_cmp_txt(c["total_seats"], "석"), color=RED, bold=True),
            _pp(_cmp_txt(c["sold_seats"], "석"), color=RED, bold=True),
            _pp(("▲" if occ_d >= 0 else "▼") + f" {abs(occ_d):.1f}%p", color=RED, bold=True),
            _pp(_cmp_txt(c["shows"], "회"), color=RED, bold=True),
            _pp(_cmp_txt(c["theaters"], "개"), color=RED, bold=True),
            _pp(_cmp_txt(c["screens"], "개"), color=RED, bold=True),
        ])
    for day in ks["days"]:
        rows.append([_pp(day["label"])] + kpi_cells(day))
    w0 = content_w * 0.14
    wn = (content_w - w0) / 6
    story.append(_pdf_table(rows, [w0] + [wn] * 6, total_rows=total_rows))
    story.append(Spacer(1, 12))

    # ---- 지역별 / 포맷별 ----
    def detail_table(title, detail):
        story.append(_pp(title, size=11, bold=True, align="LEFT"))
        story.append(Spacer(1, 4))
        labels = detail["labels"]
        head1 = [_pp("구분", bold=True)]
        head2 = [_pp("", bold=True)]
        for lb in labels:
            head1 += [_pp(lb, bold=True), _pp("", bold=True)]
            head2 += [_pp("총 좌석수", bold=True), _pp("비중", bold=True)]
        head1 += [_pp("합계", bold=True), _pp("", bold=True),
                  _pp(detail["count_label"], bold=True), _pp("회차수", bold=True)]
        head2 += [_pp("총 좌석수", bold=True), _pp("비중", bold=True), _pp("", bold=True), _pp("", bold=True)]
        rows = [head1, head2]
        total_rows = []
        for i, row in enumerate(detail["rows"]):
            bold = bool(row.get("is_total"))
            cells = [_pp(row["label"], bold=bold)]
            for d in row["days"]:
                cells += [_pp(_fnum(d["seats"]) + "석", bold=bold), _pp(_fpct(d["share"]), bold=bold)]
            cells += [_pp(_fnum(row["total_seats"]) + "석", bold=bold),
                      _pp(_fpct(row["total_share"]), bold=bold),
                      _pp(_fnum(row["count"]), bold=bold),
                      _pp(_fnum(row["shows"]), bold=bold)]
            rows.append(cells)
            if row.get("is_total"):
                total_rows.append(2 + i)
        n_cols = 1 + 2 * len(labels) + 4
        w0 = content_w * 0.09
        wn = (content_w - w0) / (n_cols - 1)
        from reportlab.platypus import Table, TableStyle
        from reportlab.lib import colors as _c
        tbl = _pdf_table(rows, [w0] + [wn] * (n_cols - 1), header_rows=2, total_rows=total_rows)
        # 날짜·합계 가로 병합, 구분·극장수·회차수 세로 병합
        spans = [("SPAN", (0, 0), (0, 1))]
        col = 1
        for _ in labels:
            spans.append(("SPAN", (col, 0), (col + 1, 0)))
            col += 2
        spans.append(("SPAN", (col, 0), (col + 1, 0)))
        spans.append(("SPAN", (col + 2, 0), (col + 2, 1)))
        spans.append(("SPAN", (col + 3, 0), (col + 3, 1)))
        tbl.setStyle(TableStyle(spans))
        story.append(tbl)
        story.append(Spacer(1, 12))

    detail_table("지역별 상세 현황", data["region_detail"])
    detail_table("포맷별 상세 현황", data["format_detail"])

    doc.build(story)
    return buf.getvalue()


# =====================================================================
# T003: 경쟁작 PDF
# =====================================================================

def competitor_pdf_bytes(data):
    from reportlab.platypus import PageBreak, Spacer

    _ensure_pdf_fonts()
    meta = data["meta"]

    buf = io.BytesIO()
    doc, content_w = _pdf_doc(buf, "경쟁작 성과 종합")
    story = []

    for ti, tab in enumerate(data["tabs"]):
        if ti > 0:
            story.append(PageBreak())
        story.append(_pp(f"경쟁작 성과 종합 — {tab['label']}", size=15, bold=True, align="LEFT"))
        story.append(Spacer(1, 3))
        story.append(_pp(
            f"조사기간 {meta['date_from']} ~ {meta['date_to']}  |  경쟁작 {meta['movie_count']}편"
            f"  |  수집 완료 {meta.get('last_crawled_at') or '-'}", size=8.5, align="LEFT"))
        story.append(Spacer(1, 10))

        # ① 종합 요약
        story.append(_pp("경쟁작 성과 종합 요약", size=11, bold=True, align="LEFT"))
        story.append(Spacer(1, 4))
        rows = [[_pp(h, bold=True) for h in
                 ["순위", "영화명", "총 좌석수", "평균 좌석점유율", "총 상영회차", "스크린수", "총 극장수"]]]
        total_rows = []
        for i, s in enumerate(tab["summary"]):
            bold = i == 0
            rows.append([_pp(s["rank"], bold=bold),
                         _pp(("★ " if bold else "") + s["title"], bold=bold, align="LEFT"),
                         _pp(_fnum(s["total_seats"]) + "석", bold=bold),
                         _pp(_fpct(s["occupancy"]), bold=bold),
                         _pp(_fnum(s["shows"]) + "회", bold=bold),
                         _pp(_fnum(s["screens"]) + "개", bold=bold),
                         _pp(_fnum(s["theaters"]) + "개", bold=bold)])
            if bold:
                total_rows.append(1)
        w = content_w
        story.append(_pdf_table(rows, [w * 0.06, w * 0.28, w * 0.14, w * 0.14, w * 0.13, w * 0.12, w * 0.13],
                                total_rows=total_rows))
        story.append(Spacer(1, 10))

        # ② 권역별
        story.append(_pp("서울 및 주요 권역별 좌석 점유 현황", size=11, bold=True, align="LEFT"))
        story.append(Spacer(1, 4))
        rows = [[_pp(h, bold=True) for h in
                 ["영화명", "서울 좌석수", "서울 좌점율", "서울 비중",
                  "수도권(경강) 좌석수", "수도권 좌점율", "그 외 지방 좌석수", "지방 좌점율"]]]
        for row in tab["regions"]:
            rows.append([_pp(row["title"], align="LEFT"),
                         _pp(_fnum(row["seoul"]["seats"]) + "석"), _pp(_fpct(row["seoul"]["occupancy"])),
                         _pp(_fpct(row["seoul"]["share"])),
                         _pp(_fnum(row["metro"]["seats"]) + "석"), _pp(_fpct(row["metro"]["occupancy"])),
                         _pp(_fnum(row["local"]["seats"]) + "석"), _pp(_fpct(row["local"]["occupancy"]))])
        wn = (content_w - content_w * 0.2) / 7
        story.append(_pdf_table(rows, [content_w * 0.2] + [wn] * 7))
        story.append(Spacer(1, 10))

        # ③ 골든타임 + ④ 특별관 (나란히 대신 순차)
        story.append(_pp("골든타임(14~21시) 집중도", size=11, bold=True, align="LEFT"))
        story.append(Spacer(1, 4))
        rows = [[_pp(h, bold=True) for h in ["영화명", "골든타임 좌석수", "골든타임 점유율", "골든타임 비중"]]]
        for row in tab["golden"]:
            rows.append([_pp(row["title"], align="LEFT"), _pp(_fnum(row["seats"]) + "석"),
                         _pp(_fpct(row["occupancy"])), _pp(_fpct(row["share"]))])
        wn = (content_w - content_w * 0.3) / 3
        story.append(_pdf_table(rows, [content_w * 0.3] + [wn] * 3))
        story.append(Spacer(1, 10))

        story.append(_pp("특별관 (IMAX/4DX/Dolby)", size=11, bold=True, align="LEFT"))
        story.append(Spacer(1, 4))
        rows = [[_pp(h, bold=True) for h in ["영화명", "특별관 회차", "특별관 좌석수"]]]
        if tab["special"]:
            for row in tab["special"]:
                rows.append([_pp(row["title"], align="LEFT"),
                             _pp(_fnum(row["shows"]) + "회"), _pp(_fnum(row["seats"]) + "석")])
        else:
            rows.append([_pp("특별관 상영 데이터 없음", align="LEFT"), _pp("-"), _pp("-")])
        wn = (content_w - content_w * 0.3) / 2
        story.append(_pdf_table(rows, [content_w * 0.3] + [wn] * 2))
        story.append(Spacer(1, 10))

        # ⑤ 계열사별 세부 현황 — 작품이 많으면 8개씩 끊어 표를 나눈다
        bb = tab["by_brand"]
        if bb["movies"]:
            story.append(_pp("계열사별 세부 현황", size=11, bold=True, align="LEFT"))
            story.append(Spacer(1, 4))
            CHUNK = 8
            for start in range(0, len(bb["movies"]), CHUNK):
                movies = bb["movies"][start:start + CHUNK]
                rows = [[_pp("구분", bold=True)] + [_pp(m, bold=True) for m in movies]]
                for row in bb["rows"]:
                    cells = [_pp(row["brand"], bold=True)]
                    for c in row["cells"][start:start + CHUNK]:
                        cells.append(_pp(f"{_fnum(c['seats'])}석 ({c['share']:.1f}%)"))
                    rows.append(cells)
                w0 = content_w * 0.1
                wn = (content_w - w0) / max(len(movies), 1)
                story.append(_pdf_table(rows, [w0] + [wn] * len(movies)))
                story.append(Spacer(1, 6))

    doc.build(story)
    return buf.getvalue()
