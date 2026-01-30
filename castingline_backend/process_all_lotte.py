import os
import django
import sys

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'castingline_backend.settings')
django.setup()

from crawler.models import LotteScheduleLog, MovieSchedule

# Fetch all Lotte logs
logs = LotteScheduleLog.objects.all().order_by('id')
total = logs.count()
print(f"Found {total} Lotte logs. Starting processing...")

success_total = 0
error_total = 0

for i, log in enumerate(logs):
    try:
        count, errors = MovieSchedule.create_from_lotte_log(log)
        if errors:
            print(f"[{i+1}/{total}] Log {log.id}: {len(errors)} errors")
            error_total += 1
        else:
            success_total += 1
            if count > 0 and i % 50 == 0:
                print(f"[{i+1}/{total}] Log {log.id}: {count} schedules created/updated")
    except Exception as e:
        print(f"[{i+1}/{total}] Log {log.id}: Critical Error {e}")
        error_total += 1

print(f"Processing Complete. Success: {success_total}, Errors: {error_total}")
