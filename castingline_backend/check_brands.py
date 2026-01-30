import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'castingline_backend.settings')
django.setup()

from crawler.models import MovieSchedule

brands = MovieSchedule.objects.values_list('brand', flat=True).distinct().order_by('brand')
print("Distinct Brands found in DB:")
for b in brands:
    print(b)
