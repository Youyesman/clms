"""이미 저장된 극장명/영화명에 남아있는 HTML 엔티티(&#40; &amp; 등)를 일괄 디코딩한다.

메가박스 API가 극장명 괄호를 &#40; &#41;, '&'를 &amp; 로 내려주는데 저장 시
디코딩하지 않아 '미사강변&#40;하남종합운동장&#41;', '미니언즈 &amp; 몬스터즈'
형태로 쌓인 기존 데이터를 정리한다. 수집 경로 자체는
MovieSchedule.decode_html_entities 로 이미 막혀 있다.

주의: 극장명을 디코딩하면 이미 정상 극장명으로 저장된 행과
unique_together(brand, theater_name, screen_name, start_time)가 충돌하는
중복 행이 있다. 이 경우 **나중에 수집된 행(id가 큰 쪽)의 좌석 정보를 남기고**
나머지 한 행을 삭제해 병합한다.

사용:
    python manage.py fix_html_entities            # 변경 대상만 출력 (기본 dry-run)
    python manage.py fix_html_entities --apply    # 실제 반영
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Q

from crawler.models import MegaboxScheduleLog, MovieSchedule

# 중복 병합 시 나중 수집분에서 가져올 필드
MERGE_FIELDS = ['movie_title', 'end_time', 'tags', 'is_booking_available',
                'total_seats', 'remaining_seats', 'play_date']

ENTITY_MARKERS = ('&#', '&amp;', '&lt;', '&gt;', '&quot;')


def _entity_q(*fields):
    q = Q()
    for f in fields:
        for m in ENTITY_MARKERS:
            q |= Q(**{f'{f}__contains': m})
    return q


class Command(BaseCommand):
    help = "저장된 극장명·영화명의 HTML 엔티티를 디코딩한다 (기본 dry-run)"

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true',
                            help='실제로 DB에 반영 (미지정 시 dry-run)')

    def handle(self, *args, **options):
        apply_ = options['apply']
        dec = MovieSchedule.decode_html_entities

        schedules = list(MovieSchedule.objects.filter(
            _entity_q('theater_name', 'movie_title', 'screen_name')))

        to_update, to_delete, merges = [], [], []
        cnt = {'theater_name': 0, 'movie_title': 0, 'screen_name': 0}
        theater_samples = set()

        for s in schedules:
            new_theater = dec(s.theater_name)
            new_title = dec(s.movie_title)
            new_screen = dec(s.screen_name)
            if new_theater != s.theater_name:
                cnt['theater_name'] += 1
                theater_samples.add(f'{s.theater_name}  →  {new_theater}')
            if new_title != s.movie_title:
                cnt['movie_title'] += 1
            if new_screen != s.screen_name:
                cnt['screen_name'] += 1
            if (new_theater, new_title, new_screen) == (s.theater_name, s.movie_title, s.screen_name):
                continue

            twin = None
            if new_theater != s.theater_name:
                twin = MovieSchedule.objects.filter(
                    brand=s.brand, theater_name=new_theater,
                    screen_name=new_screen, start_time=s.start_time,
                ).exclude(pk=s.pk).first()

            if twin is None:
                s.theater_name, s.movie_title, s.screen_name = new_theater, new_title, new_screen
                to_update.append(s)
                continue

            # 중복 병합: 나중에 수집된 쪽(id가 큼)의 값을 남긴다
            newer, older = (s, twin) if s.pk > twin.pk else (twin, s)
            keep = twin  # 살아남는 행은 항상 이미 정상 극장명인 twin
            if newer is s:
                for f in MERGE_FIELDS:
                    setattr(keep, f, dec(getattr(s, f)) if f == 'movie_title' else getattr(s, f))
            else:
                keep.movie_title = dec(keep.movie_title)
            merges.append((s.pk, twin.pk, newer.pk))
            to_update.append(keep)
            to_delete.append(s.pk)

        logs = [lg for lg in MegaboxScheduleLog.objects.filter(_entity_q('theater_name'))
                if dec(lg.theater_name) != lg.theater_name]
        for lg in logs:
            lg.theater_name = dec(lg.theater_name)

        self.stdout.write('--- MovieSchedule ---')
        self.stdout.write(f'  극장명 디코딩 : {cnt["theater_name"]}건')
        self.stdout.write(f'  영화명 디코딩 : {cnt["movie_title"]}건')
        self.stdout.write(f'  상영관 디코딩 : {cnt["screen_name"]}건')
        self.stdout.write(f'  중복 병합(삭제): {len(to_delete)}건')
        self.stdout.write(f'  갱신 대상     : {len(to_update)}건')
        self.stdout.write(f'--- MegaboxScheduleLog: {len(logs)}건 ---')
        for t in sorted(theater_samples):
            self.stdout.write(f'   {t}')

        if not apply_:
            self.stdout.write(self.style.WARNING('dry-run: 저장하지 않음 (--apply 로 반영)'))
            return

        with transaction.atomic():
            if to_delete:
                MovieSchedule.objects.filter(pk__in=to_delete).delete()
            if to_update:
                MovieSchedule.objects.bulk_update(
                    to_update, ['theater_name', 'movie_title', 'screen_name'] + MERGE_FIELDS,
                    batch_size=500)
            if logs:
                MegaboxScheduleLog.objects.bulk_update(logs, ['theater_name'], batch_size=500)

        self.stdout.write(self.style.SUCCESS(
            f'완료: 갱신 {len(to_update)}건 / 중복삭제 {len(to_delete)}건 / 로그 {len(logs)}건'))
