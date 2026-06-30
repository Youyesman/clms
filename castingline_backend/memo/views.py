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

from .models import SharedMemo
from .serializers import SharedMemoSerializer


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
