from datetime import datetime
import csv
from django.core.management.base import BaseCommand
from movie.models import Movie
from client.models import Client


TYPE_MAPPING = {
    "type_1": {
        "101": ("media_type", "필름"),
        "102": ("media_type", "디지털"),
    },
    "type_2": {
        "101": ("audio_mode", "더빙"),
        "102": ("audio_mode", "한글자막"),
    },
    "type_3": {
        "101": ("viewing_dimension", "3D"),
        "102": ("viewing_dimension", "2D"),
        "103": ("viewing_dimension", "4D"),
        "104": ("viewing_dimension", "4D"),
    },
    "type_4": {
        "101": ("screening_type", "IMAX"),
        "102": ("screening_type", "ATMOS"),
    },
    "type_5": {
        "101": ("4dx_viewing_dimension", "4-DX"),
        "102": ("4dx_viewing_dimension", "Super-4D"),
        "103": ("4dx_viewing_dimension", "Dolby"),
    },
    "type_6": {
        "101": ("imax_l", "Laser"),
    },
    "type_7": {
        "101": ("screen_x", "ScreenX"),
    }
}

# grade 값에 따른 rating 매핑
GRADE_MAPPING = {
    "001": "전체",
    "002": "12세",
    "003": "15세",
    "004": "18세",
    "005": "등급외",
    "999": "기타",
}


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

        # Client 객체를 미리 캐싱
        clients = {client.client_code: client for client in Client.objects.all()}

        # 기존 Movie 객체의 movie_code 캐싱 (중복 확인용)
        existing_movie_codes = set(
            Movie.objects.values_list('movie_code', flat=True))

        # Movie 객체를 저장할 리스트
        movies_to_create = []
        batch_size = 1000  # 한 번에 삽입할 배치 크기

        with open(file_path, newline='', encoding='utf-8') as csvfile:
            reader = csv.DictReader(csvfile)
            for row in reader:
                movie_code = row.get('tt_code')

                # movie_code가 이미 존재하면 스킵
                if movie_code in existing_movie_codes:
                    self.stdout.write(self.style.WARNING(
                        f"Skipping movie with movie_code: {movie_code} (already exists)"))
                    continue

                # tt_type 및 parent_code 추출
                tt_type = row.get('tt_type')
                parent_code = row.get('parent_code')

                # ✅ 대표 영화 판단 로직 수정
                # 1. parent_code가 '11111111' 이거나
                # 2. tt_type이 '0000000' 이거나
                # 3. tt_type이 null(비어있음)일 때 대표 영화로 간주
                is_primary = (
                    parent_code == "11111111" or
                    tt_type == "0000000" or
                    not tt_type
                )

                # is_finalized는 up_id가 비어있지 않으면 True
                is_finalized = bool(row.get('up_id'))

                # 캐싱된 Client 객체에서 distributor와 production_company 조회
                distributor = clients.get(row.get('disbu'))
                production_company = clients.get(row.get('product'))

                type_fields = {
                    "media_type": None,
                    "audio_mode": None,
                    "viewing_dimension": None,
                    "screening_type": None,
                    "4dx_viewing_dimension": None,
                }

                for type_col in [f"type_{i}" for i in range(1, 8)]:
                    code = row.get(type_col)
                    if code and TYPE_MAPPING.get(type_col, {}).get(code):
                        field_name, field_value = TYPE_MAPPING[type_col][code]
                        type_fields[field_name] = field_value

                grade = row.get('grade')
                rating = GRADE_MAPPING.get(grade, None)

                # Movie 객체 생성
                movie = Movie(
                    movie_code=movie_code,
                    is_primary_movie=is_primary,
                    title_ko=row.get('title_kor'),
                    title_en=row.get('title_org'),
                    running_time_minutes=parse_int(row.get("running")),
                    distributor=distributor,
                    production_company=production_company,
                    rating=rating,
                    release_date=parse_date(row.get("d_day")),
                    end_date=parse_date(row.get("e_day")),
                    closure_completed_date=parse_date(row.get("fix_day")),
                    is_finalized=is_finalized,
                    primary_movie_code=parent_code,
                    media_type=type_fields["media_type"],
                    audio_mode=type_fields["audio_mode"],
                    viewing_dimension=type_fields["viewing_dimension"],
                    screening_type=type_fields["screening_type"],
                    dx4_viewing_dimension=type_fields["4dx_viewing_dimension"],
                )
                movies_to_create.append(movie)

                # 새로 추가된 movie_code를 캐싱에 추가
                existing_movie_codes.add(movie_code)

                # 배치 삽입
                if len(movies_to_create) >= batch_size:
                    Movie.objects.bulk_create(movies_to_create)
                    created_count += len(movies_to_create)
                    movies_to_create = []

        # 남은 객체 삽입
        if movies_to_create:
            Movie.objects.bulk_create(movies_to_create)
            created_count += len(movies_to_create)

        self.stdout.write(self.style.SUCCESS(
            f'{created_count} movies imported successfully!'))
