import os
import django
import sys
from datetime import datetime, timedelta

# Setup Django
sys.path.append('c:\\clms\\castingline_backend')
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "castingline_backend.settings")
django.setup()

from crawler.models import MovieSchedule
from crawler.utils.excel_exporter import export_transformed_schedules

def test_export():
    print("Testing Excel Export...")
    
    # 1. Check if we have any data
    if not MovieSchedule.objects.exists():
        print("No MovieSchedule data found. Cannot verify export.")
        return

    # 2. Pick a movie title that exists
    first_schedule = MovieSchedule.objects.last()
    target_title = first_schedule.movie_title
    print(f"Target Movie: {target_title}")
    
    # 3. Define range (cover the schedule's date)
    base_date = first_schedule.start_time.date()
    # Let's create a range that includes this date
    start_date = base_date
    end_date = base_date + timedelta(days=1)
    
    qs = MovieSchedule.objects.filter(
        start_time__date__gte=start_date,
        start_time__date__lte=end_date,
        movie_title=target_title
    )
    
    print(f"QuerySet Count: {qs.count()}")
    
    if qs.count() == 0:
        print("QuerySet is empty despite picking existing movie? Check date filter.")
        return

    # 4. Call Export
    print("Calling export_transformed_schedules...")
    try:
        file_path = export_transformed_schedules(qs, movie_title=target_title, start_date=start_date, end_date=end_date)
        print(f"Export successful. File: {file_path}")
        
        if file_path and os.path.exists(file_path):
            print("File exists on disk.")
            
            # 5. Verify Sheets
            import pandas as pd
            xl = pd.ExcelFile(file_path, engine='openpyxl')
            print(f"Sheet Names: {xl.sheet_names}")
            
            expected_sheet = base_date.strftime("%Y-%m-%d")
            if expected_sheet in xl.sheet_names:
                print(f"✅ Sheet '{expected_sheet}' found.")
            else:
                print(f"❌ Sheet '{expected_sheet}' NOT found. Found: {xl.sheet_names}")
                
        else:
            print("❌ File path returned but file not found.")
            
    except Exception as e:
        print(f"❌ Export Failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_export()
