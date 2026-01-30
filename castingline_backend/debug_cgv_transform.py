
import os
import django
import sys
from datetime import datetime

# Setup Django Environment
sys.path.append('c:/clms/castingline_backend')
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "castingline_backend.settings")
django.setup()

from crawler.models import CGVScheduleLog, MovieSchedule

def run_debug():
    print("Starting Debug...")
    
    # 1. Create a Mock Log
    mock_log = CGVScheduleLog()
    mock_log.query_date = "20260131"
    mock_log.theater_name = "Debug Theater"
    mock_log.id = 99999
    
    # Sample JSON with 24h time and normal time
    mock_log.response_json = {
        "data": [
            {
                "movNm": "Test Movie Normal",
                "scnsNm": "1wan",
                "scnYmd": "20260131",
                "scnsrtTm": "2000", # 20:00
                "scnendTm": "2200",
                "frSeatCnt": 100,
                "stcnt": 200,
                "frtmpSeatCnt": 100
            },
            {
                "movNm": "Test Movie Midnight",
                "scnsNm": "2wan",
                "scnYmd": "20260131",
                "scnsrtTm": "2405", # 00:05 next day
                "scnendTm": "2605",
                "frSeatCnt": 50,
                "stcnt": 100,
                "frtmpSeatCnt": 50
            }
        ]
    }
    
    print(f"Mock Log Created. query_date={mock_log.query_date}")
    
    # 2. Call Transformation
    print("Calling create_from_cgv_log...")
    try:
        count, errors = MovieSchedule.create_from_cgv_log(mock_log)
        print(f"Result Count: {count}")
        print(f"Errors: {errors}")
        
        # 3. Verify Created Items
        schedules = MovieSchedule.objects.filter(theater_name="Debug Theater")
        print(f"Querying DB for 'Debug Theater'... Found {schedules.count()} items.")
        
        for s in schedules:
            print(f"- Title: {s.movie_title}")
            print(f"  Start: {s.start_time}")
            print(f"  Play Date: {s.play_date}")
            print(f"  Booking Available: {s.is_booking_available}")
            
    except Exception as e:
        print(f"FATAL ERROR during transformation: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    run_debug()
