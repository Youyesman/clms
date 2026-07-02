"""관리자 전용 메일함(IMAP) 조회 API + 정산서 첨부 수집/조회 API."""

import io
import urllib.parse
import zipfile

from django.db.models import Count
from django.http import HttpResponse
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
)
from rest_framework.authentication import TokenAuthentication
from rest_framework.permissions import BasePermission
from rest_framework.response import Response

from movie.models import Movie

from . import lotte_report
from . import services
from . import settlement_collector
from . import xlsx_to_pdf
from .models import CollectedSettlement, SettlementTargetMovie
from .serializers import (
    CollectedSettlementSerializer,
    SettlementTargetMovieSerializer,
)


class IsSuperUser(BasePermission):
    """superuser 만 허용."""

    message = "관리자(superuser) 전용 기능입니다."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.is_superuser
        )


def _guard(fn):
    """모든 메일 뷰에 동일한 인증/권한을 적용하는 데코레이터 묶음."""
    fn = authentication_classes([TokenAuthentication])(fn)
    fn = permission_classes([IsSuperUser])(fn)
    return fn


@api_view(["GET"])
@_guard
def mail_folders(request):
    try:
        return Response({"folders": services.list_folders()})
    except Exception as e:
        return Response({"error": f"메일 서버 연결 실패: {e}"}, status=502)


@api_view(["GET"])
@_guard
def mail_messages(request):
    folder = request.query_params.get("folder") or "INBOX"
    page = request.query_params.get("page", 1)
    page_size = request.query_params.get("page_size", 30)
    try:
        return Response(services.list_messages(folder, page, page_size))
    except Exception as e:
        return Response({"error": f"메일 목록 조회 실패: {e}"}, status=502)


@api_view(["GET"])
@_guard
def mail_message_detail(request, uid):
    folder = request.query_params.get("folder") or "INBOX"
    try:
        msg = services.get_message(folder, uid)
        if msg is None:
            return Response({"error": "메일을 찾을 수 없습니다."}, status=404)
        return Response(msg)
    except Exception as e:
        return Response({"error": f"메일 조회 실패: {e}"}, status=502)


@api_view(["GET"])
@_guard
def mail_attachment(request, uid, index):
    folder = request.query_params.get("folder") or "INBOX"
    try:
        result = services.get_attachment(folder, uid, index)
        if result is None:
            return Response({"error": "첨부파일을 찾을 수 없습니다."}, status=404)
        filename, content_type, payload = result
        resp = HttpResponse(payload, content_type=content_type or "application/octet-stream")
        # RFC 5987: 한글 파일명 대응
        quoted = urllib.parse.quote(filename)
        resp["Content-Disposition"] = f"attachment; filename*=UTF-8''{quoted}"
        return resp
    except Exception as e:
        return Response({"error": f"첨부파일 다운로드 실패: {e}"}, status=502)


@api_view(["GET"])
@_guard
def mail_lotte_report(request):
    """롯데 리포트 Linker URL → 회차별 판매현황 엑셀로 변환해 다운로드.

    날짜(play_date)는 클라이언트가 보내지 않아도 메일 본문에서 서버가 직접 도출한다.
    (Linker 가 호출마다 다른 날짜 리포트를 줄 수 있어, 메일이 가리키는 날짜로 고정해야
    엉뚱한 날짜가 받아지는 것을 막을 수 있다.)
    """
    url = request.query_params.get("url", "")
    expected_date = request.query_params.get("play_date", "")
    uid = request.query_params.get("uid")
    folder = request.query_params.get("folder") or "INBOX"

    # play_date 가 없으면 해당 메일에서 도출 (브라우저 캐시/구버전 대비)
    if not expected_date and uid:
        try:
            msg = services.get_message(folder, uid)
            for link in (msg or {}).get("report_links", []):
                if not url or link["url"] == url:
                    expected_date = link.get("play_date", "")
                    url = url or link["url"]
                    break
        except Exception:
            pass

    if not lotte_report.is_allowed_url(url):
        return Response({"error": "허용되지 않은 리포트 링크입니다."}, status=400)
    if not expected_date:
        return Response(
            {"error": "리포트 날짜를 확인할 수 없습니다. 메일을 다시 열고 시도해주세요."},
            status=400,
        )
    try:
        filename, xlsx, _ = lotte_report.extract_xlsx(url, expected_date)
        resp = HttpResponse(
            xlsx,
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        quoted = urllib.parse.quote(filename)
        resp["Content-Disposition"] = f"attachment; filename*=UTF-8''{quoted}"
        return resp
    except Exception as e:
        return Response({"error": f"엑셀 추출 실패: {e}"}, status=502)


# ──────────────────────────────────────────────────────────────────────────
# 정산서(부금계산서) 수집 기능
# ──────────────────────────────────────────────────────────────────────────


@api_view(["GET"])
@_guard
def movie_search(request):
    """대상 영화 선택용 영화 검색(제목 기준, 최신 개봉순 상위 30)."""
    q = (request.query_params.get("q") or "").strip()
    qs = Movie.objects.all()
    if q:
        qs = qs.filter(title_ko__icontains=q)
    qs = qs.order_by("-release_date", "-id")[:30]
    data = [
        {
            "id": m.id,
            "title_ko": m.title_ko,
            "title_en": m.title_en,
            "movie_code": m.movie_code,
            "release_date": m.release_date,
        }
        for m in qs
    ]
    return Response({"results": data})


@api_view(["GET", "POST"])
@_guard
def settlement_targets(request):
    """대상 영화 목록 조회 / 등록."""
    if request.method == "GET":
        qs = SettlementTargetMovie.objects.select_related("movie").all()
        return Response(SettlementTargetMovieSerializer(qs, many=True).data)

    movie_id = request.data.get("movie")
    if not movie_id:
        return Response({"error": "movie(영화 id)가 필요합니다."}, status=400)
    if SettlementTargetMovie.objects.filter(movie_id=movie_id).exists():
        return Response({"error": "이미 등록된 영화입니다."}, status=400)
    ser = SettlementTargetMovieSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    ser.save()
    return Response(ser.data, status=201)


@api_view(["PATCH", "DELETE"])
@_guard
def settlement_target_detail(request, pk):
    """대상 영화 수정(별칭/활성) / 삭제."""
    try:
        obj = SettlementTargetMovie.objects.select_related("movie").get(pk=pk)
    except SettlementTargetMovie.DoesNotExist:
        return Response({"error": "대상 영화를 찾을 수 없습니다."}, status=404)

    if request.method == "DELETE":
        obj.delete()
        return Response(status=204)

    ser = SettlementTargetMovieSerializer(obj, data=request.data, partial=True)
    ser.is_valid(raise_exception=True)
    ser.save()
    return Response(ser.data)


@api_view(["POST"])
@_guard
def settlement_scan(request):
    """지정 메일함을 스캔해 매칭되는 정산서 첨부를 수집한다.

    body: { folder, since(YYYY-MM-DD), until(YYYY-MM-DD), month(YYYY-MM, optional) }
    """
    folder = request.data.get("folder") or "INBOX"
    since = request.data.get("since") or None
    until = request.data.get("until") or None
    month = request.data.get("month") or None
    try:
        stats = settlement_collector.scan_folder(
            folder, since=since, until=until, month=month
        )
        return Response(stats)
    except Exception as e:
        return Response({"error": f"수집 실패: {e}"}, status=502)


@api_view(["POST"])
@_guard
def settlement_collect_attachment(request):
    """메일을 직접 읽고 첨부 1개를 수동으로 수집한다(영화/월 직접 지정).

    한 첨부에 여러 영화 정산서가 합쳐진 경우를 위해 여러 영화를 한 번에 지정할 수 있다.
    body: { folder, uid, index, movies(영화 id 배열) 또는 movie(단일 id), month? }
    """
    folder = request.data.get("folder")
    uid = request.data.get("uid")
    index = request.data.get("index")
    month = request.data.get("month") or None

    movie_ids = request.data.get("movies")
    if not movie_ids:
        single = request.data.get("movie")
        movie_ids = [single] if single else []
    if not isinstance(movie_ids, list):
        movie_ids = [movie_ids]
    movie_ids = [m for m in movie_ids if m]

    if not folder or uid is None or index is None or not movie_ids:
        return Response(
            {"error": "folder, uid, index, movies 가 모두 필요합니다."}, status=400
        )

    movies = list(Movie.objects.filter(pk__in=movie_ids))
    if not movies:
        return Response({"error": "영화를 찾을 수 없습니다."}, status=404)

    saved, duplicated = [], 0
    try:
        wire = settlement_collector.resolve_folder(folder)
        for movie in movies:
            res = settlement_collector.save_collected(
                wire,
                int(uid),
                int(index),
                movie,
                movie.title_ko,
                month,
                matched_keyword="",
                matched_in="manual",
            )
            if res == "duplicate":
                duplicated += 1
            elif res == "notfound":
                return Response(
                    {"error": "첨부파일을 찾을 수 없습니다."}, status=404
                )
            else:
                saved.append(res)
    except Exception as e:
        return Response({"error": f"수집 실패: {e}"}, status=502)

    if not saved and duplicated:
        return Response({"error": "이미 수집된 영화입니다."}, status=400)
    return Response(
        {
            "saved": CollectedSettlementSerializer(saved, many=True).data,
            "duplicated": duplicated,
        },
        status=201,
    )


@api_view(["GET"])
@_guard
def settlement_list(request):
    """수집된 정산서 목록 조회. month/movie 필터 지원."""
    qs = CollectedSettlement.objects.all()
    month = request.query_params.get("month")
    movie = request.query_params.get("movie")
    folder = request.query_params.get("folder")
    if month:
        qs = qs.filter(month=month)
    if movie:
        qs = qs.filter(movie_id=movie)
    if folder:
        qs = qs.filter(mail_folder=folder)
    return Response(CollectedSettlementSerializer(qs, many=True).data)


@api_view(["GET"])
@_guard
def settlement_summary(request):
    """월별 집계(개수) — 조회 화면의 사이드 트리/필터용."""
    months = (
        CollectedSettlement.objects.values("month")
        .annotate(count=Count("id"))
        .order_by("-month")
    )
    return Response({"months": list(months)})


@api_view(["GET"])
@_guard
def settlement_download_zip(request):
    """수집된 파일을 영화(+월) 또는 선택 항목 단위로 묶어 zip 으로 일괄 다운로드.

    query: movie(영화 id, 선택) / month(YYYY-MM, 선택) / ids(수집 id 콤마목록, 선택).
    ids 가 있으면 해당 항목만, 없으면 movie/month 필터(둘 다 없으면 전체).
    """
    qs = CollectedSettlement.objects.all()
    movie = request.query_params.get("movie")
    month = request.query_params.get("month")
    ids_param = request.query_params.get("ids")
    if ids_param:
        try:
            ids = [int(x) for x in ids_param.split(",") if x.strip()]
        except ValueError:
            return Response({"error": "ids 형식이 올바르지 않습니다."}, status=400)
        qs = qs.filter(pk__in=ids)
    else:
        if movie:
            qs = qs.filter(movie_id=movie)
        if month:
            qs = qs.filter(month=month)
    qs = qs.order_by("month", "id")
    if not qs.exists():
        return Response({"error": "다운로드할 파일이 없습니다."}, status=404)

    # zip 파일명 앞부분: 전부 같은 영화면 영화명, 아니면 '정산서'
    titles = set(qs.values_list("movie_title", flat=True))
    title = titles.pop() if len(titles) == 1 else "정산서"
    title = title or "정산서"
    if ids_param:
        title = f"{title}_선택{qs.count()}건"

    buf = io.BytesIO()
    used = set()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for rec in qs:
            try:
                data = rec.file.read()
            except Exception:
                continue
            name = rec.filename or f"file_{rec.id}"
            # 엑셀 파일은 PDF 로 변환해서 담는다(변환 실패/미설치 시 원본 유지).
            if name.lower().endswith((".xlsx", ".xls", ".xlsm")):
                pdf = xlsx_to_pdf.convert(data, name)
                if pdf is not None:
                    data = pdf
                    name = name.rsplit(".", 1)[0] + ".pdf"
            # 월별 폴더로 정리. 같은 폴더 내 동일 파일명은 (n) 으로 구분.
            arc = f"{rec.month}/{name}"
            if arc in used:
                if "." in name:
                    base, ext = name.rsplit(".", 1)
                    arc = f"{rec.month}/{base}({rec.id}).{ext}"
                else:
                    arc = f"{rec.month}/{name}({rec.id})"
            used.add(arc)
            zf.writestr(arc, data)

    # zip 파일명: "영화명-월" (월 없으면 영화명만)
    fname = f"{title}-{month}.zip" if month else f"{title}.zip"
    resp = HttpResponse(buf.getvalue(), content_type="application/zip")
    quoted = urllib.parse.quote(fname)
    resp["Content-Disposition"] = f"attachment; filename*=UTF-8''{quoted}"
    return resp


@api_view(["POST"])
@_guard
def settlement_bulk_delete(request):
    """수집 첨부 다건 일괄 삭제. body: {"ids": [1, 2, ...]}"""
    ids = request.data.get("ids") or []
    if not isinstance(ids, list) or not ids:
        return Response({"error": "삭제할 항목(ids)이 없습니다."}, status=400)

    deleted = 0
    for obj in CollectedSettlement.objects.filter(pk__in=ids):
        try:
            obj.file.delete(save=False)
        except Exception:
            pass
        obj.delete()
        deleted += 1
    return Response({"deleted": deleted})


@api_view(["GET", "DELETE"])
@_guard
def settlement_detail(request, pk):
    """수집 첨부 1건 다운로드(GET) / 삭제(DELETE)."""
    try:
        obj = CollectedSettlement.objects.get(pk=pk)
    except CollectedSettlement.DoesNotExist:
        return Response({"error": "첨부를 찾을 수 없습니다."}, status=404)

    if request.method == "DELETE":
        try:
            obj.file.delete(save=False)
        except Exception:
            pass
        obj.delete()
        return Response(status=204)

    try:
        payload = obj.file.read()
    except Exception:
        return Response({"error": "저장된 파일을 읽을 수 없습니다."}, status=404)
    resp = HttpResponse(
        payload, content_type=obj.content_type or "application/octet-stream"
    )
    quoted = urllib.parse.quote(obj.filename)
    resp["Content-Disposition"] = f"attachment; filename*=UTF-8''{quoted}"
    return resp
