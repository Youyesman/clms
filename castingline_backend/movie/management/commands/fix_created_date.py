"""
초기 bulk import 시 created_date가 동일하게 들어간 영화 데이터를
release_date 기준으로 created_date를 업데이트하는 커맨드.

사용법: python manage.py fix_created_date
"""

from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import datetime
from movie.models import Movie


class Command(BaseCommand):
    help = "Bulk import된 영화의 created_date를 release_date 기준으로 업데이트"

    def handle(self, *args, **options):
        movies = Movie.objects.filter(release_date__isnull=False)
        total = movies.count()
        updated = 0

        for movie in movies:
            # release_date(DateField)를 DateTimeField로 변환 (자정 기준)
            new_created = timezone.make_aware(
                datetime.combine(movie.release_date, datetime.min.time())
            )
            if movie.created_date != new_created:
                Movie.objects.filter(pk=movie.pk).update(created_date=new_created)
                updated += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"완료: 전체 {total}개 중 {updated}개 영화의 created_date를 업데이트했습니다."
            )
        )
