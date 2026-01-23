from datetime import datetime
import csv
from django.core.management.base import BaseCommand
from movie.models import Movie
from order.models import OrderList


def parse_date(date_str):
    try:
        if date_str:
            return datetime.strptime(date_str, "%Y%m%d").date()
        return None
    except ValueError:
        return None


class Command(BaseCommand):
    help = "Import OrderList data from a CSV file without duplicates"

    def add_arguments(self, parser):
        parser.add_argument("csv_file", type=str)

    def handle(self, *args, **options):
        file_path = options["csv_file"]
        created_count = 0
        skipped_count = 0

        # 1. 빠른 조회를 위해 모든 영화 객체 캐싱 (movie_code 기준)
        movies = {movie.movie_code: movie for movie in Movie.objects.all()}

        # 2. DB에 이미 등록된 OrderList의 영화 ID들을 set으로 추출 (중복 체크용)
        # values_list('movie_id', flat=True)는 영화 ID값만 리스트로 가져옵니다.
        existing_order_movie_ids = set(
            OrderList.objects.values_list('movie_id', flat=True))

        # 3. CSV 내부에서의 중복을 막기 위해 현재 루프에서 처리 중인 ID 추적
        processed_in_csv = set()

        orders_to_create = []
        batch_size = 1000

        with open(file_path, newline="", encoding="utf-8") as csvfile:
            reader = csv.DictReader(csvfile)
            for row in reader:
                movie_code = row.get("tt_code")
                movie = movies.get(movie_code)

                # 조건 확인 1: 영화 정보가 DB에 없는 경우 스킵
                if not movie:
                    skipped_count += 1
                    continue

                # 조건 확인 2: 이미 DB에 해당 영화의 OrderList가 있거나, 현재 CSV 내에서 이미 처리된 경우 스킵
                if movie.id in existing_order_movie_ids or movie.id in processed_in_csv:
                    skipped_count += 1
                    continue

                # OrderList 객체 생성 준비
                order = OrderList(
                    movie=movie,
                    start_date=parse_date(row.get("st_ymd")),
                )
                orders_to_create.append(order)

                # CSV 내 중복 방지를 위해 처리 완료된 ID 저장
                processed_in_csv.add(movie.id)

                # 배치 단위 저장
                if len(orders_to_create) >= batch_size:
                    OrderList.objects.bulk_create(orders_to_create)
                    created_count += len(orders_to_create)
                    orders_to_create = []

        # 남은 객체 삽입
        if orders_to_create:
            OrderList.objects.bulk_create(orders_to_create)
            created_count += len(orders_to_create)

        self.stdout.write(
            self.style.SUCCESS(
                f"Import Complete: {created_count} created, {skipped_count} skipped (duplicates or missing movies)."
            )
        )
