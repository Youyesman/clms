# -*- coding: utf-8 -*-
"""흥행 전망 야간 배치 (크론 1일 1회).

1) 스코어 → ForecastDailyAgg 재집계 (최근 --days일, --full 이면 전체)
2) KOBIS 일별 박스오피스 TOP10 누락일 수집 (--kobis-from 부터 어제까지)
3) 스코어 있는 대표영화 중 KOBIS 매칭 안 된 영화 매칭 (실패 건은 7일 뒤 재시도)
4) KOBIS 대형작 후보의 영화정보(국가·장르) 수집
5) 검증 실적 갱신 + 상영 중 작품의 전망 스냅샷 미리 계산

KOBIS 일일 호출 한도(3,000) 때문에 --max-calls 로 상한을 둔다. 한도에 걸리면 다음 날 이어서 채운다.
"""
from datetime import date, timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from movie.models import Movie
from forecast.engine.dataset import refresh_daily_agg, kobis_candidates_needing_info
from forecast.kobis import KobisClient, KobisQuotaError, match_movie
from forecast.models import ForecastDailyAgg, KobisDailyBoxOffice, MovieKobisMatch, ForecastTrack
from forecast import service


class Command(BaseCommand):
    help = "흥행 전망 야간 배치 (스코어 집계 · KOBIS 수집 · 전망 갱신)"

    def add_arguments(self, parser):
        parser.add_argument("--full", action="store_true", help="스코어 일별 집계를 전체 다시 만든다")
        parser.add_argument("--days", type=int, default=60, help="재집계할 최근 일수 (기본 60)")
        parser.add_argument("--kobis-from", default="2022-07-01", help="KOBIS TOP10 수집 시작일")
        parser.add_argument("--max-calls", type=int, default=2500, help="이번 실행의 KOBIS 호출 상한")
        parser.add_argument("--skip-kobis", action="store_true")
        parser.add_argument("--skip-snapshots", action="store_true")

    def log(self, msg):
        self.stdout.write(f"[{timezone.localtime():%Y-%m-%d %H:%M:%S}] {msg}")

    def handle(self, *args, **o):
        # 1) 스코어 집계
        if o["full"] or not ForecastDailyAgg.objects.exists():
            n = refresh_daily_agg()
            self.log(f"일별 집계 전체 재생성: {n}행")
        else:
            n = refresh_daily_agg(date.today() - timedelta(days=o["days"]))
            self.log(f"일별 집계 최근 {o['days']}일 재생성: {n}행")

        # 2~4) KOBIS
        if not o["skip_kobis"]:
            try:
                client = KobisClient()
                self._kobis(client, o)
            except KobisQuotaError as e:
                self.log(f"KOBIS 중단: {e}")

        # 5) 검증 실적 + 스냅샷
        fc, v = service.get_forecaster(force=True)
        track = ForecastTrack.load(); track.payload = fc.track(); track.save()
        self.log(f"검증 실적 갱신: {track.payload.get('horizons')}")
        if not o["skip_snapshots"]:
            done = 0
            for m in service.candidate_movies(fc, recent_days=120):
                if m["completed"]: continue
                movie = Movie.objects.filter(id=m["movie_id"]).first()
                if not movie: continue
                payload, _ = service.get_report(movie, use_cache=False)
                done += payload is not None
            self.log(f"상영 중 작품 전망 계산: {done}편")

    def _kobis(self, client, o):
        cap = o["max_calls"]
        start = date.fromisoformat(o["kobis_from"])
        have = set(KobisDailyBoxOffice.objects.filter(target_date__gte=start).values_list("target_date", flat=True).distinct())
        day, end, fetched = start, date.today() - timedelta(days=1), 0
        while day <= end and client.calls < cap:
            if day not in have:
                client.fetch_daily_boxoffice(day); fetched += 1
            day += timedelta(days=1)
        self.log(f"KOBIS 박스오피스 {fetched}일 수집 (누적 호출 {client.calls})")

        # 스코어 있는 대표영화 중 미매칭 (실패 건은 7일 뒤 재시도)
        codes = set(ForecastDailyAgg.objects.values_list("movie_code", flat=True).distinct())
        retry_before = timezone.now() - timedelta(days=7)
        matched = 0
        for mv in Movie.objects.filter(is_primary_movie=True).select_related("kobis_match"):
            if client.calls >= cap: break
            if (mv.movie_code or "").strip() not in codes or not mv.release_date: continue
            mk = getattr(mv, "kobis_match", None)
            if mk and (mk.match_type != "none" or mk.checked_at > retry_before): continue
            match_movie(client, mv); matched += 1
        self.log(f"KOBIS 영화 매칭 {matched}편 (누적 호출 {client.calls})")

        need = kobis_candidates_needing_info()
        for cd in need:
            if client.calls >= cap: break
            client.movie_info(cd)
        self.log(f"KOBIS 대형작 영화정보 {len(need)}편 확인 (누적 호출 {client.calls})")
