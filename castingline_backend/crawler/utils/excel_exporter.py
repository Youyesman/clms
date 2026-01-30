import os
import pandas as pd
from django.conf import settings
from datetime import datetime

from crawler.models import MovieSchedule

def export_schedules_to_excel(start_date_str, end_date_str, companies=None, target_titles=None, failures=None):
    """
    Exports MovieSchedule data and Failure logs to an Excel file.
    
    Args:
        start_date_str (str): YYYY-MM-DD
        end_date_str (str): YYYY-MM-DD
        companies (list): List of company names
        target_titles (list): List of movie titles to filter
        failures (list, optional): List of failure dictionaries
        
    Returns:
        str: Absolute path to the generated Excel file
    """
    
    # Prepare Data -> Removed as user requested only Failure logs
    
    # If no failures, return None
    if not failures:
        return None

    # Define File Path
    save_dir = os.path.join(settings.BASE_DIR, 'media', 'crawler_exports')
    os.makedirs(save_dir, exist_ok=True)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"crawler_result_{timestamp}.xlsx"
    file_path = os.path.join(save_dir, filename)
    
    # Export using ExcelWriter
    with pd.ExcelWriter(file_path, engine='openpyxl') as writer:
        if failures:
            # Group by Date
            # Convert failures list to DataFrame first for easier grouping
            df_all = pd.DataFrame(failures)
            
            # Reorder columns for readability
            desired_order = ['brand', 'region', 'theater', 'date', 'reason', 'worker']
            cols = [c for c in desired_order if c in df_all.columns] + [c for c in df_all.columns if c not in desired_order]
            df_all = df_all[cols]
            
            # Identify unique dates
            # 'date' column might contain 'Unknown', 'All', or actual dates
            unique_dates = df_all['date'].unique()
            
            for d_val in unique_dates:
                # Sanitize sheet name (Excel limits: 31 chars, no special chars like / \ ? * : [ ])
                sheet_name_safe = str(d_val).replace('/', '').replace('\\', '').replace(':', '')
                # If date is YYYYMMDD, maybe format nicely? or just keep it simple.
                # Prefix with 'Fail_' to avoid pure number sheet names sometimes causing issues?
                # User asked for "Failure_20260130"
                
                sheet_title = f"Fail_{sheet_name_safe}"[:30] # Limit length
                
                df_sub = df_all[df_all['date'] == d_val]
                df_sub.to_excel(writer, sheet_name=sheet_title, index=False)
        else:
             pass

    return file_path

def export_transformed_schedules(queryset, movie_title=None, start_date=None, end_date=None):
    """
    Exports MovieSchedule QuerySet to Excel with specific filename format and Pivot Table structure.
    Format: excel_{MovieTitle}__{StartDate}-{EndDate}_({GenDate} [{GenTime}])({DayOfWeek}).xlsx
    Internal Format: Pivot by Screen (One row per screen/date) with 1~N showtimes.
    """
    if not queryset.exists():
        return None
    
    # helper for safe division/int conversion
    def safe_int(val):
        try:
            return int(val)
        except:
            return 0
            
    # 1. Fetch Data
    schedules = queryset.order_by('start_time')
    
    # 2. Grouping Logic
    # Key: (brand, theater_name, screen_name, date)
    # Value: List of schedule objects
    grouped_data = {}
    
    for sch in schedules:
        s_date = sch.start_time.date()
        key = (sch.brand, sch.theater_name, sch.screen_name, s_date)
        
        if key not in grouped_data:
            grouped_data[key] = []
        grouped_data[key].append(sch)
        
    # 3. Build Rows
    rows = []
    max_shows = 0
    
    for key, items in grouped_data.items():
        brand, theater, screen, s_date = key
        
        # Sort items by time
        items.sort(key=lambda x: x.start_time)
        
        # Base Info
        # Tags processing (simple heuristic)
        # Assuming all items in group have same format/type usually
        sample_tags = items[0].tags if items else []
        
        fmt = "2D"
        sub_type = "일반"
        
        # Extract format (IMAX, 4DX, etc)
        special_formats = ["IMAX", "4DX", "SCREENX", "DOLBY"]
        for t in sample_tags:
            t_upper = str(t).upper()
            if any(f in t_upper for f in special_formats):
                fmt = t_upper
                break
                
        # Extract subtitle/dubbing
        if "자막" in sample_tags:
            sub_type = "자막"
        elif "더빙" in sample_tags:
            sub_type = "더빙"
            
        # Stats
        total_capacity = safe_int(items[0].total_seats) if items else 0
        show_count = len(items)
        
        # Calculate Aggregates
        item_total_seats_sum = 0
        item_sold_seats_sum = 0
        
        show_times = []
        for item in items:
            # Time string HH:MM
            show_times.append(item.start_time.strftime("%H:%M"))
            
            t_seat = safe_int(item.total_seats)
            r_seat = safe_int(item.remaining_seats)
            
            # If t_seat is 0 (missing data), try to use max of group if available, or just leave as 0
            if t_seat == 0 and total_capacity > 0:
                t_seat = total_capacity
                
            item_total_seats_sum += t_seat
            # Sold = Total - Remaining
            # If remaining is 0 but we don't know (parser failed), we assume sold all? Or 0?
            # It's better to trust the numbers. If r_seat is 0, maybe sold out?
            # User sample has "판매좌석수" as "53", "41", "48".
            sold = max(0, t_seat - r_seat)
            item_sold_seats_sum += sold
            
        if len(show_times) > max_shows:
            max_shows = len(show_times)
            
        row = {
            '지역': brand,
            '극장명': theater,
            '포맷': fmt,
            '구분': sub_type,
            '관': screen,
            '좌석수': total_capacity,
            'show_times': show_times, 
            '총회차': show_count,
            '총스크린': 1,
            '총좌석수': item_total_seats_sum,
            '판매좌석수': item_sold_seats_sum
        }
        rows.append(row)
        
    # 4. Create DataFrame
    final_data = []
    # Dynamic Columns for Shows
    # 1회, 2회 ... N회
    
    # Ensure at least 12 or max
    display_max_shows = max(12, max_shows)
    
    for r in rows:
        flat_row = {
            '지역': r['지역'],
            '극장명': r['극장명'],
            '포맷': r['포맷'],
            '구분': r['구분'],
            '관': r['관'],
            '좌석수': r['좌석수']
        }
        
        # Fill times
        times = r['show_times']
        for i in range(display_max_shows):
            col_name = f"{i+1}회"
            val = times[i] if i < len(times) else ""
            flat_row[col_name] = val
            
        flat_row['총회차'] = r['총회차']
        flat_row['총스크린'] = r['총스크린']
        flat_row['총좌석수'] = r['총좌석수']
        flat_row['판매좌석수'] = r['판매좌석수']
        
        final_data.append(flat_row)
        
    df = pd.DataFrame(final_data)
    
    # Reorder columns explicitly
    base_cols = ['지역', '극장명', '포맷', '구분', '관', '좌석수']
    show_cols = [f"{i+1}회" for i in range(display_max_shows)]
    stat_cols = ['총회차', '총스크린', '총좌석수', '판매좌석수']
    
    final_cols = base_cols + show_cols + stat_cols
    
    # Ensure all columns exist
    for c in final_cols:
        if c not in df.columns:
            df[c] = ""
            
    df = df[final_cols]
        
    # 5. Filename & Export
    save_dir = os.path.join(settings.BASE_DIR, 'media', 'crawler_exports')
    os.makedirs(save_dir, exist_ok=True)
    
    now = datetime.now()
    gen_date = now.strftime("%Y-%m-%d")
    gen_time = now.strftime("%H_%M_%S")
    weekday_kor = ["월", "화", "수", "목", "금", "토", "일"]
    day_of_week = weekday_kor[now.weekday()]
    
    if not movie_title: movie_title = "Overall"
    
    # Sanitize movie title
    import re
    safe_title = re.sub(r'[\\/*?:"<>|]', "", movie_title).replace(" ", "")
    
    if not start_date: start_date = gen_date
    if not end_date: end_date = start_date
    
    def fmt_date(d):
        if isinstance(d, datetime): return d.strftime("%Y-%m-%d")
        return str(d).split(' ')[0]
        
    filename = f"excel_{safe_title}__{fmt_date(start_date)}-{fmt_date(end_date)}_({gen_date} [{gen_time}])({day_of_week}).xlsx"
    file_path = os.path.join(save_dir, filename)
    
    # OpenPyXL Styling
    from openpyxl.styles import PatternFill, Border, Side, Alignment, Font
    from openpyxl.utils import get_column_letter

    with pd.ExcelWriter(file_path, engine='openpyxl') as writer:
        df.to_excel(writer, sheet_name='Schedules', index=False)
        
        workbook = writer.book
        worksheet = writer.sheets['Schedules']
        
        # Styles
        # Yellow header
        yellow_fill = PatternFill(start_color="FFFF00", end_color="FFFF00", fill_type="solid")
        thin_border = Border(left=Side(style='thin'), right=Side(style='thin'), 
                             top=Side(style='thin'), bottom=Side(style='thin'))
        center_align = Alignment(horizontal='center', vertical='center')
        header_font = Font(bold=True)
        
        # Apply to Headers (Row 1)
        for cell in worksheet[1]:
            cell.fill = yellow_fill
            cell.font = header_font
            cell.alignment = center_align
            cell.border = thin_border
            
        # Apply borders and alignment to all cells
        for row in worksheet.iter_rows(min_row=2):
            for cell in row:
                cell.border = thin_border
                cell.alignment = center_align
                
        # Auto-width (approximate)
        for i, column in enumerate(worksheet.columns):
            max_len = 0
            col_letter = get_column_letter(i+1)
            for cell in column:
                try:
                    if cell.value:
                        max_len = max(max_len, len(str(cell.value)))
                except: pass
            
            # Add some padding
            adj_width = (max_len + 2) * 1.2
            worksheet.column_dimensions[col_letter].width = min(adj_width, 50) # Cap at 50

    return file_path
