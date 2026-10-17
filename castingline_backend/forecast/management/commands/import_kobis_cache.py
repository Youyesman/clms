# -*- coding: utf-8 -*-
"""분석 단계에서 받아둔 KOBIS 응답 캐시(JSON)를 DB에 적재 — 초기 구축 시 API 호출을 아끼기 위한 1회성 커맨드.

--boxoffice : {"YYYYMMDD": [dailyBoxOfficeList...]}
--movie     : {"searchMovieInfo?movieCd=XXX": {movieInfoResult...}, "searchMovieList?...": {...}}
--matches   : [{"movie_code": "C2025080", "kobis_cd": "...", "match_type": "exact"}, ...]
"""
import json
from datetime import datetime

from django.core.management.base import BaseCommand

from forecast.kobis import save_daily_rows, save_movie_info
from forecast.models import KobisDailyBoxOffice, MovieKobisMatch
from movie.models import Movie


class Command(BaseCommand):
    help = "KOBIS 응답 캐시(JSON) → DB 적재"

    def add_arguments(self, parser):
        parser.add_argument("--boxoffice")
        parser.add_argument("--movie")
        parser.add_argument("--matches")

    def handle(self, *args, **o):
        if o["boxoffice"]:
            data = json.load(open(o["boxoffice"], encoding="utf-8"))
            have = set(KobisDailyBoxOffice.objects.values_list("target_date", flat=True).distinct())
            n = 0
            for k, lst in data.items():
                day = datetime.strptime(k, "%Y%m%d").date()
                if day in have: continue
                save_daily_rows(day, lst); n += 1
            self.stdout.write(f"박스오피스 {n}일 적재")
        if o["movie"]:
            data = json.load(open(o["movie"], encoding="utf-8"))
            n = 0
            for k, v in data.items():
                if not k.startswith("searchMovieInfo"): continue
                info = (v or {}).get("movieInfoResult", {}).get("movieInfo")
                if info and info.get("movieCd"):
                    save_movie_info(info["movieCd"], info); n += 1
            self.stdout.write(f"영화정보 {n}편 적재")
        if o["matches"]:
            rows = json.load(open(o["matches"], encoding="utf-8"))
            movies = {(m.movie_code or "").strip(): m for m in Movie.objects.filter(is_primary_movie=True)}
            n = 0
            for r in rows:
                mv = movies.get(r["movie_code"])
                if not mv or MovieKobisMatch.objects.filter(movie=mv).exists(): continue
                MovieKobisMatch.objects.create(movie=mv, kobis_cd=r.get("kobis_cd") or "", match_type=r.get("match_type") or "none")
                n += 1
            self.stdout.write(f"영화 매칭 {n}건 적재")
