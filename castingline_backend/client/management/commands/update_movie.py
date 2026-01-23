from datetime import datetime
import csv
from django.core.management.base import BaseCommand
from movie.models import Movie
from client.models import Client

# (TYPE_MAPPING, GRADE_MAPPING, parse_date, parse_int 함수는 기존과 동일하게 유지)
TYPE_MAPPING = {
    "type_1": {"101": ("media_type", "필름"), "102": ("media_type", "디지털")},
    "type_2": {"101": ("audio_mode", "더빙"), "102": ("audio_mode", "한글자막")},
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
    "type_6": {"101": ("imax_l", "Laser")},
    "type_7": {"101": ("screen_x", "ScreenX")}
}

GRADE_MAPPING = {
    "001": "전체", "002": "12세", "003": "15세", "004": "18세", "005": "등급외", "999": "기타",
}


def parse_date(date_str):
    try:
        if date_str:
            return datetime.strptime(str(int(float(date_str))), "%Y%m%d").date()
        return None
    except (ValueError, TypeError):
        return None


def parse_int(value, default=0):
    try:
        if value:
            return int(float(str(value).strip()))
        return default
    except (ValueError, TypeError):
        return default


class Command(BaseCommand):
    help = 'Update Movie data from a CSV file using movie_code'

    def add_arguments(self, parser):
        parser.add_argument('csv_file', type=str)

    def handle(self, *args, **options):
        file_path = options['csv_file']
        updated_count = 0

        # 1. Client 및 기존 Movie 객체 캐싱 (성능 최적화)
        self.stdout.write("Caching existing data...")
        clients = {client.client_code: client for client in Client.objects.all()}
        # 모든 영화를 가져오되, 메모리 효율을 위해 필요한 필드만 가져와서 딕셔너리로 만듭니다.
        existing_movies = {m.movie_code: m for m in Movie.objects.all()}

        movies_to_update = []
        batch_size = 500  # 업데이트는 생성보다 무거울 수 있으므로 적절히 조절

        # 2. 업데이트할 필드 목록 정의 (bulk_update 시 필요)
        update_fields = [
            'is_primary_movie', 'title_ko', 'title_en', 'running_time_minutes',
            'distributor', 'production_company', 'rating', 'release_date',
            'end_date', 'closure_completed_date', 'is_finalized', 'primary_movie_code',
            'media_type', 'audio_mode', 'viewing_dimension', 'screening_type',
            'dx4_viewing_dimension'
        ]

        with open(file_path, newline='', encoding='utf-8') as csvfile:
            reader = csv.DictReader(csvfile)
            for row in reader:
                movie_code = row.get('tt_code')

                # DB에 해당 movie_code가 없으면 업데이트 대상에서 제외
                if movie_code not in existing_movies:
                    # self.stdout.write(self.style.WARNING(f"Movie {movie_code} not found. Skipping..."))
                    continue

                movie = existing_movies[movie_code]

                # --- 데이터 가공 로직 (기존과 동일) ---
                is_primary = not row.get('tt_type')
                is_finalized = bool(row.get('up_id'))
                distributor = clients.get(row.get('disbu'))
                production_company = clients.get(row.get('product'))

                type_fields = {
                    "media_type": None, "audio_mode": None, "viewing_dimension": None,
                    "screening_type": None,  "4dx_viewing_dimension": None,
                }

                for type_col in [f"type_{i}" for i in range(1, 8)]:
                    code = row.get(type_col)
                    if code and TYPE_MAPPING.get(type_col, {}).get(code):
                        field_name, field_value = TYPE_MAPPING[type_col][code]
                        if field_name in type_fields:
                            type_fields[field_name] = field_value

                grade = row.get('grade')
                rating = GRADE_MAPPING.get(grade, None)

                # 3. 기존 객체 속성 업데이트
                movie.is_primary_movie = is_primary
                movie.title_ko = row.get('title_kor')
                movie.title_en = row.get('title_org')
                movie.running_time_minutes = parse_int(row.get("running"))
                movie.distributor = distributor
                movie.production_company = production_company
                movie.rating = rating
                movie.release_date = parse_date(row.get("d_day"))
                movie.end_date = parse_date(row.get("e_day"))
                movie.closure_completed_date = parse_date(row.get("fix_day"))
                movie.is_finalized = is_finalized
                movie.primary_movie_code = row.get('parent_code')
                movie.media_type = type_fields["media_type"]
                movie.audio_mode = type_fields["audio_mode"]
                movie.viewing_dimension = type_fields["viewing_dimension"]
                movie.screening_type = type_fields["screening_type"]
                movie.dx4_viewing_dimension = type_fields["4dx_viewing_dimension"]

                movies_to_update.append(movie)

                # 배치 업데이트 처리
                if len(movies_to_update) >= batch_size:
                    Movie.objects.bulk_update(
                        movies_to_update, fields=update_fields)
                    updated_count += len(movies_to_update)
                    movies_to_update = []
                    self.stdout.write(f"Updated {updated_count} movies...")

        # 남은 객체 처리
        if movies_to_update:
            Movie.objects.bulk_update(movies_to_update, fields=update_fields)
            updated_count += len(movies_to_update)

        self.stdout.write(self.style.SUCCESS(
            f'{updated_count} movies updated successfully!'))
