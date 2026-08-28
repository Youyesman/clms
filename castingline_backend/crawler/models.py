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
    crawler_run = models.ForeignKey('CrawlerRunHistory', on_delete=models.SET_NULL, null=True, blank=True, related_name='cgv_logs')

    class Meta:
        unique_together = [('query_date', 'site_code')]

    def __str__(self):
        return f"CGV Schedule Log - {self.query_date} ({self.theater_name} / {self.site_code})"



class MegaboxScheduleLog(models.Model):
    query_date = models.CharField(max_length=8)  # YYYYMMDD
    site_code = models.CharField(max_length=20)  # 지점코드 (brchNo)
    theater_name = models.CharField(max_length=50) # 극장명
    response_json = models.JSONField(default=dict) # 응답 전체 (megaMap 포함)
    status = models.CharField(max_length=20, default='pending')
    crawler_run = models.ForeignKey('CrawlerRunHistory', on_delete=models.SET_NULL, null=True, blank=True, related_name='megabox_logs')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('query_date', 'site_code')]

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
    crawler_run = models.ForeignKey('CrawlerRunHistory', on_delete=models.SET_NULL, null=True, blank=True, related_name='lotte_logs')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('query_date', 'theater_name')]

    def __str__(self):
        return f"[Lotte] {self.theater_name} ({self.query_date})"


class KobisScheduleLog(models.Model):
    """
    KOBIS(영화관입장권 통합전산망) 극장별 시간표 API 응답 원본 저장 로그.
    findSchedule.do 응답({theater, schedule})을 그대로 저장한다.
    """
    query_date = models.CharField(max_length=8)  # YYYYMMDD
    site_code = models.CharField(max_length=20)  # KOBIS theaCd
    theater_name = models.CharField(max_length=100, blank=True)  # 크롤된 극장명 (cdNm)
    response_json = models.JSONField(null=True, blank=True)
    status = models.CharField(max_length=20, default='success')
    crawler_run = models.ForeignKey('CrawlerRunHistory', on_delete=models.SET_NULL, null=True, blank=True, related_name='kobis_logs')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('query_date', 'site_code')]

    def __str__(self):
        return f"[KOBIS] {self.theater_name} ({self.query_date})"


class MovieSchedule(models.Model):
    """
    통합 영화 스케줄 모델 (CGV, 롯데, 메가박스 등 통합)
    """
    BRAND_CHOICES = (
        ('CGV', 'CGV'),
        ('LOTTE', 'Lotte Cinema'),
        ('MEGABOX', 'Megabox'),
        ('일반극장', '일반극장'),
        ('OTHER', 'Other'),
    )

    brand = models.CharField(max_length=20, choices=BRAND_CHOICES, default='CGV')
    theater_name = models.CharField(max_length=100) # 지점명 (예: 강남, 코엑스)
    movie_title = models.CharField(max_length=255) # 영화 제목 (정규화 전 원본 제목일 수 있음)
    screen_name = models.CharField(max_length=100) # 상영관 (예: 1관, IMAX관)
    
    start_time = models.DateTimeField() # 상영 시작 시간
    end_time = models.DateTimeField(null=True, blank=True) # 상영 종료 시간
    play_date = models.DateField(null=True, blank=True) # 상영 일자 (심야 영화 식별용)
    
    is_booking_available = models.BooleanField(default=True) # 예매 가능 여부
    booking_url = models.URLField(max_length=500, null=True, blank=True) # 예매 링크
    
    # [NEW] 메타데이터 태그 (더빙, 자막, 무대인사 등)
    # [NEW] 메타데이터 태그 (더빙, 자막, 무대인사 등)
    tags = models.JSONField(default=list, blank=True)
    total_seats = models.IntegerField(null=True, blank=True, default=0)
    remaining_seats = models.IntegerField(null=True, blank=True, default=0)

    # Note: parse_robust_datetime added here
    @staticmethod
    def parse_robust_datetime(ymd, tm_str):
        from datetime import datetime, timedelta
        from django.utils import timezone
        
        if not ymd or not tm_str: return None
        
        ymd = str(ymd).replace("-", "").strip()[:8]
        tm_str = str(tm_str).replace(":", "").strip()[:4]
        
        try:
            hour_int = int(tm_str[:2])
            min_int = int(tm_str[2:])
            base_dt = datetime.strptime(ymd, "%Y%m%d")
            dt = base_dt + timedelta(hours=hour_int, minutes=min_int)
            return timezone.make_aware(dt)
        except:
            return None
    
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
    def parse_and_normalize_title(raw_title):
        """
        영화 제목에서 메타데이터(태그)를 추출하고 순수 제목만 반환합니다.
        Returns: (clean_title, tags_list)
        """
        import re
        if not raw_title:
            return "", []

        tags = set()
        clean_title = raw_title
        
        # 0. HTML Entity Decoding & Full-width Parenthesis Normalization
        clean_title = clean_title.replace("&#40;", "(").replace("&#41;", ")")
        clean_title = clean_title.replace("（", "(").replace("）", ")")

        # 1. Bracket Tags: [무대인사], [F], [담력챌린지] ...
        # Pattern: [Anything except brackets]
        bracket_pattern = r'\[([^\]]+)\]'
        matches = re.findall(bracket_pattern, clean_title)
        for m in matches:
            tags.add(m.strip())
        # Remove tags from title
        clean_title = re.sub(bracket_pattern, '', clean_title).strip()

        # 2. Parenthesis Tags (Suffix/Infix): (더빙), (자막), (3D)...
        # Pattern: (Anything except parenthesis) at the end or middle
        paren_pattern = r'\(([^)]+)\)'
        matches = re.findall(paren_pattern, clean_title)
        
        # Filter unrelated parenthesis content? 
        # For now, we assume most parenthesis in movie titles in theater context are metadata
        # Exception: "Mission: Impossible (1996)" -> Year? 
        # Considering the user request, things like (더빙), (자막), (3D 4K..) are targets.
        for m in matches:
            # Simple heuristic: if it looks like a year (4 digits), probably keep it? 
            # But user example has "주토피아 2(팝콘 패키지,자막)"
            # Let's extract all for now.
            tags.add(m.strip())
            
        clean_title = re.sub(paren_pattern, '', clean_title).strip()

        # 3. Normalize subtitle separator (한국 영화 제목 부제 구분자 통일: - → :)
        # 한글 뒤 dash: '짱구는 못말려- 초화려', '씨너스-죄인들' → '짱구는 못말려: 초화려', '씨너스: 죄인들'
        clean_title = re.sub(r'([가-힣])\s*-\s*', r'\1: ', clean_title)
        # 공백-dash-공백: '호프 - 포썸' → '호프: 포썸'
        clean_title = re.sub(r'\s+-\s+', ': ', clean_title)
        # 콜론 앞뒤 공백 통일: 'A : B', 'A :B', 'A: B' → 'A: B'
        clean_title = re.sub(r'\s*:\s*(?=\S)', ': ', clean_title)

        # 4. Cleanup extra spaces
        clean_title = re.sub(r'\s+', ' ', clean_title).strip()

        return clean_title, list(tags)

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

    @staticmethod
    def detect_sub_type_tag(*sources):
        """C005: 자막/더빙 구분 검출 — 원문 문자열들에 '더빙'/'자막'이 포함되면 반환.

        체인마다 표기 위치가 다르다: CGV sbtdivNm('자막'/'더빙'),
        메가박스 playKindNm('2D(자막)'), 영진위 movieNm('...(디지털 더빙)'),
        롯데 TranslationDivisionCode(50=더빙, 100=자막).
        """
        joined = " ".join(str(s) for s in sources if s)
        if "더빙" in joined:
            return "더빙"
        if "자막" in joined:
            return "자막"
        return None

    @staticmethod
    def title_matches(target_title, crawled_title):
        """
        영화 제목 매칭 (V003: 특수문자·공백 제외 '정확 일치').

        양쪽 제목에서 메타 태그([IMAX], (더빙) 등)를 떼고(parse_and_normalize_title)
        특수문자·공백을 제거(normalize_title)한 결과가 완전히 같아야만 매칭한다.
        예) 등록 '오디세이' ↔ 크롤 '오디세이...!', '오디세이(더빙)' → 매칭 O
            등록 '오디세이' ↔ 크롤 '2001 스페이스 오디세이' → 매칭 X

        (예전의 부분 문자열·토큰 포함 매칭은 '오디세이'가
        '2001 스페이스 오디세이'까지 끌어와 미등록 영화가 수집·표기되는
        문제가 있었다.)
        """
        clean_target, _ = MovieSchedule.parse_and_normalize_title(target_title)
        clean_crawled, _ = MovieSchedule.parse_and_normalize_title(crawled_title)
        norm_target = MovieSchedule.normalize_title(clean_target)
        norm_crawled = MovieSchedule.normalize_title(clean_crawled)
        if not norm_target or not norm_crawled:
            return False
        return norm_target == norm_crawled

    @staticmethod
    def decode_html_entities(text):
        """HTML 엔티티(&#40; &amp; 등)를 실제 문자로 되돌린다.

        메가박스 API의 brchNm/movieNm 등은 괄호를 &#40; &#41; 로 내려주므로
        저장 전에 반드시 디코딩해야 한다. (미적용 시 '미사강변&#40;하남종합운동장&#41;'
        같은 극장명이 그대로 저장돼 화면·엑셀에 노출되고 극장 매칭도 실패한다.)
        """
        import html
        if not text:
            return text
        return html.unescape(str(text)).strip()

    @staticmethod
    def normalize_screen_name(name):
        """
        상영관 이름 정규화
        1. HTML Entity 디코딩
        2. 괄호 및 메타데이터 제거
        3. 'N관' 패턴 추출
        """
        import re
        if not name:
            return ""

        # 1. HTML Entity Decoding
        name = MovieSchedule.decode_html_entities(name)

        # 2. Simple Digit Check
        if name.isdigit():
            return f"{name}관"
            
        # 3. Extract 'N관' pattern if exists (Priority)
        # 예: "르 리클라이너 2관", "5관(리클라이너)" -> "2관", "5관"
        # 단, "1관 2관" 처럼 여러개 있는 경우는 드물지만, 첫번째 것을 취함
        digit_hall_match = re.search(r'(\d+)\s*관', name)
        if digit_hall_match:
            return f"{digit_hall_match.group(1)}관"
            
        # 4. Remove Parenthesis/Brackets and clean up
        # 괄호 안의 내용 제거: (리클라이너), [무대인사]
        name = re.sub(r'\([^)]*\)', '', name)
        name = re.sub(r'\[[^\]]*\]', '', name)
        
        # 특수문자 정리 (선택적) 또는 공백 정리
        name = re.sub(r'\s+', ' ', name).strip()
        
        return name

    # 특수상영(이벤트) 키워드: 무대인사·상영회·관객이벤트 등. 단순 할인/패키지 프로모션은 제외.
    SPECIAL_EVENT_KEYWORDS = [
        "무대인사", "상영회", "관객과", "GV", "시사회", "생중계", "싱어롱",
        "특별상영", "기획전", "오픈채팅", "메가토크", "시네마톡", "무비토크",
        "관크", "단체관람",
    ]

    @classmethod
    def extract_special_event_tags(cls, *texts):
        """주어진 텍스트들 중 특수상영 이벤트 키워드가 든 것을 태그(원문)로 반환."""
        tags = []
        for text in texts:
            s = str(text or "").strip()
            if not s:
                continue
            if any(kw in s for kw in cls.SPECIAL_EVENT_KEYWORDS):
                if s not in tags:
                    tags.append(s)
        return tags

    # E004: 특별 상영 포맷 검출 패턴 — 각 사이트의 포맷/관 표기에서 찾아 canonical 태그로 저장한다.
    # (CGV: movkndDsplNm·scnsNm / 메가박스: playKindNm·theabExpoNm / 롯데: FilmNameKR·ScreenDivisionNameKR·SoundTypeNameKR)
    # ATMOS의 MX 패턴: 메가박스 MX관(돌비 애트모스 사운드관). IMAX(A+MX)·MX4D(MX+4D)와 겹치지 않게 앞뒤 영숫자를 배제한다.
    SPECIAL_FORMAT_PATTERNS = [
        ("IMAX", (r"IMAX", r"아이맥스")),
        ("4DX", (r"4DX",)),
        ("SUPER-4D", (r"수퍼\s*-?\s*4D", r"슈퍼\s*-?\s*4D", r"SUPER\s*-?\s*4D")),
        ("MX4D", (r"MX4D",)),
        ("SCREENX", (r"SCREEN\s*-?X", r"스크린\s*X")),
        ("DOLBY", (r"돌비\s*시네마", r"DOLBY\s*CINEMA")),
        ("ATMOS", (r"ATMOS", r"애트모스", r"(?<![A-Z0-9])MX(?![A-Z0-9])")),
        ("3D", (r"(?<!\d)3D",)),
    ]

    @classmethod
    def extract_format_tags(cls, *texts):
        """사이트 표기 텍스트들에서 특별 상영 포맷(IMAX·3D·4DX·SUPER-4D·DOLBY·ATMOS 등)을 검출해 반환."""
        import re
        joined = " ".join(str(t) for t in texts if t)
        if not joined:
            return []
        upper = cls.decode_html_entities(joined).upper()
        tags = []
        for canonical, patterns in cls.SPECIAL_FORMAT_PATTERNS:
            if any(re.search(p, upper) for p in patterns):
                tags.append(canonical)
        return tags

    @classmethod
    def create_from_cgv_log(cls, log, target_titles=None, title_map=None):
        """
        CGVScheduleLog 객체를 받아 파싱하여 MovieSchedule 데이터를 일괄 생성/업데이트합니다.
        (Bulk Operation 적용)
        """
        # [Robust JSON Parse]
        json_data = log.response_json
        if isinstance(json_data, str):
            try:
                import json
                json_data = json.loads(json_data)
            except:
                json_data = {}

        if not json_data or "data" not in json_data:
            return 0, []

        data_list = json_data["data"]
        from datetime import datetime, timedelta
        from django.utils import timezone
        
        parsed_items = []
        target_dates = set()
        errors = []

        # 1. Parsing Step
        for item in data_list:
            try:
                # 필수 필드 추출 (CGV API 키 매핑 수정됨)
                movie_title = item.get("movNm")

                # CGV 특수상영(무대인사·상영회 등)은 videoAddexp 필드에 표기됨
                special_event_tags = cls.extract_special_event_tags(
                    item.get("videoAddexpCdNm"), item.get("videoAddexpCont")
                )

                # [Filtering Logic] 크롤 대상 영화만 수집.
                # 0828: 예전에는 '특수상영(무대인사·GV)이면 대상이 아니어도 수집'했으나,
                # 체크한 영화만 크롤해도 다른 영화의 GV 회차가 딸려 들어와 비교표에
                # 1극장·1회짜리로 나타났다. 대상 영화의 특수상영은 어차피 제목이
                # 일치하므로 그대로 수집되고, 특수상영 다운로드도 크롤 대상 영화에서만
                # 고르게 되어 있어 잃는 기능이 없다.
                if target_titles:
                    is_target = False
                    matched_target = None

                    for t in target_titles:
                        if cls.title_matches(t, movie_title):
                             is_target = True
                             matched_target = t
                             break
                    if is_target and matched_target != movie_title:
                        print(f"      [Title Match] \"{movie_title}\" <- target: \"{matched_target}\"")
                    if not is_target:
                        continue
                
                screen_name = cls.normalize_screen_name(item.get("scnsNm"))
                
                # 시간 파싱
                play_ymd = item.get("scnYmd")
                play_start_time = item.get("scnsrtTm")
                play_end_time = item.get("scnendTm") 
                
                if not (play_ymd and play_start_time):
                    continue
                
                # 안전한 파싱 (24시 포맷 처리 및 play_date 저장)
                ymd_clean = str(play_ymd)[:8]
                
                # [NEW] play_date는 로그의 query_date를 사용 (User Request)
                try:
                     parsed_play_date = datetime.strptime(log.query_date, "%Y%m%d").date()
                except:
                     parsed_play_date = None

                start_tm_clean = str(play_start_time)[:4]
                start_dt = cls.parse_robust_datetime(ymd_clean, start_tm_clean)
                if not start_dt: continue
                
                target_dates.add(start_dt.date())

                end_dt = None
                if play_end_time:
                    end_tm_clean = str(play_end_time)[:4]
                    end_dt = cls.parse_robust_datetime(ymd_clean, end_tm_clean)
                    # 종료 시간이 시작 시간보다 빠르면(보통 없겠지만) 하루 더하기? 
                    # parse_robust_datetime이 이미 24시 넘는건 처리함.
                    # 단, 01:00 종료가 입력되었는데 사실 25:00 의미라면? 
                    # CGV는 보통 2500으로 줌. 만약 0100으로 준다면 처리 필요.
                    if end_dt and end_dt < start_dt:
                         end_dt += timedelta(days=1)

                remain_seat = int(item.get("frSeatCnt", 0))
                is_available = remain_seat > 0
                
                # Title Consistency Logic
                # 1. Parse Metadata
                clean_title, extracted_tags = cls.parse_and_normalize_title(movie_title)
                # CGV 특수상영 이벤트(무대인사 등)를 태그에 추가 → 키워드 검색/내보내기 가능
                if special_event_tags:
                    extracted_tags = list(extracted_tags) + [t for t in special_event_tags if t not in extracted_tags]
                # E004: 특별 상영 포맷(IMAX·4DX·SCREENX 등) — CGV는 movkndDsplNm(포맷 표기)·상영관명에서 검출
                format_tags = cls.extract_format_tags(item.get("movkndDsplNm"), item.get("scnsNm"))
                if format_tags:
                    extracted_tags = list(extracted_tags) + [t for t in format_tags if t not in extracted_tags]
                # C005: 자막/더빙 구분 — CGV는 sbtdivNm('자막'/'더빙')과 prodNm 괄호로 내려준다
                sub_tag = cls.detect_sub_type_tag(item.get("sbtdivNm"), item.get("prodNm"))
                if sub_tag and sub_tag not in extracted_tags:
                    extracted_tags = list(extracted_tags) + [sub_tag]

                final_title = clean_title
                if title_map is not None:
                    norm_title = cls.normalize_title(clean_title)
                    if norm_title in title_map:
                        final_title = title_map[norm_title]
                    else:
                        title_map[norm_title] = clean_title
                
                parsed_items.append({
                    'brand': 'CGV',
                    'theater_name': log.theater_name,
                    'screen_name': screen_name,
                    'start_time': start_dt,
                    'movie_title': final_title,
                    'tags': extracted_tags,
                    'tags': extracted_tags,
                    'end_time': end_dt, # Update 대상
                    'is_booking_available': is_available, # Update 대상
                    'total_seats': int(item.get("stcnt", 0)),
                    'remaining_seats': int(item.get("frtmpSeatCnt", 0)),
                    'remaining_seats': int(item.get("frtmpSeatCnt", 0)),
                    'play_date': parsed_play_date, # [NEW] Play Date
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

        # [PREMIUM Seat Merge] 용산아이파크몰·정관은 'N관'과 'N관[PREMIUM]'이 같은 상영시간에
        # 별개 항목으로 내려오므로, normalize 후 동일 (screen_name, start_time, movie_title) 이면
        # total_seats / remaining_seats 를 합산하여 하나의 행으로 통합한다.
        PREMIUM_MERGE_KEYWORDS = ["용산아이파크몰", "씨네드쉐프 용산", "정관"]
        if any(kw in (log.theater_name or "") for kw in PREMIUM_MERGE_KEYWORDS):
            merged_map = {}
            for item in parsed_items:
                key = (item['screen_name'], item['start_time'], item['movie_title'])
                if key not in merged_map:
                    merged_map[key] = dict(item)
                else:
                    merged_map[key]['total_seats'] += item['total_seats']
                    merged_map[key]['remaining_seats'] += item['remaining_seats']
                    if item['is_booking_available']:
                        merged_map[key]['is_booking_available'] = True
            parsed_items = list(merged_map.values())

        # 2. Fetch Existing Step
        # 해당 로그의 극장에서 파싱된 시간 범위에 해당하는 모든 스케줄을 미리 가져옴
        all_start_times = [item['start_time'] for item in parsed_items]
        min_time = min(all_start_times)
        max_time = max(all_start_times) + timedelta(hours=1)
        existing_qs = cls.objects.filter(
            brand='CGV',
            theater_name=log.theater_name,
            start_time__gte=min_time,
            start_time__lte=max_time,
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
                obj.movie_title = item['movie_title'] # 혹시 제목 바뀌었을 수도 있음
                obj.tags = item['tags']
                obj.total_seats = item['total_seats']
                obj.remaining_seats = item['remaining_seats']
                obj.play_date = item['play_date'] # Update
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
            cls.objects.bulk_update(to_update, ['is_booking_available', 'end_time', 'movie_title', 'tags', 'raw_log', 'updated_at', 'total_seats', 'remaining_seats', 'play_date'])
            updated_count = len(to_update)

        # C002: 이전 영진위 예비 수집 잔재 정리 (최신 크롤만 표출)
        cls._purge_stale_backup_rows('CGV', log.theater_name, parsed_items)

        return created_count + updated_count, errors

    def __str__(self):
        return f"[{self.brand}] {self.theater_name} - {self.movie_title} ({self.start_time.strftime('%Y-%m-%d %H:%M')})"

    @classmethod
    def _kobis_client_candidates(cls, crawled_name):
        """크롤된 KOBIS 극장명과 이름이 일치하는 Client 후보 목록.

        같은 영진위 극장명이 여러 거래처에 등록될 수 있으므로(예: '영화의 전당' →
        부산영화의전당 / 부산영화의전당(발전기금면제관)) 첫 건만 남기지 않고
        전부 보관한다 (K001).
        """
        import re, html
        from client.models import Client
        # KOBIS는 '&'를 이중 인코딩(&amp;amp;)하는 경우가 있어 두 번 unescape
        crawled_name = html.unescape(html.unescape(str(crawled_name or "")))
        norm = re.sub(r'\s+', '', crawled_name).lower()
        if not norm:
            return []
        # 캐시 (이름정규화 -> [client 후보 목록]) : 첫 호출 시 1회 구축
        cache = getattr(MovieSchedule, '_kobis_client_cache', None)
        if cache is None:
            cache = {}
            for c in Client.objects.all().only(
                'id', 'client_name', 'excel_theater_name',
                'kofic_theater_name', 'kofic_theater_name2',
            ):
                for nm in (c.kofic_theater_name, c.kofic_theater_name2,
                           c.excel_theater_name, c.client_name):
                    if nm:
                        k = re.sub(r'\s+', '', nm).lower()
                        bucket = cache.setdefault(k, [])
                        if all(x.id != c.id for x in bucket):
                            bucket.append(c)
            MovieSchedule._kobis_client_cache = cache
        return cache.get(norm) or []

    @staticmethod
    def _pick_client_by_screen(candidates, screen_name):
        """동명 거래처 후보 중 해당 관명이 극장관 정보에 등록된 거래처를 고른다 (K001).

        정규화 후 정확 일치 → 포함 일치(예: KOBIS '인디플러스 영화의 전당' ⊃
        등록 관 '인디플러스') 순으로 비교하고, 유일하게 좁혀지지 않으면 None.
        """
        import re
        from client.models import Theater

        def _norm(s):
            s = MovieSchedule.normalize_screen_name(s)
            return re.sub(r'\s+', '', s).lower()

        target = _norm(screen_name)
        if not target:
            return None

        # client_id -> 정규화된 관명 집합 캐시
        screen_cache = getattr(MovieSchedule, '_kobis_screen_cache', None)
        if screen_cache is None:
            screen_cache = {}
            MovieSchedule._kobis_screen_cache = screen_cache
        for c in candidates:
            if c.id not in screen_cache:
                names = set()
                theaters = Theater.objects.filter(client_id=c.id).only(
                    'auditorium_name', 'kofic_auditorium_name'
                )
                for t in theaters:
                    for nm in (t.kofic_auditorium_name, t.auditorium_name):
                        n = _norm(nm) if nm else ''
                        if n:
                            names.add(n)
                screen_cache[c.id] = names

        exact = [c for c in candidates if target in screen_cache[c.id]]
        if len(exact) == 1:
            return exact[0]
        partial = [
            c for c in candidates
            if any(
                (n in target or target in n)
                for n in screen_cache[c.id] if len(n) >= 2
            )
        ]
        if len(partial) == 1:
            return partial[0]
        return None

    @classmethod
    def map_kobis_theater_name(cls, crawled_name, screen_name=None):
        """크롤된 KOBIS 극장명을 기존 DB 극장(Client)과 매핑. 매칭되면 client_name, 아니면 원본 반환.

        같은 영진위 극장명을 여러 거래처가 공유하면 관명(screen_name)으로
        올바른 거래처를 판별한다 (K001).
        """
        candidates = cls._kobis_client_candidates(crawled_name)
        if len(candidates) > 1 and screen_name:
            picked = cls._pick_client_by_screen(candidates, screen_name)
            if picked is not None:
                return picked.client_name, picked.id
        if candidates:
            c = candidates[0]
            return c.client_name, c.id
        import html
        return html.unescape(html.unescape(str(crawled_name or ""))), None

    @classmethod
    def replace_before_transform(cls, brands, yyyymmdd_dates, target_titles=None):
        """'가장 최근 크롤만 표출' — 교체 방식.

        크롤 변환 직전에 이번 크롤 범위의 기존 스케줄을 지운 뒤 새 수집분으로
        다시 채운다. 잔재(이전 크롤의 폐지·변경 회차, 영진위↔자사 표기 차이
        행 등)가 원천적으로 남지 않는다.

        C002(0827): 교체 단위는 **(브랜드 × 상영일) 전체**다. 같은 날짜를 다시
        크롤하면 그 날짜의 기존 데이터는 영화 구분 없이 전부 지워지고 이번
        크롤 대상 영화만 남는다 — 예) 1차에 20편으로 9/2~9/8을 크롤한 뒤
        2차에 3편만 골라 9/2~9/4를 다시 크롤하면, 9/2~9/4는 그 3편만 남고
        9/5~9/8은 1차 데이터가 유지된다. (0825의 '영화별 교체'는 이전 크롤
        영화의 잔재가 보고서에 계속 남는 문제로 0827에 폐기)

        target_titles 는 하위 호환용으로 남겨둔다: 주어지면 예전처럼 그 영화들의
        행만 지운다(현재 호출부는 모두 미지정). 수집 로그가 있는 날짜만 지우므로,
        크롤이 통째로 실패한 날짜의 기존 데이터는 유지된다.
        """
        from datetime import datetime as _dt
        dates = []
        for d in (yyyymmdd_dates or []):
            try:
                dates.append(_dt.strptime(str(d), "%Y%m%d").date())
            except Exception:
                continue
        if not brands or not dates:
            return 0
        qs = cls.objects.filter(brand__in=list(brands), play_date__in=dates)
        scope = "전체"
        if target_titles:
            # 영화별 덮어쓰기 — 저장된 제목의 표기 변형('어떻게 해야 했을까?' 등)도
            # 정확 일치 규칙(title_matches)으로 같은 영화로 보고 함께 지운다
            existing_titles = list(qs.values_list('movie_title', flat=True).distinct())
            doomed = [t for t in existing_titles
                      if any(cls.title_matches(tt, t) for tt in target_titles)]
            if not doomed:
                return 0
            qs = qs.filter(movie_title__in=doomed)
            scope = f"대상 {len(target_titles)}편"
        deleted, _detail = qs.delete()
        if deleted:
            print(f"   [Replace] {'/'.join(brands)} {len(dates)}일치 {scope} 기존 스케줄 {deleted}건 삭제 (날짜 전체 교체)")
        return deleted

    @classmethod
    def _purge_stale_backup_rows(cls, brand, theater_name, parsed_items):
        """C002: 영진위 예비 크롤 잔재 정리 — '가장 최근 크롤만 표출'(0825 지시).

        자사 크롤 변환 직후 호출한다. 같은 (브랜드·극장·상영일)에서 이번 수집에
        없는 회차의 '좌석 정보 없는' 행을 삭제한다. 영진위 수집분은 좌석수가 항상
        0이고 자사 크롤 행은 좌석수가 있으므로, 자사 사이트가 복구되어 다시
        크롤하면 이전 영진위 예비 수집분만 정확히 걷어진다.
        """
        from django.db.models import Q
        parsed_keys = {(i['screen_name'], i['start_time']) for i in parsed_items}
        play_dates = {i.get('play_date') for i in parsed_items if i.get('play_date')}
        if not play_dates:
            return 0
        stale_ids = [
            o.id for o in cls.objects.filter(
                brand=brand, theater_name=theater_name, play_date__in=play_dates,
            ).filter(Q(total_seats=0) | Q(total_seats__isnull=True))
             .only('id', 'screen_name', 'start_time')
            if (o.screen_name, o.start_time) not in parsed_keys
        ]
        if stale_ids:
            cls.objects.filter(id__in=stale_ids).delete()
        return len(stale_ids)

    @classmethod
    def _resolve_chain_theater_name(cls, brand, kobis_name):
        """C002: 영진위 멀티 극장명 → 자사 크롤 극장명 매핑.

        영진위와 자사의 지점 표기가 다른 극장(예: 영진위 '영등포' ↔ 자사
        '영등포타임스퀘어', '수원' ↔ '수원(수원역롯데몰)', '월드타워_샤롯데' ↔
        '월드타워')을 같은 극장으로 합치기 위해, 최근 30일 자사 크롤(좌석수 있는
        행)의 극장명과 정규화 비교한다. **유일하게** 매칭될 때만 치환하고,
        못 찾거나 여럿이면 영진위 표기를 그대로 쓴다 (임의 매핑 금지).
        """
        import re
        from datetime import timedelta
        from django.utils import timezone as dj_tz

        since = dj_tz.now() - timedelta(days=30)
        own_names = set(cls.objects.filter(
            brand=brand, total_seats__gt=0, created_at__gte=since,
        ).values_list('theater_name', flat=True).distinct())
        if kobis_name in own_names:
            return kobis_name

        def key(s):
            s = re.sub(r'\([^)]*\)', '', str(s))                      # 괄호 내용 제거
            s = re.sub(r'[_\s]*(샤롯데|charlotte관?)$', '', s, flags=re.I)  # 특별관 접미
            s = re.sub(r'(지점|점)$', '', s)                            # 접미 '점'
            return re.sub(r'\s+', '', s).lower()

        k = key(kobis_name)
        if not k:
            return kobis_name
        exact = [n for n in own_names if key(n) == k]
        if len(exact) == 1:
            return exact[0]
        if not exact:
            # 접두/포함 매칭 (예: 영진위 '영등포' → 자사 '영등포타임스퀘어')
            pref = [n for n in own_names
                    if key(n).startswith(k) or k.startswith(key(n))]
            if len(pref) == 1:
                return pref[0]
        return kobis_name

    @staticmethod
    def kobis_chain_brand(theater_name):
        """C002: 영진위(KOBIS) 극장명에서 멀티 3사 브랜드 판별 (예비용 크롤).

        반환: (브랜드, 접두어 제거 지점명) — 멀티가 아니면 (None, None).
        자사 크롤과 같은 형식(브랜드 접두어 없는 지점명)으로 저장해
        지역 매핑·엑셀 표기가 기존 데이터와 자연스럽게 이어지게 한다.
        """
        import re
        norm = re.sub(r"\s+", "", str(theater_name or ""))
        for prefix, brand in (("CGV", "CGV"), ("메가박스", "MEGABOX"),
                              ("롯데시네마", "LOTTE"), ("롯데", "LOTTE")):
            if norm.startswith(prefix):
                return brand, (norm[len(prefix):] or norm)
        return None, None

    @classmethod
    def create_from_kobis_log(cls, log, target_titles=None, title_map=None):
        """
        KobisScheduleLog -> MovieSchedule 변환.
        - 일반극장: brand='일반극장' + 거래처 매핑(K001)
        - 멀티 3사 극장(C002 예비용 수집분): 극장명 접두어로 브랜드 판별해
          brand='CGV'/'LOTTE'/'MEGABOX' 로 저장 (자사 크롤과 같은 지점명 형식)
        KOBIS 응답: {theater:[{homepgUrl}], schedule:[{scrnNm, movieNm, movieCd, showTm}]}
        showTm 은 콤마 구분 시각 문자열 "0830,1040,1310".
        """
        from datetime import datetime, timedelta

        json_data = log.response_json
        if isinstance(json_data, str):
            try:
                import json
                json_data = json.loads(json_data)
            except Exception:
                json_data = {}
        if not json_data or "schedule" not in json_data:
            return 0, []

        schedule_list = json_data.get("schedule") or []
        theater_info = json_data.get("theater") or [{}]
        homepg = theater_info[0].get("homepgUrl") if theater_info else None

        # C002: 멀티 3사 극장(예비용 수집분)이면 브랜드/지점명을 분리하고,
        # 영진위 지점명을 자사 크롤 지점명으로 매핑 (같은 극장으로 합쳐지도록)
        chain_brand, chain_name = cls.kobis_chain_brand(log.theater_name)
        row_brand = chain_brand or '일반극장'
        if chain_brand:
            chain_name = cls._resolve_chain_theater_name(row_brand, chain_name)

        # 심야 회차 포함 자사 크롤과 같은 상영일 규칙(query_date)을 쓰기 위한 기준일
        try:
            q_date = datetime.strptime(str(log.query_date), "%Y%m%d").date()
        except Exception:
            q_date = None

        parsed_items = []
        errors = []
        for item in schedule_list:
            try:
                movie_title = item.get("movieNm")
                if not movie_title:
                    continue
                # 대상 영화 필터
                if target_titles:
                    if not any(cls.title_matches(t, movie_title) for t in target_titles):
                        continue

                screen_name = cls.normalize_screen_name(item.get("scrnNm"))
                if chain_brand:
                    # C002: 멀티 3사는 거래처 매핑 대신 접두어 제거 지점명 사용
                    mapped_theater_name = chain_name
                else:
                    # 극장명: 기존 DB 극장과 매핑 — 같은 영진위 극장명이 여러 거래처로
                    # 나뉜 경우(예: 영화의 전당) 관명으로 판별해야 하므로 관 단위로 매핑 (K001)
                    mapped_theater_name, _client_id = cls.map_kobis_theater_name(
                        log.theater_name, screen_name=screen_name
                    )
                clean_title, extracted_tags = cls.parse_and_normalize_title(movie_title)
                # C005: 자막/더빙 구분 — 영진위는 movieNm 괄호에 '(디지털 더빙)'처럼
                # 복합 표기로 내려오므로 canonical 태그('더빙'/'자막')를 따로 추가한다
                sub_tag = cls.detect_sub_type_tag(*extracted_tags)
                if sub_tag and sub_tag not in extracted_tags:
                    extracted_tags = list(extracted_tags) + [sub_tag]
                final_title = clean_title
                if title_map is not None:
                    norm_title = cls.normalize_title(clean_title)
                    if norm_title in title_map:
                        final_title = title_map[norm_title]
                    else:
                        title_map[norm_title] = clean_title

                show_tm = str(item.get("showTm") or "")
                for tm in [t.strip() for t in show_tm.split(",") if t.strip()]:
                    start_dt = cls.parse_robust_datetime(log.query_date, tm[:4])
                    if not start_dt:
                        continue
                    parsed_items.append({
                        'brand': row_brand,
                        'theater_name': mapped_theater_name,
                        'screen_name': screen_name,
                        'start_time': start_dt,
                        'movie_title': final_title,
                        'tags': extracted_tags,
                        'booking_url': homepg,
                        'play_date': start_dt.date(),
                    })
            except Exception as e:
                errors.append({
                    'theater': log.theater_name,
                    'site_code': log.site_code,
                    'movie': item.get('movieNm', 'Unknown'),
                    'error': str(e),
                    'item': str(item)[:200],
                })
                continue

        if not parsed_items:
            # 대상 회차가 없으면 기존 데이터를 건드리지 않는다 (빈 응답으로 인한 소실 방지)
            return 0, errors

        if chain_brand:
            # C002: 멀티 3사 예비 수집은 '가장 최근 크롤만 표출'(0825 지시) —
            # 같은 (브랜드·지점·상영일)에서 **이번 수집에 포함된 영화의** 기존 행
            # (자사 크롤 행 포함)을 지우고 이번 영진위 수집분으로 교체한다.
            # 크롤 대상에서 뺀 영화의 이전 데이터는 유지된다(영화별 덮어쓰기).
            # 좌석 정보는 영진위가 제공하지 않으므로 0 그대로 저장한다(임의 폴백 금지).
            if q_date:
                for item in parsed_items:
                    item['play_date'] = q_date
                new_keys = {cls.normalize_title(i['movie_title'])
                            for i in parsed_items}
                scope_qs = cls.objects.filter(
                    brand=row_brand, theater_name=chain_name, play_date=q_date)
                doomed = [t for t in scope_qs.values_list('movie_title', flat=True).distinct()
                          if cls.normalize_title(
                              cls.parse_and_normalize_title(t)[0]) in new_keys]
                if doomed:
                    scope_qs.filter(movie_title__in=doomed).delete()
            seen = set()
            to_create = []
            for item in parsed_items:
                key = (item['screen_name'], item['start_time'])
                if key in seen:
                    continue
                seen.add(key)
                to_create.append(cls(**item))
            cls.objects.bulk_create(to_create, ignore_conflicts=True)
            return len(to_create), errors

        # 기존 스케줄 조회 (brand+theater 범위).
        # 같은 영진위 극장을 공유하는 모든 후보 거래처명과 원본 극장명까지 포함해
        # 과거에 다른 거래처명으로 저장된 행도 찾는다 (K001 — 중복 생성 방지)
        all_start = [i['start_time'] for i in parsed_items]
        lookup_names = {i['theater_name'] for i in parsed_items}
        lookup_names.add(str(log.theater_name or ""))
        if not chain_brand:
            lookup_names.update(
                c.client_name for c in cls._kobis_client_candidates(log.theater_name)
                if c.client_name
            )
        existing_qs = cls.objects.filter(
            brand=row_brand,
            theater_name__in=[n for n in lookup_names if n],
            start_time__gte=min(all_start),
            start_time__lte=max(all_start) + timedelta(hours=1),
        )
        # 같은 (관, 시각)이 별칭 거래처명으로 중복 저장돼 있으면 새 매핑명 행을
        # 우선 채택하고 나머지는 삭제 대상으로 모은다 (unique 제약 충돌 방지 — K001)
        mapped_names = {i['theater_name'] for i in parsed_items}
        existing_map = {}
        stale_ids = []
        for o in existing_qs:
            key = (o.screen_name, o.start_time)
            cur = existing_map.get(key)
            if cur is None:
                existing_map[key] = o
            elif o.theater_name in mapped_names and cur.theater_name not in mapped_names:
                stale_ids.append(cur.id)
                existing_map[key] = o
            else:
                stale_ids.append(o.id)

        to_create, to_update = [], []
        seen = set()
        for item in parsed_items:
            key = (item['screen_name'], item['start_time'])
            if key in seen:
                continue
            seen.add(key)
            if key in existing_map:
                obj = existing_map[key]
                obj.movie_title = item['movie_title']
                obj.tags = item['tags']
                obj.booking_url = item['booking_url']
                # 과거에 잘못 매핑된 거래처명도 함께 교정한다 (K001)
                obj.theater_name = item['theater_name']
                to_update.append(obj)
            else:
                to_create.append(cls(**item))

        created_count = updated_count = 0
        if stale_ids:
            cls.objects.filter(id__in=stale_ids).delete()
        if to_create:
            cls.objects.bulk_create(to_create, ignore_conflicts=True)
            created_count = len(to_create)
        if to_update:
            cls.objects.bulk_update(to_update, ['movie_title', 'tags', 'booking_url', 'theater_name', 'updated_at'])
            updated_count = len(to_update)

        return created_count + updated_count, errors

    @classmethod
    def create_from_megabox_log(cls, log, target_titles=None, title_map=None):
        """
        MegaboxScheduleLog 데이터를 파싱하여 MovieSchedule 생성
        Returns: (created_count + updated_count, error_list)
        """
        from datetime import datetime, timedelta
        from django.utils import timezone

        # [Robust JSON Parse]
        json_data = log.response_json or {}
        if isinstance(json_data, str):
            try:
                import json
                json_data = json.loads(json_data)
            except:
                json_data = {}
        mega_map = json_data.get("megaMap", {})
        movie_list = mega_map.get("movieFormList", [])
        
        parsed_items = []
        target_dates = set()
        errors = []
        
        # 메가박스는 응답이 date 파라미터(playDe) 기준이므로 보통 하루치 데이터임.
        play_date_str = mega_map.get("playDe") or log.query_date
        
        # 구 로그(엔티티가 남아있는 상태로 저장된 것)를 재변환해도 깨끗하게 나오도록 여기서도 디코딩
        log_theater_name = cls.decode_html_entities(log.theater_name)

        for movie in movie_list:
            movie_title = cls.decode_html_entities(movie.get("movieNm", "제목없음"))

            # 메가박스 특수상영은 제목 대괄호([무대인사],[메가토크] 등)로 표기되며,
            # 아래 parse_and_normalize_title 이 태그로 분리한다.

            # [Filtering Logic] 크롤 대상 영화만 수집 (0828 — CGV 쪽과 동일 규칙)
            if target_titles:
                is_target = False
                matched_target = None
                for t in target_titles:
                    if cls.title_matches(t, movie_title):
                            is_target = True
                            matched_target = t
                            break
                if is_target and matched_target != movie_title:
                    print(f"      [Title Match] \"{movie_title}\" <- target: \"{matched_target}\"")
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
                    ymd_clean = log.query_date
                    parsed_play_date = None
                    try:
                        parsed_play_date = datetime.strptime(ymd_clean, "%Y%m%d").date()
                    except:
                        pass
                        
                    # 시간에서 콜론만 제거 (HH:MM -> HHMM)
                    start_tm_clean = str(play_start_tm).replace(':', '')[:4]
                    end_tm_clean = str(play_end_tm).replace(':', '')[:4]
                    
                    # [Fix] 24:05 -> 다음날 00:05 처리 로직 (from CGV logic)
                    try:
                        hour_int = int(start_tm_clean[:2])
                        min_int = int(start_tm_clean[2:])
                        base_dt_naive = datetime.strptime(ymd_clean, "%Y%m%d")
                        start_dt_naive = base_dt_naive + timedelta(hours=hour_int, minutes=min_int)
                        start_dt = timezone.make_aware(start_dt_naive)
                    except:
                        # Fallback for complex format
                        start_dt_str = f"{ymd_clean}{start_tm_clean}"
                        start_dt = datetime.strptime(start_dt_str, "%Y%m%d%H%M")
                        start_dt = timezone.make_aware(start_dt)
                    
                    try:
                        ehour_int = int(end_tm_clean[:2])
                        emin_int = int(end_tm_clean[2:])
                        ebase_dt_naive = datetime.strptime(ymd_clean, "%Y%m%d")
                        end_dt_naive = ebase_dt_naive + timedelta(hours=ehour_int, minutes=emin_int)
                        end_dt = timezone.make_aware(end_dt_naive)
                    except:
                        end_dt_str = f"{ymd_clean}{end_tm_clean}"
                        end_dt = datetime.strptime(end_dt_str, "%Y%m%d%H%M")
                        end_dt = timezone.make_aware(end_dt)
                    
                    if end_dt < start_dt:
                        end_dt += timedelta(days=1)

                    target_dates.add(start_dt.date())

                    remain_seat = int(item.get("restSeatCnt", 0))
                    total_seat = int(item.get("totSeatCnt", 0))
                    is_available = remain_seat > 0
                    
                    screen_nm = cls.normalize_screen_name(item.get("theabExpoNm") or item.get("theabEngNm", "관정보없음"))
                    
                    # Title Consistency Logic
                    clean_title, extracted_tags = cls.parse_and_normalize_title(movie_title)
                    # E004: 특별 상영 포맷 — 메가박스는 상영종류(playKindNm)·상영관 표기(theabExpoNm)에서 검출
                    format_tags = cls.extract_format_tags(item.get("playKindNm"), item.get("theabExpoNm"))
                    if format_tags:
                        extracted_tags = list(extracted_tags) + [t for t in format_tags if t not in extracted_tags]
                    # C005: 자막/더빙 구분 — 메가박스는 playKindNm('2D(자막)' 등)과
                    # 영화명 접두 '(더빙)'으로 내려준다 (자막 건이 더빙으로 뭉뚱그려지던 오류 수정)
                    sub_tag = cls.detect_sub_type_tag(
                        cls.decode_html_entities(item.get("playKindNm")), movie_title)
                    if sub_tag and sub_tag not in extracted_tags:
                        extracted_tags = list(extracted_tags) + [sub_tag]

                    final_title = clean_title
                    if title_map is not None:
                        norm_title = cls.normalize_title(clean_title)
                        if norm_title in title_map:
                            final_title = title_map[norm_title]
                        else:
                            title_map[norm_title] = clean_title

                    parsed_items.append({
                        'brand': 'MEGABOX',
                        'theater_name': log_theater_name,
                        'screen_name': screen_nm,
                        'start_time': start_dt,
                        'end_time': end_dt,
                        'movie_title': final_title,
                        'tags': extracted_tags,
                        'is_booking_available': is_available,
                        'total_seats': total_seat,
                        'total_seats': total_seat,
                        'remaining_seats': remain_seat,
                        'play_date': parsed_play_date
                    })
                except Exception as e:
                    errors.append({
                        'theater': log_theater_name,
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
            theater_name=log_theater_name,
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
                # 재변환 시 태그(E004 포맷 포함)·좌석·상영일자도 최신값으로 갱신
                obj.tags = item['tags']
                obj.total_seats = item['total_seats']
                obj.remaining_seats = item['remaining_seats']
                obj.play_date = item['play_date']
                to_update.append(obj)
            else:
                to_create.append(cls(**item))

        if to_create:
            # ignore_conflicts=True를 사용하여 중복 키 오류(Duplicate Key Error) 방지
            # 이미 존재하는 스케줄이면 무시하고 넘어감
            cls.objects.bulk_create(to_create, ignore_conflicts=True)

        if to_update:
            cls.objects.bulk_update(to_update, ['is_booking_available', 'end_time', 'movie_title', 'tags', 'raw_log', 'updated_at', 'total_seats', 'remaining_seats', 'play_date'])

        # C002: 이전 영진위 예비 수집 잔재 정리 (최신 크롤만 표출)
        cls._purge_stale_backup_rows('MEGABOX', log_theater_name, parsed_items)

        return len(to_create) + len(to_update), errors

    @classmethod
    def create_from_lotte_log(cls, log, target_titles=None, title_map=None):
        """
        LotteScheduleLog 데이터를 파싱하여 MovieSchedule 생성
        Returns: (created_count + updated_count, error_list)
        """
        from datetime import datetime, timedelta
        from django.utils import timezone

        # [Robust JSON Parse]
        json_data = log.response_json or {}
        if isinstance(json_data, str):
            try:
                import json
                json_data = json.loads(json_data)
            except:
                json_data = {}
        
        # 롯데시네마 API 구조 분석 필요 - 실제 API 응답에 따라 수정 필요
        # 일반적인 극장 API 패턴: Movies 리스트 > PlaySchedules 리스트
        movies = json_data.get("Movies", [])
        play_list = json_data.get("PlaySeqs", [])
        items = json_data.get("Items", [])
        
        schedule_data = []
        
        # Priority 1: Movies (List)
        if movies and isinstance(movies, list):
            schedule_data = movies
        # Priority 2: PlaySeqs (Dict or List)
        elif play_list:
            if isinstance(play_list, dict) and "Items" in play_list:
                schedule_data = play_list["Items"]
            elif isinstance(play_list, list):
                schedule_data = play_list
        # Priority 3: Items (List)
        elif items and isinstance(items, list):
            schedule_data = items
            
        if not isinstance(schedule_data, list):
            schedule_data = []
        
        parsed_items = []
        target_dates = set()
        errors = []
        
        play_date_str = json_data.get("RepresentationDate") or log.query_date
        
        for item in schedule_data:
            try:
                # 롯데는 필드명이 다양함. MovieNameKR, ScreenNameKR 등
                movie_title = item.get("MovieNameKR") or item.get("MovieName") or item.get("FilmName", "제목없음")

                # 롯데 특수상영(무대인사·관객시사회 등)은 AccompanyTypeNameKR 필드에 표기됨
                special_event_tags = cls.extract_special_event_tags(item.get("AccompanyTypeNameKR"))

                # [Filtering Logic] 크롤 대상 영화만 수집 (0828 — CGV 쪽과 동일 규칙)
                if target_titles:
                    is_target = False
                    matched_target = None
                    for t in target_titles:
                        if cls.title_matches(t, movie_title):
                                is_target = True
                                matched_target = t
                                break
                    if is_target and matched_target != movie_title:
                        print(f"      [Title Match] \"{movie_title}\" <- target: \"{matched_target}\"")
                    if not is_target:
                        continue

                # 시간 파싱
                start_tm_str = item.get("StartTime")
                play_dt_val = item.get("PlayDt") 
                end_dt_str = item.get("EndTime") or item.get("EndDt")
                
                # StartTime이 없으면 PlayDt가 DateTime일 수도 있음.
                # 그러나 에러 로그상 "11:45" 같은 값이 들어옴.
                
                start_dt_str = start_tm_str or play_dt_val
                
                if not start_dt_str: continue
                
                # [NEW] Play Date from Log
                try:
                     parsed_play_date = datetime.strptime(log.query_date, "%Y%m%d").date()
                except:
                     parsed_play_date = None

                # 만약 시간만 있다면 (length < 8 등) 날짜 붙여주기
                start_dt = None
                if len(start_dt_str) < 10:
                    base_date = play_date_str
                    if not base_date and play_dt_val and len(play_dt_val) >= 10:
                        base_date = play_dt_val[:10]

                    if base_date:
                        # 24+ 시간 처리 (한국 영화관 자정 초과 표현: 24:00, 24:30 등)
                        raw_time = start_dt_str.replace(":", "")
                        if len(raw_time) >= 2 and raw_time[:2].isdigit() and int(raw_time[:2]) >= 24:
                            shour = int(raw_time[:2])
                            smin = int(raw_time[2:4]) if len(raw_time) >= 4 else 0
                            bd_fmt = "%Y-%m-%d" if "-" in base_date else "%Y%m%d"
                            base_naive = datetime.strptime(base_date, bd_fmt)
                            start_dt = timezone.make_aware(base_naive + timedelta(hours=shour, minutes=smin))
                        else:
                            start_dt_str = f"{base_date} {start_dt_str}"

                if start_dt is None:
                    try:
                        if "T" in start_dt_str:
                            start_dt = datetime.fromisoformat(start_dt_str)
                        else:
                            start_dt = datetime.strptime(start_dt_str, "%Y-%m-%d %H:%M:%S")
                    except:
                        try:
                            start_dt = datetime.strptime(start_dt_str, "%Y-%m-%d %H:%M")
                        except:
                            try:
                                start_dt = datetime.strptime(start_dt_str, "%Y%m%d %H:%M")
                            except:
                                try:
                                    start_dt = datetime.strptime(start_dt_str, "%Y-%m-%d")
                                except:
                                    start_dt = datetime.strptime(start_dt_str, "%Y%m%d")
                    start_dt = timezone.make_aware(start_dt)
                
                if end_dt_str:
                    try:
                        # EndTime이 "HH:MM" 형식일 때 (24:xx, 25:xx 같은 자정 초과 표현 처리)
                        if len(end_dt_str) < 10:
                            raw_time = end_dt_str.replace(":", "")
                            ehour = int(raw_time[:2]) if len(raw_time) >= 2 else 0
                            emin = int(raw_time[2:4]) if len(raw_time) >= 4 else 0
                            base_date_str = play_dt_val[:10] if play_dt_val else start_dt.strftime("%Y-%m-%d")
                            base_naive = datetime.strptime(base_date_str, "%Y-%m-%d")
                            end_dt = timezone.make_aware(base_naive + timedelta(hours=ehour, minutes=emin))
                        elif "T" in end_dt_str:
                            end_dt = timezone.make_aware(datetime.fromisoformat(end_dt_str))
                        else:
                            try:
                                end_dt = timezone.make_aware(datetime.strptime(end_dt_str, "%Y-%m-%d %H:%M:%S"))
                            except:
                                end_dt = timezone.make_aware(datetime.strptime(end_dt_str, "%Y-%m-%d %H:%M"))
                    except:
                        end_dt = start_dt + timedelta(hours=2)
                else:
                    end_dt = start_dt + timedelta(hours=2) # Default duration
                
                target_dates.add(start_dt.date())

                remain_seat = int(item.get("BookingSeatCount") or item.get("SeatCount") or 0)
                total_seat = int(item.get("TotalSeatCount") or 0)
                is_available = remain_seat > 0
                
                # 상영관 정보
                screen_name = cls.normalize_screen_name(item.get("ScreenNameKR") or item.get("ScreenName") or item.get("TheaterName", "미지정"))
                
                # Title Consistency Logic
                clean_title, extracted_tags = cls.parse_and_normalize_title(movie_title)
                # 롯데 특수상영 이벤트(무대인사 등)를 태그에 추가
                if special_event_tags:
                    extracted_tags = list(extracted_tags) + [t for t in special_event_tags if t not in extracted_tags]
                # E004: 특별 상영 포맷 — 롯데는 필름(FilmNameKR)·관구분(ScreenDivisionNameKR)·사운드(SoundTypeNameKR)·관브랜드에서 검출
                format_tags = cls.extract_format_tags(
                    item.get("FilmNameKR"), item.get("ScreenDivisionNameKR"),
                    item.get("SoundTypeNameKR"), item.get("BrandNm_KR"),
                )
                if format_tags:
                    extracted_tags = list(extracted_tags) + [t for t in format_tags if t not in extracted_tags]
                # C005: 자막/더빙 구분 — 롯데는 TranslationDivisionCode(50=더빙, 100=자막,
                # 900=해당없음)로 내려준다 (NameKR은 항상 null — 운영 응답 실측)
                trans_code = item.get("TranslationDivisionCode")
                sub_tag = {50: "더빙", 100: "자막"}.get(trans_code)
                if sub_tag and sub_tag not in extracted_tags:
                    extracted_tags = list(extracted_tags) + [sub_tag]

                final_title = clean_title
                if title_map is not None:
                    norm_title = cls.normalize_title(clean_title)
                    if norm_title in title_map:
                        final_title = title_map[norm_title]
                    else:
                        title_map[norm_title] = clean_title
                
                parsed_items.append({
                    'brand': 'LOTTE',
                    'theater_name': log.theater_name,
                    'screen_name': screen_name,
                    'start_time': start_dt,
                    'end_time': end_dt,
                    'movie_title': final_title,
                    'tags': extracted_tags,
                    'tags': extracted_tags,
                    'is_booking_available': is_available,
                    'total_seats': total_seat,
                    'remaining_seats': remain_seat,
                    'play_date': parsed_play_date
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
                # 재변환 시 태그(E004 포맷 포함)·좌석·상영일자도 최신값으로 갱신
                obj.tags = item['tags']
                obj.total_seats = item['total_seats']
                obj.remaining_seats = item['remaining_seats']
                obj.play_date = item['play_date']
                to_update.append(obj)
            else:
                to_create.append(cls(**item))

        if to_create:
            cls.objects.bulk_create(to_create, ignore_conflicts=True)
        if to_update:
            cls.objects.bulk_update(to_update, ['is_booking_available', 'end_time', 'movie_title', 'tags', 'updated_at', 'total_seats', 'remaining_seats', 'play_date'])

        # C002: 이전 영진위 예비 수집 잔재 정리 (최신 크롤만 표출)
        cls._purge_stale_backup_rows('LOTTE', log.theater_name, parsed_items)

        return len(to_create) + len(to_update), errors


class CrawlerScheduleConfig(models.Model):
    """C007: 자동(데일리) 크롤링 스케줄 설정 — 단일 행으로 운용.

    크론은 5분마다 run_scheduled_crawls 디스패처를 돌리고, 디스패처가 이 설정을
    읽어 실행 시각(다중)·수집 일수·On/Off를 반영한다. last_runs 는 같은 시각이
    하루에 두 번 돌지 않게 하는 실행 기록({"13:00": "2026-08-25"}).
    """
    enabled = models.BooleanField(default=True)
    run_times = models.JSONField(default=list)    # ["13:00", "17:30"] (HH:MM, 다중)
    crawl_days = models.IntegerField(default=3)   # 수집 일수: 내일(D+1) ~ D+N
    last_runs = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    @classmethod
    def get(cls):
        obj = cls.objects.first()
        if obj is None:
            obj = cls.objects.create(enabled=True, run_times=["13:00"], crawl_days=3)
        return obj


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

    TRIGGER_CHOICES = (
        ('MANUAL', 'Manual'),
        ('SCHEDULED', 'Scheduled'),
        ('TRANSFORM', 'Transform'),
    )

    created_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    trigger_type = models.CharField(max_length=20, choices=TRIGGER_CHOICES, default='MANUAL')
    
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


class CrawlTargetMovie(models.Model):
    """
    크롤링 대상 영화 목록.
    사용자가 입력한 제목과 정규화 매칭(normalize_title)으로 크롤된 영화 중
    일치하는 것만 MovieSchedule에 저장한다.
    """
    MOVIE_TYPE_CHOICES = [('main', '주영화'), ('competitor', '경쟁작')]

    title = models.CharField(max_length=200, verbose_name="영화 제목")
    movie_type = models.CharField(
        max_length=10, choices=MOVIE_TYPE_CHOICES, default='main', verbose_name="구분"
    )
    is_active = models.BooleanField(default=True, verbose_name="활성화")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = "크롤 대상 영화"

    def __str__(self):
        return f"{'✅' if self.is_active else '⏸'} [{self.get_movie_type_display()}] {self.title}"


class MegaboxDistributorAccount(models.Model):
    """
    메가박스 윙업(M SCORE) 배급사 로그인 계정.
    하드코딩 대신 DB로 관리 — 스코어 크롤 시 활성 계정으로 로그인한다.
    """
    name = models.CharField(max_length=100, verbose_name="배급사명")
    user = models.CharField(max_length=50, verbose_name="아이디")
    password = models.CharField(max_length=100, verbose_name="비밀번호")
    is_active = models.BooleanField(default=True, verbose_name="활성화")
    sort_order = models.IntegerField(default=0, verbose_name="정렬순서")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['sort_order', 'id']
        verbose_name = "메가박스 배급사 계정"

    def __str__(self):
        return f"{'✅' if self.is_active else '⏸'} {self.name} ({self.user})"


class CineQDistributorAccount(models.Model):
    """
    씨네큐 스코어(score.cineq.co.kr) 배급사 로그인 계정.
    하드코딩 대신 DB로 관리 — 스코어 크롤 시 활성 계정으로 로그인한다.
    """
    name = models.CharField(max_length=100, verbose_name="배급사명")
    user = models.CharField(max_length=100, verbose_name="아이디")
    password = models.CharField(max_length=100, verbose_name="비밀번호")
    is_active = models.BooleanField(default=True, verbose_name="활성화")
    sort_order = models.IntegerField(default=0, verbose_name="정렬순서")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['sort_order', 'id']
        verbose_name = "씨네큐 배급사 계정"

    def __str__(self):
        return f"{'✅' if self.is_active else '⏸'} {self.name} ({self.user})"


class KobisDistributorAccount(models.Model):
    """
    KOBIS(영화관입장권통합전산망) 배급사 회원 계정.
    회원용통계(영화사별)상세 수집 시 활성 계정으로 로그인한다.
    """
    name = models.CharField(max_length=100, verbose_name="배급사명")
    user = models.CharField(max_length=100, verbose_name="아이디")
    password = models.CharField(max_length=100, verbose_name="비밀번호")
    aprv_no = models.CharField(max_length=100, blank=True, default="",
                               verbose_name="인증번호")
    is_active = models.BooleanField(default=True, verbose_name="활성화")
    sort_order = models.IntegerField(default=0, verbose_name="정렬순서")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['sort_order', 'id']
        verbose_name = "KOBIS 배급사 계정"

    def __str__(self):
        return f"{'✅' if self.is_active else '⏸'} {self.name} ({self.user})"
