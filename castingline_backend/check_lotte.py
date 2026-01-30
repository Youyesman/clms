import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'castingline_backend.settings')
django.setup()

from crawler.models import LotteScheduleLog, MovieSchedule

raw_count = LotteScheduleLog.objects.count()
transformed_count = MovieSchedule.objects.filter(brand='LOTTE').count()

print(f"Lotte Raw Logs (LotteScheduleLog): {raw_count}")
print(f"Lotte Transformed Schedules (MovieSchedule): {transformed_count}")

# If raw logs exist but transformed is 0, let's peek at the first raw log to see if JSON is valid
if raw_count > 0:
    first_log = LotteScheduleLog.objects.last()
    print(f"Last Log ID: {first_log.id}, Created: {first_log.created_at}")
    print(f"Response JSON Type: {type(first_log.response_json)}")
    print(f"Response JSON Preview: {str(first_log.response_json)[:200]}")
