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
