"""화면·PDF·야간 배치가 공유하는 진입점."""
import threading

import pandas as pd
from django.db.models import Max

from movie.models import Movie
from .engine.dataset import build_clms, build_kobis
from .kobis import norm_title
from .engine.model import Forecaster, HORIZONS, MODEL_VERSION
from .models import ForecastDailyAgg, ForecastSnapshot, ForecastTrack, KobisDailyBoxOffice

_lock = threading.Lock()
_cache = {"version": None, "fc": None}


def data_version():
    a = ForecastDailyAgg.objects.aggregate(m=Max("date"))["m"]
    k = KobisDailyBoxOffice.objects.aggregate(m=Max("target_date"))["m"]
    return f"{MODEL_VERSION}|{a}|{k}|{ForecastDailyAgg.objects.count()}"


def get_forecaster(force=False):
    """데이터 기준이 같으면 프로세스 안에서 재사용 (구성에 수 초 걸림)"""
    v = data_version()
    with _lock:
        if force or _cache["version"] != v or _cache["fc"] is None:
            clms, run_daily = build_clms()
            kobis = build_kobis(clms)
            _cache.update(version=v, fc=Forecaster(clms, kobis, run_daily))
        return _cache["fc"], v


def pkey_of(movie):
    code = movie.movie_code if movie.is_primary_movie else movie.primary_movie_code
    return (code or "").strip()


def covered_until(fc, pkey):
    """개봉 1일차부터 스코어가 이어서 등록된 마지막 일차.
    업로드가 밀려 중간이 비면(이틀 이상 연속 공백) 그 앞날까지만 믿는다 — 빈 날을 '관객 없음'으로 읽으면 예측이 크게 낮아진다.
    상영이 끝난 작품은 뒤쪽 공백이 실제 종영이므로 마지막 일자를 그대로 쓴다."""
    cur = fc._curve(pkey)
    cur = cur[cur.v > 0]
    if cur.empty:
        return 0
    if bool(fc.clms.loc[pkey, "completed"]):
        return int(cur.dn.max())
    last = 0
    for d in sorted(cur.dn.astype(int)):
        if d - last > 2:
            break
        last = d
    return last


def available_days(fc, pkey):
    """예측 기준일로 고를 수 있는 개봉 N일차 (7·14·21일차 + 스코어가 이어진 마지막 날)"""
    if pkey not in fc.clms.index:
        return []
    last = covered_until(fc, pkey)
    days = [h for h in HORIZONS if h <= last]
    if last >= 7 and last not in days:
        days.append(last)
    return sorted(days)


def get_report(movie, dn=None, use_cache=True):
    fc, v = get_forecaster()
    pkey = pkey_of(movie)
    days = available_days(fc, pkey)
    if not days:
        return None, days
    dn = int(dn) if dn else days[-1]
    if dn not in days:
        dn = max([d for d in days if d <= dn] or [days[0]])
    primary = Movie.objects.filter(id=int(fc.clms.loc[pkey, "id"])).first() or movie
    if use_cache:
        snap = ForecastSnapshot.objects.filter(movie=primary, dn=dn, data_version=v).first()
        if snap:
            return snap.payload, days
    payload = fc.report(pkey, dn)
    # 상영 중인데 스코어가 끊긴 경우 안내 (업로드 지연)
    last_row = fc._curve(pkey).dn.max()
    if not bool(fc.clms.loc[pkey, "completed"]) and dn == days[-1] and last_row > dn + 2:
        payload["score_note"] = (f"스코어가 개봉 {dn}일차({payload['as_of']})까지만 이어서 등록되어 있어 그날을 기준으로 예측했습니다. "
                                 "이후 스코어가 등록되면 다시 계산됩니다.")
    payload["track"] = ForecastTrack.load().payload
    payload["available_days"] = days
    ForecastSnapshot.objects.update_or_create(movie=primary, dn=dn, defaults={
        "as_of": pd.Timestamp(payload["as_of"]).date(), "data_version": v, "payload": payload})
    return payload, days


def candidate_movies(fc, recent_days=None):
    """스코어가 있는(전망 가능) 대표영화 — 최근 개봉순"""
    df = fc.clms[(~fc.clms.excluded) & (fc.clms.w1 > 0)].sort_values("release_date", ascending=False)
    # 개봉 7일차까지 스코어가 이어져 있어야 예측 가능
    df = df[[covered_until(fc, pk) >= 7 for pk in df.index]]
    if recent_days:
        df = df[df.release_date >= pd.Timestamp.today() - pd.Timedelta(days=recent_days)]
    return [{"movie_id": int(r.id), "title": r.title_ko, "release": r.release_date.strftime("%Y-%m-%d"),
             "total": int(r.total), "completed": bool(r.completed), "distributor": r.distributor or ""}
            for r in df.itertuples()]


def forecast_for_title(title, as_of_date):
    """상영현황 보고서 주요작(크롤러 제목) → CLMS 대표영화 전망. as_of_date 기준 개봉 7일차 이상일 때만."""
    fc, _ = get_forecaster()
    nt = norm_title(title)
    if not nt:
        return None
    cand = fc.clms[(~fc.clms.excluded) & (fc.clms.title_ko.map(norm_title) == nt)]
    cand = cand[cand.release_date <= pd.Timestamp(as_of_date)]
    if cand.empty:
        return None
    r = cand.sort_values("release_date").iloc[-1]
    dn = (pd.Timestamp(as_of_date) - r.release_date).days + 1
    if dn < 7:
        return None
    movie = Movie.objects.filter(id=int(r.id)).first()
    payload, _ = get_report(movie, dn) if movie else (None, [])
    return payload
