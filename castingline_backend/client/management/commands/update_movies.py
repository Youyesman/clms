import csv
from django.core.management.base import BaseCommand
from movie.models import Movie


class Command(BaseCommand):
    help = 'Title_M.csv 파일을 읽어 기존 Movie 모델의 대표 영화 여부를 업데이트합니다.'

    def add_arguments(self, parser):
        parser.add_argument('csv_file', type=str,
                            help='CSV 파일 경로 (예: Title_M.csv)')

    def handle(self, *args, **options):
        file_path = options['csv_file']

        # 1. 현재 DB에 있는 영화들을 movie_code 기준으로 캐싱 (빠른 조회를 위함)
        movie_dict = {m.movie_code: m for m in Movie.objects.all()}

        movies_to_update = []
        updated_count = 0

        try:
            with open(file_path, newline='', encoding='utf-8') as csvfile:
                reader = csv.DictReader(csvfile)
                for row in reader:
                    tt_code = row.get('tt_code')

                    # DB에 해당 영화가 없으면 스킵
                    if tt_code not in movie_dict:
                        continue

                    movie = movie_dict[tt_code]
                    tt_type = row.get('tt_type')
                    parent_code = row.get('parent_code')

                    # ✅ 대표 영화 판단 로직 적용
                    # 1. parent_code가 '11111111' 이거나
                    # 2. tt_type이 '0000000' 이거나
                    # 3. tt_type이 null(비어있음)일 때
                    is_primary = (
                        parent_code == "11111111" or
                        tt_type == "0000000" or
                        not tt_type
                    )

                    # 값이 변경된 경우에만 업데이트 리스트에 추가
                    if movie.is_primary_movie != is_primary or movie.primary_movie_code != parent_code:
                        movie.is_primary_movie = is_primary
                        movie.primary_movie_code = parent_code
                        movies_to_update.append(movie)

                    # 배치 처리 (1000건 단위로 DB 반영)
                    if len(movies_to_update) >= 1000:
                        Movie.objects.bulk_update(
                            movies_to_update, ['is_primary_movie', 'primary_movie_code'])
                        updated_count += len(movies_to_update)
                        movies_to_update = []

            # 남은 데이터 반영
            if movies_to_update:
                Movie.objects.bulk_update(
                    movies_to_update, ['is_primary_movie', 'primary_movie_code'])
                updated_count += len(movies_to_update)

            self.stdout.write(self.style.SUCCESS(
                f'성공적으로 {updated_count}개의 영화 데이터를 업데이트했습니다.'))

        except FileNotFoundError:
            self.stdout.write(self.style.ERROR(f'파일을 찾을 수 없습니다: {file_path}'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'오류 발생: {str(e)}'))
