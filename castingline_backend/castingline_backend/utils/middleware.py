# castingline_backend/utils/middleware.py

from rest_framework.authentication import TokenAuthentication
from rest_framework.exceptions import AuthenticationFailed
from .thread_local import set_current_user


class CurrentUserMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # 1. 일단 기본 유저 정보 가져오기 (세션 등)
        user = getattr(request, "user", None)

        # 2. 유저가 인증되지 않았고 Authorization 헤더가 있는 경우 토큰 검사
        if (
            not user or not user.is_authenticated
        ) and "HTTP_AUTHORIZATION" in request.META:
            try:
                # TokenAuthentication 인스턴스 생성 및 인증 시도
                auth = TokenAuthentication()
                # authenticate()는 (user, token) 튜플을 반환함
                user_auth_tuple = auth.authenticate(request)
                if user_auth_tuple:
                    user = user_auth_tuple[0]
            except Exception:
                # 인증 실패 시 무시하고 AnonymousUser로 진행
                pass

        # 3. 식별된 유저를 Thread-local에 저장
        if user and user.is_authenticated:
            set_current_user(user)
        else:
            set_current_user(None)

        response = self.get_response(request)

        # 4. 요청 종료 후 초기화
        set_current_user(None)
        return response
