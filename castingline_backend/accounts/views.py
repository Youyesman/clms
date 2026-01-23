from django.shortcuts import render
from datetime import timedelta
from .models import *
from .serializers import *
from rest_framework import viewsets, status, mixins
from rest_framework import filters
from rest_framework.views import APIView
from rest_framework.response import Response
from django.contrib.auth import authenticate
from rest_framework.authtoken.models import Token
from rest_framework.authentication import TokenAuthentication
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from rest_framework.pagination import PageNumberPagination
from django.contrib.auth.hashers import check_password
from django.utils import timezone
from django.db.models import Q
from rest_framework.decorators import action


class UserPagination(PageNumberPagination):
    page_size = 10  # 한 페이지에 보여질 항목 수 설정
    page_size_query_param = "page_size"
    max_page_size = 100  # 최대 몇개 항목까지 보여줄건지?


class GetUser(viewsets.ReadOnlyModelViewSet):
    authentication_classes = [TokenAuthentication]
    permission_classes = [IsAuthenticated]
    queryset = User.objects.all()
    pagination_class = UserPagination  # 페이지네이션 설정
    filter_backends = [filters.SearchFilter]
    search_fields = ["username", "nickname", "local_name"]
    serializer_class = UserSerializer


class UserCreateView(APIView):
    queryset = User.objects.all()
    serializer_class = UserSerializer

    def post(self, request):
        code = request.data.get("code")
        role = request.data.get("role")

        # User 생성
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            user = serializer.save()  # User 객체 생성
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        else:
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class LoginView(APIView):
    authentication_classes = []
    permission_classes = []

    def post(self, request):
        print("asdfasdfasfasdf")
        username = request.data.get("username")
        password = request.data.get("password")

        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            return Response({"error": "User does not exist."}, status=400)

        if not check_password(password, user.password):
            return Response({"error": "Please recheck your password."}, status=400)

        if not user.is_active:
            return Response(
                {
                    "error": "Unable to login. Please contact your administrator or sales representative."
                },
                status=400,
            )
        user.last_login = timezone.now()
        user.save()
        user_data = UserSerializer(user).data

        token, created = Token.objects.get_or_create(user=user)

        return Response({"token": token.key, "user_data": user_data})


class LogoutView(APIView):
    authentication_classes = [TokenAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # 현재 사용자의 토큰을 가져옵니다.
        user_token = Token.objects.filter(user=request.user).first()

        if user_token:
            # 토큰을 삭제하여 로그아웃 처리합니다.
            user_token.delete()

        return Response({"success": "Logged out successfully"})


class TokenCheck(APIView):
    def post(self, request):
        token = request.data.get("token")
        try:
            user_token = Token.objects.get(key=token)
            
            # 토큰 연장 정책: 호출 시점부터 24시간으로 갱신
            now = timezone.now()
            user_token.created = now
            user_token.save()
            
            expire_hours = 24
            expiration_time = now + timedelta(hours=expire_hours)
            remaining_seconds = (expiration_time - now).total_seconds()
            
            return Response({
                "result": True,
                "msg" : "Token extended", 
                "expires_at": expiration_time.isoformat(),
                "remaining_seconds": int(remaining_seconds)
            }, status=status.HTTP_200_OK)
        except Token.DoesNotExist:
            return Response({"result": False, "msg": "Token does not exist"}, status=status.HTTP_200_OK)


class UserProfile(APIView):
    authentication_classes = [TokenAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, format=None):
        user = request.user
        serializer = UserSerializer(user)
        return Response(serializer.data)

    def post(self, request, format=None):
        user = request.user
        serializer = UserSerializer(user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response({"message": "사용자 정보가 업데이트되었습니다."})
        return Response(serializer.errors, status=400)

    def patch(self, request, pk=None, format=None):
        if pk:
            user = User.objects.get(id=pk)
        else:
            user = request.user
        return self.update_user(request, user, partial=True)

    def update_user(self, request, user, partial=False):
        serializer = UserSerializer(user, data=request.data, partial=partial)
        if serializer.is_valid():
            serializer.save()
            return Response(
                {"message": "사용자 정보가 업데이트되었습니다."},
                status=status.HTTP_200_OK,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ChangePasswordView(APIView):
    authentication_classes = [TokenAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        username = self.request.user.username
        old_password = request.data.get("old_password")
        new_password = request.data.get("new_password")
        confirm_password = request.data.get("confirm_password")

        if not all([username, old_password, new_password, confirm_password]):
            return Response(
                {"error": "Please fill in all fields."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if new_password != confirm_password:
            return Response(
                {"error": "New password and confirm password do not match."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = authenticate(username=username, password=old_password)
        if user is None:
            return Response(
                {"error": "Current password is incorrect."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(new_password)
        user.save()

        return Response(
            {"success": "Password has been successfully changed."},
            status=status.HTTP_200_OK,
        )

class UserViewSet(viewsets.ModelViewSet):
    authentication_classes = [TokenAuthentication]
    permission_classes = [IsAuthenticated]
    queryset = User.objects.all().order_by('-id')
    pagination_class = UserPagination
    filter_backends = [filters.SearchFilter]
    search_fields = ['username', 'nickname', 'email']
    serializer_class = UserSerializer


class GroupListView(APIView):
    authentication_classes = [TokenAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        groups = Group.objects.all().values('id', 'name')
        return Response(list(groups))

