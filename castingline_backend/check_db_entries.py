
import os
import django
import sys
from datetime import date

# Setup Django Environment
sys.path.append('c:/clms/castingline_backend')
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "castingline_backend.settings")
django.setup()

from crawler.models import MovieSchedule

def check_db():
    print("Checking DB for schedules...")
    
    # Check for play_date = 2026-01-31
    target_date = date(2026, 1, 31)
    
    print(f"Searching for play_date={target_date}...")
    qs = MovieSchedule.objects.filter(play_date=target_date)
    count = qs.count()
    print(f"Found {count} items with play_date={target_date}")
    
    for s in qs:
        print(f"[{s.brand}] {s.movie_title} | Start: {s.start_time} | PlayDate: {s.play_date}")

    # Also check specifically for start_time > 2026-02-01 00:00
    print("-" * 30)
    print("Checking for start_time >= 2026-02-01 belonging to CGV...")
    qs2 = MovieSchedule.objects.filter(start_time__year=2026, start_time__month=2, start_time__day=1, brand='CGV')
    for s in qs2:
        print(f"[{s.brand}] {s.movie_title} | Start: {s.start_time} | PlayDate: {s.play_date}")

if __name__ == "__main__":
    check_db()
