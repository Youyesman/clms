"""흥행 전망(개봉 후 최종 관객 예측) 데이터.

- KobisDailyBoxOffice / KobisMovieInfo : KOBIS 오픈API 원천 (대형작 학습 보강·영화 메타)
- MovieKobisMatch : CLMS 대표영화 ↔ KOBIS 영화코드 매칭 결과
- ForecastDailyAgg : 스코어를 대표영화×일자로 미리 합친 테이블 (1,200만 행을 매번 읽지 않도록)
- ForecastSnapshot : 작품×기준일 전망 결과 캐시 (화면·PDF 공용 payload)
- ForecastTrack : 모델 검증 실적(롤링 백테스트) — 야간 배치가 갱신
"""
from django.db import models

from movie.models import Movie


class KobisDailyBoxOffice(models.Model):
    target_date = models.DateField()
    movie_cd = models.CharField(max_length=20)
    movie_nm = models.CharField(max_length=255)
    open_dt = models.DateField(null=True, blank=True)
    rank = models.PositiveSmallIntegerField()
    audi_cnt = models.IntegerField()
    audi_acc = models.BigIntegerField()
    scrn_cnt = models.IntegerField()
    show_cnt = models.IntegerField()

    class Meta:
        constraints = [models.UniqueConstraint(fields=["target_date", "movie_cd"], name="uniq_kobis_daily_bo")]
        indexes = [models.Index(fields=["movie_cd"])]


class KobisMovieInfo(models.Model):
    movie_cd = models.CharField(max_length=20, unique=True)
    movie_nm = models.CharField(max_length=255, blank=True, default="")
    open_dt = models.CharField(max_length=8, blank=True, default="")
    type_nm = models.CharField(max_length=50, blank=True, default="")
    nations = models.CharField(max_length=255, blank=True, default="")
    genres = models.CharField(max_length=255, blank=True, default="")
    directors = models.CharField(max_length=500, blank=True, default="")
    actors = models.CharField(max_length=1000, blank=True, default="")
    audit = models.CharField(max_length=100, blank=True, default="")
    distributors = models.CharField(max_length=500, blank=True, default="")
    fetched_at = models.DateTimeField(auto_now=True)

    @property
    def nation(self):
        n = (self.nations or "").split(",")[0]
        return n if n in ("한국", "미국", "일본") else "기타"

    @property
    def is_animation(self):
        return "애니메이션" in (self.genres or "")


class MovieKobisMatch(models.Model):
    MATCH_TYPES = [("exact", "정확 일치"), ("partial", "부분 일치"), ("rerelease", "재개봉"), ("none", "매칭 실패")]
    movie = models.OneToOneField(Movie, on_delete=models.CASCADE, related_name="kobis_match")
    kobis_cd = models.CharField(max_length=20, blank=True, default="")
    match_type = models.CharField(max_length=10, choices=MATCH_TYPES)
    checked_at = models.DateTimeField(auto_now=True)


class ForecastDailyAgg(models.Model):
    movie_code = models.CharField(max_length=20)   # 대표영화 movie_code (공백 제거)
    date = models.DateField()
    visitors = models.BigIntegerField()
    theaters = models.IntegerField()

    class Meta:
        constraints = [models.UniqueConstraint(fields=["movie_code", "date"], name="uniq_forecast_daily_agg")]
        indexes = [models.Index(fields=["date"])]


class ForecastSnapshot(models.Model):
    movie = models.ForeignKey(Movie, on_delete=models.CASCADE, related_name="forecast_snapshots")
    as_of = models.DateField()        # 리포트 기준일 (개봉 dn일차)
    dn = models.PositiveSmallIntegerField()
    data_version = models.CharField(max_length=40)   # 학습 데이터 기준(마지막 집계일 등) — 바뀌면 재계산
    payload = models.JSONField()
    created_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["movie", "dn"], name="uniq_forecast_snapshot")]


class ForecastTrack(models.Model):
    """모델 검증 실적 (싱글톤)"""
    payload = models.JSONField(default=dict)
    updated_at = models.DateTimeField(auto_now=True)

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj
