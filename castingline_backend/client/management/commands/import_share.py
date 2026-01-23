from datetime import datetime
import csv
from django.core.management.base import BaseCommand
from movie.models import Movie
from client.models import Client
from rate.models import Rate


def parse_date(date_str):
    if not date_str:
        return None

    try:
        # 먼저 "YYYY-MM-DD HH:MM:SS" 포맷 처리
        return datetime.strptime(date_str.strip(), "%Y-%m-%d %H:%M:%S").date()
    except ValueError:
        try:
            # 또는 "YYYYMMDD" 형식 처리
            return datetime.strptime(date_str.strip(), "%Y%m%d").date()
        except ValueError:
            return None


def parse_int(value, default=0):
    try:
        value = str(value).strip()
        return int(value) if value else default
    except ValueError:
        return default


class Command(BaseCommand):
    help = "Import Share data from a CSV file"

    def add_arguments(self, parser):
        parser.add_argument("csv_file", type=str)

    def handle(self, *args, **options):
        file_path = options["csv_file"]
        created_count = 0

        # 외래 키 객체를 미리 캐싱
        clients = {client.client_code: client for client in Client.objects.all()}
        movies = {movie.movie_code: movie for movie in Movie.objects.all()}

        # Rate 객체를 저장할 리스트
        rates_to_create = []
        batch_size = 1000  # 한 번에 삽입할 배치 크기

        with open(options["csv_file"], newline="", encoding="utf-8") as csvfile:
            reader = csv.DictReader(csvfile)
            for row in reader:
                # 캐싱된 객체에서 client와 movie 조회
                client = clients.get(row.get("ctm_code"))
                movie = movies.get(row.get("tt_code"))

                # region_code 기반 share_rate 결정
                region_code = client.region_code if client else ""
                if region_code in ["경강", "서울"]:
                    share_value = row.get("theater_share")
                else:
                    share_value = row.get("dist_share")

                # Rate 객체 생성
                rate = Rate(
                    client=client,
                    movie=movie,
                    start_date=parse_date(row.get("change_date")),
                    share_rate=share_value,
                    end_date=parse_date(row.get("end_date")),
                    updated_date=parse_date(row.get("update_date")),
                )
                rates_to_create.append(rate)

                # 배치 크기에 도달하면 bulk_create 호출
                if len(rates_to_create) >= batch_size:
                    Rate.objects.bulk_create(rates_to_create)
                    created_count += len(rates_to_create)
                    rates_to_create = []  # 리스트 초기화

        # 남은 객체가 있으면 마지막으로 삽입
        if rates_to_create:
            Rate.objects.bulk_create(rates_to_create)
            created_count += len(rates_to_create)

        self.stdout.write(
            self.style.SUCCESS(f"{created_count} rates imported successfully!")
        )
