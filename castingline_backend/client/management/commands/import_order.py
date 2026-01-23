from datetime import datetime
import csv
from django.core.management.base import BaseCommand
from movie.models import Movie
from client.models import Client
from order.models import Order


def parse_date(date_str):
    try:
        if date_str:
            return datetime.strptime(date_str, "%Y%m%d").date()
        return None
    except ValueError:
        return None


def parse_int(value, default=0):
    try:
        value = str(value).strip()
        return int(value) if value else default
    except ValueError:
        return default


class Command(BaseCommand):
    help = 'Import Movie data from a CSV file'

    def add_arguments(self, parser):
        parser.add_argument('csv_file', type=str)

    def handle(self, *args, **options):
        file_path = options['csv_file']
        created_count = 0

        # 외래 키 객체를 미리 캐싱
        clients = {client.client_code: client for client in Client.objects.all()}
        movies = {movie.movie_code: movie for movie in Movie.objects.all()}

        # Order 객체를 저장할 리스트
        orders_to_create = []
        batch_size = 1000  # 한 번에 삽입할 배치 크기

        with open(options['csv_file'], newline='', encoding='utf-8') as csvfile:
            reader = csv.DictReader(csvfile)
            for row in reader:
                # 캐싱된 객체에서 client와 movie 조회
                client = clients.get(row.get('ctm_code'))
                movie = movies.get(row.get('tt_code'))

                # Order 객체 생성 (DB에 바로 저장하지 않음)
                order = Order(
                    client=client,
                    movie=movie,
                    start_date=parse_date(row.get("st_ymd")),
                    release_date=parse_date(row.get("in_ymd")),
                    end_date=parse_date(row.get("end_ymd")),
                    last_screening_date=parse_date(row.get("out_ymd")),
                )
                orders_to_create.append(order)

                # 배치 크기에 도달하면 bulk_create 호출
                if len(orders_to_create) >= batch_size:
                    Order.objects.bulk_create(orders_to_create)
                    created_count += len(orders_to_create)
                    orders_to_create = []  # 리스트 초기화

        # 남은 객체가 있으면 마지막으로 삽입
        if orders_to_create:
            Order.objects.bulk_create(orders_to_create)
            created_count += len(orders_to_create)

        self.stdout.write(self.style.SUCCESS(
            f'{created_count} orders imported successfully!'))