"""오더의 '마지막 상영일'을 실제 스코어 기준으로 일괄 재산출한다.

예전 로직은 스코어 저장 시 최댓값으로 올리기만 해서, 잘못 들어간 스코어를 삭제해도
마지막 상영일이 옛 날짜로 남아 있었다. 이 명령으로 기존 데이터를 정리한다.

사용:
    python manage.py recalc_last_screening            # 변경 대상만 출력 (dry-run)
    python manage.py recalc_last_screening --apply    # 실제 반영
"""
from django.core.management.base import BaseCommand

from order.models import Order, latest_screening_map, recalc_last_screening_dates


class Command(BaseCommand):
    help = "오더의 마지막 상영일을 실제 스코어 기준으로 재산출한다 (기본 dry-run)"

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true',
                            help='실제로 DB에 반영 (미지정 시 dry-run)')
        parser.add_argument('--limit', type=int, default=20,
                            help='출력할 변경 예시 개수 (기본 20)')

    def handle(self, *args, **options):
        orders = list(Order.objects.select_related('movie', 'client')
                      .only('id', 'movie_id', 'client_id', 'last_screening_date'))
        # 대표영화 오더는 하위 포맷 스코어까지 포함해 계산 (본 로직과 동일)
        latest_map = latest_screening_map(orders)

        # 스코어가 아예 없는 오더(옛 데이터가 이관 안 된 경우)는 건드리지 않는다.
        diffs, skipped_empty = [], 0
        for o in orders:
            latest = latest_map.get((o.movie_id, o.client_id))
            if latest is None:
                if o.last_screening_date is not None:
                    skipped_empty += 1
                continue
            if latest != o.last_screening_date:
                diffs.append((o, o.last_screening_date, latest))

        self.stdout.write(f'오더 {len(orders)}건 중 마지막 상영일 불일치 {len(diffs)}건')
        self.stdout.write(f'(스코어가 없어 건너뛴 오더 {skipped_empty}건 — 값 유지)')
        for o, before, after in diffs[:options['limit']]:
            movie = o.movie.title_ko if o.movie else '?'
            client = o.client.client_name if o.client else '?'
            self.stdout.write(f'   {movie} / {client}: {before} → {after}')
        if len(diffs) > options['limit']:
            self.stdout.write(f'   ... 외 {len(diffs) - options["limit"]}건')

        if not options['apply']:
            self.stdout.write(self.style.WARNING('dry-run: 저장하지 않음 (--apply 로 반영)'))
            return

        changed = recalc_last_screening_dates(clear_when_empty=False)
        self.stdout.write(self.style.SUCCESS(f'완료: {changed}건 재산출'))
