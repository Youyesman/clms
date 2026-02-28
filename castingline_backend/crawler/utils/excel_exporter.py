import os
import re
import logging
from datetime import datetime
from collections import defaultdict

import pandas as pd
from django.conf import settings
from openpyxl import Workbook
from openpyxl.styles import PatternFill, Border, Side, Alignment, Font
from openpyxl.utils import get_column_letter

from crawler.models import MovieSchedule
from client.models import Client

logger = logging.getLogger(__name__)


def export_schedules_to_excel(start_date_str, end_date_str, companies=None, target_titles=None, failures=None):
    """
    Exports MovieSchedule data and Failure logs to an Excel file.
    """
    save_dir = os.path.join(settings.BASE_DIR, 'media', 'crawler_exports')
    os.makedirs(save_dir, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"crawler_result_{timestamp}.xlsx"
    file_path = os.path.join(save_dir, filename)

    with pd.ExcelWriter(file_path, engine='openpyxl') as writer:
        if failures:
            df_all = pd.DataFrame(failures)
            desired_order = ['brand', 'region', 'theater', 'date', 'reason', 'worker']
            cols = [c for c in desired_order if c in df_all.columns] + [c for c in df_all.columns if c not in desired_order]
            df_all = df_all[cols]
            unique_dates = df_all['date'].unique()
            for d_val in unique_dates:
                sheet_name_safe = str(d_val).replace('/', '').replace('\\', '').replace(':', '')
                sheet_title = f"Fail_{sheet_name_safe}"[:30]
                df_sub = df_all[df_all['date'] == d_val]
                df_sub.to_excel(writer, sheet_name=sheet_title, index=False)
        else:
            df_summary = pd.DataFrame([{
                '결과': '수집 완료',
                '수집 기간': f"{start_date_str} ~ {end_date_str}",
                '수집 대상': ', '.join(companies) if companies else '전체',
                '실패 건수': 0,
                '비고': '모든 극장 데이터 정상 수집됨'
            }])
            df_summary.to_excel(writer, sheet_name='수집결과', index=False)

    return file_path


# ===== Styles =====
BLUE_FILL = PatternFill(start_color="D9E1F2", end_color="D9E1F2", fill_type="solid")
YELLOW_FILL = PatternFill(start_color="FFFF00", end_color="FFFF00", fill_type="solid")
YELLOW_LIGHT = PatternFill(start_color="FFE699", end_color="FFE699", fill_type="solid")
BLACK_FILL = PatternFill(start_color="000000", end_color="000000", fill_type="solid")

THIN_BORDER = Border(
    left=Side(style='thin'), right=Side(style='thin'),
    top=Side(style='thin'), bottom=Side(style='thin')
)

CENTER = Alignment(horizontal='center', vertical='center')
LEFT = Alignment(horizontal='left', vertical='center')

TITLE_FONT = Font(name='맑은 고딕', size=14, bold=True, color="0000FF")
INFO_FONT = Font(name='맑은 고딕', size=10, color="FF0000")
HEADER_FONT = Font(name='맑은 고딕', size=10, bold=True)
WHITE_FONT = Font(name='맑은 고딕', size=10, bold=True, color="FFFFFF")
DATA_FONT = Font(name='맑은 고딕', size=10)
BOLD_FONT = Font(name='맑은 고딕', size=10, bold=True)


def _safe_int(val):
    try:
        return int(val)
    except:
        return 0


def _fmt_number(n):
    """Format number with comma separator as string."""
    if isinstance(n, float):
        return f"{n:,.1f}"
    return f"{int(n):,}"


def _auto_width(ws, min_row=1):
    """Auto-adjust column widths based on content."""
    for i, col_cells in enumerate(ws.columns, 1):
        max_len = 0
        for cell in col_cells:
            if cell.row < min_row:
                continue
            try:
                if cell.value:
                    val = str(cell.value)
                    width = sum(2 if ord(c) > 127 else 1 for c in val)
                    max_len = max(max_len, width)
            except:
                pass
        adj = (max_len + 2) * 1.1
        ws.column_dimensions[get_column_letter(i)].width = min(max(adj, 8), 50)


def _build_region_map():
    """Build (brand, theater_name) -> region mapping from Client model."""
    clients = Client.objects.filter(excel_theater_name__isnull=False).values(
        'theater_kind', 'excel_theater_name', 'theater_name', 'client_name', 'region_code'
    )

    region_map = {}

    def normalize_brand(kind):
        if not kind:
            return None
        k = kind.upper()
        if 'CGV' in k: return 'CGV'
        if 'LOTTE' in k or '롯데' in k: return 'LOTTE'
        if 'MEGA' in k or '메가' in k: return 'MEGABOX'
        if 'CINEQ' in k or '씨네큐' in k: return 'CINEQ'
        return kind

    for c in clients:
        brand = normalize_brand(c['theater_kind'])
        if not brand or not c['region_code']:
            continue
        region = c['region_code']
        if c['excel_theater_name']:
            region_map[(brand, c['excel_theater_name'].replace(" ", ""))] = region
        if c['theater_name']:
            region_map[(brand, c['theater_name'].replace(" ", ""))] = region

    return region_map


def _resolve_region(brand, theater, region_map):
    """Resolve region for a theater using fuzzy matching."""
    if not brand or not theater:
        return "-"
    clean = theater.replace(" ", "")
    if (brand, clean) in region_map:
        return region_map[(brand, clean)]

    def strip_brand(s):
        return s.replace("CGV", "").replace("롯데시네마", "").replace("롯데", "").replace("메가박스", "").replace("씨네큐", "").replace(" ", "")

    crawl_pure = strip_brand(theater)
    for (m_brand, m_name), m_region in region_map.items():
        if m_brand != brand:
            continue
        client_pure = strip_brand(m_name)
        if crawl_pure == client_pure:
            return m_region
        if len(client_pure) >= 2 and len(crawl_pure) >= 2:
            if client_pure in crawl_pure or crawl_pure in client_pure:
                return m_region
    return "-"


def _format_theater_name(brand, theater):
    """Format theater name with brand prefix."""
    clean = theater.replace("CGV", "").replace("롯데시네마", "").replace("롯데", "").replace("메가박스", "").replace("씨네큐", "").strip()
    if brand == 'CGV': return f"CGV {clean}"
    if brand == 'LOTTE': return f"롯데{clean}"
    if brand == 'MEGABOX': return f"메가박스{clean}"
    if brand == 'CINEQ': return f"씨네큐{clean}"
    return f"{brand} {clean}"


def _extract_format_and_type(tags):
    """Extract format (2D/IMAX/DOLBY...) and sub_type (일반/자막/더빙) from tags."""
    fmt = "2D"
    sub_type = "일반"
    special_formats = ["IMAX", "4DX", "SCREENX", "DOLBY", "ATMOS"]
    for t in (tags or []):
        t_upper = str(t).upper()
        if any(f in t_upper for f in special_formats):
            fmt = t_upper
            break
    if "자막" in (tags or []):
        sub_type = "자막"
    elif "더빙" in (tags or []):
        sub_type = "더빙"
    return fmt, sub_type


def _brand_priority(b):
    b = (b or '').upper()
    if 'CGV' in b: return 1
    if 'LOTTE' in b: return 2
    if 'MEGA' in b: return 3
    return 99


def _brand_display(b):
    b = (b or '').upper()
    if 'CGV' in b: return 'CGV 계'
    if 'LOTTE' in b: return 'LOTTE 계'
    if 'MEGA' in b: return 'MEGA 계'
    return b


BRAND_ORDER = ['CGV', 'LOTTE', 'MEGABOX']


def _process_to_rows(schedules, region_map):
    """Process schedule queryset into structured rows for display and aggregation."""
    grouped = {}
    for sch in schedules:
        s_date = sch.start_time.date()
        key = (sch.brand, sch.theater_name, sch.screen_name, s_date)
        if key not in grouped:
            grouped[key] = []
        grouped[key].append(sch)

    rows = []
    max_shows = 0

    for (brand, theater, screen, s_date), items in grouped.items():
        items.sort(key=lambda x: x.start_time)

        region = _resolve_region(brand, theater, region_map)
        display_theater = _format_theater_name(brand, theater)
        fmt, sub_type = _extract_format_and_type(items[0].tags if items else [])

        total_capacity = _safe_int(items[0].total_seats) if items else 0
        show_count = len(items)

        total_seats_sum = 0
        sold_seats_sum = 0
        show_times = []

        for item in items:
            show_times.append(item.start_time.strftime("%H:%M"))
            t_seat = _safe_int(item.total_seats)
            r_seat = _safe_int(item.remaining_seats)
            if t_seat == 0 and total_capacity > 0:
                t_seat = total_capacity
            total_seats_sum += t_seat
            sold_seats_sum += max(0, t_seat - r_seat)

        max_shows = max(max_shows, len(show_times))

        rows.append({
            'brand': brand,
            'region': region,
            'theater': display_theater,
            'format': fmt,
            'sub_type': sub_type,
            'screen': screen,
            'capacity': total_capacity,
            'show_times': show_times,
            'show_count': show_count,
            'total_seats': total_seats_sum,
            'sold_seats': sold_seats_sum,
        })

    rows.sort(key=lambda x: (
        _brand_priority(x['brand']),
        x['region'],
        x['theater'],
        x['screen']
    ))
    return rows, max_shows


def _calc_summary(rows):
    """Calculate summary statistics from a list of rows."""
    theaters = set(r['theater'] for r in rows)
    theater_count = len(theaters)
    show_count = sum(r['show_count'] for r in rows)
    screen_count = len(rows)
    total_seats = sum(r['total_seats'] for r in rows)
    sold_seats = sum(r['sold_seats'] for r in rows)

    avg_shows = round(show_count / theater_count, 1) if theater_count else 0
    avg_seats = round(total_seats / show_count, 1) if show_count else 0
    avg_sold_rate = round(sold_seats / total_seats * 100, 1) if total_seats else 0

    return {
        'theater_count': theater_count,
        'show_count': show_count,
        'screen_count': screen_count,
        'total_seats': total_seats,
        'sold_seats': sold_seats,
        'avg_shows': avg_shows,
        'avg_seats': avg_seats,
        'avg_sold_rate': avg_sold_rate,
    }


def _write_schedule_sheet(ws, rows, proc_date, movie_title, display_max_shows, gen_info):
    """Write a single schedule sheet (상영시간표)."""
    date_str = proc_date.strftime("%Y-%m-%d")

    # Column definitions
    base_cols = ['지역', '극장명', '포맷', '구분', '관', '좌석수']
    show_cols = [f"{i+1}회" for i in range(display_max_shows)]
    stat_cols = ['총회차', '총스크린', '총좌석수', '판매좌석수']
    all_cols = base_cols + show_cols + stat_cols
    max_col = len(all_cols)

    # Row 2: Movie Title (Row 1 empty for spacing)
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=max_col)
    title_cell = ws.cell(row=2, column=1, value=movie_title or "전체 영화")
    title_cell.font = TITLE_FONT
    title_cell.alignment = CENTER
    for ci in range(1, max_col + 1):
        c = ws.cell(row=2, column=ci)
        c.border = THIN_BORDER
        c.fill = YELLOW_FILL

    # Row 3: Date/Generation Info
    ws.merge_cells(start_row=3, start_column=1, end_row=3, end_column=max_col)
    ws.cell(row=3, column=1, value=f"{date_str} | {gen_info}").font = INFO_FONT

    # Row 4: Headers
    for ci, col_name in enumerate(all_cols, 1):
        cell = ws.cell(row=4, column=ci, value=col_name)
        cell.border = THIN_BORDER
        cell.alignment = CENTER
        if col_name in ['총좌석수', '판매좌석수']:
            cell.fill = BLACK_FILL
            cell.font = WHITE_FONT
        else:
            cell.fill = YELLOW_FILL
            cell.font = HEADER_FONT

    # Row 5+: Data
    for ri, row in enumerate(rows, 5):
        vals = [
            row['region'], row['theater'], row['format'], row['sub_type'],
            row['screen'], row['capacity']
        ]
        for i in range(display_max_shows):
            vals.append(row['show_times'][i] if i < len(row['show_times']) else "")
        vals.extend([row['show_count'], 1, row['total_seats'], row['sold_seats']])

        for ci, val in enumerate(vals, 1):
            cell = ws.cell(row=ri, column=ci, value=val)
            cell.border = THIN_BORDER
            cell.alignment = CENTER
            cell.font = DATA_FONT

    # Merge theater name cells (column B) for same theater
    if rows:
        last_row = 4 + len(rows)
        start_merge = 5
        for ri in range(6, last_row + 2):
            current = ws.cell(row=ri, column=2).value if ri <= last_row else None
            prev = ws.cell(row=ri - 1, column=2).value
            if current != prev or ri > last_row:
                if ri - 1 > start_merge:
                    ws.merge_cells(start_row=start_merge, start_column=2, end_row=ri - 1, end_column=2)
                start_merge = ri

    ws.sheet_view.showGridLines = False
    _auto_width(ws, min_row=4)


def _write_brand_summary(ws, all_data):
    """Write 계열사별 summary sheet."""
    headers = ['상영일자', '계열사', '극장수', '상영회차', '상영관수', '총 좌석수', '평균회차', '평균좌석수', '평균좌판율']

    for ci, h in enumerate(headers, 1):
        cell = ws.cell(row=1, column=ci, value=h)
        cell.fill = BLUE_FILL
        cell.font = HEADER_FONT
        cell.border = THIN_BORDER
        cell.alignment = CENTER

    row_idx = 2

    for proc_date, rows in all_data.items():
        date_str = proc_date.strftime("%Y-%m-%d")
        date_start_row = row_idx

        for brand in BRAND_ORDER:
            brand_rows = [r for r in rows if r['brand'] == brand]
            if not brand_rows:
                continue

            s = _calc_summary(brand_rows)
            vals = [
                date_str if row_idx == date_start_row else '',
                _brand_display(brand),
                _fmt_number(s['theater_count']),
                _fmt_number(s['show_count']),
                _fmt_number(s['screen_count']),
                _fmt_number(s['total_seats']),
                str(s['avg_shows']),
                str(s['avg_seats']),
                str(s['avg_sold_rate'])
            ]

            for ci, v in enumerate(vals, 1):
                cell = ws.cell(row=row_idx, column=ci, value=v)
                cell.border = THIN_BORDER
                cell.alignment = CENTER
                if ci == 1 and v:
                    cell.fill = BLUE_FILL
                    cell.font = BOLD_FONT
                elif ci == 2:
                    cell.font = BOLD_FONT
                else:
                    cell.font = DATA_FONT

            row_idx += 1

        # 합 row
        s = _calc_summary(rows)
        vals = [
            '', '합',
            _fmt_number(s['theater_count']),
            _fmt_number(s['show_count']),
            _fmt_number(s['screen_count']),
            _fmt_number(s['total_seats']),
            str(s['avg_shows']),
            str(s['avg_seats']),
            str(s['avg_sold_rate'])
        ]

        for ci, v in enumerate(vals, 1):
            cell = ws.cell(row=row_idx, column=ci, value=v)
            cell.border = THIN_BORDER
            cell.alignment = CENTER
            cell.fill = YELLOW_LIGHT
            cell.font = BOLD_FONT

        # Merge date column
        if row_idx > date_start_row:
            ws.merge_cells(start_row=date_start_row, start_column=1, end_row=row_idx, end_column=1)

        row_idx += 1

    ws.sheet_view.showGridLines = False
    _auto_width(ws)


def _write_region_summary(ws, all_data):
    """Write 지역별 summary sheet."""
    headers = ['상영일자', '지역', '극장수', '상영회차', '상영관수', '총 좌석수', '평균회차', '평균좌석수', '평균좌판율']

    for ci, h in enumerate(headers, 1):
        cell = ws.cell(row=1, column=ci, value=h)
        cell.fill = BLUE_FILL
        cell.font = HEADER_FONT
        cell.border = THIN_BORDER
        cell.alignment = CENTER

    row_idx = 2

    for proc_date, rows in all_data.items():
        date_str = proc_date.strftime("%Y-%m-%d")
        date_start_row = row_idx

        regions = sorted(set(r['region'] for r in rows))

        for region in regions:
            region_rows = [r for r in rows if r['region'] == region]
            s = _calc_summary(region_rows)

            vals = [
                date_str if row_idx == date_start_row else '',
                region,
                _fmt_number(s['theater_count']),
                _fmt_number(s['show_count']),
                _fmt_number(s['screen_count']),
                _fmt_number(s['total_seats']),
                str(s['avg_shows']),
                str(s['avg_seats']),
                str(s['avg_sold_rate'])
            ]

            for ci, v in enumerate(vals, 1):
                cell = ws.cell(row=row_idx, column=ci, value=v)
                cell.border = THIN_BORDER
                cell.alignment = CENTER
                if ci == 1 and v:
                    cell.fill = BLUE_FILL
                    cell.font = BOLD_FONT
                else:
                    cell.font = DATA_FONT

            row_idx += 1

        # 합 row
        s = _calc_summary(rows)
        vals = [
            '', '합',
            _fmt_number(s['theater_count']),
            _fmt_number(s['show_count']),
            _fmt_number(s['screen_count']),
            _fmt_number(s['total_seats']),
            str(s['avg_shows']),
            str(s['avg_seats']),
            str(s['avg_sold_rate'])
        ]

        for ci, v in enumerate(vals, 1):
            cell = ws.cell(row=row_idx, column=ci, value=v)
            cell.border = THIN_BORDER
            cell.alignment = CENTER
            cell.fill = YELLOW_LIGHT
            cell.font = BOLD_FONT

        if row_idx > date_start_row:
            ws.merge_cells(start_row=date_start_row, start_column=1, end_row=row_idx, end_column=1)

        row_idx += 1

    ws.sheet_view.showGridLines = False
    _auto_width(ws)


def _write_format_summary(ws, all_data, gen_info):
    """Write 포맷별 요약표 sheet."""
    # Row 2: Generation info
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=9)
    ws.cell(row=2, column=1, value=gen_info).font = INFO_FONT

    # Row 3: Headers
    headers = ['상영일자', '포맷별', '계열사', '극장수', '상영회차', '평균회차', '상영관수', '좌석수', '평균좌석수']

    for ci, h in enumerate(headers, 1):
        cell = ws.cell(row=3, column=ci, value=h)
        cell.fill = BLUE_FILL
        cell.font = HEADER_FONT
        cell.border = THIN_BORDER
        cell.alignment = CENTER

    row_idx = 4

    for proc_date, rows in all_data.items():
        date_str = proc_date.strftime("%Y-%m-%d")
        date_start_row = row_idx

        # Group by format, sorted
        formats = sorted(set(r['format'] for r in rows))

        for fmt in formats:
            fmt_start_row = row_idx
            fmt_rows = [r for r in rows if r['format'] == fmt]

            for brand in BRAND_ORDER:
                brand_fmt_rows = [r for r in fmt_rows if r['brand'] == brand]
                if not brand_fmt_rows:
                    continue

                s = _calc_summary(brand_fmt_rows)
                brand_label = brand.replace('MEGABOX', 'MEGA')

                vals = [
                    date_str if row_idx == date_start_row else '',
                    fmt if row_idx == fmt_start_row else '',
                    brand_label,
                    _fmt_number(s['theater_count']),
                    _fmt_number(s['show_count']),
                    str(s['avg_shows']),
                    _fmt_number(s['screen_count']),
                    _fmt_number(s['total_seats']),
                    str(s['avg_seats'])
                ]

                for ci, v in enumerate(vals, 1):
                    cell = ws.cell(row=row_idx, column=ci, value=v)
                    cell.border = THIN_BORDER
                    cell.alignment = CENTER
                    cell.font = DATA_FONT

                row_idx += 1

            # 합 row for this format
            s = _calc_summary(fmt_rows)
            vals = [
                '',
                '',
                '합',
                _fmt_number(s['theater_count']),
                _fmt_number(s['show_count']),
                str(s['avg_shows']),
                _fmt_number(s['screen_count']),
                _fmt_number(s['total_seats']),
                str(s['avg_seats'])
            ]

            for ci, v in enumerate(vals, 1):
                cell = ws.cell(row=row_idx, column=ci, value=v)
                cell.border = THIN_BORDER
                cell.alignment = CENTER
                cell.fill = YELLOW_LIGHT
                cell.font = BOLD_FONT

            # Merge format column (B)
            if row_idx > fmt_start_row:
                ws.merge_cells(start_row=fmt_start_row, start_column=2, end_row=row_idx, end_column=2)

            row_idx += 1

        # Merge date column (A)
        if row_idx - 1 > date_start_row:
            ws.merge_cells(start_row=date_start_row, start_column=1, end_row=row_idx - 1, end_column=1)

    ws.sheet_view.showGridLines = False
    _auto_width(ws, min_row=3)


def _write_comparison_sheet(ws, main_data, competitor_data_dict, movie_title, gen_info):
    """Write 집계작 및 경쟁작 멀티3사 비교 sheet."""
    # Movie order: main first, then competitors
    movie_titles = [movie_title] + list(competitor_data_dict.keys())
    cols_per_movie = 4  # 상영관, 회차, 총좌석수, 평균좌판율
    fixed_cols = 2  # 상영일자, 영화명(계열사)

    total_cols = fixed_cols + len(movie_titles) * cols_per_movie

    # Row 1: Movie title headers (merged per movie block)
    ws.cell(row=1, column=1, value="상영일자").fill = BLUE_FILL
    ws.cell(row=1, column=1).font = HEADER_FONT
    ws.cell(row=1, column=1).border = THIN_BORDER
    ws.cell(row=1, column=1).alignment = CENTER
    ws.cell(row=1, column=2, value="").fill = BLUE_FILL
    ws.cell(row=1, column=2).border = THIN_BORDER

    for mi, mt in enumerate(movie_titles):
        start_col = fixed_cols + 1 + mi * cols_per_movie
        end_col = start_col + cols_per_movie - 1
        ws.merge_cells(start_row=1, start_column=start_col, end_row=1, end_column=end_col)
        cell = ws.cell(row=1, column=start_col, value=mt)
        cell.fill = BLUE_FILL
        cell.font = HEADER_FONT
        cell.alignment = CENTER
        for ci in range(start_col, end_col + 1):
            ws.cell(row=1, column=ci).border = THIN_BORDER
            ws.cell(row=1, column=ci).fill = BLUE_FILL

    # Row 2: Sub-headers (repeating per movie)
    sub_headers = ['상영관', '회차', '총좌석수', '평균좌판율']
    ws.cell(row=2, column=1, value="상영일자").fill = BLUE_FILL
    ws.cell(row=2, column=1).font = HEADER_FONT
    ws.cell(row=2, column=1).border = THIN_BORDER
    ws.cell(row=2, column=1).alignment = CENTER
    ws.cell(row=2, column=2, value="영화명").fill = BLUE_FILL
    ws.cell(row=2, column=2).font = HEADER_FONT
    ws.cell(row=2, column=2).border = THIN_BORDER
    ws.cell(row=2, column=2).alignment = CENTER

    for mi in range(len(movie_titles)):
        for si, sh in enumerate(sub_headers):
            col = fixed_cols + 1 + mi * cols_per_movie + si
            cell = ws.cell(row=2, column=col, value=sh)
            cell.fill = BLUE_FILL
            cell.font = HEADER_FONT
            cell.border = THIN_BORDER
            cell.alignment = CENTER

    # Build data: all_movie_data[movie_title] -> {date -> rows}
    all_movie_data = {movie_title: main_data}
    for ct, c_data in competitor_data_dict.items():
        all_movie_data[ct] = c_data

    # Get all dates from main data
    dates = list(main_data.keys())

    row_idx = 3
    for proc_date in dates:
        date_str = proc_date.strftime("%Y-%m-%d")
        date_start_row = row_idx

        for brand in BRAND_ORDER:
            # Write date + brand
            ws.cell(row=row_idx, column=1, value=date_str if row_idx == date_start_row else '')
            ws.cell(row=row_idx, column=1).border = THIN_BORDER
            ws.cell(row=row_idx, column=1).alignment = CENTER
            if row_idx == date_start_row:
                ws.cell(row=row_idx, column=1).fill = BLUE_FILL
                ws.cell(row=row_idx, column=1).font = BOLD_FONT

            ws.cell(row=row_idx, column=2, value=_brand_display(brand))
            ws.cell(row=row_idx, column=2).border = THIN_BORDER
            ws.cell(row=row_idx, column=2).alignment = CENTER
            ws.cell(row=row_idx, column=2).font = BOLD_FONT

            # For each movie, write stats
            for mi, mt in enumerate(movie_titles):
                m_data = all_movie_data.get(mt, {})
                m_rows = m_data.get(proc_date, [])
                brand_rows = [r for r in m_rows if r['brand'] == brand]

                base_col = fixed_cols + 1 + mi * cols_per_movie
                if brand_rows:
                    s = _calc_summary(brand_rows)
                    vals = [
                        _fmt_number(s['screen_count']),
                        _fmt_number(s['show_count']),
                        _fmt_number(s['total_seats']),
                        f"{s['avg_sold_rate']}%"
                    ]
                else:
                    vals = ['', '', '', '']

                for si, v in enumerate(vals):
                    cell = ws.cell(row=row_idx, column=base_col + si, value=v)
                    cell.border = THIN_BORDER
                    cell.alignment = CENTER
                    cell.font = DATA_FONT

            row_idx += 1

        # 합 row
        ws.cell(row=row_idx, column=1, value='')
        ws.cell(row=row_idx, column=1).border = THIN_BORDER
        ws.cell(row=row_idx, column=2, value='합')
        ws.cell(row=row_idx, column=2).border = THIN_BORDER
        ws.cell(row=row_idx, column=2).alignment = CENTER
        ws.cell(row=row_idx, column=2).fill = YELLOW_LIGHT
        ws.cell(row=row_idx, column=2).font = BOLD_FONT

        for mi, mt in enumerate(movie_titles):
            m_data = all_movie_data.get(mt, {})
            m_rows = m_data.get(proc_date, [])
            base_col = fixed_cols + 1 + mi * cols_per_movie

            if m_rows:
                s = _calc_summary(m_rows)
                vals = [
                    f"{_fmt_number(s['screen_count'])} 상영관",
                    f"{_fmt_number(s['show_count'])} 회",
                    f"{_fmt_number(s['total_seats'])} 석",
                    f"{s['avg_sold_rate']}%"
                ]
            else:
                vals = ['', '', '', '']

            for si, v in enumerate(vals):
                cell = ws.cell(row=row_idx, column=base_col + si, value=v)
                cell.border = THIN_BORDER
                cell.alignment = CENTER
                cell.fill = YELLOW_LIGHT
                cell.font = BOLD_FONT

        # Merge date column
        if row_idx > date_start_row:
            ws.merge_cells(start_row=date_start_row, start_column=1, end_row=row_idx, end_column=1)

        row_idx += 1

    ws.sheet_view.showGridLines = False
    _auto_width(ws)


def _write_competitor_detail_sheet(ws, main_data, competitor_data_dict, movie_title, gen_info):
    """Write 경쟁작 detail sheet - per-screen data for all movies side by side."""
    movie_titles = [movie_title] + list(competitor_data_dict.keys())
    cols_per_movie = 6  # 상영관, 회차, 좌석수, 총좌석수, 판매좌석수, 판매좌석율
    fixed_cols = 2  # 상영일자, 극장명

    all_movie_data = {movie_title: main_data}
    for ct, c_data in competitor_data_dict.items():
        all_movie_data[ct] = c_data

    # Row 1: Gen info
    total_cols = fixed_cols + len(movie_titles) * cols_per_movie
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=total_cols)
    ws.cell(row=1, column=1, value=gen_info).font = INFO_FONT

    # Row 3: Movie title headers
    ws.cell(row=3, column=1, value="상영일자").fill = BLUE_FILL
    ws.cell(row=3, column=1).font = HEADER_FONT
    ws.cell(row=3, column=1).border = THIN_BORDER
    ws.cell(row=3, column=1).alignment = CENTER
    ws.cell(row=3, column=2, value="극장명").fill = BLUE_FILL
    ws.cell(row=3, column=2).font = HEADER_FONT
    ws.cell(row=3, column=2).border = THIN_BORDER
    ws.cell(row=3, column=2).alignment = CENTER

    for mi, mt in enumerate(movie_titles):
        start_col = fixed_cols + 1 + mi * cols_per_movie
        end_col = start_col + cols_per_movie - 1
        ws.merge_cells(start_row=3, start_column=start_col, end_row=3, end_column=end_col)
        cell = ws.cell(row=3, column=start_col, value=mt)
        cell.fill = BLUE_FILL
        cell.font = HEADER_FONT
        cell.alignment = CENTER
        for ci in range(start_col, end_col + 1):
            ws.cell(row=3, column=ci).border = THIN_BORDER
            ws.cell(row=3, column=ci).fill = BLUE_FILL

    # Row 4: Sub-headers
    sub_headers = ['상영관', '회차', '좌석수', '총좌석수', '판매좌석수', '판매좌석율']
    ws.cell(row=4, column=1, value="상영일자").fill = BLUE_FILL
    ws.cell(row=4, column=1).font = HEADER_FONT
    ws.cell(row=4, column=1).border = THIN_BORDER
    ws.cell(row=4, column=1).alignment = CENTER
    ws.cell(row=4, column=2, value="극장명").fill = BLUE_FILL
    ws.cell(row=4, column=2).font = HEADER_FONT
    ws.cell(row=4, column=2).border = THIN_BORDER
    ws.cell(row=4, column=2).alignment = CENTER

    for mi in range(len(movie_titles)):
        for si, sh in enumerate(sub_headers):
            col = fixed_cols + 1 + mi * cols_per_movie + si
            cell = ws.cell(row=4, column=col, value=sh)
            cell.fill = BLUE_FILL
            cell.font = HEADER_FONT
            cell.border = THIN_BORDER
            cell.alignment = CENTER

    # Collect all unique (date, theater) combinations across ALL movies
    # Build index: (date, theater) -> {movie_title -> [rows]}
    theater_movie_index = {}
    dates = sorted(set(d for m_data in all_movie_data.values() for d in m_data.keys()))

    for mt, m_data in all_movie_data.items():
        for proc_date, rows in m_data.items():
            for r in rows:
                key = (proc_date, r['theater'])
                if key not in theater_movie_index:
                    theater_movie_index[key] = {}
                if mt not in theater_movie_index[key]:
                    theater_movie_index[key][mt] = []
                theater_movie_index[key][mt].append(r)

    # Sort by date, brand priority, theater name
    sorted_keys = sorted(theater_movie_index.keys(), key=lambda k: (
        k[0],  # date
        _brand_priority(theater_movie_index[k].get(movie_title, [{}])[0].get('brand', '') if theater_movie_index[k].get(movie_title) else
                        next(iter(theater_movie_index[k].values()), [{}])[0].get('brand', '')),
        k[1]   # theater name
    ))

    # Write data rows
    row_idx = 5
    for (proc_date, theater) in sorted_keys:
        movie_rows = theater_movie_index[(proc_date, theater)]

        # Find max screens for this theater across all movies
        max_screens = max(len(rows) for rows in movie_rows.values())

        for screen_idx in range(max_screens):
            date_str = proc_date.strftime("%Y-%m-%d")
            ws.cell(row=row_idx, column=1, value=date_str)
            ws.cell(row=row_idx, column=1).border = THIN_BORDER
            ws.cell(row=row_idx, column=1).alignment = CENTER
            ws.cell(row=row_idx, column=1).font = DATA_FONT

            ws.cell(row=row_idx, column=2, value=theater)
            ws.cell(row=row_idx, column=2).border = THIN_BORDER
            ws.cell(row=row_idx, column=2).alignment = CENTER
            ws.cell(row=row_idx, column=2).font = DATA_FONT

            for mi, mt in enumerate(movie_titles):
                base_col = fixed_cols + 1 + mi * cols_per_movie
                m_rows = movie_rows.get(mt, [])

                if screen_idx < len(m_rows):
                    r = m_rows[screen_idx]
                    sold_rate = round(r['sold_seats'] / r['total_seats'] * 100, 1) if r['total_seats'] > 0 else 0
                    vals = [
                        r['screen'],
                        r['show_count'],
                        r['capacity'],
                        r['total_seats'],
                        r['sold_seats'],
                        sold_rate
                    ]
                else:
                    vals = ['', '', '', '', '', '']

                for si, v in enumerate(vals):
                    cell = ws.cell(row=row_idx, column=base_col + si, value=v)
                    cell.border = THIN_BORDER
                    cell.alignment = CENTER
                    cell.font = DATA_FONT

            row_idx += 1

    ws.sheet_view.showGridLines = False
    _auto_width(ws, min_row=4)


def export_transformed_schedules(queryset, movie_title=None, start_date=None, end_date=None, competitor_querysets=None):
    """
    Exports MovieSchedule QuerySet to Excel matching the standard schedule format.

    Sheets:
    1. 상영시간표_YYYY-MM-DD (per date schedule)
    2. 계열사별 (brand summary)
    3. 지역별 (region summary)
    4. 포맷별 요약표 (format summary)
    5. 집계작 및 경쟁작 멀티3사 비교 (comparison)
    6. 경쟁작 (competitor detail)
    """
    if not queryset.exists():
        return None

    # ========== Region Mapping ==========
    region_map = _build_region_map()

    # ========== Collect Main Data Per Date ==========
    from django.db.models.functions import TruncDate
    available_dates = list(
        queryset.annotate(d=TruncDate('start_time'))
        .values_list('d', flat=True).distinct().order_by('d')
    )

    if not available_dates:
        return None

    all_data = {}
    global_max_shows = 0

    for d in available_dates:
        sub_qs = queryset.filter(start_time__date=d)
        rows, max_shows = _process_to_rows(sub_qs, region_map)
        if rows:
            all_data[d] = rows
            global_max_shows = max(global_max_shows, max_shows)

    if not all_data:
        return None

    display_max_shows = max(12, global_max_shows)

    # ========== Collect Competitor Data ==========
    competitor_all_data = {}  # {comp_title: {date: rows}}
    if competitor_querysets:
        for comp_title, comp_qs in competitor_querysets.items():
            comp_data = {}
            for d in available_dates:
                sub_qs = comp_qs.filter(start_time__date=d)
                rows, _ = _process_to_rows(sub_qs, region_map)
                if rows:
                    comp_data[d] = rows
            if comp_data:
                competitor_all_data[comp_title] = comp_data

    # ========== File Setup ==========
    save_dir = os.path.join(settings.BASE_DIR, 'media', 'crawler_exports')
    os.makedirs(save_dir, exist_ok=True)

    now = datetime.now()
    gen_date = now.strftime("%Y-%m-%d")
    gen_time = now.strftime("%H_%M_%S")
    weekday_kor = ["월", "화", "수", "목", "금", "토", "일"]
    day_of_week = weekday_kor[now.weekday()]
    gen_info = f"({gen_date} [{gen_time}])({day_of_week})"

    if not movie_title:
        movie_title = "Overall"
    safe_title = re.sub(r'[\\/*?:"<>|]', "", movie_title).replace(" ", "")

    if not start_date:
        start_date = gen_date
    if not end_date:
        end_date = start_date

    def fmt_date(d):
        if isinstance(d, datetime):
            return d.strftime("%Y-%m-%d")
        return str(d).split(' ')[0]

    filename = f"excel_{safe_title}__{fmt_date(start_date)}-{fmt_date(end_date)}_({gen_date} [{gen_time}])({day_of_week}).xlsx"
    file_path = os.path.join(save_dir, filename)

    # ========== Write Excel ==========
    wb = Workbook()
    wb.remove(wb.active)

    # 1. Schedule Sheets (상영시간표)
    for proc_date, rows in all_data.items():
        sheet_name = f"상영시간표_{proc_date.strftime('%Y-%m-%d')}"
        ws = wb.create_sheet(sheet_name)
        _write_schedule_sheet(ws, rows, proc_date, movie_title, display_max_shows, gen_info)

    # 2. 계열사별 (Brand Summary)
    ws = wb.create_sheet("계열사별")
    _write_brand_summary(ws, all_data)

    # 3. 지역별 (Region Summary)
    ws = wb.create_sheet("지역별")
    _write_region_summary(ws, all_data)

    # 4. 집계작 및 경쟁작 멀티3사 비교
    if competitor_all_data:
        ws = wb.create_sheet("집계작 및 경쟁작 멀티3사 비교")
        _write_comparison_sheet(ws, all_data, competitor_all_data, movie_title, gen_info)

    # 5. 경쟁작
    if competitor_all_data:
        ws = wb.create_sheet("경쟁작")
        _write_competitor_detail_sheet(ws, all_data, competitor_all_data, movie_title, gen_info)

    # 6. 포맷별 요약표 (Format Summary)
    ws = wb.create_sheet("포맷별 요약표")
    _write_format_summary(ws, all_data, gen_info)

    wb.save(file_path)
    logger.info(f"Schedule Excel exported: {file_path}")
    return file_path
