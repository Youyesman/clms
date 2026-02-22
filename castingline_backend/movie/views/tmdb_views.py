import requests
import xml.etree.ElementTree as ET
from urllib.parse import quote
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

TMDB_BEARER_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIxYjNlYTRjOWY5NTA5MDViOWQxZjdjY2JkNjIyZDY1YiIsIm5iZiI6MTc3MTc2NjY4NC41MzIsInN1YiI6IjY5OWIwMzljMTU3OGJhZWI3NGZjMjc2ZSIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.6d_Z6YMCGZdG67ZhBQ2pCRl6CE_sMPAIjbf1xC6RgaU"

TMDB_HEADERS = {
    "accept": "application/json",
    "Authorization": f"Bearer {TMDB_BEARER_TOKEN}",
}


def _fetch_tmdb(url):
    """TMDB API 호출 공통 헬퍼"""
    resp = requests.get(url, headers=TMDB_HEADERS, timeout=10)
    resp.raise_for_status()
    return resp.json()


def _slim_movie(m):
    """TMDB 영화 JSON에서 필요한 필드만 추출"""
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


@api_view(["GET"])
@permission_classes([AllowAny])
def tmdb_trending(request):
    """한국에서 인기 있는 영화"""
    try:
        data = _fetch_tmdb(
            "https://api.themoviedb.org/3/movie/popular?language=ko-KR&region=KR&page=1"
        )
        results = [_slim_movie(m) for m in data.get("results", [])]
        return Response({"results": results})
    except Exception as e:
        return Response({"error": str(e)}, status=502)


@api_view(["GET"])
@permission_classes([AllowAny])
def tmdb_upcoming(request):
    """개봉 예정작"""
    try:
        data = _fetch_tmdb(
            "https://api.themoviedb.org/3/movie/upcoming?language=ko-KR&region=KR&page=1"
        )
        results = [_slim_movie(m) for m in data.get("results", [])]
        return Response({"results": results})
    except Exception as e:
        return Response({"error": str(e)}, status=502)


@api_view(["GET"])
@permission_classes([AllowAny])
def tmdb_now_playing(request):
    """현재 상영중"""
    try:
        data = _fetch_tmdb(
            "https://api.themoviedb.org/3/movie/now_playing?language=ko-KR&region=KR&page=1"
        )
        results = [_slim_movie(m) for m in data.get("results", [])]
        return Response({"results": results})
    except Exception as e:
        return Response({"error": str(e)}, status=502)


@api_view(["GET"])
@permission_classes([AllowAny])
def movie_news(request):
    """Google News RSS에서 한국 영화 뉴스 가져오기"""
    try:
        query = request.query_params.get("q", "영화")
        url = f"https://news.google.com/rss/search?q={quote(query)}&hl=ko&gl=KR&ceid=KR:ko"

        resp = requests.get(url, timeout=10, headers={
            "User-Agent": "Mozilla/5.0"
        })
        resp.raise_for_status()

        root = ET.fromstring(resp.content)
        items = root.findall(".//item")

        results = []
        for item in items[:15]:
            title_el = item.find("title")
            link_el = item.find("link")
            pub_date_el = item.find("pubDate")
            source_el = item.find("source")

            results.append({
                "title": title_el.text if title_el is not None else "",
                "link": link_el.text if link_el is not None else "",
                "pub_date": pub_date_el.text if pub_date_el is not None else "",
                "source": source_el.text if source_el is not None else "",
            })

        return Response({"results": results})
    except Exception as e:
        return Response({"error": str(e)}, status=502)
