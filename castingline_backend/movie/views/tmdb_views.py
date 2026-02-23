import requests
import re
import html
import threading
import xml.etree.ElementTree as ET
from urllib.parse import quote
from datetime import datetime, timedelta, timezone as dt_tz
from concurrent.futures import ThreadPoolExecutor, as_completed
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from movie.models import CachedArticle

TMDB_BEARER_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIxYjNlYTRjOWY5NTA5MDViOWQxZjdjY2JkNjIyZDY1YiIsIm5iZiI6MTc3MTc2NjY4NC41MzIsInN1YiI6IjY5OWIwMzljMTU3OGJhZWI3NGZjMjc2ZSIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.6d_Z6YMCGZdG67ZhBQ2pCRl6CE_sMPAIjbf1xC6RgaU"

TMDB_HEADERS = {
    "accept": "application/json",
    "Authorization": f"Bearer {TMDB_BEARER_TOKEN}",
}

NAVER_CLIENT_ID = "UnVoSnHnPBtX5loRMKZe"
NAVER_CLIENT_SECRET = "ze6u99LT6E"
NAVER_HEADERS = {
    "X-Naver-Client-Id": NAVER_CLIENT_ID,
    "X-Naver-Client-Secret": NAVER_CLIENT_SECRET,
}

SCRAPE_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)

CACHE_TTL_MINUTES = 30


# ──────────────────────────────────────────────
#  Helpers
# ──────────────────────────────────────────────
def _fetch_tmdb(url):
    resp = requests.get(url, headers=TMDB_HEADERS, timeout=10)
    resp.raise_for_status()
    return resp.json()


def _slim_movie(m):
    return {
        "id": m.get("id"),
        "title": m.get("title"),
        "original_title": m.get("original_title"),
        "overview": m.get("overview", ""),
        "poster_path": m.get("poster_path"),
        "backdrop_path": m.get("backdrop_path"),
        "release_date": m.get("release_date"),
        "vote_average": m.get("vote_average"),
        "vote_count": m.get("vote_count"),
        "popularity": m.get("popularity"),
    }


def _strip_html(text):
    """HTML 태그 제거 + 엔티티 디코딩"""
    return html.unescape(re.sub(r"<[^>]+>", "", text)) if text else ""


def _scrape_og_image(url):
    """기사 원문 URL에서 og:image 추출"""
    try:
        r = requests.get(
            url, timeout=4,
            headers={"User-Agent": SCRAPE_UA},
            allow_redirects=True,
        )
        text = r.text[:20000]
        m = re.search(
            r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']',
            text, re.IGNORECASE,
        )
        if not m:
            m = re.search(
                r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',
                text, re.IGNORECASE,
            )
        return m.group(1) if m else ""
    except Exception:
        return ""


CACHE_TTL = {
    "news": 30,       # 30분
    "blog": 1440,     # 24시간 (하루)
    "celeb": 1440,    # 24시간 (하루)
}


def _is_cache_fresh(article_type, query):
    """캐시가 TTL 이내인지 확인 (타입별 TTL)"""
    latest = CachedArticle.objects.filter(
        article_type=article_type, query=query
    ).first()
    if not latest:
        return False
    ttl = CACHE_TTL.get(article_type, 30)
    return timezone.now() - latest.fetched_at < timedelta(minutes=ttl)


def _get_cached(article_type, query):
    """DB에서 캐시된 기사 목록 반환"""
    qs = CachedArticle.objects.filter(article_type=article_type, query=query)
    return [
        {
            "title": a.title,
            "description": a.description,
            "link": a.link,
            "originallink": a.original_link,
            "source": a.source,
            "pub_date": a.pub_date,
            "image": a.image,
        }
        for a in qs
    ]


def _save_to_cache(article_type, query, articles):
    """기사 목록을 DB에 저장 (기존 캐시 삭제 후 새로 저장)"""
    CachedArticle.objects.filter(article_type=article_type, query=query).delete()
    now = timezone.now()
    objs = [
        CachedArticle(
            article_type=article_type,
            query=query,
            title=a.get("title", ""),
            description=a.get("description", ""),
            link=a.get("link", ""),
            original_link=a.get("originallink", a.get("original_link", "")),
            source=a.get("source", ""),
            pub_date=a.get("pub_date", ""),
            image=a.get("image", ""),
            fetched_at=now,
        )
        for a in articles
    ]
    CachedArticle.objects.bulk_create(objs)


# ──────────────────────────────────────────────
#  뉴스 / 블로그 가져오기 로직 (캐시 저장용)
# ──────────────────────────────────────────────
NEWS_TITLE_KEYWORDS = [
    "영화", "극장", "개봉", "박스오피스", "흥행", "관객",
    "감독", "주연", "배우", "출연", "캐스팅", "촬영",
    "시사회", "영화제", "스크린", "상영",
    "넷플릭스", "왓챠", "디즈니플러스", "OTT",
    "CGV", "롯데시네마", "메가박스", "IMAX",
]

BLOG_KEYWORDS = [
    "영화", "관람", "감상", "리뷰", "스포", "개봉", "극장",
    "배우", "감독", "촬영", "시사회", "박스오피스", "흥행",
    "스크린", "연기", "출연", "주연", "조연", "캐스팅",
    "넷플릭스", "왓챠", "디즈니", "OTT", "드라마", "시리즈",
    "씨네", "CGV", "롯데시네마", "메가박스", "IMAX",
]


def _fetch_naver_news(query, display):
    """네이버 뉴스 API 호출 + 제목 필터 + og:image 스크래핑"""
    fetch_count = min(display * 3, 100)
    resp = requests.get(
        "https://openapi.naver.com/v1/search/news.json",
        params={"query": query, "display": fetch_count, "sort": "date"},
        headers=NAVER_HEADERS,
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()

    articles = []
    for item in data.get("items", []):
        title = _strip_html(item.get("title", ""))
        if not any(kw in title for kw in NEWS_TITLE_KEYWORDS):
            continue
        articles.append({
            "title": title,
            "description": _strip_html(item.get("description", "")),
            "link": item.get("link", ""),
            "originallink": item.get("originallink", ""),
            "source": "",
            "pub_date": item.get("pubDate", ""),
            "image": "",
        })
        if len(articles) >= display:
            break

    # og:image 스크래핑
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {
            executor.submit(_scrape_og_image, a["originallink"]): i
            for i, a in enumerate(articles) if a["originallink"]
        }
        for future in as_completed(futures):
            idx = futures[future]
            try:
                articles[idx]["image"] = future.result()
            except Exception:
                pass

    return articles


FILM_RSS_FEEDS = [
    # (source_name, rss_url)
    ("Variety", "https://variety.com/feed/"),
    ("The Hollywood Reporter", "https://www.hollywoodreporter.com/feed/"),
    ("IndieWire", "https://www.indiewire.com/feed/"),
]


def _parse_rss_items(content, source_name, limit=5):
    """RSS XML에서 기사 목록 파싱"""
    try:
        root = ET.fromstring(content)
    except ET.ParseError:
        return []

    articles = []
    for item in root.findall(".//item")[:limit]:
        title_el = item.find("title")
        link_el = item.find("link")
        pub_el = item.find("pubDate")
        desc_el = item.find("description")

        title = _strip_html(title_el.text or "") if title_el is not None else ""
        if not title:
            continue

        articles.append({
            "title": title,
            "description": _strip_html(desc_el.text or "")[:200] if desc_el is not None else "",
            "link": (link_el.text or "") if link_el is not None else "",
            "originallink": (link_el.text or "") if link_el is not None else "",
            "source": source_name,
            "pub_date": (pub_el.text or "") if pub_el is not None else "",
            "image": "",
        })
    return articles


def _fetch_single_rss(source_name, rss_url, limit=5):
    """단일 RSS 피드 가져오기"""
    try:
        resp = requests.get(
            rss_url, timeout=8,
            headers={"User-Agent": SCRAPE_UA},
        )
        resp.raise_for_status()
        return _parse_rss_items(resp.content, source_name, limit)
    except Exception:
        return []


GEMINI_API_KEY = "AIzaSyALzjiCQhl7QenM-mi2Zl2nI9lsmu1cEek"
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"


def _translate_with_gemini(all_articles, english_articles):
    """Gemini Flash로 영문 기사 번역 + 요약 (배치 처리)"""
    import json as _json

    # Gemini에 보낼 기사 목록 구성
    items = []
    for idx, a in english_articles:
        items.append({
            "index": idx,
            "title": a["title"],
            "description": a["description"],
        })

    prompt = (
        "너는 한국 엔터뉴스 에디터야. 아래 영어 기사들을 한국 독자용으로 다시 써줘.\n\n"
        "규칙:\n"
        "1. 제목(title): 한국 뉴스 스타일로 짧고 임팩트 있게. 직역하지 말고 의역.\n"
        "2. 설명(description): 핵심만 2~3줄로 요약. 자연스러운 한국어로. 번역투 금지.\n"
        "3. 인명은 한글 표기 (예: Tom Cruise → 톰 크루즈)\n"
        "4. 반드시 아래 JSON 배열 형식으로만 응답. 다른 텍스트 포함 금지:\n"
        '[{"index":0,"title":"제목","description":"설명"},...]'
        f"\n\n기사 목록:\n{_json.dumps(items, ensure_ascii=False)}"
    )

    try:
        resp = requests.post(
            GEMINI_URL,
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature": 0.3,
                    "maxOutputTokens": 8192,
                },
            },
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()

        raw_text = data["candidates"][0]["content"]["parts"][0]["text"]
        # JSON 블록 추출
        raw_text = raw_text.strip()
        if raw_text.startswith("```"):
            raw_text = re.sub(r"^```\w*\n?", "", raw_text)
            raw_text = re.sub(r"\n?```$", "", raw_text)

        # JSON 배열 부분만 추출
        match = re.search(r"\[.*\]", raw_text, re.DOTALL)
        if match:
            raw_text = match.group(0)

        # 모든 줄바꿈을 스페이스로 (JSON 파싱 깨짐 방지)
        raw_text = raw_text.replace("\n", " ").replace("\r", " ")

        print(f"[Gemini RAW] {raw_text[:500]}")
        results = _json.loads(raw_text)
        for item in results:
            idx = item.get("index")
            if idx is not None and 0 <= idx < len(all_articles):
                if item.get("title"):
                    all_articles[idx]["title"] = item["title"]
                if item.get("description"):
                    all_articles[idx]["description"] = item["description"]
        print(f"[Gemini] 번역 성공: {len(results)}개 기사")
        return
    except Exception as e:
        print(f"[Gemini] 번역 실패: {e}")

def _fetch_film_columns(query, display):
    """여러 영화 매체에서 칼럼/리뷰 수집"""
    per_source = max(3, display // len(FILM_RSS_FEEDS) + 1)
    all_articles = []

    # 병렬로 모든 피드 가져오기
    with ThreadPoolExecutor(max_workers=6) as executor:
        futures = {}

        for source_name, rss_url in FILM_RSS_FEEDS:
            futures[executor.submit(_fetch_single_rss, source_name, rss_url, per_source)] = source_name

        for future in as_completed(futures):
            try:
                all_articles.extend(future.result())
            except Exception:
                pass

    # 날짜순 정렬 후 display 개수만큼 자르기
    def _parse_date(a):
        try:
            from email.utils import parsedate_to_datetime
            return parsedate_to_datetime(a["pub_date"])
        except Exception:
            return datetime.min.replace(tzinfo=dt_tz.utc)
    all_articles.sort(key=_parse_date, reverse=True)
    all_articles = all_articles[:display]
    # 영문 기사 → Gemini Flash로 번역 + 요약
    english_articles = [(i, a) for i, a in enumerate(all_articles) if a["source"] != "씨네21"]

    if english_articles:
        _translate_with_gemini(all_articles, english_articles)

    # og:image 병렬 스크래핑
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {
            executor.submit(_scrape_og_image, a.get("originallink") or a["link"]): i
            for i, a in enumerate(all_articles) if a.get("link")
        }
        for future in as_completed(futures):
            idx = futures[future]
            try:
                all_articles[idx]["image"] = future.result()
            except Exception:
                pass

    return all_articles


def _refresh_cache_background(article_type, query, display, fetch_fn):
    """백그라운드 스레드에서 캐시 갱신"""
    def _do():
        try:
            articles = fetch_fn(query, display)
            _save_to_cache(article_type, query, articles)
        except Exception:
            pass
    thread = threading.Thread(target=_do, daemon=True)
    thread.start()


# ──────────────────────────────────────────────
#  TMDB views
# ──────────────────────────────────────────────
@api_view(["GET"])
@permission_classes([AllowAny])
def tmdb_trending(request):
    try:
        data = _fetch_tmdb(
            "https://api.themoviedb.org/3/movie/popular?language=ko-KR&region=KR&page=1"
        )
        return Response({"results": [_slim_movie(m) for m in data.get("results", [])]})
    except Exception as e:
        return Response({"error": str(e)}, status=502)


@api_view(["GET"])
@permission_classes([AllowAny])
def tmdb_upcoming(request):
    try:
        data = _fetch_tmdb(
            "https://api.themoviedb.org/3/movie/upcoming?language=ko-KR&region=KR&page=1"
        )
        return Response({"results": [_slim_movie(m) for m in data.get("results", [])]})
    except Exception as e:
        return Response({"error": str(e)}, status=502)


@api_view(["GET"])
@permission_classes([AllowAny])
def tmdb_now_playing(request):
    try:
        data = _fetch_tmdb(
            "https://api.themoviedb.org/3/movie/now_playing?language=ko-KR&region=KR&page=1"
        )
        return Response({"results": [_slim_movie(m) for m in data.get("results", [])]})
    except Exception as e:
        return Response({"error": str(e)}, status=502)


# ──────────────────────────────────────────────
#  Google News RSS (보존)
# ──────────────────────────────────────────────
@api_view(["GET"])
@permission_classes([AllowAny])
def movie_news(request):
    try:
        query = request.query_params.get("q", "영화")
        url = f"https://news.google.com/rss/search?q={quote(query)}&hl=ko&gl=KR&ceid=KR:ko"
        resp = requests.get(url, timeout=10, headers={"User-Agent": "Mozilla/5.0"})
        resp.raise_for_status()
        root = ET.fromstring(resp.content)
        articles = []
        for item in root.findall(".//item")[:12]:
            articles.append({
                "title": (item.find("title").text or "") if item.find("title") is not None else "",
                "link": (item.find("link").text or "") if item.find("link") is not None else "",
                "pub_date": (item.find("pubDate").text or "") if item.find("pubDate") is not None else "",
                "source": (item.find("source").text or "") if item.find("source") is not None else "",
            })
        return Response({"results": articles})
    except Exception as e:
        return Response({"error": str(e)}, status=502)


# ──────────────────────────────────────────────
#  Naver News (DB 캐시)
# ──────────────────────────────────────────────
@api_view(["GET"])
@permission_classes([AllowAny])
def naver_news(request):
    """네이버 뉴스 — DB 캐시 (30분 갱신)"""
    query = request.query_params.get("q", "영화")
    display = int(request.query_params.get("display", "20"))

    if _is_cache_fresh("news", query):
        # 캐시 신선 → DB에서 즉시 반환
        return Response({"results": _get_cached("news", query)})

    # 캐시에 데이터가 있으면 일단 반환 + 백그라운드 갱신
    cached = _get_cached("news", query)
    if cached:
        _refresh_cache_background("news", query, display, _fetch_naver_news)
        return Response({"results": cached})

    # 첫 호출 — 동기적으로 가져와서 캐시 저장
    try:
        articles = _fetch_naver_news(query, display)
        _save_to_cache("news", query, articles)
        return Response({"results": articles})
    except Exception as e:
        return Response({"error": str(e)}, status=502)


# ──────────────────────────────────────────────
#  씨네21 칼럼/리뷰 (DB 캐시)
# ──────────────────────────────────────────────
@api_view(["GET"])
@permission_classes([AllowAny])
def naver_blog(request):
    """씨네21 영화 칼럼/리뷰 — DB 캐시 (30분 갱신)"""
    query = request.query_params.get("q", "영화 리뷰")
    display = int(request.query_params.get("display", "10"))

    if _is_cache_fresh("blog", query):
        return Response({"results": _get_cached("blog", query)})

    cached = _get_cached("blog", query)
    if cached:
        _refresh_cache_background("blog", query, display, _fetch_film_columns)
        return Response({"results": cached})

    try:
        articles = _fetch_film_columns(query, display)
        _save_to_cache("blog", query, articles)
        return Response({"results": articles})
    except Exception as e:
        return Response({"error": str(e)}, status=502)


# ──────────────────────────────────────────────
#  할리우드 스타 가십 RSS
# ──────────────────────────────────────────────
CELEB_RSS_FEEDS = [
    ("TMZ", "https://www.tmz.com/rss.xml"),
    ("Page Six", "https://pagesix.com/feed/"),
    ("People", None),  # Google News RSS
    ("E! News", None),  # Google News RSS
]


def _fetch_celeb_news(query, display):
    """할리우드 셀럽 가십 수집 — 여러 매체"""
    per_source = max(3, display // len(CELEB_RSS_FEEDS) + 1)
    all_articles = []

    with ThreadPoolExecutor(max_workers=6) as executor:
        futures = {}

        for source_name, rss_url in CELEB_RSS_FEEDS:
            if rss_url:
                futures[executor.submit(_fetch_single_rss, source_name, rss_url, per_source)] = source_name
            else:
                # Google News RSS로 가져오기
                gnews_url = (
                    f"https://news.google.com/rss/search?"
                    f"q={quote(query)}+site:{source_name.lower().replace(' ', '').replace('!','')}.com"
                    f"&hl=en&gl=US&ceid=US:en"
                )
                futures[executor.submit(_fetch_single_rss, source_name, gnews_url, per_source)] = source_name

        for future in as_completed(futures):
            try:
                all_articles.extend(future.result())
            except Exception:
                pass

    # 날짜순 정렬
    def _parse_date(a):
        try:
            from email.utils import parsedate_to_datetime
            return parsedate_to_datetime(a["pub_date"])
        except Exception:
            return datetime.min.replace(tzinfo=dt_tz.utc)
    all_articles.sort(key=_parse_date, reverse=True)
    all_articles = all_articles[:display]

    # Gemini 번역 + 요약
    english_articles = [(i, a) for i, a in enumerate(all_articles)]
    if english_articles:
        _translate_with_gemini(all_articles, english_articles)

    # og:image 스크래핑
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {
            executor.submit(_scrape_og_image, a.get("originallink") or a["link"]): i
            for i, a in enumerate(all_articles) if a.get("link")
        }
        for future in as_completed(futures):
            idx = futures[future]
            try:
                all_articles[idx]["image"] = future.result()
            except Exception:
                pass

    return all_articles


@api_view(["GET"])
@permission_classes([AllowAny])
def hollywood_celeb(request):
    """할리우드 스타 가십 — DB 캐시 (30분 갱신)"""
    query = request.query_params.get("q", "hollywood celebrity")
    display = int(request.query_params.get("display", "10"))

    if _is_cache_fresh("celeb", query):
        return Response({"results": _get_cached("celeb", query)})

    cached = _get_cached("celeb", query)
    if cached:
        _refresh_cache_background("celeb", query, display, _fetch_celeb_news)
        return Response({"results": cached})

    try:
        articles = _fetch_celeb_news(query, display)
        _save_to_cache("celeb", query, articles)
        return Response({"results": articles})
    except Exception as e:
        return Response({"error": str(e)}, status=502)
