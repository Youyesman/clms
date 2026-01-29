import os
import django
from django.db.models import Count
from datetime import datetime

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'castingline_backend.settings')
django.setup()

from crawler.models import LotteScheduleLog

def check_status():
    print(f"--- Lotte Collection Status (All Dates) ---")
    
    # 1. Total Success Logs
    success_logs = LotteScheduleLog.objects.filter(status='success')
    total_count = success_logs.count()
    print(f"Total Success Logs: {total_count}")
    
    # 2. Distinct Theaters
    # Note: theater_name is stored in log
    theaters = success_logs.values('theater_name').annotate(count=Count('id')).order_by('theater_name')
    
    print(f"\n[Collected Theaters ({len(theaters)})]")
    theater_list = []
    for t in theaters:
        print(f"- {t['theater_name']} ({t['count']} logs)")
        theater_list.append(t['theater_name'])
        
    return theater_list

if __name__ == "__main__":
    check_status()
