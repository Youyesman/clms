"""
매일 오전 8시에 실행 — 해외 영화 소식 + 할리우드 스타 캐시 갱신

Windows 작업 스케줄러(Task Scheduler) 등록:
  python manage.py refresh_articles
"""
from django.core.management.base import BaseCommand
from movie.views.tmdb_views import (
    _fetch_film_columns, _fetch_celeb_news, _save_to_cache
)


class Command(BaseCommand):
    help = "해외 영화 소식 및 할리우드 스타 기사 캐시 갱신"

    def handle(self, *args, **options):
        tasks = [
            ("blog", "영화 리뷰", 10, _fetch_film_columns),
            ("celeb", "hollywood celebrity", 10, _fetch_celeb_news),
        ]

        for article_type, query, display, fetch_fn in tasks:
            self.stdout.write(f"[{article_type}] 가져오는 중...")
            try:
                articles = fetch_fn(query, display)
                _save_to_cache(article_type, query, articles)
                self.stdout.write(self.style.SUCCESS(
                    f"[{article_type}] {len(articles)}개 기사 갱신 완료"
                ))
            except Exception as e:
                self.stdout.write(self.style.ERROR(
                    f"[{article_type}] 실패: {e}"
                ))
