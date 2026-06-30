import os
import re
import logging
from datetime import datetime
from collections import defaultdict
from django.utils import timezone as dj_timezone

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
PINK_FILL = PatternFill(start_color="FFCCCC", end_color="FFCCCC", fill_type="solid")
TOTAL_BLUE_FILL = PatternFill(start_color="0033CC", end_color="0033CC", fill_type="solid")

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
# 일반극장 매핑 안 됨 강조 (빨강)
UNMAPPED_FILL = PatternFill(start_color="FFC7CE", end_color="FFC7CE", fill_type="solid")
UNMAPPED_FONT = Font(name='맑은 고딕', size=10, bold=True, color="9C0006")


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


def _norm_aud_key(name):
    """
    상영관 이름 정규화 키 (영진위관 ↔ DB관 매칭용).
    - 크롤된 screen_name 과 동일하게 괄호/메타 제거 + 'N관' 추출
      (예: 'DMZ관 [상서면관]' -> 'DMZ관', '5관(리클라이너)' -> '5관')
    - 선행 0 제거 ('04관' -> '4관') 후 공백제거·소문자
    """
    s = MovieSchedule.normalize_screen_name(name)
    m = re.match(r'0*(\d+)\s*관$', s)
    if m:
        s = f"{int(m.group(1))}관"
    return re.sub(r'\s+', '', s).lower()


def _build_normal_theater_index():
    """
    일반극장(KOBIS) 행 보강용 인덱스.
    - name_to_client: 정규화된 (영진위극장명 우선 → 극장명) -> Client
    - seat_idx: client_id -> {kofic/name/num: 관 -> 좌석수}
    """
    from client.models import Client, Theater

    qs = Client.objects.exclude(theater_kind__in=['CGV', '메가박스', '롯데']).only(
        'id', 'client_name', 'kofic_theater_name', 'region_code'
    )
    name_to_client = {}
    # 1) 영진위극장명 우선
    for c in qs:
        if c.kofic_theater_name:
            name_to_client.setdefault(re.sub(r'\s+', '', c.kofic_theater_name).lower(), c)
    # 2) 그 다음 극장명
    for c in qs:
        if c.client_name:
            name_to_client.setdefault(re.sub(r'\s+', '', c.client_name).lower(), c)

    seat_idx = {}
    for t in Theater.objects.all().only(
        'client_id', 'auditorium_name', 'kofic_auditorium_name', 'seat_count'
    ):
        d = seat_idx.setdefault(t.client_id, {'kofic': {}, 'name': {}, 'num': {}})
        # 영진위관이름·DB관이름 모두 동일 정규화로 색인 + 'N관' 숫자 색인(둘 다)
        for raw, bucket in ((t.kofic_auditorium_name, 'kofic'), (t.auditorium_name, 'name')):
            if not raw:
                continue
            key = _norm_aud_key(raw)
            if key:
                d[bucket].setdefault(key, t.seat_count)
            m = re.search(r'(\d+)', raw)
            if m:
                d['num'].setdefault(int(m.group(1)), t.seat_count)
    return name_to_client, seat_idx


def _resolve_normal_theater(theater_name, screen_name, normal_index):
    """일반극장 행: 영진위극장명→극장명 순으로 Client 매칭. 미매칭이면 None."""
    name_to_client, seat_idx = normal_index
    norm = re.sub(r'\s+', '', str(theater_name or '')).lower()
    c = name_to_client.get(norm)
    if not c:
        return None
    region = c.region_code or '-'
    seat = 0
    d = seat_idx.get(c.id, {})
    sn = _norm_aud_key(screen_name)
    if sn in d.get('kofic', {}):           # 1) 영진위관이름 매칭 우선
        seat = d['kofic'][sn]
    elif sn in d.get('name', {}):          # 2) DB관이름 매칭
        seat = d['name'][sn]
    else:                                  # 3) 'N관' 숫자 매칭 (영진위/DB관 공통)
        m = re.search(r'(\d+)', str(screen_name or ''))
        if m and int(m.group(1)) in d.get('num', {}):
            seat = d['num'][int(m.group(1))]
    return {'region': region, 'seat': _safe_int(seat), 'client_name': c.client_name}


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


CINE_DE_CHEF_MAP = {
    "압구정": "압구정",
    "용산": "용산아이파크몰",
    "센텀": "센텀시티",
}


def _filter_cine_de_chef(schedules):
    """씨네드쉐프 극장 처리: 원본 극장이 있으면 씨네드쉐프 제거, 없으면 원본명으로 치환."""
    all_theaters = set()
    cine_de_chef_items = []
    normal_items = []

    for sch in schedules:
        if sch.brand and sch.brand.upper() == "CGV" and "씨네드쉐프" in (sch.theater_name or ""):
            cine_de_chef_items.append(sch)
        else:
            normal_items.append(sch)
            if sch.brand and sch.brand.upper() == "CGV":
                all_theaters.add(sch.theater_name or "")

    for sch in cine_de_chef_items:
        # "CGV 씨네드쉐프 센텀" → "센텀" 추출
        raw_name = (sch.theater_name or "").replace("CGV", "").replace("씨네드쉐프", "").strip()
        mapped_name = CINE_DE_CHEF_MAP.get(raw_name)
        if not mapped_name:
            # 매핑에 없으면 그대로 유지
            normal_items.append(sch)
            continue

        # 원본 극장이 데이터에 존재하면 씨네드쉐프 제거 (skip)
        original_candidates = [f"CGV {mapped_name}", f"CGV{mapped_name}", mapped_name]
        if any(t.replace(" ", "") in {c.replace(" ", "") for c in all_theaters} for t in original_candidates):
            continue  # 원본 있음 → 씨네드쉐프 제거

        # 원본 없음 → 극장명을 원본으로 치환
        sch.theater_name = f"CGV {mapped_name}"
        normal_items.append(sch)

    return normal_items


def _process_to_rows(schedules, region_map, normal_index=None):
    """Process schedule queryset into structured rows for display and aggregation."""
    schedules = _filter_cine_de_chef(list(schedules))
    if normal_index is None:
        normal_index = _build_normal_theater_index()

    grouped = {}
    for sch in schedules:
        s_date = sch.play_date or sch.start_time.date()
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

        # 일반극장(KOBIS): '일반극장' 접두 제거 + 영진위극장명/극장명 매칭으로 지역·좌석수 보강
        unmapped = False
        if brand == '일반극장':
            info = _resolve_normal_theater(theater, screen, normal_index)
            if info:
                display_theater = info['client_name']
                region = info['region']
                if info['seat']:
                    total_capacity = info['seat']
            else:
                display_theater = theater  # 접두어 없이 원본 극장명
                region = '매핑안됨'
                unmapped = True

        total_seats_sum = 0
        sold_seats_sum = 0
        show_times = []

        for item in items:
            show_times.append(dj_timezone.localtime(item.start_time).strftime("%H:%M"))
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
            'unmapped': unmapped,
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


def _write_subtotal_row(ws, ri, max_col, label, theater_count, show_sum, screen_sum, seats_sum, sold_sum, fill, font):
    """Write a subtotal or grand total row in the schedule sheet."""
    # Column indices (1-based): C1=지역(극장수), C2=극장명(label), then stats at end
    stat_start = max_col - 3  # 총회차, 총스크린, 총좌석수, 판매좌석수

    for ci in range(1, max_col + 1):
        cell = ws.cell(row=ri, column=ci)
        cell.fill = fill
        cell.font = font
        cell.border = THIN_BORDER
        cell.alignment = CENTER

    ws.cell(row=ri, column=1, value=theater_count)
    ws.cell(row=ri, column=2, value=label)
    ws.cell(row=ri, column=stat_start, value=_fmt_number(show_sum))
    ws.cell(row=ri, column=stat_start + 1, value=_fmt_number(screen_sum))
    ws.cell(row=ri, column=stat_start + 2, value=_fmt_number(seats_sum))
    ws.cell(row=ri, column=stat_start + 3, value=_fmt_number(sold_sum))


def _write_schedule_sheet(ws, rows, proc_date, movie_title, display_max_shows, gen_info):
    """Write a single schedule sheet (상영시간표)."""
    date_str = proc_date.strftime("%Y-%m-%d")

    # Column definitions
    base_cols = ['지역', '극장명', '포맷', '구분', '관', '좌석수']
    show_cols = [f"{i+1}회" for i in range(display_max_shows)]
    stat_cols = ['총회차', '총스크린', '총좌석수', '판매좌석수']
    all_cols = base_cols + show_cols + stat_cols
    max_col = len(all_cols)

    SUBTOTAL_FONT = Font(name='맑은 고딕', size=10, bold=True, color="000000")

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

    # Group rows by brand for subtotals
    brand_groups = {}
    for row in rows:
        b = row['brand']
        if b not in brand_groups:
            brand_groups[b] = []
        brand_groups[b].append(row)

    # Write data rows grouped by brand, with subtotal after each brand
    ri = 5
    brand_display_map = {'CGV': 'CGV', 'LOTTE': 'LOTTE', 'MEGABOX': 'MEGA'}
    ordered_brands = [b for b in BRAND_ORDER if b in brand_groups]
    other_brands = [b for b in brand_groups if b not in BRAND_ORDER]

    grand_theaters = set()
    grand_shows = 0
    grand_screens = 0
    grand_seats = 0
    grand_sold = 0

    for brand in ordered_brands + other_brands:
        brand_rows = brand_groups[brand]
        merge_start = ri

        for row in brand_rows:
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

            # 매핑 안 된 일반극장 행: 지역·극장명 셀을 빨갛게 강조
            if row.get('unmapped'):
                for ci in (1, 2):
                    c = ws.cell(row=ri, column=ci)
                    c.fill = UNMAPPED_FILL
                    c.font = UNMAPPED_FONT

            ri += 1

        # Merge theater name cells (column B) within this brand group
        if len(brand_rows) > 1:
            merge_b_start = merge_start
            for check_ri in range(merge_start + 1, ri + 1):
                current = ws.cell(row=check_ri, column=2).value if check_ri < ri else None
                prev = ws.cell(row=check_ri - 1, column=2).value
                if current != prev or check_ri >= ri:
                    if check_ri - 1 > merge_b_start:
                        ws.merge_cells(start_row=merge_b_start, start_column=2, end_row=check_ri - 1, end_column=2)
                    merge_b_start = check_ri

        # Calculate brand subtotal
        s = _calc_summary(brand_rows)
        brand_label = brand_display_map.get(brand, brand)
        if brand in BRAND_ORDER:
            label = f"{brand_label}소계"
        else:
            label = "기타 소계"

        _write_subtotal_row(ws, ri, max_col, label,
                            s['theater_count'], s['show_count'], s['screen_count'],
                            s['total_seats'], s['sold_seats'],
                            PINK_FILL, SUBTOTAL_FONT)

        # Accumulate grand total
        grand_theaters.update(r['theater'] for r in brand_rows)
        grand_shows += s['show_count']
        grand_screens += s['screen_count']
        grand_seats += s['total_seats']
        grand_sold += s['sold_seats']

        ri += 1

    # Grand total row (총 계)
    _write_subtotal_row(ws, ri, max_col, "총 계",
                        len(grand_theaters), grand_shows, grand_screens,
                        grand_seats, grand_sold,
                        TOTAL_BLUE_FILL, WHITE_FONT)

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

    # ----- helpers for brand subtotals / grand total -----
    def _key_brand(k):
        """이 (날짜, 극장) 행이 속한 브랜드. 집계작 우선, 없으면 첫 영화 기준."""
        mv = theater_movie_index[k]
        main_rows = mv.get(movie_title)
        if main_rows:
            return main_rows[0].get('brand', '')
        first = next(iter(mv.values()), None)
        return first[0].get('brand', '') if first else ''

    BRAND_TOTAL_LABEL = {
        'CGV': 'CGV 총계',
        'LOTTE': '롯데 총계',
        'MEGABOX': '메가박스 총계',
        '일반극장': '일반극장 총계',
    }

    def _new_agg():
        return {mt: {'screens': 0, 'shows': 0, 'total': 0, 'sold': 0} for mt in movie_titles}

    def _accumulate(agg, movie_rows):
        for mt in movie_titles:
            for r in movie_rows.get(mt, []):
                a = agg[mt]
                a['screens'] += 1
                a['shows'] += r['show_count']
                a['total'] += r['total_seats']
                a['sold'] += r['sold_seats']

    def _write_total_row(rr, label, agg, fill, font):
        for ci in range(1, total_cols + 1):
            cell = ws.cell(row=rr, column=ci)
            cell.border = THIN_BORDER
            cell.alignment = CENTER
            cell.fill = fill
            cell.font = font
        ws.cell(row=rr, column=2, value=label)
        for mi, mt in enumerate(movie_titles):
            base_col = fixed_cols + 1 + mi * cols_per_movie
            a = agg[mt]
            if a['screens'] == 0:
                continue
            rate = round(a['sold'] / a['total'] * 100, 1) if a['total'] > 0 else 0
            # 상영관, 회차, 좌석수(공란), 총좌석수, 판매좌석수, 판매좌석율
            vals = [a['screens'], a['shows'], '', a['total'], a['sold'], f"{rate}%"]
            for si, v in enumerate(vals):
                ws.cell(row=rr, column=base_col + si, value=v)

    # Write data rows (with per-brand subtotals and a grand total)
    row_idx = 5
    grand_agg = _new_agg()
    brand_agg = None
    current_brand = None

    for key in sorted_keys:
        (proc_date, theater) = key
        kb = _key_brand(key)

        if current_brand is None:
            current_brand = kb
            brand_agg = _new_agg()
        elif kb != current_brand:
            _write_total_row(row_idx, BRAND_TOTAL_LABEL.get(current_brand, f"{current_brand} 총계"),
                             brand_agg, PINK_FILL, BOLD_FONT)
            row_idx += 1
            current_brand = kb
            brand_agg = _new_agg()

        movie_rows = theater_movie_index[key]
        _accumulate(brand_agg, movie_rows)
        _accumulate(grand_agg, movie_rows)

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

    # flush 마지막 브랜드 소계
    if current_brand is not None:
        _write_total_row(row_idx, BRAND_TOTAL_LABEL.get(current_brand, f"{current_brand} 총계"),
                         brand_agg, PINK_FILL, BOLD_FONT)
        row_idx += 1

    # 최하단: 모든 극장 총계
    _write_total_row(row_idx, "모든극장 총계", grand_agg, TOTAL_BLUE_FILL, WHITE_FONT)
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
    normal_index = _build_normal_theater_index()  # 일반극장 지역·좌석수 보강용

    # ========== Collect Main Data Per Date ==========
    available_dates = list(
        queryset.filter(play_date__isnull=False)
        .values_list('play_date', flat=True).distinct().order_by('play_date')
    )

    if not available_dates:
        return None

    all_data = {}
    global_max_shows = 0

    for d in available_dates:
        sub_qs = queryset.filter(play_date=d)
        rows, max_shows = _process_to_rows(sub_qs, region_map, normal_index)
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
                sub_qs = comp_qs.filter(play_date=d)
                rows, _ = _process_to_rows(sub_qs, region_map, normal_index)
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


# =============================================================================
# 특수상영(무대인사 등) 키워드 기반 평면 엑셀 내보내기
# =============================================================================

_SPECIAL_FORMAT_KEYWORDS = [
    "2D", "3D", "4D", "디지털", "DIGITAL", "자막", "더빙", "IMAX", "4DX", "SCREENX",
    "SCREEN-X", "DOLBY", "ATMOS", "LASER", "SPHEREX", "리클라이너",
]


def _special_category_tags(tags):
    """포맷(2D/자막/IMAX 등)을 제외한 구분 태그(무대인사·GV 등)만 반환."""
    out = []
    for t in (tags or []):
        tu = str(t).upper()
        if any(f in tu for f in [k.upper() for k in _SPECIAL_FORMAT_KEYWORDS]):
            continue
        out.append(str(t))
    return out


def _brand_to_multi(brand):
    """MovieSchedule.brand -> 엑셀 '멀티' 표기 (예시 파일 기준: MEGABOX->MEGA)."""
    if brand == "MEGABOX":
        return "MEGA"
    return brand or ""


def export_special_screenings(queryset, keyword=None, start_date=None, end_date=None):
    """
    특수상영(무대인사 등) 평면 엑셀 내보내기.
    컬럼: 영화명·날짜·지역·멀티·극장명·관·포맷1·구분1·상영시간·총회차·총스크린·총좌석수·판매좌석수·잔여좌석수·좌석판매율
    """
    save_dir = os.path.join(settings.BASE_DIR, 'media', 'crawler_exports')
    os.makedirs(save_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    kw = re.sub(r'[^0-9A-Za-z가-힣]', '', str(keyword or "특수상영"))
    filename = f"특수상영_{kw}_{timestamp}.xlsx"
    file_path = os.path.join(save_dir, filename)

    region_map = _build_region_map()

    headers = [
        "영화명", "날짜", "지역", "멀티", "극장명", "관", "포맷1", "구분1",
        "상영시간", "총회차", "총스크린", "총좌석수", "판매좌석수", "잔여좌석수", "좌석판매율",
    ]

    rows = list(queryset)

    # 멀티(브랜드) 순서: CGV → MEGA → LOTTE → 일반극장 (예시 파일 기준)
    BRAND_ORD = {'CGV': 0, 'MEGABOX': 1, 'LOTTE': 2, '일반극장': 3}
    BRAND_LABEL = {'CGV': 'CGV', 'MEGABOX': 'MEGA', 'LOTTE': 'LOTTE', '일반극장': '일반극장'}

    def sort_key(s):
        return (
            BRAND_ORD.get(s.brand, 9),
            str(s.play_date or (s.start_time.date() if s.start_time else "")),
            s.theater_name or "",
            s.screen_name or "",
            s.start_time or dj_timezone.now(),
        )
    rows.sort(key=sort_key)

    wb = Workbook()
    ws = wb.active
    ws.title = "특수상영"

    # 예시 파일 색상: 헤더 회색 / 소계 분홍 / 총계 파랑+흰글씨
    HEAD_FILL = PatternFill(start_color="CCCCCC", end_color="CCCCCC", fill_type="solid")
    SUB_FILL = PatternFill(start_color="FFCCCC", end_color="FFCCCC", fill_type="solid")
    TOTAL_FILL = PatternFill(start_color="0033CC", end_color="0033CC", fill_type="solid")
    HEAD_FONT = Font(bold=True, size=10)
    SUB_FONT = Font(bold=True, size=10)
    TOTAL_FONT = Font(bold=True, size=10, color="FFFFFF")
    DATA_FONT_ = Font(size=10)
    thin = Side(style="thin", color="D9D9D9")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    center = Alignment(horizontal="center", vertical="center")
    NUMFMT = '#,##0'

    def write_cells(rr, values, fill=None, font=None):
        for c, v in enumerate(values, 1):
            cell = ws.cell(row=rr, column=c, value=v)
            cell.border = border
            cell.alignment = center
            if fill:
                cell.fill = fill
            cell.font = font or DATA_FONT_
            if c in (10, 11, 12, 13, 14) and isinstance(v, (int, float)):
                cell.number_format = NUMFMT

    write_cells(1, headers, fill=HEAD_FILL, font=HEAD_FONT)

    r = 2
    grand = [0, 0, 0, 0, 0]  # 총회차, 총스크린, 총좌석수, 판매좌석수, 잔여좌석수
    i, n = 0, len(rows)
    while i < n:
        brand = rows[i].brand
        agg = [0, 0, 0, 0, 0]
        # 같은 브랜드 데이터 행 작성
        while i < n and rows[i].brand == brand:
            s = rows[i]
            total = int(s.total_seats or 0)
            remain = int(s.remaining_seats or 0)
            sold = max(0, total - remain)
            rate = f"{(sold / total * 100):.1f}%" if total > 0 else ""
            fmt, sub_type = _extract_format_and_type(s.tags)
            format1 = f"{fmt}({sub_type})" if sub_type and sub_type != "일반" else fmt
            category1 = " ".join(_special_category_tags(s.tags))
            play_date = s.play_date or (s.start_time.date() if s.start_time else None)
            region = _resolve_region(brand, s.theater_name, region_map)
            write_cells(r, [
                s.movie_title,
                str(play_date) if play_date else "",
                region,
                _brand_to_multi(brand),
                s.theater_name,
                s.screen_name,
                format1,
                category1,
                dj_timezone.localtime(s.start_time).strftime("%H:%M") if s.start_time else "",
                1, 1, total, sold, remain, rate,
            ])
            r += 1
            agg[0] += 1; agg[1] += 1; agg[2] += total; agg[3] += sold; agg[4] += remain
            i += 1
        # 멀티별 소계
        s_rate = f"{round(agg[3] / agg[2] * 100)}%" if agg[2] else ""
        write_cells(r, ["", "", "", "", f"{BRAND_LABEL.get(brand, brand)} 소계", "", "", "", "",
                        agg[0], agg[1], agg[2], agg[3], agg[4], s_rate], fill=SUB_FILL, font=SUB_FONT)
        r += 1
        for k in range(5):
            grand[k] += agg[k]

    # 총 계
    g_rate = f"{round(grand[3] / grand[2] * 100)}%" if grand[2] else ""
    write_cells(r, ["", "", "", "", "총 계", "", "", "", "",
                    grand[0], grand[1], grand[2], grand[3], grand[4], g_rate], fill=TOTAL_FILL, font=TOTAL_FONT)

    _auto_width(ws, min_row=1)
    ws.freeze_panes = "A2"
    wb.save(file_path)
    logger.info(f"특수상영 Excel exported: {file_path} ({len(rows)} rows)")
    return file_path
