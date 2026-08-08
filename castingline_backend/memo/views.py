"""대시보드 공유 메모장 API.

- GET  Api/dashboard/memo/  : 현재 메모 조회(폴링용)
- PUT  Api/dashboard/memo/  : 메모 내용 저장(마지막 저장 우선)
"""

from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
)
from rest_framework.authentication import TokenAuthentication
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from rest_framework import status

from .models import CalendarEvent, SharedMemo
from .serializers import CalendarEventSerializer, SharedMemoSerializer


@api_view(["GET", "PUT"])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def shared_memo(request):
    memo = SharedMemo.load()

    if request.method == "PUT":
        memo.content = request.data.get("content", "") or ""
        memo.updated_by = request.user if request.user.is_authenticated else None
        memo.save()

    return Response(SharedMemoSerializer(memo).data)


@api_view(["GET", "POST"])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def calendar_events(request):
    """공유 캘린더 일정 목록/등록.

    GET  ?start=YYYY-MM-DD&end=YYYY-MM-DD : 기간 내 일정 (폴링용)
    POST {date, content}                  : 일정 추가
    """
    if request.method == "POST":
        content = (request.data.get("content") or "").strip()
        date = request.data.get("date")
        if not content or not date:
            return Response({"error": "날짜와 내용을 입력해주세요."},
                            status=status.HTTP_400_BAD_REQUEST)
        event = CalendarEvent.objects.create(
            date=date, content=content[:500],
            created_by=request.user if request.user.is_authenticated else None,
        )
        return Response(CalendarEventSerializer(event).data,
                        status=status.HTTP_201_CREATED)

    qs = CalendarEvent.objects.all()
    start, end = request.query_params.get("start"), request.query_params.get("end")
    if start:
        qs = qs.filter(date__gte=start)
    if end:
        qs = qs.filter(date__lte=end)
    return Response(CalendarEventSerializer(qs, many=True).data)


@api_view(["PATCH", "DELETE"])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def calendar_event_detail(request, pk):
    """일정 수정(내용/완료 체크) 및 삭제."""
    try:
        event = CalendarEvent.objects.get(pk=pk)
    except CalendarEvent.DoesNotExist:
        return Response({"error": "일정을 찾을 수 없습니다."},
                        status=status.HTTP_404_NOT_FOUND)

    if request.method == "DELETE":
        event.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    if "content" in request.data:
        content = (request.data.get("content") or "").strip()
        if not content:
            return Response({"error": "내용을 입력해주세요."},
                            status=status.HTTP_400_BAD_REQUEST)
        event.content = content[:500]
    if "is_done" in request.data:
        event.is_done = bool(request.data["is_done"])
    if "date" in request.data and request.data["date"]:
        event.date = request.data["date"]
    event.updated_by = request.user if request.user.is_authenticated else None
    event.save()
    return Response(CalendarEventSerializer(event).data)
