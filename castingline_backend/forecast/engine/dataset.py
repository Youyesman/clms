"""학습·예측용 데이터셋.

CLMS: ForecastDailyAgg(대표영화×일자) → 상영기간(run) 분리 → 피처
  - 같은 영화코드 안에서 스코어가 GAP_DAYS일 이상 끊기면 다른 상영기간(원개봉/재개봉)
  - CLMS 개봉일(release_date)이 들어있는 run을 이번 개봉으로 사용
  - KOBIS 미매칭·비영화(공연 실황 등) 제외
KOBIS: 일별 TOP10 중 개봉 1~14일차 내내 TOP10에 있던 종영작 (대형작 학습 보강용)
"""
import re

import numpy as np
import pandas as pd
from django.db import connection

from movie.models import Movie
from ..models import ForecastDailyAgg, KobisDailyBoxOffice, KobisMovieInfo, MovieKobisMatch
from .features import build_features

GAP_DAYS = 60
NON_FILM = re.compile(r"LIVE|라이브|VIEWING|응원상영|콘서트|TOUR|미개봉작", re.I)


def refresh_daily_agg(since=None):
    """스코어 → ForecastDailyAgg. since 이후 날짜만 다시 집계(스코어는 뒤늦게 올라오므로 최근 구간 재집계)."""
    where = "WHERE s.entry_date >= %s" if since else ""
    params = [since] if since else []
    with connection.cursor() as cur:
        if since:
            cur.execute("DELETE FROM forecast_forecastdailyagg WHERE date >= %s", [since])
        else:
            cur.execute("DELETE FROM forecast_forecastdailyagg")
        # 스코어 행은 요금별이라 (극장, 관, 회차)로 먼저 묶어 회차 단위로 만든 뒤 관 좌석수를 붙인다
        cur.execute(f"""
            INSERT INTO forecast_forecastdailyagg (movie_code, date, visitors, theaters, shows, seats, visitors_seated)
            WITH th AS (
                SELECT client_id, auditorium, MAX(CASE WHEN seat_count ~ '^[0-9]+$' THEN seat_count::int END) seats
                FROM client_theater GROUP BY client_id, auditorium
            ), sh AS (
                SELECT mk.pkey, s.entry_date d, s.client_id, s.auditorium, s.show_count,
                       SUM(CASE WHEN s.visitor ~ '^-?[0-9]+$' THEN s.visitor::bigint ELSE 0 END) v
                FROM score_score s
                JOIN (SELECT id, TRIM(CASE WHEN is_primary_movie THEN movie_code ELSE primary_movie_code END) pkey
                      FROM movie_movie) mk ON mk.id = s.movie_id
                {where} {"AND" if since else "WHERE"} s.entry_date IS NOT NULL AND mk.pkey IS NOT NULL AND mk.pkey <> ''
                GROUP BY mk.pkey, s.entry_date, s.client_id, s.auditorium, s.show_count
            )
            SELECT sh.pkey, sh.d, SUM(sh.v), COUNT(DISTINCT sh.client_id), COUNT(*),
                   COALESCE(SUM(CASE WHEN th.seats > 0 THEN th.seats END), 0),
                   COALESCE(SUM(CASE WHEN th.seats > 0 THEN sh.v END), 0)
            FROM sh LEFT JOIN th ON th.client_id = sh.client_id AND th.auditorium = sh.auditorium
            GROUP BY sh.pkey, sh.d
        """, params)
        return cur.rowcount


def primary_movies():
    """대표영화 (movie_code 공백 제거) → DataFrame"""
    rows = Movie.objects.filter(is_primary_movie=True).values(
        "id", "movie_code", "title_ko", "release_date", "distributor__client_name")
    df = pd.DataFrame(list(rows))
    if df.empty:
        return df
    df["movie_code"] = df.movie_code.str.strip()
    df = df.drop_duplicates("movie_code").set_index("movie_code")
    df["release_date"] = pd.to_datetime(df.release_date)
    return df.rename(columns={"distributor__client_name": "distributor"})


def clms_daily():
    df = pd.DataFrame(list(ForecastDailyAgg.objects.values_list(
        "movie_code", "date", "visitors", "theaters", "seats", "visitors_seated")),
        columns=["pkey", "d", "v", "th", "seats", "v_seat"])
    df["d"] = pd.to_datetime(df.d)
    return df


def _meta_frame():
    """대표영화별 KOBIS 메타 (국가·장르·재개봉 여부)"""
    m = pd.DataFrame(list(MovieKobisMatch.objects.values("movie__movie_code", "kobis_cd", "match_type")))
    if m.empty:
        return pd.DataFrame(columns=["kobis_cd", "match_type", "genres", "nations", "directors", "actors", "kobis_open"])
    m["movie__movie_code"] = m["movie__movie_code"].str.strip()
    info = pd.DataFrame(list(KobisMovieInfo.objects.values("movie_cd", "genres", "nations", "directors", "actors", "open_dt")))
    if not info.empty:
        m = m.merge(info.rename(columns={"movie_cd": "kobis_cd", "open_dt": "kobis_open"}), on="kobis_cd", how="left")
    return m.set_index("movie__movie_code")


def _meta_columns(df):
    df["genre1"] = df.genres.fillna("").str.split(",").str[0]
    df["animation"] = df.genres.fillna("").str.contains("애니메이션").astype(int)
    n = df.nations.fillna("").str.split(",").str[0]
    df["nation"] = np.where(n.isin(["한국", "미국", "일본"]), n, "기타")
    for k in ["한국", "미국", "일본"]:
        df[f"n_{k}"] = (df.nation == k).astype(int)
    df["release_wd"] = df.release_date.dt.weekday
    df["y"] = df.release_date.dt.year
    return df


def build_clms(daily=None, movies=None):
    """반환: (작품 데이터프레임, run 단위로 자른 일별 데이터)"""
    daily = clms_daily() if daily is None else daily
    movies = primary_movies() if movies is None else movies
    if daily.empty:
        return pd.DataFrame(), daily
    last_data = daily.d.max()
    dd = daily.sort_values(["pkey", "d"]).copy()
    dd["run"] = dd.groupby("pkey").d.diff().dt.days.gt(GAP_DAYS).groupby(dd.pkey).cumsum()
    runs = dd.groupby(["pkey", "run"]).agg(start=("d", "min"), end=("d", "max"), total=("v", "sum")).reset_index()
    runs = runs.merge(movies[["title_ko", "release_date"]], left_on="pkey", right_index=True)
    runs = runs[runs.release_date.notna()]
    inside = (runs.release_date >= runs.start) & (runs.release_date <= runs.end)
    runs["dist"] = np.where(inside, 0, np.minimum((runs.release_date - runs.end).abs().dt.days,
                                                   (runs.release_date - runs.start).abs().dt.days))
    sel = runs.sort_values(["pkey", "dist"]).groupby("pkey").head(1).set_index("pkey")
    sel = sel[sel.dist <= 30]

    df = sel.join(movies[["id", "distributor"]]).join(_meta_frame(), how="left")
    df["excluded"] = df.match_type.isin(["none"]) | df.match_type.isna() | df.title_ko.str.contains(NON_FILM) \
        | df.genres.fillna("").str.contains("공연")
    kopen = pd.to_datetime(df.kobis_open, format="%Y%m%d", errors="coerce")
    df["rerelease"] = ((df.match_type == "rerelease") | (kopen < df.release_date - pd.Timedelta(days=365))).astype(int)
    df["completed"] = df.end < last_data - pd.Timedelta(days=21)
    df = _meta_columns(df)

    run_daily = dd.merge(df[["run"]].reset_index(), on=["pkey", "run"])[["pkey", "d", "v", "th", "seats", "v_seat"]]
    F = build_features(run_daily, df.release_date)
    df = df.join(F)
    df["src"] = "CLMS"
    return df, run_daily


def build_kobis(clms_df=None):
    """KOBIS TOP10 대형작. 최종관객 = TOP10 마지막 누적 × 꼬리 보정(회사 작품 겹침으로 추정)."""
    b = pd.DataFrame(list(KobisDailyBoxOffice.objects.values_list(
        "target_date", "movie_cd", "movie_nm", "open_dt", "audi_cnt", "audi_acc", "scrn_cnt")),
        columns=["d", "cd", "nm", "open", "v", "acc", "th"])
    if b.empty:
        return pd.DataFrame()
    b["d"] = pd.to_datetime(b.d); b["open"] = pd.to_datetime(b.open)
    first_day, last_day = b.d.min(), b.d.max()
    g = b.groupby("cd").agg(nm=("nm", "first"), open=("open", "first"), first=("d", "min"), last=("d", "max"), acc_max=("acc", "max"))
    g["rerelease"] = (g.open < g["first"] - pd.Timedelta(days=60)).astype(int)
    g["rel"] = pd.to_datetime(np.where(g.rerelease == 1, g["first"], g.open))
    b = b.merge(g[["rel"]], left_on="cd", right_index=True)
    b["dn"] = (b.d - b.rel).dt.days + 1
    full14 = b[b.dn.between(1, 14)].groupby("cd").dn.nunique().eq(14)
    ok = g[full14.reindex(g.index, fill_value=False) & (g.rel >= first_day + pd.Timedelta(days=30))].copy()
    if ok.empty:
        return pd.DataFrame()
    fd = b.sort_values("d").groupby("cd").first()
    ok["base_acc"] = np.where(ok.rerelease == 1, (fd.acc - fd.v).reindex(ok.index), 0)
    F = build_features(b[b.cd.isin(ok.index)].rename(columns={"cd": "pkey"})[["pkey", "d", "v", "th"]], ok.rel)
    d1 = b[b.dn == 1].set_index("cd")
    F["pre"] = ((d1.acc - d1.v).reindex(F.index) - ok.base_acc).clip(lower=0).fillna(0)
    F["cum7"] = F.pre + F.w1; F["cum14"] = F.cum7 + F.w2; F["cum21"] = F.cum14 + F.w3
    F["pre_share"] = F.pre / F.cum7.replace(0, np.nan)
    ok["total_raw"] = ok.acc_max - ok.base_acc

    tail = 1.0
    if clms_df is not None and not clms_df.empty:
        ov = clms_df[clms_df.completed].dropna(subset=["kobis_cd"]).set_index("kobis_cd")[["total"]].join(ok[["total_raw"]], how="inner")
        ratio = (ov.total / ov.total_raw)
        ratio = ratio[(ratio > 0.5) & (ratio < 2)]
        if len(ratio) >= 3:
            tail = float(ratio.median())
    ok["total"] = ok.total_raw * tail

    info = {i.movie_cd: i for i in KobisMovieInfo.objects.filter(movie_cd__in=list(ok.index))}
    ok["nations"] = [info[c].nations if c in info else "" for c in ok.index]
    ok["genres"] = [info[c].genres if c in info else "" for c in ok.index]
    out = ok.join(F).rename(columns={"nm": "title_ko"})
    out["release_date"] = out.rel
    out["end"] = out["last"]
    out["completed"] = out["last"] < last_day - pd.Timedelta(days=21)
    out["kobis_cd"] = out.index
    out["src"] = "KOBIS"
    out = _meta_columns(out)
    out.attrs["tail"] = tail
    # 회사 작품과 겹치는 영화는 CLMS 쪽 데이터를 쓴다
    if clms_df is not None and "kobis_cd" in clms_df:
        out = out[~out.kobis_cd.isin(clms_df.kobis_cd.dropna())]
    return out


def kobis_candidates_needing_info():
    """KOBIS 보강 후보(1~14일차 TOP10 유지) 중 영화정보가 없는 movie_cd"""
    k = build_kobis()
    if k.empty:
        return []
    have = set(KobisMovieInfo.objects.filter(movie_cd__in=list(k.index)).values_list("movie_cd", flat=True))
    return [c for c in k.index if c not in have]
