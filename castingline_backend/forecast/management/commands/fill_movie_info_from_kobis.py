# -*- coding: utf-8 -*-
"""KOBIS 영화정보 → CLMS 영화 장르·국가·감독·배우 채우기.

- 비어 있는 칸만 채운다 (직접 입력한 값은 덮어쓰지 않음)
- 대표영화에 매칭된 KOBIS 정보를 그 하위영화(프린트)에도 같이 채운다
- partial(제목 부분일치) 매칭은 오매칭 위험이 있어 제외
- 기본은 미리보기, --apply 로 저장. --match 는 아직 매칭 안 된 대표영화를 KOBIS에서 찾는다(API 호출 사용)
"""
from django.core.management.base import BaseCommand
from django.db.models import Q

from movie.models import Movie
from forecast.kobis import KobisClient, KobisQuotaError, match_movie
from forecast.models import KobisMovieInfo, MovieKobisMatch

FIELDS = {"genre": "genres", "country": "nations", "director": "directors", "cast": "actors"}
MAXLEN = {"genre": 100, "country": 100, "director": 100, "cast": None}
SAFE_MATCH = ("exact", "rerelease")


def _fmt(s, field):
    v = ", ".join(x.strip() for x in (s or "").split(",") if x.strip())
    n = MAXLEN[field]
    return v[:n] if n else v


class Command(BaseCommand):
    help = "KOBIS 영화정보로 영화의 빈 장르·국가·감독·배우를 채운다"

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true", help="실제 저장 (없으면 미리보기)")
        parser.add_argument("--match", action="store_true", help="미매칭 대표영화를 KOBIS에서 찾아 매칭 (API 호출)")
        parser.add_argument("--max-calls", type=int, default=2500)

    def handle(self, *args, **o):
        if o["match"]:
            self._match(o["max_calls"])

        matches = MovieKobisMatch.objects.filter(match_type__in=SAFE_MATCH).exclude(kobis_cd="").select_related("movie")
        info = {i.movie_cd: i for i in KobisMovieInfo.objects.filter(movie_cd__in=[m.kobis_cd for m in matches])}
        filled, touched = {f: 0 for f in FIELDS}, 0
        for mk in matches:
            ki = info.get(mk.kobis_cd)
            if not ki:
                continue
            code = (mk.movie.movie_code or "").strip()
            targets = Movie.objects.filter(Q(id=mk.movie_id) | Q(primary_movie_code__iregex=rf"^\s*{code}\s*$"))
            for mv in targets:
                changed = []
                for f, src in FIELDS.items():
                    val = _fmt(getattr(ki, src), f)
                    if val and not (getattr(mv, f) or "").strip():
                        setattr(mv, f, val); changed.append(f); filled[f] += 1
                if changed:
                    touched += 1
                    if o["apply"]:
                        mv.save(update_fields=changed + ["updated_date"])
        mode = "저장" if o["apply"] else "미리보기(--apply 로 저장)"
        self.stdout.write(f"[{mode}] 영화 {touched}건 · " + ", ".join(f"{f} {n}" for f, n in filled.items()))

    def _match(self, cap):
        try:
            client = KobisClient()
        except KobisQuotaError as e:
            self.stdout.write(f"KOBIS 매칭 건너뜀: {e}"); return
        done = 0
        todo = Movie.objects.filter(is_primary_movie=True, release_date__isnull=False, kobis_match__isnull=True)
        try:
            for mv in todo:
                if client.calls >= cap: break
                match_movie(client, mv); done += 1
        except KobisQuotaError as e:
            self.stdout.write(f"KOBIS 중단: {e}")
        self.stdout.write(f"KOBIS 매칭 {done}편 (남은 미매칭 {todo.count()}편, 호출 {client.calls})")
