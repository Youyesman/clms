from django.db import models
from castingline_backend.utils.models import TimeStampedModel

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

    @staticmethod
    def normalize_title(title):
        """
        영화 제목 정규화:
        1. 특수문자 제거 (알파벳, 한글, 숫자만 남김)
        2. 공백 제거
        3. 소문자 변환
        """
        import re
        if not title:
            return ""
        # 남길 문자: 영문(a-zA-Z), 숫자(0-9), 한글(가-힣)
        # ^는 부정. 즉, 저것들이 아닌 문자는 모두 공백으로 대체 후 제거
        return re.sub(r'[^a-zA-Z0-9가-힣]', '', str(title)).lower()

    @classmethod
    def create_from_cgv_log(cls, log, target_titles=None):
        """
        CGVScheduleLog 객체를 받아 파싱하여 MovieSchedule 데이터를 일괄 생성/업데이트합니다.
        (Bulk Operation 적용)
        """
        if not log.response_json or "data" not in log.response_json:
            return 0, []

        data_list = log.response_json["data"]
        from datetime import datetime
        
        parsed_items = []
        target_dates = set()
        errors = []

        # 1. Parsing Step
        for item in data_list:
            try:
                # 필수 필드 추출 (CGV API 키 매핑 수정됨)
                movie_title = item.get("movNm")
                
                # [Filtering Logic]
                if target_titles:
                    norm_crawled = cls.normalize_title(movie_title)
                    is_target = False
                    
                    for t in target_titles:
                        norm_target = cls.normalize_title(t)
                        # 정확히 일치하는 경우만 허용 (부분 일치 X) -> 다시 포함 관계로 변경 (사용자 요청)
                        # "주토피아" 입력 시 "주토피아 (자막)", "주토피아 (더빙)" 모두 수집되어야 함
                        # DB에는 원본 제목 그대로 저장되므로 서로 다른 영화로 구분됨
                        if norm_target in norm_crawled:
                             is_target = True
                             break
                    if not is_target:
                        continue
                
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
            cls.objects.bulk_create(to_create, ignore_conflicts=True)
            created_count = len(to_create)
            
        if to_update:
            # 변경될 수 있는 필드만 업데이트
            cls.objects.bulk_update(to_update, ['is_booking_available', 'end_time', 'movie_title', 'raw_log', 'updated_at'])
            updated_count = len(to_update)
            
        return created_count + updated_count, errors

    def __str__(self):
        return f"[{self.brand}] {self.theater_name} - {self.movie_title} ({self.start_time.strftime('%Y-%m-%d %H:%M')})"

    @classmethod
    def create_from_megabox_log(cls, log, target_titles=None):
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
            
            # [Filtering Logic]
            # [Filtering Logic]
            if target_titles:
                norm_crawled = cls.normalize_title(movie_title)
                is_target = False
                for t in target_titles:
                    norm_target = cls.normalize_title(t)
                    if norm_target in norm_crawled:
                            is_target = True
                            break
                if not is_target:
                    continue
            
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
                        'brand': 'MEGABOX',
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
            brand='MEGABOX',
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
            # ignore_conflicts=True를 사용하여 중복 키 오류(Duplicate Key Error) 방지
            # 이미 존재하는 스케줄이면 무시하고 넘어감
            cls.objects.bulk_create(to_create, ignore_conflicts=True)
            
        if to_update:
            cls.objects.bulk_update(to_update, ['is_booking_available', 'end_time', 'movie_title', 'raw_log', 'updated_at'])
            
        return len(to_create) + len(to_update), errors

    @classmethod
    def create_from_lotte_log(cls, log, target_titles=None):
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
                
                # [Filtering Logic]
                if target_titles:
                    norm_crawled = cls.normalize_title(movie_title)
                    is_target = False
                    for t in target_titles:
                        norm_target = cls.normalize_title(t)
                        if norm_target in norm_crawled:
                                is_target = True
                                break
                    if not is_target:
                        continue

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
            cls.objects.bulk_create(to_create, ignore_conflicts=True)
        if to_update:
            cls.objects.bulk_update(to_update, ['is_booking_available', 'end_time', 'movie_title', 'updated_at'])
            
        return len(to_create) + len(to_update), errors


class CrawlerRunHistory(models.Model):
    """
    크롤러 실행 이력 모델
    """
    STATUS_CHOICES = (
        ('PENDING', 'Pending'),
        ('RUNNING', 'Running'),
        ('SUCCESS', 'Success'),
        ('FAILED', 'Failed'),
        ('STOP_REQUESTED', 'Stop Requested'),
        ('STOPPED', 'Stopped'),
    )

    created_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    
    # 실행 시 설정 (JSON)
    configuration = models.JSONField(default=dict)
    
    # 결과 요약 (생성된 스케줄 수, 실패 건수 등)
    result_summary = models.JSONField(null=True, blank=True)
    
    # 에러 메시지 (실패 시)
    error_message = models.TextField(null=True, blank=True)
    
    # 생성된 엑셀 파일 경로
    excel_file_path = models.CharField(max_length=500, null=True, blank=True)

    def __str__(self):
        return f"Run #{self.id} - {self.status} ({self.created_at.strftime('%Y-%m-%d %H:%M')})"
