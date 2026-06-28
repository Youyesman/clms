"""관리자 전용 메일함(IMAP) 조회 API."""

import urllib.parse

from django.http import HttpResponse
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
)
from rest_framework.authentication import TokenAuthentication
from rest_framework.permissions import BasePermission
from rest_framework.response import Response

from . import services
from . import lotte_report


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
