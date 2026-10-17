"""흥행 전망 API.

- GET Api/forecast/movies/?q=        : 전망 가능한 작품 목록 (최근 개봉순)
- GET Api/forecast/report/?movie_id=&dn= : 전망 payload (dn 생략 시 최신일)
- GET Api/forecast/report/pdf/?movie_id=&dn= : 전망 PDF
모두 관리자(superuser) 전용.
"""
import io
from urllib.parse import quote

from django.http import FileResponse
from rest_framework import status
from rest_framework.authentication import TokenAuthentication
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response

from movie.models import Movie
from . import service
from .pdf import build_forecast_pdf


class IsSuperuser(BasePermission):
    message = "관리자만 사용할 수 있습니다."

    def has_permission(self, request, view):
        return bool(getattr(request.user, "is_superuser", False))


def _movie(request):
    mid = request.query_params.get("movie_id")
    return Movie.objects.filter(id=mid).first() if mid and str(mid).isdigit() else None


@api_view(["GET"])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated, IsSuperuser])
def forecast_movies(request):
    fc, _ = service.get_forecaster()
    rows = service.candidate_movies(fc)
    q = (request.query_params.get("q") or "").replace(" ", "")
    if q:
        rows = [r for r in rows if q in r["title"].replace(" ", "")]
    return Response({"movies": rows[:300]})


@api_view(["GET"])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated, IsSuperuser])
def forecast_report(request):
    movie = _movie(request)
    if not movie:
        return Response({"error": "영화를 선택해주세요."}, status=status.HTTP_400_BAD_REQUEST)
    payload, days = service.get_report(movie, request.query_params.get("dn"))
    if payload is None:
        return Response({"error": "개봉 7일이 지나야 예측할 수 있습니다.", "available_days": days},
                        status=status.HTTP_404_NOT_FOUND)
    return Response(payload)


@api_view(["GET"])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated, IsSuperuser])
def forecast_report_pdf(request):
    movie = _movie(request)
    if not movie:
        return Response({"error": "영화를 선택해주세요."}, status=status.HTTP_400_BAD_REQUEST)
    payload, _ = service.get_report(movie, request.query_params.get("dn"))
    if payload is None:
        return Response({"error": "개봉 7일이 지나야 예측할 수 있습니다."}, status=status.HTTP_404_NOT_FOUND)
    buf = io.BytesIO()
    build_forecast_pdf(payload, buf)
    buf.seek(0)
    name = f"흥행전망_{payload['film']['title']}_{payload['as_of']}.pdf"
    resp = FileResponse(buf, content_type="application/pdf")
    resp["Content-Disposition"] = f"attachment; filename*=UTF-8''{quote(name)}"
    return resp
