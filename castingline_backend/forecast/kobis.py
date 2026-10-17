"""KOBIS 오픈API 클라이언트 + CLMS 영화 매칭.

키는 settings.KOBIS_API_KEY (환경변수) — 저장소가 공개라 코드에 넣지 않는다.
일일 호출 한도 3,000회. 호출 결과는 DB(KobisDailyBoxOffice / KobisMovieInfo)에 남겨 재호출하지 않는다.
"""
import re
import time
from datetime import datetime

import requests
from django.conf import settings

from .models import KobisDailyBoxOffice, KobisMovieInfo, MovieKobisMatch

BASE = "http://www.kobis.or.kr/kobisopenapi/webservice/rest"


class KobisQuotaError(Exception):
    pass


class KobisClient:
    def __init__(self, key=None, sleep=0.05):
        self.key = key or getattr(settings, "KOBIS_API_KEY", "")
        if not self.key:
            raise KobisQuotaError("KOBIS_API_KEY 환경변수가 없습니다.")
        self.sleep = sleep
        self.calls = 0

    def get(self, path, **params):
        last = None
        for _ in range(3):
            try:
                r = requests.get(f"{BASE}/{path}.json", params={"key": self.key, **params}, timeout=15)
                data = r.json()
                break
            except Exception as e:  # 네트워크 일시 오류 재시도
                last = e
                time.sleep(2)
        else:
            raise last
        self.calls += 1
        if "faultInfo" in data:
            raise KobisQuotaError(str(data["faultInfo"]))
        time.sleep(self.sleep)
        return data

    # ---------- 일별 박스오피스 ----------
    def fetch_daily_boxoffice(self, day):
        """day(date)의 TOP10 저장. 이미 있으면 건너뜀. 저장 행 수 반환."""
        if KobisDailyBoxOffice.objects.filter(target_date=day).exists():
            return 0
        lst = self.get("boxoffice/searchDailyBoxOfficeList", targetDt=day.strftime("%Y%m%d"))["boxOfficeResult"]["dailyBoxOfficeList"]
        save_daily_rows(day, lst)
        return len(lst)

    # ---------- 영화 정보 ----------
    def movie_info(self, movie_cd, refresh=False):
        obj = KobisMovieInfo.objects.filter(movie_cd=movie_cd).first()
        if obj and not refresh:
            return obj
        info = self.get("movie/searchMovieInfo", movieCd=movie_cd).get("movieInfoResult", {}).get("movieInfo", {})
        return save_movie_info(movie_cd, info)

    def search(self, name, open_from=None, open_to=None):
        p = {"movieNm": name, "itemPerPage": "100"}
        if open_from: p["openStartDt"] = str(open_from)
        if open_to: p["openEndDt"] = str(open_to)
        return self.get("movie/searchMovieList", **p).get("movieListResult", {}).get("movieList", [])


def save_daily_rows(day, lst):
    objs = []
    for r in lst:
        try:
            open_dt = datetime.strptime(r.get("openDt", "").strip(), "%Y-%m-%d").date()
        except ValueError:
            open_dt = None
        objs.append(KobisDailyBoxOffice(
            target_date=day, movie_cd=r["movieCd"], movie_nm=r["movieNm"], open_dt=open_dt, rank=int(r["rank"]),
            audi_cnt=int(r["audiCnt"]), audi_acc=int(r["audiAcc"]), scrn_cnt=int(r["scrnCnt"]), show_cnt=int(r["showCnt"])))
    KobisDailyBoxOffice.objects.bulk_create(objs, ignore_conflicts=True)


def save_movie_info(movie_cd, info):
    j = lambda key, sub: ",".join(x.get(sub, "") for x in info.get(key, []) or [])
    obj, _ = KobisMovieInfo.objects.update_or_create(movie_cd=movie_cd, defaults=dict(
        movie_nm=info.get("movieNm", "") or "", open_dt=info.get("openDt", "") or "", type_nm=info.get("typeNm", "") or "",
        nations=j("nations", "nationNm"), genres=j("genres", "genreNm"), directors=j("directors", "peopleNm"),
        actors=",".join(p.get("peopleNm", "") for p in (info.get("actors") or [])[:5]),
        audit=j("audits", "watchGradeNm"),
        distributors=",".join(c.get("companyNm", "") for c in info.get("companys", []) or [] if c.get("companyPartNm") == "배급사"),
    ))
    return obj


def norm_title(s):
    s = re.sub(r"\(\d{4}\)$", "", (s or "").strip())
    return re.sub(r"[^0-9A-Za-z가-힣]", "", s).lower()


def match_movie(client, movie):
    """CLMS 대표영화 → KOBIS 영화코드. CLMS 제목은 붙여쓰기라 앞 글자로 검색 후 정규화 비교.
    재개봉작은 원개봉 연도가 범위 밖이라 연도 제한 없이 한 번 더 찾는다."""
    nt = norm_title(movie.title_ko)
    rel = movie.release_date
    cands = []
    if nt and rel:
        for q in dict.fromkeys([nt[:4], nt[:2]]):
            cands += client.search(q, rel.year - 1, rel.year + 1)
            if any(norm_title(c["movieNm"]) == nt for c in cands):
                break
    if nt and not any(norm_title(c["movieNm"]) == nt for c in cands):
        cands += client.search(nt[:4])

    def dist(c):
        try:
            return abs((datetime.strptime(c["openDt"], "%Y%m%d").date() - rel).days)
        except Exception:
            return 99999

    exact = [c for c in cands if norm_title(c["movieNm"]) == nt]
    pool = exact or [c for c in cands if nt and len(norm_title(c["movieNm"])) >= 2
                     and (nt in norm_title(c["movieNm"]) or norm_title(c["movieNm"]) in nt)]
    best, how = None, "none"
    if pool and rel:
        best = min(pool, key=dist)
        how = "exact" if exact else "partial"
        if dist(best) > 400:
            if exact and str(best.get("openDt", "")) < rel.strftime("%Y%m%d"):
                how = "rerelease"
            else:
                best, how = None, "none"
    MovieKobisMatch.objects.update_or_create(movie=movie, defaults={"kobis_cd": best["movieCd"] if best else "", "match_type": how})
    if best:
        client.movie_info(best["movieCd"])
    return how
