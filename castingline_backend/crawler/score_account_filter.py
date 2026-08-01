"""스코어 크롤 대상 배급사 계정 필터.

영화명 키워드(includes)가 주어지면 영화 관리(Movie)에 등록된 해당 영화의
배급사/제작사만 골라 그 계정으로만 로그인하도록 돕는다.

- resolve_allowed_company_names(includes) : 허용 거래처명 목록(또는 None=제한 없음)
- account_matches(account_name, allowed)  : 계정명이 허용 거래처명과 매칭되는지
"""

# 거래처명/계정명 정규화 시 제거할 법인 표기
_CORP_MARKERS = ["(주)", "㈜", "주식회사", "(유)", "(사)"]

# Movie 에서 배급사/제작사로 쓰는 FK 필드
_COMPANY_FIELDS = (
    "distributor", "distributor_2", "distributor_3",
    "production_company", "production_company_2", "production_company_3",
)


def _normalize(s):
    """비교용 정규화: 공백 제거 + 법인 표기 제거 + 소문자."""
    t = str(s or "")
    for marker in _CORP_MARKERS:
        t = t.replace(marker, "")
    t = "".join(t.split())          # 모든 공백 제거
    return t.lower()


def resolve_allowed_company_names(includes):
    """영화명 키워드로 크롤 대상 배급사/제작사명을 결정한다.

    반환:
      None      : 제한 없음(기존처럼 모든 활성 계정 크롤)
      list[str] : 허용 거래처명 목록(중복 제거)

    - includes 가 비어 있으면 None
    - 키워드로 찾은 영화가 하나도 없으면 None (배급사를 알 수 없으므로 폴백)
    - 찾은 영화에 배급사/제작사가 하나도 없어도 None (폴백)
    """
    keywords = [str(k).strip() for k in (includes or []) if str(k).strip()]
    if not keywords:
        return None

    try:
        from movie.models import Movie
    except Exception:
        return None

    try:
        movies = []
        seen_ids = set()
        for kw in keywords:
            # 대표/하위 영화 구분 없이 제목이 일치하는 영화를 모두 사용
            qs = Movie.objects.filter(title_ko__icontains=kw).select_related(
                *_COMPANY_FIELDS)
            for mv in qs:
                if mv.pk not in seen_ids:
                    seen_ids.add(mv.pk)
                    movies.append(mv)

        if not movies:
            return None  # 등록된 영화가 없으면 제한하지 않는다

        names = []
        seen_names = set()
        for mv in movies:
            for field in _COMPANY_FIELDS:
                client = getattr(mv, field, None)
                name = (getattr(client, "client_name", "") or "").strip() if client else ""
                if name and name not in seen_names:
                    seen_names.add(name)
                    names.append(name)

        if not names:
            return None  # 배급사/제작사 미등록 → 폴백
        return names
    except Exception:
        return None


def account_matches(account_name, allowed_names):
    """계정명(배급사명)이 허용 거래처명 중 하나와 매칭되는지.

    정규화 후 서로 부분문자열이면 매칭으로 본다.
    예) 계정 "바이포엠" ↔ 거래처 "(주)바이포엠스튜디오" → True
    """
    if allowed_names is None:
        return True
    acc = _normalize(account_name)
    if not acc:
        return False
    for nm in allowed_names:
        target = _normalize(nm)
        if not target:
            continue
        if acc in target or target in acc:
            return True
    return False


def filter_accounts(accounts, allowed_names):
    """계정 dict 목록을 허용 거래처명으로 필터링."""
    if allowed_names is None:
        return accounts
    return [a for a in accounts if account_matches(a.get("name"), allowed_names)]
