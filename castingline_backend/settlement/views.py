import calendar
import os
import openpyxl
from django.conf import settings
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime
from django.db.models import F, Q, Value
from django.db.models.functions import Replace
from django.http import HttpResponse
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from openpyxl.styles import Font, PatternFill, Alignment  # ✅ 스타일 관련 임포트

# 모델 및 유틸 임포트
from score.models import Score
from fund.models import DailyFund, MonthlyFund, Fund
from rate.models import Rate, TheaterRate, DefaultRate
from client.models import Client, Theater
from movie.models import Movie
from castingline_backend.utils.excel_helper import ExcelGenerator

# 1. 정산용 영화 목록 조회


class SettlementMovieListView(APIView):
    """선택된 연월에 상영 실적이 있는 영화의 '대표 영화' 목록 (가나다->ABC->숫자 순)"""

    def get(self, request):
        yyyy_mm = request.query_params.get("yyyyMm")
        if not yyyy_mm:
            return Response([])

        try:
            yyyy, mm = yyyy_mm.split("-")
            # 1. 해당 월에 실적이 있는 모든 영화 ID 조회
            active_movie_ids = (
                Score.objects.filter(entry_date__year=yyyy,
                                     entry_date__month=mm)
                .values_list("movie", flat=True)
                .distinct()
            )

            # 2. 해당 영화들 조회
            active_movies = Movie.objects.filter(id__in=active_movie_ids)
            # 3. 대표 영화들 식별
            primary_movie_codes = set()
            for m in active_movies:
                raw_code = ""
                if m.is_primary_movie:
                    raw_code = m.movie_code
                elif m.primary_movie_code:
                    raw_code = m.primary_movie_code
                else:
                    raw_code = m.movie_code
                
                if raw_code:
                    primary_movie_codes.add(raw_code.replace(" ", ""))
            
            # 4. 최종 대표 영화 목록 (DB에서 정보 가져오기)
            # DB의 movie_code에서도 공백을 제거한 뒤 비교 (Replace 사용)
            primary_movies = list(Movie.objects.annotate(
                clean_code=Replace(F('movie_code'), Value(' '), Value(''))
            ).filter(
                clean_code__in=primary_movie_codes, is_primary_movie=True
            ).values("id", "title_ko"))
            # 만약 primary_movie 정보가 부족하면(데이터 불일치 등), active_movies 중 is_primary_movie인 것들이라도 포함
            if not primary_movies:
                primary_movies = list(active_movies.filter(
                    is_primary_movie=True).values("id", "title_ko"))

            def sort_key(movie):
                title = movie["title_ko"] or ""
                if not title:
                    return (3, "")
                first_char = title[0]
                if "가" <= first_char <= "힣":
                    return (0, title)
                if "a" <= first_char.lower() <= "z":
                    return (1, title)
                if "0" <= first_char <= "9":
                    return (2, title)
                return (3, title)

            primary_movies.sort(key=sort_key)
            return Response([{"id": m["id"], "title": m["title_ko"]} for m in primary_movies])
        except Exception:
            return Response([])

# 2. 월간 부금 정산 관리 (메인 로직)


class SettlementListView(APIView):
    def get_processed_data(self, yyyy_mm, movie_id, target_filter):
        """API와 엑셀에서 공통으로 사용하는 핵심 계산 및 집계 로직"""
        yyyy, mm = map(int, yyyy_mm.split("-"))

        # [대표영화 합산 로직 추가]
        try:
            primary_movie = Movie.objects.get(id=movie_id)
            clean_parent_code = (primary_movie.movie_code or "").replace(" ", "")

            # 본인(대표영화) + 본인을 부모로 둔 모든 하위(프린트) 영화 ID들 추출
            # DB의 primary_movie_code에서도 공백을 제거한 뒤 비교
            all_related_movie_ids = list(Movie.objects.annotate(
                clean_primary_code=Replace(F('primary_movie_code'), Value(' '), Value(''))
            ).filter(
                Q(id=movie_id) | Q(clean_primary_code=clean_parent_code)
            ).values_list("id", flat=True))
        except Movie.DoesNotExist:
            return []

        # 스코어 데이터 조회 (합산된 영화 ID들 사용)
        scores = Score.objects.filter(
            entry_date__year=yyyy, entry_date__month=mm, movie_id__in=all_related_movie_ids
        ).select_related("client", "movie").order_by("entry_date")

        if not scores.exists():
            return []

        # 캐싱 데이터 준비
        client_ids = list(scores.values_list(
            "client_id", flat=True).distinct())
        daily_fund_map = {(f.client_id, f.dd): f.fund_yn for f in DailyFund.objects.filter(
            client_id__in=client_ids, yyyy=yyyy, mm=mm)}
        monthly_fund_map = {(f.client_id, f.mm): f.fund_yn for f in MonthlyFund.objects.filter(
            client_id__in=client_ids, yyyy=yyyy)}
        yearly_fund_map = {(f.client_id, f.yyyy): f.fund_yn for f in Fund.objects.filter(
            client_id__in=client_ids, yyyy=yyyy)}

        # 부율(Rate)은 '대표영화' 기준으로 설정된 것을 따르는 것이 기본 정책
        rates = Rate.objects.filter(movie_id=movie_id, client_id__in=client_ids).filter(
            Q(start_date__year=yyyy, start_date__month=mm) | Q(end_date__year=yyyy, end_date__month=mm) |
            Q(start_date__lte=datetime(yyyy, mm, 1), end_date__gte=datetime(
                yyyy, mm, calendar.monthrange(yyyy, mm)[1]))
        )
        rate_map = {}
        for r in rates:
            if r.client_id not in rate_map:
                rate_map[r.client_id] = []
            rate_map[r.client_id].append(r)

        theater_rate_map = {(tr.rate_id, tr.theater.auditorium_name): tr.share_rate for tr in TheaterRate.objects.filter(
            rate__in=rates).select_related("theater")}
        default_rate_map = {(dr.region_code, dr.theater_kind): dr.share_rate for dr in DefaultRate.objects.all()}

        # 데이터 집계
        aggregated_data = {}
        for score in scores:
            client = score.client
            c_id = client.id
            entry_date = score.entry_date

            # 부율 조회는 넘겨받은 원본 movie_id(대표영화) 기준
            share_rate = self._get_cached_rate(
                c_id, movie_id, entry_date, score.auditorium, rate_map, theater_rate_map, default_rate_map, client)
            is_fund_exempt = self._get_cached_fund(
                c_id, entry_date, daily_fund_map, monthly_fund_map, yearly_fund_map)

            group_key = (c_id, share_rate, is_fund_exempt)
            if group_key not in aggregated_data:
                # 초기화 시 상영타입 등은 대표영화(primary_movie) 정보를 따름
                aggregated_data[group_key] = self.init_data_struct(
                    client, primary_movie, share_rate, is_fund_exempt, entry_date)

            target = aggregated_data[group_key]
            visitor_count = int(score.visitor or 0)
            fare = Decimal(str(score.fare or 0))

            unit_excl_fund = fare if is_fund_exempt else (
                fare / Decimal("1.03")).quantize(Decimal("1"), rounding=ROUND_HALF_UP)

            target["인원"] += visitor_count
            target["_total_raw_amt"] += int(fare) * visitor_count
            target["_total_excl_fund_sum"] += unit_excl_fund * visitor_count

            if entry_date < target["_min_date"]:
                target["_min_date"] = entry_date
            if entry_date > target["_max_date"]:
                target["_max_date"] = entry_date

        # 결과 리스트 생성 및 필터링
        calculated_list = []
        for data in aggregated_data.values():
            if target_filter == "일반극장" and data["is_fund_exempt"]:
                continue
            if target_filter == "기금면제극장" and not data["is_fund_exempt"]:
                continue

            item = self.calculate_amounts(data)
            item["날짜(From)"] = data["_min_date"].strftime("%Y-%m-%d")
            item["날짜(To)"] = data["_max_date"].strftime("%Y-%m-%d")
            calculated_list.append(item)

        return self.sort_and_add_subtotals(calculated_list)

    def get(self, request):
        yyyy_mm = request.query_params.get("yyyyMm")
        movie_id = request.query_params.get("movie_id")
        target_filter = request.query_params.get("target", "전체극장")

        if not yyyy_mm or not movie_id:
            return Response({"error": "년월과 영화를 선택해주세요."}, status=400)

        results = self.get_processed_data(yyyy_mm, movie_id, target_filter)
        return Response(results)

    # 헬퍼 함수들
    def _get_cached_fund(self, c_id, date, d_map, m_map, y_map):
        val = d_map.get((c_id, date.day))
        if val is not None:
            return val
        val = m_map.get((c_id, date.month))
        if val is not None:
            return val
        val = y_map.get((c_id, date.year))
        return val if val is not None else False

    def _get_cached_rate(self, c_id, m_id, date, aud_name, r_map, tr_map, dr_map, client):
        rate_list = r_map.get(c_id, [])
        found_rate = None
        for r in rate_list:
            if r.start_date <= date <= r.end_date:
                found_rate = r
                break

        if found_rate:
            tr_val = tr_map.get((found_rate.id, aud_name))
            return tr_val if tr_val is not None else found_rate.share_rate
        return dr_map.get((client.region_code, client.theater_kind), Decimal("50.0"))

    def init_data_struct(self, client, movie, rate, exempt, entry_date):
        return {
            "지역": client.region_code, "멀티구분": client.theater_kind, "거래처코드": client.client_code,
            "거래처코드(바이포엠만 해당)": client.by4m_theater_code or "-",
            "극장명": client.client_name or "-",
            "사업자 등록번호": client.business_registration_number, "종사업장번호": client.business_operator,
            "공급받는자 상호": client.business_name, "공급받는자 성명": client.representative_name,
            "사업장 소재": client.business_address, "업태": client.business_category, "업종": client.business_industry,
            "수신자이메일": client.invoice_email_address,
            "수신자이메일2": client.invoice_email_address2,
            "수신자 전화번호": client.settlement_phone_number,
            "상영타입": movie.viewing_dimension, "인원": 0, "부율": float(rate), "is_fund_exempt": exempt,
            "_total_raw_amt": 0, "_total_excl_fund_sum": Decimal("0"), "_min_date": entry_date, "_max_date": entry_date,
            "classification": client.classification,
        }

    def calculate_amounts(self, data):
        # [Special Logic] Indie Plus (인디플러스포항/천안)
        theater_name = data.get("극장명", "").replace(" ", "")
        fixed_rate_per_person = 0

        if "인디플러스포항" in theater_name:
            fixed_rate_per_person = 2500
        elif "인디플러스천안" in theater_name:
            fixed_rate_per_person = 3500

        if fixed_rate_per_person > 0:
            visitors = data["인원"]
            total_payment = int(visitors * fixed_rate_per_person)

            # 역산: 지급금 = 공급가액 * 1.1
            supply_val = (Decimal(total_payment) / Decimal("1.1")
                          ).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
            vat = total_payment - int(supply_val)

            data.update({
                "금액(입장료)": data["_total_raw_amt"],
                "기금제외금액": data["_total_excl_fund_sum"],
                "부가세제외금액": (data["_total_excl_fund_sum"] / Decimal("1.1")).quantize(Decimal("1"), rounding=ROUND_HALF_UP),
                "공급가액": int(supply_val),
                "부가세": int(vat),
                "영화사 지급금": total_payment,
            })
            return data

        total_amt = data["_total_raw_amt"]
        rounded_excl_fund = data["_total_excl_fund_sum"]
        rate = Decimal(str(data["부율"]))

        rounded_excl_vat_total = (
            rounded_excl_fund / Decimal("1.1")).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        rounded_supply_val = (rounded_excl_vat_total * (rate / Decimal("100"))
                              ).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        rounded_vat = (rounded_supply_val * Decimal("0.1")
                       ).quantize(Decimal("1"), rounding=ROUND_HALF_UP)

        data.update({
            "금액(입장료)": total_amt, "기금제외금액": int(rounded_excl_fund), "부가세제외금액": int(rounded_excl_vat_total),
            "공급가액": int(rounded_supply_val), "부가세": int(rounded_vat), "영화사 지급금": int(rounded_supply_val + rounded_vat),
        })
        return data

    def sort_and_add_subtotals(self, items):
        brand_order = ["CGV", "롯데", "메가", "씨네큐"]
        region_order = ["서울", "경강", "충청", "호남", "경북", "경남"]

        def get_sort_key(x):
            brand_idx = 99
            for i, b in enumerate(brand_order):
                if b in (x["멀티구분"] or ""):
                    brand_idx = i
                    break
            class_idx = 0 if x["classification"] == "직영" else 1
            region_idx = region_order.index(
                x["지역"]) if x["지역"] in region_order else 99
            return (brand_idx, class_idx, region_idx, x["극장명"])

        items.sort(key=get_sort_key)
        if not items:
            return []

        processed = []

        def get_section(item):
            brand = "기타"
            for b in brand_order:
                if b in (item["멀티구분"] or ""):
                    brand = b
                    break
            return (brand, item["classification"])

        current_section = get_section(items[0])
        section_sum = {
            "인원": 0, "금액(입장료)": 0, "기금제외금액": 0,
            "부가세제외금액": 0, "공급가액": 0, "부가세": 0, "영화사 지급금": 0
        }

        for item in items:
            section_key = get_section(item)
            if section_key != current_section:
                processed.append(self.make_subtotal_row(
                    current_section, section_sum))
                current_section = section_key
                section_sum = {
                    "인원": 0, "금액(입장료)": 0, "기금제외금액": 0,
                    "부가세제외금액": 0, "공급가액": 0, "부가세": 0, "영화사 지급금": 0
                }

            processed.append(item)
            section_sum["인원"] += item.get("인원", 0)
            section_sum["금액(입장료)"] += item.get("금액(입장료)", 0)
            section_sum["기금제외금액"] += item.get("기금제외금액", 0)
            section_sum["부가세제외금액"] += item.get("부가세제외금액", 0)
            section_sum["공급가액"] += item.get("공급가액", 0)
            section_sum["부가세"] += item.get("부가세", 0)
            section_sum["영화사 지급금"] += item.get("영화사 지급금", 0)

        processed.append(self.make_subtotal_row(current_section, section_sum))
        return processed

    def make_subtotal_row(self, section_key, sums):
        brand, clss = section_key
        return {
            "is_subtotal": True, "극장명": f"[{brand} {clss}] 합계",
            "인원": sums["인원"], "금액(입장료)": sums["금액(입장료)"],
            "기금제외금액": sums["기금제외금액"], "부가세제외금액": sums["부가세제외금액"],
            "공급가액": sums["공급가액"], "부가세": sums["부가세"], "영화사 지급금": sums["영화사 지급금"],
            "지역": "", "멀티구분": "", "거래처코드": "", "거래처코드(바이포엠만 해당)": "", "사업자 등록번호": "", "종사업장번호": "", "공급받는자 상호": "",
            "공급받는자 성명": "", "사업장 소재": "", "업태": "", "업종": "", "수신자이메일": "", "수신자이메일2": "", "수신자 전화번호": "",
            "날짜(From)": "", "날짜(To)": "", "상영타입": "", "부율": "",
            "classification": "",
        }

# 3. 월간 부금 정산 엑셀 출력 (SettlementListView 상속)


class SettlementExcelExportView(SettlementListView):
    def get(self, request):
        yyyy_mm = request.query_params.get("yyyyMm")
        movie_id = request.query_params.get("movie_id")
        target_filter = request.query_params.get("target", "전체극장")

        if not yyyy_mm or not movie_id:
            return HttpResponse("년월과 영화를 선택해주세요.", status=400)

        # 상속받은 핵심 로직 호출
        items = self.get_processed_data(yyyy_mm, movie_id, target_filter)

        if not items:
            return HttpResponse("조회된 데이터가 없습니다.", status=404)

        excel = ExcelGenerator(sheet_name="월간부금정산")
        header_labels = [
            "지역", "멀티", "구분", "거래처코드(바이포엠만 해당)", "극장명",
            "사업자 등록번호", "종사업장번호", "공급받는자 상호", "공급받는자 성명",
            "사업장 소재", "업태", "업종", "수신자이메일", "수신자 전화번호",
            "날짜(From)", "날짜(To)", "상영타입", "인원", "금액(입장료)",
            "기금제외금액", "부가세제외금액", "부율", "공급가액", "부가세", "영화사 지급금"
        ]
        excel.add_header(header_labels)

        for item in items:
            row = [
                item.get("지역", ""), item.get(
                    "멀티구분", ""), item.get("classification", ""),
                item.get("거래처코드(바이포엠만 해당)", ""), item.get("극장명", ""),
                item.get("사업자 등록번호", ""), item.get("종사업장번호", ""),
                item.get("공급받는자 상호", ""), item.get("공급받는자 성명", ""),
                item.get("사업장 소재", ""), item.get("업태", ""), item.get("업종", ""),
                item.get("수신자이메일", ""), item.get("수신자 전화번호", ""),
                item.get("날짜(From)", ""), item.get(
                    "날짜(To)", ""), item.get("상영타입", ""),
                item.get("인원", 0), item.get("금액(입장료)", 0),
                item.get("기금제외금액", 0), item.get(
                    "부가세제외금액", 0), item.get("부율", 0),
                item.get("공급가액", 0), item.get(
                    "부가세", 0), item.get("영화사 지급금", 0),
            ]
            excel.ws.append(row)

            # 합계 행 스타일 (굵게 + 배경색)
            if item.get("is_subtotal"):
                for cell in excel.ws[excel.ws.max_row]:
                    cell.font = Font(bold=True)
                    cell.fill = PatternFill(
                        start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")

        filename = f"Settlement_{yyyy_mm}_{datetime.now().strftime('%Y%m%d')}"
        return excel.to_response(filename)

# 4. 지정 부금 관리 (리스트 및 엑셀)


class SpecialSettlementListView(APIView):
    """
    지정 부금 관리: 특정 기간, 특정 영화에 대한 극장/요금/일자별 관객수 집계
    """

    def get(self, request):
        movie_id = request.query_params.get("movie_id")
        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")
        client_id = request.query_params.get("client_id")  # 선택 사항

        # 필수 파라미터 체크
        if not all([movie_id, start_date, end_date]):
            return Response(
                {"error": "영화 및 조회 기간(시작일, 종료일)은 필수입니다."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            # 1. 대표영화 및 하위영화 ID 집계
            primary_movie = Movie.objects.get(id=movie_id)
            clean_parent_code = (primary_movie.movie_code or "").replace(" ", "")

            all_related_movie_ids = list(Movie.objects.annotate(
                clean_primary_code=Replace(F('primary_movie_code'), Value(' '), Value(''))
            ).filter(
                Q(id=movie_id) | Q(clean_primary_code=clean_parent_code)
            ).values_list("id", flat=True))

            # 2. 기본 필터링 (영화 목록 및 기간)
            filters = {
                "movie_id__in": all_related_movie_ids,
                "entry_date__range": [start_date, end_date]
            }

            # 3. 특정 극장 선택 시 필터 추가
            if client_id:
                filters["client_id"] = client_id

            # 3. 데이터 조회
            # values를 사용하여 필요한 필드만 추출하고, 성능을 위해 select_related와 유사하게 관련 필드 참조
            scores = Score.objects.filter(**filters).annotate(
                client_name=F('client__client_name')
            ).values(
                'client_name',
                'fare',
                'entry_date',
                'visitor'
            ).order_by('client_name', 'entry_date')

            # 프론트엔드 JS 로직에서 처리하기 편하도록
            # visitor(CharField)를 int로 변환하여 전달 (데이터가 비어있을 경우 0)
            result_data = []
            for s in scores:
                try:
                    visitor_count = int(
                        s['visitor']) if s['visitor'] and s['visitor'].isdigit() else 0
                except (ValueError, TypeError):
                    visitor_count = 0

                result_data.append({
                    "client_name": s['client_name'] or "미등록 극장",
                    "fare": s['fare'],
                    "entry_date": s['entry_date'].strftime("%Y-%m-%d") if s['entry_date'] else None,
                    "visitor": visitor_count
                })

            return Response(result_data, status=status.HTTP_200_OK)

        except Exception as e:
            return Response(
                {"error": f"데이터 조회 중 오류가 발생했습니다: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class SpecialSettlementExcelView(APIView):
    def get(self, request):
        # 1. 파라미터 추출
        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")
        movie_id = request.query_params.get("movie_id")
        client_id = request.query_params.get("client_id")

        # 2. 데이터 조회
        try:
            primary_movie = Movie.objects.get(id=movie_id)
            clean_parent_code = (primary_movie.movie_code or "").replace(" ", "")

            all_related_movie_ids = list(Movie.objects.annotate(
                clean_primary_code=Replace(F('primary_movie_code'), Value(' '), Value(''))
            ).filter(
                Q(id=movie_id) | Q(clean_primary_code=clean_parent_code)
            ).values_list("id", flat=True))
        except Movie.DoesNotExist:
            all_related_movie_ids = [movie_id]

        filters = {
            "movie_id__in": all_related_movie_ids,
            "entry_date__range": [start_date, end_date]
        }
        if client_id:
            filters["client_id"] = client_id

        # 성능을 위해 필요한 필드만 select
        scores = Score.objects.filter(**filters).annotate(
            c_name=F('client__client_name'),
            m_title=F('movie__title_ko')
        ).values('c_name', 'm_title', 'fare', 'entry_date', 'visitor').order_by('c_name', 'entry_date')

        if not scores:
            return HttpResponse("조회된 데이터가 없습니다.", status=404)

        movie_title = scores[0]['m_title'] or "영화"

        # 3. 데이터 가공 (날짜 피벗 로직)
        # 실제 실적이 있는 날짜만 추출 (중복 제거 및 정렬)
        active_dates = sorted(list(set(s['entry_date'].strftime(
            "%Y-%m-%d") for s in scores if s['entry_date'])))

        # (극장, 요금)을 키로 하여 데이터를 그룹화
        grouped = {}
        for s in scores:
            c_name = s['c_name'] or "미등록 극장"
            fare_val = int(
                s['fare']) if s['fare'] and s['fare'].isdigit() else 0
            key = (c_name, fare_val)

            if key not in grouped:
                # 해당 행의 모든 날짜별 관객수를 0으로 초기화
                grouped[key] = {d: 0 for d in active_dates}
                grouped[key]['total_visitor'] = 0

            date_str = s['entry_date'].strftime("%Y-%m-%d")
            visitor_cnt = int(
                s['visitor']) if s['visitor'] and s['visitor'].isdigit() else 0

            grouped[key][date_str] += visitor_cnt
            grouped[key]['total_visitor'] += visitor_cnt

        # 4. ExcelGenerator를 이용한 파일 생성
        excel = ExcelGenerator(sheet_name="지정부금집계")

        # 헤더 구성
        headers = ["극장명", "요금"] + active_dates + ["관객합계", "매출합계"]
        excel.add_header(headers)

        # 틀 고정 (C2: A,B열 및 1행 고정)
        excel.ws.freeze_panes = 'C2'

        # 데이터 행 구성
        data_rows = []
        for (c_name, fare), values in grouped.items():
            row = [c_name, fare]
            # 각 날짜별 관객수 배치
            for d in active_dates:
                row.append(values[d])

            # 합계 데이터 추가
            row.append(values['total_visitor'])  # 관객합계
            row.append(values['total_visitor'] * fare)  # 매출합계
            data_rows.append(row)

        excel.add_rows(data_rows)

        # 5. 응답 반환
        filename = f"SpecialSettlement_{movie_title}_{datetime.now().strftime('%Y%m%d')}"
        return excel.to_response(filename)


class SettlementEseroExportView(SettlementListView):
    def get(self, request):
        yyyy_mm = request.query_params.get("yyyyMm")
        movie_id = request.query_params.get("movie_id")
        target_filter = request.query_params.get("target", "전체극장")

        if not yyyy_mm or not movie_id:
            return HttpResponse("년월과 영화를 선택해주세요.", status=400)

        # 1. 영화 정보 및 배급사 정보 로드
        try:
            movie = Movie.objects.select_related(
                "distributor").get(id=movie_id)
            dist = movie.distributor
        except Movie.DoesNotExist:
            return HttpResponse("영화를 찾을 수 없습니다.", status=404)

        # [품목명 결정을 위한 대표 영화 및 제목 정제 로직]
        raw_title = movie.title_ko
        # 대표 영화가 아니고 대표 영화 코드가 존재하는 경우 대표 영화 제목 사용
        if not movie.is_primary_movie and movie.primary_movie_code:
            clean_parent_code = movie.primary_movie_code.replace(" ", "")
            primary_movie = Movie.objects.annotate(
                clean_code=Replace(F('movie_code'), Value(' '), Value(''))
            ).filter(clean_code=clean_parent_code, is_primary_movie=True).first()
            if primary_movie:
                raw_title = primary_movie.title_ko

        # 괄호 및 포맷 정보 제거: "(" 문자가 있으면 그 앞부분만 추출하여 공백 제거
        display_movie_title = raw_title.split(
            "(")[0].strip() if "(" in raw_title else raw_title

        # 2. 정산 데이터 조회 및 합산 (극장별 세금계산서 1장을 위한 집계)
        raw_items = self.get_processed_data(yyyy_mm, movie_id, target_filter)
        if not raw_items:
            return HttpResponse("조회된 데이터가 없습니다.", status=404)

        aggregated_for_esero = {}
        for item in raw_items:
            if item.get("is_subtotal"):
                continue

            biz_no = (item.get("사업자 등록번호") or "").replace("-", "")
            sub_biz_no = item.get("종사업장번호") or ""
            key = (biz_no, sub_biz_no)

            if key not in aggregated_for_esero:
                aggregated_for_esero[key] = item.copy()
            else:
                target = aggregated_for_esero[key]
                target["인원"] += item.get("인원", 0)
                target["공급가액"] += item.get("공급가액", 0)
                target["부가세"] += item.get("부가세", 0)
                target["영화사 지급금"] += item.get("영화사 지급금", 0)

                if item.get("날짜(To)", "") > target.get("날짜(To)", ""):
                    target["날짜(To)"] = item.get("날짜(To)", "")

        # 3. 엑셀 템플릿 로드 (건수에 따라 템플릿 선택)
        is_over_100 = len(aggregated_for_esero) > 100
        template_name = "esero_over100.xlsx" if is_over_100 else "esero_under100.xlsx"
        
        template_path = os.path.join(
            settings.BASE_DIR, "settlement", "excel_from", template_name)
        
        if not os.path.exists(template_path):
            return HttpResponse(f"템플릿 파일({template_name})을 찾을 수 없습니다.", status=404)

        wb = openpyxl.load_workbook(template_path)
        ws = wb.active

        # 말일자 계산
        yyyy, mm = map(int, yyyy_mm.split("-"))
        last_day_val = calendar.monthrange(yyyy, mm)[1]
        last_day_str = f"{yyyy}{mm:02d}{last_day_val:02d}"

        row_idx = 7
        for (biz_no, sub_biz), item in aggregated_for_esero.items():
            # A: 종류 (01: 일반) / B: 작성일자
            ws.cell(row=row_idx, column=1, value="01")

            multi_type = item.get("멀티구분") or ""
            clss = item.get("classification") or ""
            to_date_raw = item.get("날짜(To)", "")

            if ("롯데" in multi_type and (clss == "직영" or clss == "위탁")) or \
               ("메가" in multi_type and clss == "직영"):
                write_date = last_day_str
            else:
                write_date = to_date_raw.replace(
                    "-", "") if to_date_raw else last_day_str
            ws.cell(row=row_idx, column=2, value=write_date)

            supply_val = item.get("공급가액", 0)
            vat_val = item.get("부가세", 0)
            item_name = f"[{display_movie_title}]{mm}월 극장부금"

            if not is_over_100:
                # [CASE 1] 100건 이하 (공급자 정보 포함)
                if dist:
                    ws.cell(row=row_idx, column=3, value=(dist.business_registration_number or "").replace("-", ""))
                    ws.cell(row=row_idx, column=4, value=dist.business_operator or "")
                    ws.cell(row=row_idx, column=5, value=dist.business_name or "")
                    ws.cell(row=row_idx, column=6, value=dist.representative_name or "")
                    ws.cell(row=row_idx, column=7, value=dist.business_address or "")
                    ws.cell(row=row_idx, column=8, value=dist.business_category or "")
                    ws.cell(row=row_idx, column=9, value=dist.business_industry or "")
                    ws.cell(row=row_idx, column=10, value=dist.invoice_email_address or "")

                # K~S: 공급받는자(극장) 정보
                ws.cell(row=row_idx, column=11, value=biz_no)
                ws.cell(row=row_idx, column=12, value=sub_biz)
                ws.cell(row=row_idx, column=13, value=item.get("공급받는자 상호", ""))
                ws.cell(row=row_idx, column=14, value=item.get("공급받는자 성명", ""))
                ws.cell(row=row_idx, column=15, value=item.get("사업장 소재", ""))
                ws.cell(row=row_idx, column=16, value=item.get("업태", ""))
                ws.cell(row=row_idx, column=17, value=item.get("업종", ""))
                ws.cell(row=row_idx, column=18, value=item.get("수신자이메일", ""))
                ws.cell(row=row_idx, column=19, value=item.get("수신자이메일2", ""))

                # T~V: 합계 및 비고
                ws.cell(row=row_idx, column=20, value=supply_val)
                ws.cell(row=row_idx, column=21, value=vat_val)
                ws.cell(row=row_idx, column=22, value=item.get("극장명", ""))

                # W, X: 일자 및 품목명
                ws.cell(row=row_idx, column=23, value=write_date[-2:])
                ws.cell(row=row_idx, column=24, value=item_name)

                # AA~AC: 단가(합계), 공급가액, 세액
                ws.cell(row=row_idx, column=27, value=supply_val + vat_val)
                ws.cell(row=row_idx, column=28, value=supply_val)
                ws.cell(row=row_idx, column=29, value=vat_val)
            else:
                # [CASE 2] 101건 이상 (공급자 정보 미표기, 극장정보가 C열부터)
                ws.cell(row=row_idx, column=3, value=biz_no)
                ws.cell(row=row_idx, column=4, value=sub_biz)
                ws.cell(row=row_idx, column=5, value=item.get("공급받는자 상호", ""))
                ws.cell(row=row_idx, column=6, value=item.get("공급받는자 성명", ""))
                ws.cell(row=row_idx, column=7, value=item.get("사업장 소재", ""))
                ws.cell(row=row_idx, column=8, value=item.get("업태", ""))
                ws.cell(row=row_idx, column=9, value=item.get("업종", ""))
                ws.cell(row=row_idx, column=10, value=item.get("수신자이메일", ""))
                ws.cell(row=row_idx, column=11, value=item.get("수신자이메일2", ""))

                # L, M, N: 합계(공급가액, 세액) 및 비고
                ws.cell(row=row_idx, column=12, value=supply_val)
                ws.cell(row=row_idx, column=13, value=vat_val)
                ws.cell(row=row_idx, column=14, value=item.get("극장명", ""))

                # O, P: 일자 및 품목명
                ws.cell(row=row_idx, column=15, value=write_date[-2:])
                ws.cell(row=row_idx, column=16, value=item_name)

                # T, U: 품목1 공급가액, 세액
                ws.cell(row=row_idx, column=19, value=supply_val + vat_val)
                ws.cell(row=row_idx, column=20, value=supply_val)
                ws.cell(row=row_idx, column=21, value=vat_val)

            row_idx += 1

        # 4. 파일 응답 생성
        response = HttpResponse(
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        filename_prefix = "Esero_Over100" if is_over_100 else "Esero_Under100"
        filename = f"{filename_prefix}_{yyyy_mm}_{datetime.now().strftime('%Y%m%d')}"
        response["Content-Disposition"] = f'attachment; filename="{filename}.xlsx"'
        wb.save(response)
        return response
