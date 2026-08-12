# -*- coding: utf-8 -*-
"""P001: 영화 상영현황 보고서 — 엑셀 렌더러 (openpyxl).

첨부 샘플(sample_excel / sample_excel_주요작X)의 시트·표 구조·색상을 따른다.
숫자는 PDF와 동일한 ViewModel(aggregation.build_report_data)만 사용한다. (§23)
"""
from openpyxl import Workbook
from openpyxl.drawing.image import Image as XlImage
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from .common import (COLOR_HEADER_GREEN, COLOR_MAIN_CREAM, COLOR_RED, LOGO_PATH,
                     fmt_cmp, fmt_num, fmt_pct, fmt_rank_cmp)

FONT_NAME = "맑은 고딕"
GREEN_FILL = PatternFill(start_color=COLOR_HEADER_GREEN, end_color=COLOR_HEADER_GREEN, fill_type="solid")
CREAM_FILL = PatternFill(start_color=COLOR_MAIN_CREAM, end_color=COLOR_MAIN_CREAM, fill_type="solid")

TITLE_FONT = Font(name=FONT_NAME, size=16, bold=True)
SUB_FONT = Font(name=FONT_NAME, size=9, color="555555")
SECTION_FONT = Font(name=FONT_NAME, size=11, bold=True)
HEADER_FONT = Font(name=FONT_NAME, size=9, bold=True)
DATA_FONT = Font(name=FONT_NAME, size=9)
DATA_BOLD = Font(name=FONT_NAME, size=9, bold=True)
BIG_FONT = Font(name=FONT_NAME, size=14, bold=True)
RED_FONT = Font(name=FONT_NAME, size=9, bold=True, color=COLOR_RED)

_side = Side(style="thin", color="BFBFBF")
BORDER = Border(left=_side, right=_side, top=_side, bottom=_side)
CENTER = Alignment(horizontal="center", vertical="center", wrap_text=False)
LEFT = Alignment(horizontal="left", vertical="center")


def _cell(ws, row, col, value, font=DATA_FONT, fill=None, border=True, align=CENTER):
    c = ws.cell(row=row, column=col, value=value)
    c.font = font
    if fill:
        c.fill = fill
    if border:
        c.border = BORDER
    c.alignment = align
    return c


def _cmp_value(cmp_dict):
    """전주 비교 → (표시문자열, 폰트)"""
    txt, red = fmt_cmp(cmp_dict)
    return txt, (RED_FONT if red else DATA_FONT)


def _sheet_head(ws, title, subtitle, last_col):
    _cell(ws, 1, 1, title, font=TITLE_FONT, border=False, align=LEFT)
    _cell(ws, 2, 1, subtitle, font=SUB_FONT, border=False, align=LEFT)
    # 우측 상단 CASTING LINE 로고 (§22)
    try:
        img = XlImage(LOGO_PATH)
        h = 42
        img.width = int(img.width * h / img.height)
        img.height = h
        ws.add_image(img, f"{get_column_letter(max(last_col - 1, 1))}1")
    except Exception:
        pass


def _write_table(ws, start_row, headers, rows, highlight_rows=None):
    """headers: [str] / rows: [[(값, 폰트|None)]]. 반환: 다음 빈 행 번호"""
    highlight_rows = highlight_rows or set()
    for ci, h in enumerate(headers, 1):
        _cell(ws, start_row, ci, h, font=HEADER_FONT, fill=GREEN_FILL)
    r = start_row + 1
    for ri, row in enumerate(rows):
        fill = CREAM_FILL if ri in highlight_rows else None
        for ci, item in enumerate(row, 1):
            val, font = item if isinstance(item, tuple) else (item, DATA_FONT)
            _cell(ws, r, ci, val, font=font or DATA_FONT, fill=fill)
        r += 1
    return r


def _movie_table_rows(movies, keys, star_main):
    rows, highlights = [], set()
    for i, s in enumerate(movies):
        row = []
        for k in keys:
            if k == "no":
                row.append(i + 1)
            elif k == "title":
                txt = ("★ " + s["title"]) if (star_main and s["is_main"]) else s["title"]
                row.append((txt, DATA_BOLD if (star_main and s["is_main"]) else DATA_FONT))
            elif k == "seats_cmp":
                row.append(_cmp_value(s["seats_cmp"]))
            elif k in ("occupancy", "share"):
                row.append(fmt_pct(s[k]))
            else:
                row.append(fmt_num(s[k]))
        rows.append(row)
        if star_main and s["is_main"]:
            highlights.add(i)
    return rows, highlights


def _set_widths(ws, widths):
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w


def _kpi_block(ws, row, cols):
    """cols: [(라벨, 값, cmp|None)] — 3행(라벨/값/전주비교) KPI 블록"""
    for ci, (label, _, _) in enumerate(cols, 1):
        _cell(ws, row, ci, label, font=HEADER_FONT, fill=GREEN_FILL)
    for ci, (_, value, _) in enumerate(cols, 1):
        _cell(ws, row + 1, ci, value, font=BIG_FONT)
    for ci, (_, _, cmp_dict) in enumerate(cols, 1):
        if cmp_dict is None:
            _cell(ws, row + 2, ci, "-")
        else:
            txt, font = _cmp_value(cmp_dict)
            _cell(ws, row + 2, ci, txt, font=font)
    ws.row_dimensions[row + 1].height = 26


def _period_str(p):
    return (f"조사기간 {p['start'].strftime('%Y.%m.%d')} - {p['end'].strftime('%Y.%m.%d')}",
            f"전주 {p['prev_start'].strftime('%Y.%m.%d')} - {p['prev_end'].strftime('%Y.%m.%d')}")


def build_excel(data, out_path):
    p = data["period"]
    cur_s, prev_s = _period_str(p)
    wb = Workbook()
    wb.remove(wb.active)

    detail_headers = ["#", "작품", "총 좌석수", "전주比", "예매좌석수", "점유율", "스크린", "극장", "회차"]
    detail_keys = ["no", "title", "total_seats", "seats_cmp", "reserved", "occupancy",
                   "screens", "theaters", "shows"]
    p3_headers = ["#", "작품명", "총 좌석수", "전주比", "점유비중", "예매좌석수", "극장수", "스크린수", "회차수"]
    p3_keys = ["no", "title", "total_seats", "seats_cmp", "share", "reserved",
               "theaters", "screens", "shows"]
    widths9 = [5, 30, 13, 22, 13, 10, 10, 10, 10]

    star = data["mode"] == "main"

    # ================= P1 =================
    if data["mode"] == "main":
        main = data["main"]
        ws = wb.create_sheet("P1 주요작 상영 현황")
        _set_widths(ws, [16, 16, 14, 16, 14, 14, 14, 14, 14])
        _sheet_head(ws, "P.1 주요작 상영 현황",
                    f"작품명 {main['title']} | {cur_s} | {prev_s}", last_col=9)
        _cell(ws, 4, 1, "KEY SUMMARY", font=SECTION_FONT, border=False, align=LEFT)
        kc = main["kpi_cmp"]
        _kpi_block(ws, 5, [
            ("총 좌석수", fmt_num(main["total_seats"], "석"), kc["total_seats"]),
            ("예매좌석수", fmt_num(main["reserved"], "석"), kc["reserved"]),
            ("좌석점유율", fmt_pct(main["occupancy"]), kc["occupancy"]),
            ("총 회차", fmt_num(main["shows"], "회"), kc["shows"]),
            ("총 극장수", fmt_num(main["theaters"], "개"), kc["theaters"]),
            ("총 스크린수", fmt_num(main["screens"], "개"), kc["screens"]),
        ])

        _cell(ws, 9, 1, "① 멀티별 현황", font=SECTION_FONT, border=False, align=LEFT)
        multi_rows = []
        for m in data["main_multis"]:
            multi_rows.append([
                m["name"], fmt_num(m["total_seats"]), _cmp_value(m["seats_cmp"]),
                fmt_num(m["reserved"]), fmt_pct(m["occupancy"]),
                fmt_num(m["screens"]), fmt_num(m["theaters"]), fmt_num(m["shows"]),
            ])
        next_r = _write_table(ws, 10, ["멀티", "총 좌석수", "전주比", "예매좌석수", "점유율", "스크린", "극장", "회차"], multi_rows)

        _cell(ws, next_r + 1, 1, "② 총 좌석수 기준 극장 TOP 10", font=SECTION_FONT, border=False, align=LEFT)
        top_rows = []
        for i, th in enumerate(data["main_theaters_top10"], 1):
            top_rows.append([
                i, th["multi"], th["name"], fmt_num(th["total_seats"]),
                _cmp_value(th["seats_cmp"]), fmt_num(th["reserved"]),
                fmt_pct(th["occupancy"]), fmt_num(th["screens"]), fmt_num(th["shows"]),
            ])
        _write_table(ws, next_r + 2, ["#", "멀티", "극장명", "총 좌석수", "전주比", "예매좌석수", "점유율", "스크린", "회차"], top_rows)
    else:
        totals = data["totals"]
        ws = wb.create_sheet("P1 경쟁작 전체 상영 요약")
        _set_widths(ws, [14, 16, 16, 14, 14, 14, 14, 14, 14])
        _sheet_head(ws, "P.1 경쟁작 전체 상영 요약",
                    f"주요 상영작 {data['movie_count']}개 작품 | {cur_s} | {prev_s}", last_col=9)
        _cell(ws, 4, 1, "KEY SUMMARY", font=SECTION_FONT, border=False, align=LEFT)
        kc = totals["kpi_cmp"]
        _kpi_block(ws, 5, [
            ("조사 작품수", f"{totals['movie_count']}편", None),
            ("총 좌석수", fmt_num(totals["total_seats"], "석"), kc["total_seats"]),
            ("예매좌석수", fmt_num(totals["reserved"], "석"), kc["reserved"]),
            ("좌석점유율", fmt_pct(totals["occupancy"]), kc["occupancy"]),
            ("총 회차", fmt_num(totals["shows"], "회"), kc["shows"]),
            ("총 극장수", fmt_num(totals["theaters"], "개"), kc["theaters"]),
            ("총 스크린수", fmt_num(totals["screens"], "개"), kc["screens"]),
        ])

        _cell(ws, 9, 1, "① 경쟁작 상위권 현황", font=SECTION_FONT, border=False, align=LEFT)
        top5_headers = ["#", "작품명", "총 좌석수", "전주比", "예매좌석수", "점유율", "스크린", "극장", "회차"]
        rows, _hl = _movie_table_rows(data["movies"][:5], detail_keys, star_main=False)
        next_r = _write_table(ws, 10, top5_headers, rows)

        _cell(ws, next_r + 1, 1, "② 총 좌석수 기준 작품 TOP 10", font=SECTION_FONT, border=False, align=LEFT)
        top10_headers = ["#", "작품명", "총 좌석수", "전주比", "점유비중", "예매좌석수", "점유율", "스크린", "회차"]
        top10_keys = ["no", "title", "total_seats", "seats_cmp", "share", "reserved",
                      "occupancy", "screens", "shows"]
        rows, _hl = _movie_table_rows(data["movies"][:10], top10_keys, star_main=False)
        _write_table(ws, next_r + 2, top10_headers, rows)

    # ================= P2 =================
    if data["mode"] == "main":
        main = data["main"]
        ws = wb.create_sheet("P2 주요작 vs 주요 경쟁작")
        _set_widths(ws, widths9)
        _sheet_head(ws, "P.2 주요작 vs 경쟁작",
                    f"{cur_s} | 총 좌석수 기준 TOP 10 | {prev_s}", last_col=9)
        _cell(ws, 4, 1, "주요작 경쟁 포지션", font=SECTION_FONT, border=False, align=LEFT)
        rk = main["ranks"]
        cards = [("좌석수 순위", "seats", fmt_num(main["total_seats"], "석")),
                 ("예매좌석 순위", "reserved", fmt_num(main["reserved"], "석")),
                 ("점유율 순위", "occupancy", fmt_pct(main["occupancy"])),
                 ("회차 순위", "shows", fmt_num(main["shows"], "회"))]
        for ci, (label, _, _) in enumerate(cards, 1):
            _cell(ws, 5, ci, label, font=HEADER_FONT, fill=GREEN_FILL)
        for ci, (_, k, _) in enumerate(cards, 1):
            _cell(ws, 6, ci, f"{rk[k]['cur']}위", font=DATA_BOLD)
        for ci, (_, _, v) in enumerate(cards, 1):
            _cell(ws, 7, ci, v)
        for ci, (_, k, _) in enumerate(cards, 1):
            txt, red = fmt_rank_cmp(rk[k]["prev"], rk[k]["cur"])
            _cell(ws, 8, ci, txt, font=RED_FONT if red else DATA_FONT)

        _cell(ws, 10, 1, "① 경쟁작 상세 비교", font=SECTION_FONT, border=False, align=LEFT)
        rows, hl = _movie_table_rows(data["movies"][:10], detail_keys, star_main=True)
        _write_table(ws, 11, detail_headers, rows, highlight_rows=hl)
    else:
        ws = wb.create_sheet("P2 경쟁작 현황")
        _set_widths(ws, widths9)
        _sheet_head(ws, "P.2 경쟁작 경쟁 현황",
                    f"{cur_s} | 총 좌석수 기준 TOP 10 | {prev_s}", last_col=9)
        _cell(ws, 4, 1, "경쟁작 경쟁 포지션", font=SECTION_FONT, border=False, align=LEFT)
        L = data["leaders"]
        cards = [("좌석수 1위", L["seats"]), ("예매좌석 1위", L["reserved"]),
                 ("점유율 1위", L["occupancy"]), ("회차 1위", L["shows"])]
        for ci, (label, _) in enumerate(cards, 1):
            _cell(ws, 5, ci, label, font=HEADER_FONT, fill=GREEN_FILL)
        for ci, (_, c) in enumerate(cards, 1):
            _cell(ws, 6, ci, c["title"], font=DATA_BOLD)
        for ci, (_, c) in enumerate(cards, 1):
            val = fmt_pct(c["value"]) if c["unit"] == "%" else fmt_num(c["value"], c["unit"])
            _cell(ws, 7, ci, val)
        for ci, (_, c) in enumerate(cards, 1):
            txt, red = fmt_rank_cmp(c["prev_rank"], c["cur_rank"])
            _cell(ws, 8, ci, txt, font=RED_FONT if red else DATA_FONT)

        _cell(ws, 10, 1, "① 경쟁작 상세 비교", font=SECTION_FONT, border=False, align=LEFT)
        rows, _hl = _movie_table_rows(data["movies"][:10], detail_keys, star_main=False)
        _write_table(ws, 11, detail_headers, rows)

    # ================= P3 =================
    sheet3 = "P3 전체 경쟁작 상영 현황"
    ws = wb.create_sheet(sheet3)
    _set_widths(ws, widths9)
    if data["mode"] == "main":
        sub3 = f"주요작 포함 {data['movie_count']}개 작품 | {cur_s} | 총 좌석수 기준 내림차순"
    else:
        sub3 = f"주요 상영작 {data['movie_count']}개 작품 | {cur_s} | 총 좌석수 기준 내림차순"
    _sheet_head(ws, "P.3 전체 경쟁작 상영 현황", sub3, last_col=9)
    rows, hl = _movie_table_rows(data["movies"], p3_keys, star_main=star)
    _write_table(ws, 4, p3_headers, rows, highlight_rows=hl)

    for ws in wb.worksheets:
        ws.sheet_view.showGridLines = False

    wb.save(out_path)
    return out_path
