from django.db import models
from client.models import *
from castingline_backend.utils.models import TimeStampedModel


class Movie(TimeStampedModel):
    movie_code = models.CharField(max_length=20, unique=True)  # 영화 코드 (tt_code)
    is_primary_movie = models.BooleanField(
        default=False
    )  # 대표 영화 지정 (tt_type이 null이면 True)
    title_ko = models.CharField(max_length=255)  # 한글 제목
    title_en = models.CharField(max_length=255, null=True, blank=True)  # 영어 제목
    running_time_minutes = models.PositiveIntegerField(
        null=True, blank=True
    )  # 상영 시간 (분)

    distributor = models.ForeignKey(
        Client,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="movie_distributor",
    )  # 배급사
    production_company = models.ForeignKey(
        Client,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="production_company",
    )  # 제작사

    rating = models.CharField(max_length=50, null=True, blank=True)  # 관람 등급
    genre = models.CharField(max_length=100, null=True, blank=True)
    country = models.CharField(max_length=100, null=True, blank=True)
    director = models.CharField(max_length=100, null=True, blank=True)
    cast = models.TextField(null=True, blank=True)

    release_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    closure_completed_date = models.DateField(null=True, blank=True)
    is_finalized = models.BooleanField(
        default=False
    )  # up_id로 판단했지만 여기선 Boolean 처리

    primary_movie_code = models.CharField(
        max_length=20, null=True, blank=True
    )  # 대표 영화 코드 (parent_code)

    media_type = models.CharField(max_length=50, null=True, blank=True)  # 필름/디지털
    audio_mode = models.CharField(
        max_length=50, null=True, blank=True
    )  # 자막/영어자막/더빙
    viewing_dimension = models.CharField(
        max_length=50, null=True, blank=True
    )  # 2D/3D/4D
    screening_type = models.CharField(
        max_length=50, null=True, blank=True
    )  # IMAX/ATMOS
    dx4_viewing_dimension = models.CharField(
        max_length=50, null=True, blank=True
    )  # 4DX/Super-4D/Dolby
    imax_l = models.CharField(max_length=50, null=True, blank=True)  # IMAX-L
    screen_x = models.CharField(max_length=50, null=True, blank=True)  # SCREEN-X
    created_date = models.DateTimeField(auto_now_add=True)
    updated_date = models.DateTimeField(auto_now=True)
    is_public = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.title_ko} ({self.movie_code})"


class CGVScheduleLog(models.Model):
    """
    CGV API 호출 결과를 원본 그대로 저장하는 로그 모델
    """
    created_at = models.DateTimeField(auto_now_add=True)
    query_date = models.CharField(max_length=8)  # YYYYMMDD
    site_code = models.CharField(max_length=10) # 예: 0054
    theater_name = models.CharField(max_length=100, blank=True) # 예: 강남
    response_json = models.JSONField(null=True, blank=True)
    status = models.CharField(max_length=20, default="success")

    def __str__(self):
        return f"CGV Schedule Log - {self.query_date} ({self.theater_name} / {self.site_code})"


class MegaboxScheduleLog(models.Model):
    query_date = models.CharField(max_length=8)  # YYYYMMDD
    site_code = models.CharField(max_length=20)  # 지점코드 (brchNo)
    theater_name = models.CharField(max_length=50) # 극장명
    response_json = models.JSONField(default=dict) # 응답 전체 (megaMap 포함)
    status = models.CharField(max_length=20, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"[Megabox] {self.theater_name} ({self.query_date})"


class LotteScheduleLog(models.Model):
    """
    롯데시네마 API 호출 결과를 원본 그대로 저장하는 로그 모델
    """
    query_date = models.CharField(max_length=8)  # YYYYMMDD
    site_code = models.CharField(max_length=20)  # 극장 코드
    theater_name = models.CharField(max_length=100)  # 극장명
    response_json = models.JSONField(null=True, blank=True)  # API 응답 JSON
    status = models.CharField(max_length=20, default='success')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"[Lotte] {self.theater_name} ({self.query_date})"


class MovieSchedule(models.Model):
    """
    통합 영화 스케줄 모델 (CGV, 롯데, 메가박스 등 통합)
    """
    BRAND_CHOICES = (
        ('CGV', 'CGV'),
        ('LOTTE', 'Lotte Cinema'),
        ('MEGABOX', 'Megabox'),
        ('OTHER', 'Other'),
    )

    brand = models.CharField(max_length=20, choices=BRAND_CHOICES, default='CGV')
    theater_name = models.CharField(max_length=100) # 지점명 (예: 강남, 코엑스)
    movie_title = models.CharField(max_length=255) # 영화 제목 (정규화 전 원본 제목일 수 있음)
    screen_name = models.CharField(max_length=100) # 상영관 (예: 1관, IMAX관)
    
    start_time = models.DateTimeField() # 상영 시작 시간
    end_time = models.DateTimeField(null=True, blank=True) # 상영 종료 시간
    
    is_booking_available = models.BooleanField(default=True) # 예매 가능 여부
    booking_url = models.URLField(max_length=500, null=True, blank=True) # 예매 링크
    
    # 원본 로그 추적용 (선택)
    raw_log = models.ForeignKey(CGVScheduleLog, on_delete=models.SET_NULL, null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=['start_time']),
            models.Index(fields=['brand', 'theater_name']),
        ]
        unique_together = [
            ('brand', 'theater_name', 'screen_name', 'start_time'),
        ]

    @classmethod
    def create_from_cgv_log(cls, log):
        """
        CGVScheduleLog 객체를 받아 파싱하여 MovieSchedule 데이터를 일괄 생성/업데이트합니다.
        (Bulk Operation 적용)
        """
        if not log.response_json or "data" not in log.response_json:
            return 0

        data_list = log.response_json["data"]
        from datetime import datetime
        
        parsed_items = []
        target_dates = set()

        # 1. Parsing Step
        for item in data_list:
            try:
                # 필수 필드 추출 (CGV API 키 매핑 수정됨)
                movie_title = item.get("movNm")
                screen_name = item.get("scnsNm") 
                
                # 시간 파싱
                play_ymd = item.get("scnYmd")
                play_start_time = item.get("scnsrtTm")
                play_end_time = item.get("scnendTm") 
                
                if not (play_ymd and play_start_time):
                    continue
                
                # 안전한 파싱
                ymd_clean = str(play_ymd)[:8]
                start_tm_clean = str(play_start_time)[:4]
                start_dt_str = f"{ymd_clean}{start_tm_clean}"
                start_dt = datetime.strptime(start_dt_str, "%Y%m%d%H%M")
                
                target_dates.add(start_dt.date())

                end_dt = None
                if play_end_time:
                    end_tm_clean = str(play_end_time)[:4]
                    end_dt_str = f"{ymd_clean}{end_tm_clean}"
                    end_dt = datetime.strptime(end_dt_str, "%Y%m%d%H%M")
                    if end_dt < start_dt:
                        from datetime import timedelta
                        end_dt += timedelta(days=1)

                remain_seat = int(item.get("frSeatCnt", 0))
                is_available = remain_seat > 0
                
                parsed_items.append({
                    'brand': 'CGV',
                    'theater_name': log.theater_name,
                    'screen_name': screen_name,
                    'start_time': start_dt,
                    'movie_title': movie_title,
                    'end_time': end_dt, # Update 대상
                    'is_booking_available': is_available, # Update 대상
                    'raw_log': log
                })
                    
            except Exception as e:
                errors.append({
                    'theater': log.theater_name,
                    'site_code': log.site_code,
                    'movie': item.get('movieNm', 'Unknown'),
                    'error': str(e),
                    'item': str(item)[:200]
                })
                continue
        
        if not parsed_items:
            return 0, errors

        # 2. Fetch Existing Step
        # 해당 로그의 극장과 날짜 범위에 있는 모든 스케줄을 미리 가져옴
        existing_qs = cls.objects.filter(
            brand='CGV',
            theater_name=log.theater_name,
            start_time__date__in=target_dates
        )
        
        # 키: (screen_name, start_time) -> 객체
        existing_map = {
            (obj.screen_name, obj.start_time): obj for obj in existing_qs
        }

        to_create = []
        to_update = []
        
        # 3. Compare & Segregate
        for item in parsed_items:
            key = (item['screen_name'], item['start_time'])
            
            if key in existing_map:
                # 이미 존재하면 업데이트할 필드만 수정
                obj = existing_map[key]
                # 변경 점이 있는지 체크할 수도 있지만, 일단 업데이트 목록에 추가
                obj.is_booking_available = item['is_booking_available']
                obj.end_time = item['end_time']
                obj.movie_title = item['movie_title'] # 혹시 제목 바뀌었을 수도 있음
                obj.raw_log = log # 최신 로그로 갱신
                to_update.append(obj)
            else:
                # 없으면 생성 목록에 추가
                to_create.append(cls(**item))
        
        # 4. Bulk Execute
        created_count = 0
        updated_count = 0
        
        if to_create:
            cls.objects.bulk_create(to_create)
            created_count = len(to_create)
            
        if to_update:
            # 변경될 수 있는 필드만 업데이트
            cls.objects.bulk_update(to_update, ['is_booking_available', 'end_time', 'movie_title', 'raw_log', 'updated_at'])
            updated_count = len(to_update)
            
        return created_count + updated_count, errors

    def __str__(self):
        return f"[{self.brand}] {self.theater_name} - {self.movie_title} ({self.start_time.strftime('%Y-%m-%d %H:%M')})"

    @classmethod
    def create_from_megabox_log(cls, log):
        """
        MegaboxScheduleLog 데이터를 파싱하여 MovieSchedule 생성
        Returns: (created_count + updated_count, error_list)
        """
        from datetime import datetime, timedelta

        json_data = log.response_json or {}
        mega_map = json_data.get("megaMap", {})
        movie_list = mega_map.get("movieFormList", [])
        
        parsed_items = []
        target_dates = set()
        errors = []
        
        # 메가박스는 응답이 date 파라미터(playDe) 기준이므로 보통 하루치 데이터임.
        play_date_str = mega_map.get("playDe") or log.query_date
        
        for movie in movie_list:
            movie_title = movie.get("movieNm", "제목없음")
            
            # 메가박스 구조상 movieFormList 내부에 스케줄 리스트가 있는게 아니라,
            # (movieFormList -> 영화 정보) 구조일 수 있음. 확인 필요. 
            # 브라우저 결과로는 movieFormList가 배열이고 그 안에 상영 정보가 있을 것임.
            # 보통 메가박스는 영화별로 묶여있음.
            
            # 영화 하나에 여러 회차가 있을 수 있는지, 아니면 회차별 row인지 확인 중요.
            # API 구조 추정: movieFormList가 영화별 Grouping이고 내부에 'rpstMovieNo'(영화코드) 등이 있음.
            # 실제 스케줄 리스트는 어디에? -> 보통 movieFormList 안에 또다른 리스트나, 아니면 Flat List임.
            # 일단 영화별 루프를 돌고, 그 안에서 회차 정보를 찾아야 함.
            
            # 메가박스 JSON 분석 (일반적 패턴): 
            # movieFormList: [{movieNo:..., movieNm:..., moviePlayTime:..., ...}] -> 스케줄은?
            # 보통 movieFormList 자체가 "영화별 그룹"이고, 상영 시간표 데이터는 별도 키거나 내부에 있음.
            # 혹은 movieFormList가 Flat하게 모든 회차를 담고 있을 수도 있음.
            
            # (중요) 브라우저 Tool 결과를 다시 보지 않았으므로 '일반적인' 구조로 가정하고 작성하되,
            # 에러 방지(Try-Except)를 넣고, 추후 디버깅으로 확인.
            # 가정: movieFormList가 '상영 시간표 리스트'가 아니라 '영화 정보'라면...
            # => 'megaMap.movieFormList'라고 했으니, 영화별 묶음일 가능성이 큼.
            # 하지만 실제 시간표는 어디에? -> 아마 movieFormList 내에 상영관/회차 정보가 있을 것.
            
            # [가정 Fix] 메가박스 API는 movieFormList가 영화 목록이고, 각 영화 객체 안에 상영 목록이 있는 구조가 아님.
            # movieFormList 자체가 "상영 중인 영화 목록"이고, 그 영화를 클릭했을 때 나오는 시간표 데이터는
            # 보통 같은 레벨이나 하위에 존재.
            # *하지만* timetable API는 보통 영화+상영관+시간 정보가 섞여있음.
            
            # 일단, 보수적으로 작성:
            # movieFormList의 각 항목이 '하나의 상영 회차'인지, '영화 그룹'인지 모름.
            # -> 대부분의 극장 API는 '영화 그룹' 형태를 띔.
            # -> 영화 그룹 내에 `.movieList` 같은게 있거나, 아니면 `.playList`가 있을 것임.
            
            # 일단 Loop Item 내용을 확인하기 어려우므로,
            # 1. 영화 정보 파싱
            # 2. 내부 리스트가 있다면 순회, 없다면 Item 자체가 스케줄인지 확인.
            #    (Item에 'playStartTime', 'brchNo' 등이 바로 있으면 Flat List임)
            
            # 메가박스 필드명 추정: 
            # playStartTime, playEndTime, playDe, brchNo, theatNo, seatAttrCd...
            
            # 만약 Flat List라면 바로 처리:
            play_start_tm = movie.get("playStartTime")
            play_end_tm = movie.get("playEndTime")
            
            if play_start_tm and play_end_tm:
                # Flat Structure (영화별 아님, 회차별 리스트)
                # movie 변수명이 헷갈리지만 item으로 취급
                item = movie
                try:
                    ymd = play_date_str
                    # 시간에서 콜론만 제거 (HH:MM -> HHMM)
                    start_tm_clean = str(play_start_tm).replace(':', '')[:4]
                    end_tm_clean = str(play_end_tm).replace(':', '')[:4]
                    
                    start_dt_str = f"{ymd}{start_tm_clean}"
                    end_dt_str = f"{ymd}{end_tm_clean}"
                    
                    start_dt = datetime.strptime(start_dt_str, "%Y%m%d%H%M")
                    end_dt = datetime.strptime(end_dt_str, "%Y%m%d%H%M")
                    
                    if end_dt < start_dt:
                        end_dt += timedelta(days=1)

                    target_dates.add(start_dt.date())

                    remain_seat = int(item.get("restSeatCnt", 0))
                    total_seat = int(item.get("totSeatCnt", 0))
                    is_available = remain_seat > 0
                    
                    screen_nm = item.get("theabExpoNm") or item.get("theabEngNm", "관정보없음")
                    
                    parsed_items.append({
                        'brand': 'Megabox',
                        'theater_name': log.theater_name,
                        'screen_name': screen_nm,
                        'start_time': start_dt,
                        'end_time': end_dt,
                        'movie_title': movie_title,
                        'is_booking_available': is_available
                    })
                except Exception as e:
                    errors.append({
                        'theater': log.theater_name,
                        'site_code': log.site_code,
                        'movie': movie_title,
                        'error': str(e),
                        'start_time': play_start_tm,
                        'end_time': play_end_tm
                    })
                    continue
        
        if not parsed_items:
            return 0, errors
            
        # Bulk Create/Update (CGV와 동일 로직)
        existing_qs = cls.objects.filter(
            brand='Megabox',
            theater_name=log.theater_name,
            start_time__date__in=target_dates
        )
        existing_map = {(obj.screen_name, obj.start_time): obj for obj in existing_qs}
        
        to_create, to_update = [], []
        
        for item in parsed_items:
            key = (item['screen_name'], item['start_time'])
            if key in existing_map:
                obj = existing_map[key]
                obj.is_booking_available = item['is_booking_available']
                obj.end_time = item['end_time']
                obj.movie_title = item['movie_title']
                to_update.append(obj)
            else:
                to_create.append(cls(**item))
                
        if to_create:
            cls.objects.bulk_create(to_create)
        if to_update:
            cls.objects.bulk_update(to_update, ['is_booking_available', 'end_time', 'movie_title', 'raw_log', 'updated_at'])
            
        return len(to_create) + len(to_update), errors

    @classmethod
    def create_from_lotte_log(cls, log):
        """
        LotteScheduleLog 데이터를 파싱하여 MovieSchedule 생성
        Returns: (created_count + updated_count, error_list)
        """
        from datetime import datetime, timedelta

        json_data = log.response_json or {}
        
        # 롯데시네마 API 구조 분석 필요 - 실제 API 응답에 따라 수정 필요
        # 일반적인 극장 API 패턴: Movies 리스트 > PlaySchedules 리스트
        movies = json_data.get("Movies", [])
        play_list = json_data.get("PlaySeqs", [])
        items = json_data.get("Items", [])
        
        # 어떤 키가 실제로 사용되는지 확인 후 처리
        schedule_data = movies or play_list or items or []
        
        parsed_items = []
        target_dates = set()
        errors = []
        
        play_date_str = json_data.get("RepresentationDate") or log.query_date
        
        for item in schedule_data:
            try:
                movie_title = item.get("MovieNameKR") or item.get("MovieName") or item.get("FilmName", "제목없음")
                
                # 롯데 API 시간 필드 추정
                play_start_time = item.get("StartTime") or item.get("PlayStartTime")
                play_end_time = item.get("EndTime") or item.get("PlayEndTime")
                
                if not play_start_time:
                    continue
                
                # 시간 파싱
                ymd = play_date_str
                start_tm_clean = str(play_start_time).replace(':', '')[:4]
                
                start_dt_str = f"{ymd}{start_tm_clean}"
                start_dt = datetime.strptime(start_dt_str, "%Y%m%d%H%M")
                
                end_dt = None
                if play_end_time:
                    end_tm_clean = str(play_end_time).replace(':', '')[:4]
                    end_dt_str = f"{ymd}{end_tm_clean}"
                    end_dt = datetime.strptime(end_dt_str, "%Y%m%d%H%M")
                    
                    if end_dt < start_dt:
                        end_dt += timedelta(days=1)

                target_dates.add(start_dt.date())

                # 잔여 좌석 및 예매 가능 여부
                remain_seat = int(item.get("BookingSeatCount", 0)) or int(item.get("SeatCount", 0))
                is_available = remain_seat > 0 or item.get("BookingYN") == "Y"
                
                # 상영관 정보
                screen_name = item.get("ScreenNameKR") or item.get("ScreenName") or item.get("TheaterName", "미지정")
                
                parsed_items.append({
                    'brand': 'LOTTE',
                    'theater_name': log.theater_name,
                    'screen_name': screen_name,
                    'start_time': start_dt,
                    'end_time': end_dt,
                    'movie_title': movie_title,
                    'is_booking_available': is_available
                })
            except Exception as e:
                errors.append({
                    'theater': log.theater_name,
                    'site_code': log.site_code,
                    'movie': item.get('MovieNameKR', 'Unknown'),
                    'error': str(e),
                    'item': str(item)[:200]
                })
                continue
        
        if not parsed_items:
            return 0, errors
            
        # Bulk Create/Update
        existing_qs = cls.objects.filter(
            brand='LOTTE',
            theater_name=log.theater_name,
            start_time__date__in=target_dates
        )
        existing_map = {(obj.screen_name, obj.start_time): obj for obj in existing_qs}
        
        to_create, to_update = [], []
        
        for item in parsed_items:
            key = (item['screen_name'], item['start_time'])
            if key in existing_map:
                obj = existing_map[key]
                obj.is_booking_available = item['is_booking_available']
                obj.end_time = item['end_time']
                obj.movie_title = item['movie_title']
                to_update.append(obj)
            else:
                to_create.append(cls(**item))
                
        if to_create:
            cls.objects.bulk_create(to_create)
        if to_update:
            cls.objects.bulk_update(to_update, ['is_booking_available', 'end_time', 'movie_title', 'updated_at'])
            
        return len(to_create) + len(to_update), errors

