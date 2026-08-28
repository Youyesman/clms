from django.db import models
from client.models import *
from movie.models import *
from castingline_backend.utils.models import TimeStampedModel

# Create your models here.


# 오더
class OrderList(TimeStampedModel):
    movie = models.OneToOneField(  # ✅ ForeignKey에서 OneToOneField로 변경
        Movie,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="orderlist_movie",
        verbose_name="대상 영화",
    )
    start_date = models.DateField(null=True, blank=True)  # 오더일자(보통 개봉일)
    remark = models.TextField(null=True, blank=True)
    created_date = models.DateTimeField(auto_now_add=True)
    updated_date = models.DateTimeField(auto_now=True)
    is_auto_generated = models.BooleanField(default=False)


# 오더상세내역
class Order(TimeStampedModel):
    client = models.ForeignKey(
        Client,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="order_client",
    )  # 극장명
    movie = models.ForeignKey(
        Movie,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="order_movie",
    )
    remark = models.TextField(null=True, blank=True)
    start_date = models.DateField(null=True, blank=True)  # 오더일자(보통 개봉일)
    release_date = models.DateField(null=True, blank=True)  # 개봉일
    end_date = models.DateField(null=True, blank=True)  # 종영일
    last_screening_date = models.DateField(null=True, blank=True)  # 마지막 상영일 (스코어 기준 재산출)
    created_date = models.DateTimeField(auto_now_add=True)
    updated_date = models.DateTimeField(auto_now=True)
    is_auto_generated = models.BooleanField(default=False)
    # O002: 종영일이 마지막 상영일로 자동 연장된 상태 표시(빨간 강조).
    # 사용자가 종영일을 직접 저장(수정/복사 버튼)하면 해제된다.
    end_date_auto_updated = models.BooleanField(default=False)

    class Meta:
        constraints = [
            # O003: 같은 영화(포맷 단위) × 극장 오더 중복 생성 금지 (DB 차원 보증)
            models.UniqueConstraint(
                fields=["movie", "client"],
                condition=models.Q(movie__isnull=False, client__isnull=False),
                name="uniq_order_movie_client",
            ),
        ]

    def recalc_last_screening_date(self, save=True):
        """마지막 상영일을 '실제 스코어가 존재하는 최종 입회일'로 다시 계산한다.

        예전에는 스코어 저장 시 max 값으로 올리기만 해서, 잘못 들어간 스코어를
        삭제해도 마지막 상영일이 그대로 남았다. 스코어가 하나도 없으면 None.
        대표영화 오더는 하위 포맷 스코어까지 포함해 계산한다(스코어는 하위영화에 쌓임).
        """
        from score.models import Score

        latest = (
            Score.objects.filter(movie_id__in=movie_family_ids(self.movie_id),
                                 client_id=self.client_id)
            .order_by('-entry_date')
            .values_list('entry_date', flat=True)
            .first()
        )
        update_fields = []
        if latest != self.last_screening_date:
            self.last_screening_date = latest
            update_fields += ['last_screening_date', 'updated_date']
        # O002: 등록된 종영일 이후 스코어가 잡히면 종영일을 자동 연장하고 강조 플래그를 켠다.
        # 0827 O001: 마지막 상영일이 이미 갱신돼 있어도(다른 저장 경로가 먼저 올린 경우)
        # 종영일이 뒤처져 있으면 연장해야 하므로, 변경 여부와 무관하게 항상 검사한다.
        if (self.last_screening_date and self.end_date
                and self.last_screening_date > self.end_date):
            self.end_date = self.last_screening_date
            self.end_date_auto_updated = True
            update_fields += ['end_date', 'end_date_auto_updated', 'updated_date']
        if not update_fields:
            return False
        if save:
            self.save(update_fields=sorted(set(update_fields)))
        return True


def movie_family_ids(movie_id):
    """마지막 상영일 산출에 쓸 영화 id 집합.

    스코어는 하위영화(포맷)에 쌓이므로, 대표영화 오더는 하위 포맷 스코어까지 봐야
    한다. 하위영화는 자기 자신만.
    """
    return _family_map([movie_id]).get(movie_id, {movie_id})


def _family_map(movie_ids):
    """{영화 id: 스코어를 찾아볼 영화 id 집합} 를 한 번에 만든다."""
    from movie.models import Movie

    movie_ids = [m for m in movie_ids if m]
    if not movie_ids:
        return {}
    movies = list(Movie.objects.filter(id__in=movie_ids)
                  .only('id', 'movie_code', 'is_primary_movie'))
    primary_codes = {m.movie_code for m in movies if m.is_primary_movie and m.movie_code}
    subs = {}
    if primary_codes:
        for s in Movie.objects.filter(primary_movie_code__in=primary_codes).only(
                'id', 'primary_movie_code'):
            subs.setdefault(s.primary_movie_code, []).append(s.id)
    out = {}
    for m in movies:
        ids = {m.id}
        if m.is_primary_movie and m.movie_code:
            ids.update(subs.get(m.movie_code, []))
        out[m.id] = ids
    return out


def _with_primary_pairs(pairs):
    """하위영화 스코어가 바뀌면 그 영화의 대표영화 오더도 다시 계산해야 하므로 짝을 추가."""
    from movie.models import Movie

    sub_ids = {m for m, _c in pairs}
    code_by_sub = {m.id: m.primary_movie_code
                   for m in Movie.objects.filter(id__in=sub_ids).only(
                       'id', 'primary_movie_code', 'is_primary_movie')
                   if not m.is_primary_movie and m.primary_movie_code}
    if not code_by_sub:
        return pairs
    primary_by_code = {m.movie_code: m.id for m in Movie.objects.filter(
        movie_code__in=set(code_by_sub.values()), is_primary_movie=True).only(
            'id', 'movie_code')}
    out = set(pairs)
    for movie_id, client_id in pairs:
        pid = primary_by_code.get(code_by_sub.get(movie_id))
        if pid:
            out.add((pid, client_id))
    return out


def latest_screening_map(orders):
    """{(오더의 movie_id, client_id): 실제 스코어 최종 상영일}.

    대표영화 오더는 하위 포맷 스코어까지 합쳐 최댓값을 낸다.
    """
    from django.db.models import Max
    from score.models import Score

    families = _family_map({o.movie_id for o in orders})
    all_movie_ids = set()
    for ids in families.values():
        all_movie_ids |= ids
    if not all_movie_ids:
        return {}

    rows = (Score.objects
            .filter(movie_id__in=all_movie_ids,
                    client_id__in={o.client_id for o in orders})
            .values('movie_id', 'client_id')
            .annotate(mx=Max('entry_date')))
    by_movie_client = {(r['movie_id'], r['client_id']): r['mx'] for r in rows}

    out = {}
    for o in orders:
        dates = [by_movie_client.get((mid, o.client_id))
                 for mid in families.get(o.movie_id, {o.movie_id})]
        dates = [d for d in dates if d]
        out[(o.movie_id, o.client_id)] = max(dates) if dates else None
    return out


def recalc_last_screening_dates(pairs=None, movie_ids=None, clear_when_empty=True):
    """오더의 마지막 상영일을 실제 스코어 기준으로 재산출한다. 변경 건수를 반환.

    pairs            : {(movie_id, client_id)} — 스코어가 실제로 바뀐 조합만 정확히 지정
    movie_ids        : 해당 영화의 오더 전체 (엑셀 재업로드처럼 영화 단위로 갈아끼울 때)
    clear_when_empty : 스코어가 하나도 없으면 None으로 지울지 여부.
                       삭제/재업로드 경로에서는 True(지워야 맞다).
                       과거 데이터 일괄 보정에서는 False — 스코어가 이관되지 않은
                       옛 오더(2007년대 등)의 마지막 상영일까지 날려버리면 안 된다.
    """
    from django.db.models import Max, Q
    from score.models import Score

    orders = Order.objects.all()
    if pairs is not None:
        pairs = {(m, c) for m, c in pairs if m and c}
        if not pairs:
            return 0
        # 하위 포맷 스코어가 바뀌면 그 영화의 대표영화 오더도 같이 다시 계산한다
        pairs = _with_primary_pairs(pairs)
        cond = Q()
        for m, c in pairs:
            cond |= Q(movie_id=m, client_id=c)
        orders = orders.filter(cond)
    elif movie_ids is not None:
        movie_ids = [m for m in movie_ids if m]
        if not movie_ids:
            return 0
        orders = orders.filter(movie_id__in=movie_ids)

    orders = list(orders.only('id', 'movie_id', 'client_id', 'last_screening_date',
                              'end_date', 'end_date_auto_updated'))
    if not orders:
        return 0

    latest_map = latest_screening_map(orders)

    changed = []
    for o in orders:
        latest = latest_map.get((o.movie_id, o.client_id))
        if latest is None and not clear_when_empty:
            continue
        dirty = False
        if latest != o.last_screening_date:
            o.last_screening_date = latest
            dirty = True
        # O002: 등록된 종영일 이후 상영(스코어)이 잡히면 종영일을 자동 연장하고
        # 강조 플래그를 켠다 (사용자가 종영일을 직접 저장하면 해제).
        # 0827 O001: 마지막 상영일이 이미 갱신돼 있던 행(다른 저장 경로가 먼저
        # 올린 경우)도 종영일이 뒤처져 있으면 연장되도록, 변경 여부와 무관하게 검사한다.
        if (o.last_screening_date and o.end_date
                and o.last_screening_date > o.end_date):
            o.end_date = o.last_screening_date
            o.end_date_auto_updated = True
            dirty = True
        if dirty:
            changed.append(o)

    if changed:
        Order.objects.bulk_update(
            changed, ['last_screening_date', 'end_date', 'end_date_auto_updated'],
            batch_size=500)
    return len(changed)
