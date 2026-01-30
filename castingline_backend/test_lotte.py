import os
import django
import json

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'castingline_backend.settings')
django.setup()

from crawler.models import LotteScheduleLog, MovieSchedule

log = LotteScheduleLog.objects.last()
if not log:
    print("No logs found")
    exit()

print(f"Testing Log ID: {log.id}")
try:
    count, errors = MovieSchedule.create_from_lotte_log(log)
    print(f"Result -> Count: {count}")
    if errors:
        print("Errors found:")
        for e in errors:
            print(f"Error for movie {e.get('movie')}: {e.get('error')}")
            # print(f"Context: {e.get('item')}")
    else:
        print("No errors returned.")
        
except Exception as e:
    import traceback
    print(f"Exception during create_from_lotte_log: {e}")
    traceback.print_exc()
