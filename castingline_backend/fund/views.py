from datetime import datetime
import calendar
from rest_framework import viewsets, filters
from rest_framework.permissions import AllowAny
from rest_framework.pagination import PageNumberPagination
from .models import Fund, MonthlyFund, DailyFund
from .serializers import FundSerializer, MonthlyFundSerializer
from django.db.models import (
    OuterRef,
    Subquery,
    Value,
    Q,
    Case,
    When,
    BooleanField,
    IntegerField,
)
from django.db import transaction
from django.db.models.functions import Coalesce
from rest_framework import viewsets, filters, status
from rest_framework.response import Response
from client.models import Client
from .models import DailyFund
from .serializers import DailyFundSerializer
from castingline_backend.utils.ordering import KoreanOrderingFilter
from rest_framework.views import APIView
from castingline_backend.utils.excel_helper import ExcelGenerator
from django.db.models import Count


class DefaultPagination(PageNumberPagination):
    page_size = 20  # 한 페이지에 보여질 항목 수 설정
    page_size_query_param = "page_size"
    max_page_size = 100  # 최대 몇개 항목까지 보여줄건지?


class FundViewSet(viewsets.ModelViewSet):
    serializer_class = FundSerializer
    permission_classes = [AllowAny]
    pagination_class = DefaultPagination
    filter_backends = [filters.SearchFilter, KoreanOrderingFilter]
    search_fields = ["client_name", "client_code"]
    ordering_fields = "__all__"

    ordering = ["theater_kind", "client_name"]

    def get_queryset(self):
        # 1. 필터 파라미터 추출
        yyyy = self.request.query_params.get("yyyy")
        client_id = self.request.query_params.get("client_id")  # client_id 추가
        multi_only = self.request.query_params.get("multi_only")
        normal_only = self.request.query_params.get("normal_only")
        fund_yn_filter = self.request.query_params.get("fund_yn")

        if not yyyy:
            # yyyy가 없을 경우 에러 방지를 위해 현재 연도 등을 기본값으로 설정하거나 빈 쿼리셋 반환
            from datetime import datetime
            yyyy = datetime.now().year

        # 2. 서브쿼리: 특정 연도의 Fund 상태
        fund_status = Fund.objects.filter(client=OuterRef("pk"), yyyy=yyyy).values(
            "fund_yn"
        )[:1]

        # 3. Client 기반 쿼리셋 (Annotate 핵심 로직)
        queryset = Client.objects.annotate(
            annotated_fund_yn=Subquery(
                fund_status, output_field=BooleanField()),
            current_yyyy=Value(int(yyyy), output_field=IntegerField()),
        ).annotate(
            fund_yn=Coalesce("annotated_fund_yn", Value(False))
        )

        # 4. [수정 포인트] client_id 필터링 로직 추가
        if client_id:
            queryset = queryset.filter(id=client_id)

        # 5. 기존 필터링 로직
        if multi_only and multi_only.lower() == "true":
            queryset = queryset.exclude(theater_kind="일반극장")
        elif normal_only and normal_only.lower() == "true":
            queryset = queryset.filter(theater_kind="일반극장")

        if fund_yn_filter is not None:
            val = True if fund_yn_filter.lower() == "true" else False
            queryset = queryset.filter(fund_yn=val)

        return queryset.order_by("client_code")

    def partial_update(self, request, *args, **kwargs):
        client_id = kwargs.get("pk")
        yyyy = int(request.data.get("yyyy"))
        fund_yn = request.data.get("fund_yn")

        with transaction.atomic():
            # 연간 레코드 생성/수정
            Fund.objects.update_or_create(
                client_id=client_id, yyyy=yyyy, defaults={"fund_yn": fund_yn}
            )
            # 하위 월별/일별 기록을 모두 삭제하여 연간 설정을 상속받도록 함 (효율적 관리)
            MonthlyFund.objects.filter(client_id=client_id, yyyy=yyyy).delete()
            DailyFund.objects.filter(client_id=client_id, yyyy=yyyy).delete()

        updated_instance = self.get_queryset().get(pk=client_id)
        return Response(self.get_serializer(updated_instance).data)


class MonthlyFundViewSet(viewsets.ModelViewSet):
    serializer_class = MonthlyFundSerializer
    queryset = MonthlyFund.objects.all()

    def partial_update(self, request, *args, **kwargs):
        client_id = kwargs.get("pk")
        yyyy = int(request.data.get("yyyy"))
        mm = int(request.data.get("mm"))
        fund_yn = request.data.get("fund_yn")

        with transaction.atomic():
            # 해당 월의 일별 기록 삭제 (월 설정을 상속받음)
            DailyFund.objects.filter(
                client_id=client_id, yyyy=yyyy, mm=mm).delete()

            # 월 레코드 생성/수정
            obj, _ = MonthlyFund.objects.update_or_create(
                client_id=client_id, yyyy=yyyy, mm=mm, defaults={
                    "fund_yn": fund_yn}
            )

            # 상향 전파: '일반(False)'으로 변경 시 연간 상태도 '일반'으로 변경
            if fund_yn is False:
                Fund.objects.filter(client_id=client_id,
                                    yyyy=yyyy).update(fund_yn=False)

        return Response(self.get_serializer(obj).data)

    def list(self, request, *args, **kwargs):
        client_id = request.query_params.get("client_id")
        yyyy = request.query_params.get("yyyy")
        if not client_id or not yyyy:
            return Response([])

        # ✅ 1. 해당 연도의 '연간 기금 상태'를 먼저 가져옴 (상속용)
        parent_fund = Fund.objects.filter(
            client_id=client_id, yyyy=yyyy).first()
        default_yn = parent_fund.fund_yn if parent_fund else False

        existing_funds = MonthlyFund.objects.filter(
            client_id=client_id, yyyy=yyyy)
        fund_map = {f.mm: f for f in existing_funds}

        results = []
        for mm in range(1, 13):
            fund = fund_map.get(mm)
            results.append({
                "id": fund.id if fund else None,
                "yyyy": int(yyyy),
                "mm": mm,
                # ✅ 레코드가 있으면 자기 값을, 없으면 연간 기본값(default_yn)을 사용
                "fund_yn": fund.fund_yn if fund else default_yn,
                "client_id": int(client_id),
            })
        return Response({"results": results})


class DailyFundViewSet(viewsets.ModelViewSet):
    serializer_class = DailyFundSerializer
    queryset = DailyFund.objects.all()

    def list(self, request, *args, **kwargs):
        client_id = request.query_params.get("client_id")
        yyyy = request.query_params.get("yyyy")
        mm = request.query_params.get("mm")
        if not client_id or not yyyy or not mm:
            return Response({"results": []})

        # ✅ 1. 상속받을 기본값 결정 (월별 상태 -> 없으면 연간 상태 -> 없으면 False)
        m_fund = MonthlyFund.objects.filter(
            client_id=client_id, yyyy=yyyy, mm=mm).first()
        if m_fund:
            default_yn = m_fund.fund_yn
        else:
            y_fund = Fund.objects.filter(
                client_id=client_id, yyyy=yyyy).first()
            default_yn = y_fund.fund_yn if y_fund else False

        existing_funds = DailyFund.objects.filter(
            client_id=client_id, yyyy=yyyy, mm=mm)
        fund_map = {f.dd: f for f in existing_funds}
        last_day = calendar.monthrange(int(yyyy), int(mm))[1]

        results = []
        for dd in range(1, last_day + 1):
            fund = fund_map.get(dd)
            results.append({
                "id": fund.id if fund else None,
                "yyyy": int(yyyy),
                "mm": int(mm),
                "dd": dd,
                # ✅ 레코드가 없으면 결정된 기본값(default_yn)을 상속
                "fund_yn": fund.fund_yn if fund else default_yn,
                "client_id": int(client_id),
            })
        return Response({"results": results})

    def partial_update(self, request, *args, **kwargs):
        client_id = kwargs.get("pk")
        yyyy = int(request.data.get("yyyy"))
        mm = int(request.data.get("mm"))
        dd = int(request.data.get("dd"))
        fund_yn = request.data.get("fund_yn")

        with transaction.atomic():
            # 현재 이 날짜가 상속받고 있는 '부모(월/연)'의 상태를 확인
            m_fund = MonthlyFund.objects.filter(
                client_id=client_id, yyyy=yyyy, mm=mm).first()
            y_fund = Fund.objects.filter(
                client_id=client_id, yyyy=yyyy).first()

            # 부모가 '기금면제(True)'였는데 이 날짜만 '일반(False)'으로 바꾸는 경우
            if fund_yn is False:
                # 1. 월 상태가 True였거나, 월 기록은 없지만 연 상태가 True였다면
                if (m_fund and m_fund.fund_yn) or (not m_fund and y_fund and y_fund.fund_yn):
                    # 다른 날짜들이 '일반'으로 변하지 않도록 나머지 날짜들을 '기금면제'로 명시적 생성
                    last_day = calendar.monthrange(yyyy, mm)[1]
                    for d in range(1, last_day + 1):
                        if d != dd:
                            DailyFund.objects.get_or_create(
                                client_id=client_id, yyyy=yyyy, mm=mm, dd=d,
                                defaults={"fund_yn": True}
                            )

                    # 2. 연 상태가 True였다면 다른 월들을 '기금면제'로 명시적 생성
                    if y_fund and y_fund.fund_yn:
                        for m in range(1, 13):
                            if m != mm:
                                MonthlyFund.objects.get_or_create(
                                    client_id=client_id, yyyy=yyyy, mm=m,
                                    defaults={"fund_yn": True}
                                )

                # 이제 부모들을 '일반'으로 변경 (다른 형제들은 위에서 명시적 생성했으므로 상태 유지됨)
                MonthlyFund.objects.update_or_create(
                    client_id=client_id, yyyy=yyyy, mm=mm, defaults={
                        "fund_yn": False}
                )
                Fund.objects.filter(client_id=client_id,
                                    yyyy=yyyy).update(fund_yn=False)

            # 본인(해당 일자) 레코드 업데이트
            obj, _ = DailyFund.objects.update_or_create(
                client_id=client_id, yyyy=yyyy, mm=mm, dd=dd, defaults={
                    "fund_yn": fund_yn}
            )

        return Response(self.get_serializer(obj).data)


class FundExcelExportView(APIView):
    def get(self, request):
        # 1. Reuse logic from FundViewSet
        viewset = FundViewSet()
        viewset.request = request
        viewset.format_kwarg = None

        # Determine year
        yyyy = request.query_params.get("yyyy")
        if not yyyy:
            yyyy = datetime.now().year
        
        # 2. Get Base Queryset (Client + fund_yn annotation)
        queryset = viewset.get_queryset()

        # 3. Add annotation for exempt_months_count
        # Counts how many MonthlyFund records for this client/year have fund_yn=True (Exempt)
        queryset = queryset.filter(client_type="극장").exclude(operational_status=True).annotate(
            exempt_months_count=Count(
                "monthly_funds",
                filter=Q(monthly_funds__yyyy=yyyy, monthly_funds__fund_yn=True)
            )
        )

        # DB 정렬 문제(글자수 뭉침) 해결을 위해 Python 레벨에서 정렬 수행
        clients_list = list(queryset)
        import re
        def sort_key(client):
            name = client.client_name or ""
            # 우선순위: 0=특수문자, 1=한글, 2=영어/숫자
            if re.match(r'^[^0-9a-zA-Z가-힣]', name):
                return (0, name)
            elif re.match(r'^[가-힣]', name):
                return (1, name)
            else:
                return (2, name)
        
        clients_list.sort(key=sort_key)

        # 4. Prepare Excel
        excel = ExcelGenerator(sheet_name="기금_연별")
        # 2. 헤더 변경: 극장코드 / 극장명 / 년 전체 기금구분 / 멀티구분 / 값
        headers = ["극장코드", "극장명", "년 전체 기금구분", "멀티구분", "값"]
        excel.add_header(headers)

        data_rows = []
        for c in clients_list:
            # True -> 기금면제, False -> 일반
            fund_status = "기금면제" if c.fund_yn else "일반"
            
            data_rows.append([
                c.client_code,
                c.client_name,
                fund_status,
                c.theater_kind,
                c.exempt_months_count
            ])

        excel.add_rows(data_rows)
        
        filename = f"Fund_Status_{yyyy}_{datetime.now().strftime('%Y%m%d')}"
        return excel.to_response(filename)


class MonthlyFundExcelExportView(APIView):
    def get(self, request):
        # client_id 파라미터는 무시하고(또는 선택), 'yyyy' 기준으로 '모든 극장'을 조회
        yyyy = request.query_params.get("yyyy")
        
        if not yyyy:
             # 기본값 설정 (현재 연도)
             yyyy = datetime.now().year
             
        # 1. 모든 극장 가져오기 (client_type='극장', 폐관 제외)
        clients = Client.objects.filter(client_type="극장").exclude(operational_status=True)
        
        # 2. 정렬 로직 (특수문자 -> 한글 -> 영어)
        clients_list = list(clients)
        import re
        def sort_key(client):
            name = client.client_name or ""
            if re.match(r'^[^0-9a-zA-Z가-힣]', name):
                return (0, name)
            elif re.match(r'^[가-힣]', name):
                return (1, name)
            else:
                return (2, name)
        clients_list.sort(key=sort_key)

        # 3. 데이터 프리패치 (성능 최적화)
        # 해당 연도의 모든 MonthlyFund, Fund(연간) 데이터를 미리 가져와 딕셔너리로 매핑
        monthly_funds = MonthlyFund.objects.filter(yyyy=yyyy)
        monthly_map = {(f.client_id, f.mm): f.fund_yn for f in monthly_funds}
        
        annual_funds = Fund.objects.filter(yyyy=yyyy)
        annual_map = {f.client_id: f.fund_yn for f in annual_funds}

        # 4. 엑셀 생성
        excel = ExcelGenerator(sheet_name="기금_월별")
        # 헤더 변경: 극장코드 / 극장명 / 년도 / 월 / 기금면제여부
        headers = ["극장코드", "극장명", "년도", "월", "기금면제여부"]
        excel.add_header(headers)
        
        data_rows = []
        for client in clients_list:
            # 연간 기본 상태 (없으면 False=일반)
            default_yn = annual_map.get(client.id, False)
            
            for mm in range(1, 13):
                # 월별 상태 확인 -> 없으면 연간 상태 상속
                is_exempt = monthly_map.get((client.id, mm), default_yn)
                status_text = "기금면제" if is_exempt else "일반"
                
                data_rows.append([
                    client.client_code,
                    client.client_name,
                    str(yyyy),
                    f"{mm}월",
                    status_text
                ])
            
        excel.add_rows(data_rows)
        filename = f"Monthly_Fund_All_{yyyy}_{datetime.now().strftime('%Y%m%d')}"
        return excel.to_response(filename)


class DailyFundExcelExportView(APIView):
    def get(self, request):
        client_id = request.query_params.get("client_id")
        yyyy = request.query_params.get("yyyy")
        mm = request.query_params.get("mm")

        if not client_id or not yyyy or not mm:
             return Response(status=400)

        client = Client.objects.get(pk=client_id)
        
        m_fund = MonthlyFund.objects.filter(client_id=client_id, yyyy=yyyy, mm=mm).first()
        if m_fund:
            default_yn = m_fund.fund_yn
        else:
            y_fund = Fund.objects.filter(client_id=client_id, yyyy=yyyy).first()
            default_yn = y_fund.fund_yn if y_fund else False

        existing_funds = DailyFund.objects.filter(client_id=client_id, yyyy=yyyy, mm=mm)
        fund_map = {f.dd: f for f in existing_funds}
        last_day = calendar.monthrange(int(yyyy), int(mm))[1]

        excel = ExcelGenerator(sheet_name="기금_일별")
        headers = ["극장코드", "극장명", "연도", "월", "일", "기금면제여부"]
        excel.add_header(headers)

        data_rows = []
        for dd in range(1, last_day + 1):
            fund = fund_map.get(dd)
            is_exempt = fund.fund_yn if fund else default_yn
            status_text = "기금면제" if is_exempt else "일반"

            data_rows.append([
                client.client_code,
                client.client_name,
                str(yyyy),
                f"{mm}월",
                f"{dd}일",
                status_text
            ])
        
        excel.add_rows(data_rows)
        filename = f"Daily_Fund_{client.client_name}_{yyyy}{mm}_{datetime.now().strftime('%Y%m%d')}"
        return excel.to_response(filename)