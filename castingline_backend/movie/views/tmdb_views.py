import requests
import re
import xml.etree.ElementTree as ET
from urllib.parse import quote
from concurrent.futures import ThreadPoolExecutor, as_completed
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

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


# ──────────────────────────────────────────────
#  TMDB helpers
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


# ──────────────────────────────────────────────
#  og:image scraper
# ──────────────────────────────────────────────
def _scrape_og_image(url):
    """기사 원문 URL에서 og:image 추출"""
    try:
        r = requests.get(
            url, timeout=4,
            headers={"User-Agent": SCRAPE_UA},
            allow_redirects=True,
        )
        html = r.text[:20000]
        # og:image (두 가지 속성 순서)
        m = re.search(
            r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']',
            html, re.IGNORECASE,
        )
        if not m:
            m = re.search(
                r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',
                html, re.IGNORECASE,
            )
        return m.group(1) if m else ""
    except Exception:
        return ""


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
    """Google News RSS — 한국 영화 뉴스"""
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
#  Naver News API (썸네일 이미지 포함)
# ──────────────────────────────────────────────
def _strip_html(text):
    """<b>, </b> 등 HTML 태그 제거"""
    return re.sub(r"<[^>]+>", "", text) if text else ""


@api_view(["GET"])
@permission_classes([AllowAny])
def naver_news(request):
    """네이버 뉴스 검색 — og:image 포함"""
    try:
        query = request.query_params.get("q", "영화")
        display = int(request.query_params.get("display", "12"))
        display = min(display, 30)

        resp = requests.get(
            "https://openapi.naver.com/v1/search/news.json",
            params={"query": query, "display": display, "sort": "date"},
            headers=NAVER_HEADERS,
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()

        articles = []
        for item in data.get("items", []):
            articles.append({
                "title": _strip_html(item.get("title", "")),
                "description": _strip_html(item.get("description", "")),
                "link": item.get("link", ""),
                "originallink": item.get("originallink", ""),
                "pub_date": item.get("pubDate", ""),
                "image": "",
            })

        # 병렬로 og:image 스크래핑 (originallink에서)
        with ThreadPoolExecutor(max_workers=8) as executor:
            futures = {
                executor.submit(_scrape_og_image, a["originallink"]): i
                for i, a in enumerate(articles)
                if a["originallink"]
            }
            for future in as_completed(futures):
                idx = futures[future]
                try:
                    articles[idx]["image"] = future.result()
                except Exception:
                    pass

        return Response({"results": articles})
    except Exception as e:
        return Response({"error": str(e)}, status=502)


@api_view(["GET"])
@permission_classes([AllowAny])
def naver_blog(request):
    """네이버 블로그 검색 — 영화 칼럼/리뷰"""
    try:
        query = request.query_params.get("q", "영화평")
        display = int(request.query_params.get("display", "10"))
        # 관련 없는 글 필터링을 위해 더 많이 가져옴
        fetch_count = min(display * 3, 100)

        resp = requests.get(
            "https://openapi.naver.com/v1/search/blog.json",
            params={"query": query, "display": fetch_count, "sort": "sim"},
            headers=NAVER_HEADERS,
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()

        # 영화 관련 키워드 필터
        MOVIE_KEYWORDS = [
            "영화", "관람", "감상", "리뷰", "스포", "개봉", "극장",
            "배우", "감독", "촬영", "시사회", "박스오피스", "흥행",
            "스크린", "연기", "출연", "주연", "조연", "캐스팅",
            "넷플릭스", "왓챠", "디즈니", "OTT", "드라마", "시리즈",
            "씨네", "CGV", "롯데시네마", "메가박스", "IMAX",
        ]

        articles = []
        for item in data.get("items", []):
            title = _strip_html(item.get("title", ""))
            desc = _strip_html(item.get("description", ""))
            combined = (title + " " + desc).lower()

            # 키워드 매칭 — 하나라도 포함되어야 함
            if not any(kw.lower() in combined for kw in MOVIE_KEYWORDS):
                continue

            # postdate(YYYYMMDD) → RFC2822 형식으로 변환
            raw_date = item.get("postdate", "")
            pub_date = raw_date
            if raw_date and len(raw_date) == 8:
                try:
                    from datetime import datetime
                    dt = datetime.strptime(raw_date, "%Y%m%d")
                    pub_date = dt.strftime("%a, %d %b %Y 00:00:00 +0900")
                except Exception:
                    pass

            articles.append({
                "title": title,
                "description": desc,
                "link": item.get("link", ""),
                "blogger_name": item.get("bloggername", ""),
                "pub_date": pub_date,
                "image": "",
            })

            if len(articles) >= display:
                break

        # 병렬로 og:image 스크래핑
        with ThreadPoolExecutor(max_workers=6) as executor:
            futures = {
                executor.submit(_scrape_og_image, a["link"]): i
                for i, a in enumerate(articles)
                if a["link"]
            }
            for future in as_completed(futures):
                idx = futures[future]
                try:
                    articles[idx]["image"] = future.result()
                except Exception:
                    pass

        return Response({"results": articles})
    except Exception as e:
        return Response({"error": str(e)}, status=502)

