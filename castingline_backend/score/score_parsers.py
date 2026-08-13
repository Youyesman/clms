import re
import pandas as pd
import numpy as np
from django.db import transaction
from django.db.models import Q, Value
from django.db.models.functions import Replace, Lower
from .models import Score, Movie, Client
from client.models import Theater
from collections import Counter
from order.models import OrderList, Order, recalc_last_screening_dates
from datetime import datetime, date


# 스코어를 올릴 수 없는 거래처 구분. 극장이 아닌 거래처(배급사/제작사/매입처)는
# 극장명이 같더라도 스코어 매칭/저장 대상에서 제외한다.
NON_THEATER_CLIENT_TYPES = ["배급사", "제작사", "매입처"]


# 제목 매칭용 정규화: 공백 + 특수문자(-, :, ~, ·, 콤마 등) 제거 후 소문자.
# 예) "신극장판 은혼-요시와라 대염상" 과 "신극장판은혼:요시와라대염상" 이 같아진다.
_TITLE_NORM_RE = re.compile(r"[\s\-:~·,.\'\"’“”!?/\\|()\[\]{}&+_=]+")


def _norm_title(s):
    if not s:
        return ""
    return _TITLE_NORM_RE.sub("", str(s)).lower()


def _read_excel(file, **kwargs):
    """엑셀을 읽되 openpyxl이 손상된 셀로 실패하면 calamine 엔진으로 재시도한다.

    일부 극장(예: 롯데) 내보내기 파일은 셀 타입이 '숫자'인데 값은 '7,000' 처럼
    콤마가 포함된 문자열로 저장돼 있어 openpyxl 이 int('7,000') 캐스팅 중
    ValueError 로 죽는다. calamine(Rust 기반)은 이런 셀을 문자열로 관대하게 읽는다.
    """
    try:
        return pd.read_excel(file, **kwargs)
    except Exception:
        try:
            file.seek(0)
        except Exception:
            pass
        return pd.read_excel(file, engine="calamine", **kwargs)


# ==========================================
# 1. 성능 최적화 및 지능형 중복 해결 매칭 클래스
# ==========================================


class BulkMatcher:
    def __init__(self, theater_kind, exclude_kinds=None, all_kinds=False, relaxed=None):
        """
        데이터를 메모리에 로드하고 중복 지점을 지능적으로 처리하기 위한 구조 생성

        exclude_kinds가 주어지면 해당 theater_kind들을 제외한 전체 극장을 로드한다.
        (영진위 일반극장 업로드 시 CGV/메가박스/롯데를 제외하기 위해 사용)
        all_kinds=True면 체인 포함 전 극장을 로드한다. (영진위 대사 — S001)
        relaxed는 영진위식 완화 매칭(영진위극장명/관번호 폴백) 사용 여부.
        기본값은 exclude_kinds/all_kinds 지정 시 True.
        """
        self.kind = theater_kind
        if all_kinds:
            clients = Client.objects.all()
        elif exclude_kinds:
            clients = Client.objects.exclude(theater_kind__in=exclude_kinds)
        else:
            clients = Client.objects.filter(theater_kind=theater_kind)

        # 스코어는 '극장' 거래처에만 들어갈 수 있다. 배급사/제작사/매입처는 이름이 같아도
        # 매칭 후보에서 제외한다. (예: 배급사 '에무시네마 앤 카페' 가 극장으로 오인 매칭)
        # 거래처 구분이 비어있는 옛 극장 데이터는 계속 매칭되도록 exclude 형태로 거른다.
        clients = clients.exclude(client_type__in=NON_THEATER_CLIENT_TYPES)

        self.relaxed_aud = (
            relaxed if relaxed is not None else bool(exclude_kinds) or all_kinds
        )
        self.name_to_clients = {}  # 정규화이름 -> [Client 객체 리스트]

        for c in clients:
            names = set()
            if c.excel_theater_name:
                names.add(c.excel_theater_name.replace(" ", "").lower())
            if c.excel_theater_name2:
                names.add(c.excel_theater_name2.replace(" ", "").lower())
            if c.client_name:
                names.add(c.client_name.replace(" ", "").lower())
            # 영진위극장명: 영진위 업로드(relaxed) 전용 명시적 매핑 키
            if self.relaxed_aud and c.kofic_theater_name:
                names.add(c.kofic_theater_name.replace(" ", "").lower())
            if self.relaxed_aud and c.kofic_theater_name2:
                names.add(c.kofic_theater_name2.replace(" ", "").lower())

            for name in names:
                if name not in self.name_to_clients:
                    self.name_to_clients[name] = []
                self.name_to_clients[name].append(c)

        # 상영관 로드 (Key: (client_id, 정규화된 관이름))
        theaters = list(
            Theater.objects.annotate(
                name_norm=Lower(Replace("auditorium_name", Value(" "), Value("")))
            )
        )
        self.theater_dict = {(t.client_id, t.name_norm): t for t in theaters}

        # 영진위관이름 명시적 인덱스 + 관 번호 보조 인덱스 (relaxed 모드 전용)
        # 영진위 관명("산천어관" 등)은 영진위관이름 필드로 매핑하고,
        # "02관" vs DB "2관" 같은 표기 차이는 관 번호로 폴백 매칭한다.
        self.theater_by_kofic = {}  # (client_id, 정규화된 영진위관이름) -> Theater
        self.theater_by_num = {}    # (client_id, 관번호) -> Theater
        if self.relaxed_aud:
            for t in theaters:
                if t.kofic_auditorium_name:
                    k = (t.client_id, t.kofic_auditorium_name.replace(" ", "").lower())
                    self.theater_by_kofic[k] = t
                num = self._extract_aud_num(t.auditorium_name)
                if num is None:
                    num = self._extract_aud_num(t.auditorium)  # 코드(예: '004') 폴백
                if num is None:
                    continue
                key = (t.client_id, num)
                # "N관" 정확 명칭을 우선 채택 (접미사 있는 명칭보다 우선)
                name_norm = (t.auditorium_name or "").replace(" ", "")
                if key not in self.theater_by_num or name_norm == f"{num}관":
                    self.theater_by_num[key] = t

        # 영화 로드 (전체 속성 필드 반영). title_norm 은 공백+특수문자 제거 정규화.
        # title_pure_norm 은 포맷 괄호((디지털 2D) 등)를 뗀 순수 제목의 정규화 —
        # 엑셀 제목에 행사명 접두/접미가 붙었을 때 역방향 포함 매칭에 쓴다 (S001).
        self.movie_list = list(Movie.objects.all())
        for _m in self.movie_list:
            _m.title_norm = _norm_title(_m.title_ko)
            _m.title_pure_norm = _norm_title(re.sub(r"\(.*?\)", "", _m.title_ko or ""))

    @staticmethod
    def _extract_aud_num(s):
        """관 이름/코드에서 관 번호를 추출. '02관'->2, '2관(삼척관)'->2, '004'->4, '산천어관'->None"""
        if not s:
            return None
        s = str(s)
        m = re.search(r"(\d+)\s*관", s)
        if m:
            return int(m.group(1))
        m = re.fullmatch(r"\s*0*(\d+)\s*", s)  # 순수 숫자/코드
        if m:
            return int(m.group(1))
        return None

    def _match_theater_logic(self, client_id, raw_aud):
        """내부용: 특정 클라이언트 내에서 상영관 매칭 시도 (정제 규칙 포함)"""
        if not client_id or not raw_aud:
            return None
        raw_aud_str = str(raw_aud).strip()

        # 0. 영진위관이름 명시적 매핑 (relaxed 모드 최우선)
        if self.relaxed_aud:
            t = self.theater_by_kofic.get(
                (client_id, raw_aud_str.replace(" ", "").lower())
            )
            if t:
                return t

        # 1. 전체 일치
        t = self.theater_dict.get((client_id, raw_aud_str.replace(" ", "").lower()))
        if t:
            return t

        # 2. 씨네큐 룰: (리클라이너)1 -> 1관
        match_num = re.search(r"\)(\d+)", raw_aud_str)
        if match_num:
            t = self.theater_dict.get((client_id, f"{match_num.group(1)}관"))
            if t:
                return t

        # 3. 일반 정제: 첫 공백, [, ( 이전 텍스트
        clean_core = re.split(r"[\[\(\s]", raw_aud_str)[0]
        t = self.theater_dict.get((client_id, clean_core.replace(" ", "").lower()))
        if t:
            return t

        # 4. relaxed(영진위) 폴백: 관 번호로 매칭 ("02관"=="2관", "가람 2관"=="2관(삼척관)")
        if self.relaxed_aud:
            num = self._extract_aud_num(raw_aud_str)
            if num is not None:
                t = self.theater_by_num.get((client_id, num))
                if t:
                    return t

        return None

    def check_client_and_theater(self, raw_client, raw_aud):
        """
        ✅ 중복 해결 로직: 극장명이 중복되어도 관 이름으로 유일한 극장 하나를 찾아냄.
        영진위(relaxed) 모드에서는 극장명을 client_name/excel_theater_name/영진위극장명으로
        정확 매칭한다. (표기가 다른 극장은 영진위극장명 필드에 등록해 매핑)
        """
        norm_c = str(raw_client).replace(" ", "").lower()
        candidates = self.name_to_clients.get(norm_c, [])

        if not candidates:
            return None, None, f"등록안된 {self.kind}({raw_client})"

        # 1. 후보가 단 하나인 경우
        if len(candidates) == 1:
            client = candidates[0]
            theater = self._match_theater_logic(client.id, raw_aud)
            if theater:
                return client, theater, None
            return client, None, f"관 정보 없음({raw_aud})"

        # 2. 후보가 여러 개인 경우 (예: 코엑스 객체 2개)
        matches = []
        for c in candidates:
            t = self._match_theater_logic(c.id, raw_aud)
            if t:
                matches.append((c, t))

        # 💡 관 이름으로 유일하게 매칭되는 극장을 찾았을 때 (중복 해결 성공!)
        if len(matches) == 1:
            return matches[0][0], matches[0][1], None

        # 💡 관 이름으로도 못 찾았거나, 여전히 중복일 때
        dup_names = ", ".join([c.client_name for c in candidates])
        return None, None, f"중복된 극장 설정({dup_names})"

    def find_movie(self, raw_title, type_str, original_excel_movie_text):
        """
        ✅ 제목 매칭 고도화:
        SOUNDX 등 비관리 속성(괄호 내용)을 제거하고 순수 제목으로 매칭
        """
        # 1. 속성 추출 (수정된 7개 필드 기준)
        attr = parse_screening_attributes(f"{original_excel_movie_text} {type_str}")

        # 2. 제목 정규화: 괄호와 그 안의 텍스트(SOUNDX 등) 무조건 삭제
        pure_title = re.sub(r"\(.*?\)", "", raw_title).strip()
        norm_raw = _norm_title(pure_title)

        def match_logic(movie_list):
            for m in movie_list:
                # 1순위: 7개 전체 속성 정확히 일치
                if (
                    m.media_type == attr["media_type"]
                    and m.audio_mode == attr["audio_mode"]
                    and m.viewing_dimension == attr["viewing_dimension"]
                    and m.screening_type == attr["screening_type"]
                    and m.dx4_viewing_dimension == attr["dx4_viewing_dimension"]
                    and m.imax_l == attr["imax_l"]
                    and m.screen_x == attr["screen_x"]
                ):
                    return m

            for m in movie_list:
                # 2순위: 유연한 매칭 (2D/자막 DB 공백 허용)
                # 고정 속성 체크
                if not (
                    m.media_type == attr["media_type"]
                    and m.screening_type == attr["screening_type"]
                    and m.dx4_viewing_dimension == attr["dx4_viewing_dimension"]
                    and m.imax_l == attr["imax_l"]
                    and m.screen_x == attr["screen_x"]
                ):
                    continue

                audio_ok = (m.audio_mode == attr["audio_mode"]) or (not m.audio_mode)
                view_ok = (
                    (m.viewing_dimension == "2D" or not m.viewing_dimension)
                    if attr["viewing_dimension"] == "2D"
                    else (m.viewing_dimension == attr["viewing_dimension"])
                )

                if audio_ok and view_ok:
                    return m
            return None

        candidates = [m for m in self.movie_list if norm_raw in m.title_norm]

        # 역방향 폴백 (S001): 정방향(엑셀 제목 ⊂ DB 제목) 후보가 없으면,
        # CLMS 등록 영화명이 엑셀 제목 안에 포함되는 영화를 찾는다.
        # 예) "[2026독립예술영화상영] 지느러미 (디지털 2D)" → 등록영화 "지느러미(디지털2D)".
        # 제목 앞뒤에 괄호·대괄호 등으로 행사명이 어떻게 붙어도 매칭된다.
        # 짧은 제목의 오인식을 줄이기 위해 포함되는 등록 제목이 가장 긴 것만 남긴다.
        if not candidates and norm_raw:
            reverse = [
                m
                for m in self.movie_list
                if m.title_pure_norm and m.title_pure_norm in norm_raw
            ]
            if reverse:
                longest = max(len(m.title_pure_norm) for m in reverse)
                candidates = [
                    m for m in reverse if len(m.title_pure_norm) == longest
                ]

        matched = match_logic(candidates)
        if not matched:
            primary = next((m for m in candidates if m.is_primary_movie), None)
            if primary:
                matched = match_logic(
                    [
                        m
                        for m in self.movie_list
                        if m.primary_movie_code == primary.movie_code
                    ]
                )

        parts = [attr["media_type"]]
        for key in [
            "viewing_dimension",
            "screening_type",
            "dx4_viewing_dimension",
            "imax_l",
            "screen_x",
        ]:
            if attr[key]:
                parts.append(attr[key])
        return matched, f"{pure_title} ({' '.join(filter(None, parts))})"


# ==========================================
# 2. 유틸리티 함수 (변경된 필드 사양 반영)
# ==========================================


def parse_screening_attributes(text):
    """
    7개 필드 사양에 맞춘 속성 추출 로직
    """
    attr = {
        "media_type": "디지털",
        "audio_mode": None,  # 자막/더빙
        "viewing_dimension": "2D",  # 2D/3D/4D
        "screening_type": None,  # IMAX/ATMOS
        "dx4_viewing_dimension": None,  # 4DX/Super-4D/Dolby
        "imax_l": None,  # IMAX-L
        "screen_x": None,  # SCREEN-X
    }
    if not text or pd.isna(text):
        return attr
    u = str(text).upper().replace(" ", "")

    # 1. viewing_dimension
    if "3D" in u:
        attr["viewing_dimension"] = "3D"
    elif "4D" in u:
        attr["viewing_dimension"] = "4D"

    # 2. audio_mode
    if "자막" in u:
        attr["audio_mode"] = "한글자막"
    elif "더빙" in u:
        attr["audio_mode"] = "더빙"

    # 3. screening_type (IMAX/ATMOS)
    if "IMAX" in u and "IMAX-L" not in u and "IMAXL" not in u:
        attr["screening_type"] = "IMAX"
    elif "ATMOS" in u:
        attr["screening_type"] = "ATMOS"

    # 4. dx4_viewing_dimension (4DX/Super-4D/Dolby)
    if "4DX" in u or "4-DX" in u:
        attr["dx4_viewing_dimension"] = "4DX"
    elif "SUPER4D" in u:
        attr["dx4_viewing_dimension"] = "Super-4D"
    elif "DOLBY" in u:
        attr["dx4_viewing_dimension"] = "Dolby"

    # 5. imax_l
    if "IMAX-L" in u or "IMAXL" in u:
        attr["imax_l"] = "IMAX-L"

    # 6. screen_x
    if "SCREENX" in u or "SCREEN-X" in u:
        attr["screen_x"] = "SCREEN-X"

    return attr


# ==========================================
# 3. 파서 본체 (CGV 날짜 A5 고정 등)
# ==========================================


# 영진위(일반극장) 업로드 시 제외할 멀티플렉스 체인
KOFIC_EXCLUDE_KINDS = ["CGV", "메가박스", "롯데", "씨네큐"]


def _is_kofic_file(file):
    """엑셀 내용으로 영진위 '회원용통계(영화사별)상세' 양식인지 판별한다."""
    if file.name.endswith(".csv"):
        return False
    try:
        file.seek(0)
        df = _read_excel(file, header=None, nrows=3)
        text = " ".join(str(v) for v in df.fillna("").values.flatten())
        return ("회원용통계" in text) or (
            "스크린" in text and "좌석수" in text and "발권금액" in text
        )
    except Exception:
        return False
    finally:
        try:
            file.seek(0)
        except Exception:
            pass


def _is_cgv_file(file):
    """엑셀/CSV 내용으로 CGV '관객현황' 양식인지 판별한다. (파일명에 CGV가 없는 ScoreMail 등 대응)"""
    try:
        file.seek(0)
        if file.name.endswith(".csv"):
            df = pd.read_csv(file, header=None, nrows=8, dtype=str)
        else:
            df = _read_excel(file, header=None, nrows=8)
        text = " ".join(str(v) for v in df.fillna("").values.flatten())
        return "CGV" in text and ("관객현황" in text or "CJ CGV" in text)
    except Exception:
        return False
    finally:
        try:
            file.seek(0)
        except Exception:
            pass


def handle_score_file_upload(file, movie_id=None):
    name = file.name
    # 영진위(일반극장)는 파일명 또는 내용으로 판별 (영화명 컬럼이 없어 movie_id 필수)
    if "영진위" in name or _is_kofic_file(file):
        result = preview_kofic_format(file, movie_id)
        file_type = "영진위"
    elif "롯데" in name:
        result = preview_lotte_format(file)
        file_type = "롯데"
    elif "메가박스" in name:
        result = preview_megabox_format(file)
        file_type = "메가박스"
    elif "씨네큐" in name:
        result = preview_cineq_format(file)
        file_type = "씨네큐"
    # CGV: 파일명에 CGV가 없어도 내용으로 판별 (예: ScoreMail_백룸_YYYYMMDD.xlsx)
    elif "CGV" in name or _is_cgv_file(file):
        result = preview_cgv_format(file)
        file_type = "CGV"
    else:
        return {"error": "지원하지 않는 파일 양식입니다."}

    # 프론트가 멀티 종류별 저장 정책(메일함 파일명 단위 교체 — M001)을 판단할 수 있게 전달
    if "error" not in result:
        result["file_type"] = file_type
    return result


def _is_excluded_kofic_theater(theater_name):
    """영진위 극장명이 CGV/메가박스/롯데/씨네큐 체인인지 판별 (제외 대상)."""
    norm = str(theater_name).replace(" ", "")
    low = norm.lower()
    return (
        norm.startswith("CGV")
        or norm.startswith("메가박스")
        or norm.startswith("롯데")
        # CINE de CHEF(씨네 드 쉐프)는 메가박스 프리미엄 브랜드 → 제외
        or low.startswith("cinedechef")
        or "씨네드쉐프" in norm
        or "씨네드셰프" in norm
        # 씨네큐(CineQ) — 별도 수집기로 커버. 영진위 표기: '씨네Q 보은',
        # '칠곡호이영화관(씨네Q)' 처럼 중간에 등장하기도 해 contains 로 판별.
        # 단, 씨네큐브(Cinecube 광화문)는 무관한 예술극장이므로 제외하지 않는다.
        or "씨네q" in low
        or "cineq" in low
        or ("씨네큐" in norm and "씨네큐브" not in norm)
    )


def preview_kofic_format(file, movie_id, include_chains=False):
    """
    영진위 '회원용통계(영화사별)상세' 양식 파서.
    - 파일에 영화명 컬럼이 없으므로 사용자가 선택한 movie_id로 전체 행을 매칭한다.
    - CGV/메가박스/롯데/씨네큐 체인 행은 제외하고 나머지 일반극장 데이터만 추출한다.
      단 include_chains=True(스코어 검증 대사용)면 체인도 포함해 전 극장을 매칭한다.
    - 여러 시트(날짜별 분할)를 모두 합산 처리한다.

    레이아웃(0-indexed):
      row0: 제목 / row1: 날짜|지역|극장명|스크린|좌석수|전체|...|회차 / row2: 발권금액|매출액|관객수...
      data: col0 날짜, col1 지역, col2 극장명, col3 스크린, col4 좌석수, col5 발권금액(요금),
            col6/7 전체 매출액/관객수, 이후 1~8회 (매출액, 관객수) 쌍
    """
    if not movie_id:
        return {"error": "영진위(일반극장) 파일은 영화를 먼저 선택해야 합니다."}

    try:
        movie = Movie.objects.get(id=movie_id)
    except (Movie.DoesNotExist, ValueError, TypeError):
        return {"error": "선택한 영화를 찾을 수 없습니다."}

    try:
        if include_chains:
            matcher = BulkMatcher(theater_kind="일반극장", all_kinds=True)
        else:
            matcher = BulkMatcher(
                theater_kind="일반극장", exclude_kinds=KOFIC_EXCLUDE_KINDS
            )

        # 모든 시트를 읽어 합산 (영진위는 날짜별로 시트가 분할될 수 있음)
        sheets = _read_excel(file, sheet_name=None, header=None)

        preview_data = []
        for _sheet_name, df in sheets.items():
            for _, row in df.iterrows():
                date_raw = str(row.iloc[0]).strip() if len(row) > 0 else ""
                # 데이터 행만 처리 (날짜가 YYYYMMDD 8자리 숫자인 행)
                if not re.fullmatch(r"\d{8}", date_raw):
                    continue

                theater_name = str(row.iloc[2]).strip()
                # CGV/메가박스/롯데/씨네큐 체인은 제외 (대사 모드에서는 포함)
                if not include_chains and _is_excluded_kofic_theater(theater_name):
                    continue

                raw_aud = str(row.iloc[3]).strip()
                entry_date = f"{date_raw[:4]}-{date_raw[4:6]}-{date_raw[6:8]}"
                # 빈 셀은 NaN 으로 읽히므로 0 으로 떨어뜨린다 (NaN은 truthy 라 or 0 로는 못 거름)
                fare_val = pd.to_numeric(row.iloc[5], errors="coerce")
                fare = 0 if pd.isna(fare_val) else int(fare_val)

                # 발권금액 0원(무료 발권) 행은 관객수 집계에서 제외
                if fare == 0:
                    continue

                # 극장/상영관 매칭 (영화는 사용자가 선택한 것으로 고정)
                client, theater, err_msg = matcher.check_client_and_theater(
                    theater_name, raw_aud
                )

                # 회차 1~8: 관객수 컬럼 = 7 + 2*h
                for h in range(1, 9):
                    vis_col = 7 + 2 * h
                    if vis_col >= len(row):
                        break
                    vis = pd.to_numeric(row.iloc[vis_col], errors="coerce")
                    # 빈 셀(NaN)/0 은 건너뛴다. NaN은 truthy 이므로 반드시 isna 로 먼저 판별.
                    if pd.isna(vis) or vis == 0:
                        continue

                    match_errs = []
                    if err_msg:
                        match_errs.append(err_msg)

                    preview_data.append(
                        {
                            "entry_date": entry_date,
                            "movie_name": movie.title_ko,
                            "movie_id": movie.id,
                            "client_name": (
                                client.client_name if client else theater_name
                            ),
                            "client_id": client.id if client else None,
                            "display_auditorium": (
                                f"{theater.auditorium}({theater.auditorium_name})"
                                if theater
                                else raw_aud
                            ),
                            "auditorium": theater.auditorium if theater else raw_aud,
                            "show_count": str(h).zfill(2),
                            "fare": fare,
                            "visitor": int(vis),
                            "is_matched": not match_errs,
                            "match_error": " / ".join(match_errs),
                        }
                    )
        return {"data": preview_data}
    except Exception as e:
        return {"error": f"영진위 분석 오류: {str(e)}"}


def preview_cgv_format(file):
    try:
        header_idx = 14
        df_full = (
            pd.read_csv(file, header=None)
            if file.name.endswith(".csv")
            else _read_excel(file, header=None)
        )
        df = (
            pd.read_csv(file, skiprows=header_idx)
            if file.name.endswith(".csv")
            else _read_excel(file, skiprows=header_idx)
        )

        # ✅ 상영일자 추출: A5 셀 (index 4)
        date_raw = str(df_full.iloc[4, 0]) if df_full.shape[0] > 4 else ""
        date_match = re.search(r"(\d{4}-\d{2}-\d{2})", date_raw)
        base_date = date_match.group(1) if date_match else "Unknown"

        matcher = BulkMatcher(theater_kind="CGV")
        cur_client, cur_movie, cur_aud = None, None, None
        preview_data = []
        show_cols = [
            "특회",
            "１회",
            "２회",
            "３회",
            "４회",
            "５회",
            "６회",
            "７회",
            "８회",
            "９회",
            "10회",
            "11회",
            "12회",
        ]

        for _, row in df.iterrows():
            # 극장명/영화명은 극장 블록 첫 줄에만 있고, 같은 극장의 다른 상영관 줄에는 비어있음.
            # 각 필드를 독립적으로 갱신해 직전 값이 유지되도록 한다.
            # (한 번에 묶어 갱신하면 빈칸이 'nan'으로 들어가 'CGVnan' 미매칭이 발생함)
            if pd.notna(row.get("상영관")):
                cur_aud = str(row["상영관"]).strip()
            if pd.notna(row.get("극장명")):
                cur_client = str(row["극장명"]).strip()
            if pd.notna(row.get("영화명")):
                cur_movie = str(row["영화명"]).strip()

            # 상영관 소계행("CGV 강남(계)" 등)은 데이터가 아니므로 건너뜀
            if cur_aud and "(계)" in cur_aud:
                continue

            price_raw = str(row.get("가격", ""))
            if "원" in price_raw:
                search_client = (
                    f"CGV{cur_client}"
                    if cur_client and "CGV" not in cur_client
                    else cur_client
                )
                # ✅ 지능형 극장/관 매칭 호출
                client, theater, err_msg = matcher.check_client_and_theater(
                    search_client, cur_aud
                )
                # "씨네드쉐프 용산"처럼 CGV 접두 없이 등록된 표기(엑셀 극장명2 등)는
                # 접두 매칭 실패 시 원본 극장명으로 재시도한다.
                if client is None and search_client != cur_client:
                    raw_client, raw_theater, raw_err = (
                        matcher.check_client_and_theater(cur_client, cur_aud)
                    )
                    if raw_client:
                        client, theater, err_msg = raw_client, raw_theater, raw_err
                movie, exp_title = matcher.find_movie(cur_movie, "", cur_movie)

                for i, col_name in enumerate(show_cols):
                    vis = pd.to_numeric(row.get(col_name), errors="coerce")
                    # 빈 셀(NaN)은 건너뜀 (NaN은 truthy라 별도 처리 필요)
                    if pd.notna(vis) and vis != 0:
                        match_errs = []
                        if not movie:
                            match_errs.append(f"영화 없음({exp_title})")
                        if err_msg:
                            match_errs.append(err_msg)

                        # ✅ 회차 포맷팅 (i가 0보다 크면 01, 02.. / 0이면 특회)
                        display_show_count = str(i).zfill(2) if i > 0 else "특회"

                        preview_data.append(
                            {
                                "entry_date": base_date,
                                "movie_name": movie.title_ko if movie else exp_title,
                                "movie_id": movie.id if movie else None,
                                "client_name": (
                                    client.client_name if client else cur_client
                                ),
                                "client_id": client.id if client else None,
                                "display_auditorium": (
                                    f"{theater.auditorium}({theater.auditorium_name})"
                                    if theater
                                    else cur_aud
                                ),
                                "auditorium": (
                                    theater.auditorium if theater else cur_aud
                                ),
                                "show_count": display_show_count,
                                "fare": int(re.sub(r"[^0-9]", "", price_raw) or 0),
                                "visitor": int(vis),
                                "is_matched": not match_errs,
                                "match_error": " / ".join(match_errs),
                            }
                        )
        return {"data": preview_data}
    except Exception as e:
        return {"error": f"CGV 분석 오류: {str(e)}"}


def preview_megabox_format(file):
    try:
        df = (
            pd.read_csv(file, skiprows=6)
            if file.name.endswith(".csv")
            else _read_excel(file, skiprows=6)
        )
        df.columns = df.columns.str.strip()
        df = df.dropna(subset=["지점", "상영일"])
        matcher = BulkMatcher(theater_kind="메가박스")
        # 메가박스 회차: 특회(0회) + 1~15회. 파일에 존재하는 회차 컬럼만 사용한다.
        show_cols = ["특회"] + [f"{i}회" for i in range(1, 16)]
        existing_show_cols = [col for col in show_cols if col in df.columns]
        id_vars = ["지점", "상영일", "관", "상영영화", "상영종류", "티켓가"]

        # 회차 컬럼 합보다 '합계'가 큰 행은 파일의 회차 컬럼 범위 밖 상영
        # (예: 컬럼이 5회까지인데 6회차 상영) — 잔여 관객을 1회차에 합산한다
        if "합계" in df.columns:
            show_sum = (
                df[existing_show_cols]
                .apply(pd.to_numeric, errors="coerce")
                .fillna(0)
                .sum(axis=1)
            )
            residual = (
                pd.to_numeric(df["합계"], errors="coerce").fillna(0) - show_sum
            ).clip(lower=0)
            if residual.gt(0).any():
                if "1회" not in df.columns:
                    df["1회"] = 0
                    existing_show_cols = [c for c in show_cols if c in df.columns]
                df["1회"] = (
                    pd.to_numeric(df["1회"], errors="coerce").fillna(0) + residual
                )

        df_melted = df.melt(
            id_vars=id_vars,
            value_vars=existing_show_cols,
            var_name="상영회차",
            value_name="매수",
        )
        df_melted["매수"] = pd.to_numeric(df_melted["매수"], errors="coerce")
        df_melted = df_melted.dropna(subset=["매수"]).query("매수 != 0")

        preview_data = []
        for _, row in df_melted.iterrows():
            # ✅ 지능형 매칭 호출
            client, theater, err_msg = matcher.check_client_and_theater(
                row["지점"], row["관"]
            )
            movie, exp_title = matcher.find_movie(
                str(row["상영영화"]).split("]")[-1].strip(),
                row["상영종류"],
                row["상영영화"],
            )

            match_errs = []
            if not movie:
                match_errs.append(f"영화 없음({exp_title})")
            if err_msg:
                match_errs.append(err_msg)

            # ✅ 회차 포맷팅
            val = str(row["상영회차"]).replace("회", "").strip()
            display_show_count = val.zfill(2) if val.isdigit() else val

            # NaN은 참으로 평가되므로 `or 0`로는 거를 수 없다 — notna로 방어
            fare_num = pd.to_numeric(
                str(row["티켓가"]).replace(",", ""), errors="coerce"
            )

            preview_data.append(
                {
                    "entry_date": str(row["상영일"]).split(" ")[0],
                    "movie_name": movie.title_ko if movie else exp_title,
                    "movie_id": movie.id if movie else None,
                    "client_name": client.client_name if client else str(row["지점"]),
                    "client_id": client.id if client else None,
                    "display_auditorium": (
                        f"{theater.auditorium}({theater.auditorium_name})"
                        if theater
                        else str(row["관"])
                    ),
                    "auditorium": theater.auditorium if theater else str(row["관"]),
                    "show_count": display_show_count,
                    "fare": int(fare_num) if pd.notna(fare_num) else 0,
                    "visitor": int(row["매수"]),
                    "is_matched": not match_errs,
                    "match_error": " / ".join(match_errs),
                }
            )
        return {"data": preview_data}
    except Exception as e:
        return {"error": str(e)}


def preview_lotte_format(file):
    try:
        df = (
            pd.read_csv(file, skiprows=2)
            if file.name.endswith(".csv")
            else _read_excel(file, skiprows=2)
        )
        df.columns = df.columns.str.strip()
        # 소계 행과 전체총계 행 모두 집계 대상에서 제외
        df = df[
            ~df.apply(
                lambda row: row.astype(str).str.contains("소계|총계").any(), axis=1
            )
        ]
        df["발권금액"] = pd.to_numeric(
            df["발권금액"].astype(str).str.replace(",", ""), errors="coerce"
        )
        df["매수"] = pd.to_numeric(df["매수"], errors="coerce")
        df = df.dropna(subset=["매수"]).query("매수 != 0")
        matcher = BulkMatcher(theater_kind="롯데")

        preview_data = []
        for _, row in df.iterrows():
            full_movie = str(row["영화"])
            raw_movie_name = full_movie.split("(")[0].strip()
            type_text = (
                full_movie.split("(")[1].replace(")", "") if "(" in full_movie else ""
            )

            # ✅ 지능형 매칭 호출
            client, theater, err_msg = matcher.check_client_and_theater(
                row["대표영화관"], row["상영관"]
            )
            movie, exp_title = matcher.find_movie(raw_movie_name, type_text, full_movie)

            match_errs = []
            if not movie:
                match_errs.append(f"영화 없음({exp_title})")
            if err_msg:
                match_errs.append(err_msg)

            # ✅ 회차 포맷팅
            val = str(row["상영회차"]).replace("회", "").strip()
            display_show_count = val.zfill(2) if val.isdigit() else val

            preview_data.append(
                {
                    "entry_date": str(row["상영일자"]),
                    "movie_name": movie.title_ko if movie else exp_title,
                    "movie_id": movie.id if movie else None,
                    "client_name": (
                        client.client_name if client else str(row["대표영화관"])
                    ),
                    "client_id": client.id if client else None,
                    "display_auditorium": (
                        f"{theater.auditorium}({theater.auditorium_name})"
                        if theater
                        else str(row["상영관"])
                    ),
                    "auditorium": theater.auditorium if theater else str(row["상영관"]),
                    "show_count": display_show_count,
                    "fare": (
                        int(row["발권금액"]) if pd.notna(row["발권금액"]) else 0
                    ),
                    "visitor": int(row["매수"]),
                    "is_matched": not match_errs,
                    "match_error": " / ".join(match_errs),
                }
            )
        return {"data": preview_data}
    except Exception as e:
        return {"error": str(e)}


def preview_cineq_format(file):
    try:
        df = pd.read_csv(file) if file.name.endswith(".csv") else _read_excel(file)
        matcher = BulkMatcher(theater_kind="씨네큐")
        cur_client, cur_movie, cur_date, cur_aud = None, None, None, None
        preview_data = []

        for _, row in df.iterrows():
            if pd.notna(row.get("영화관")):
                cur_client = str(row["영화관"]).strip()
            if pd.notna(row.get("영화명")):
                cur_movie = str(row["영화명"]).strip()
            if pd.notna(row.get("상영일")):
                cur_date = str(row["상영일"]).split(".")[0].strip()
            if pd.notna(row.get("상영관")):
                cur_aud = str(row["상영관"]).strip()
            fare_val = row.get("가격(원)")
            if pd.notna(fare_val) and str(cur_aud) != "계":
                search_client = (
                    f"씨네큐{cur_client}"
                    if cur_client and "씨네큐" not in cur_client
                    else cur_client
                )
                # ✅ 지능형 매칭 호출
                client, theater, err_msg = matcher.check_client_and_theater(
                    search_client, cur_aud
                )
                movie, exp_title = matcher.find_movie(cur_movie, "", cur_movie)
                if len(cur_date) == 8:
                    entry_date = f"{cur_date[:4]}-{cur_date[4:6]}-{cur_date[6:8]}"
                else:
                    entry_date = cur_date
                for h in range(1, 14):
                    vis = pd.to_numeric(row.get(f"{h}회"), errors="coerce")
                    if vis and vis != 0:
                        match_errs = []
                        if not movie:
                            match_errs.append(f"영화 없음({exp_title})")
                        if err_msg:
                            match_errs.append(err_msg)
                        preview_data.append(
                            {
                                "entry_date": entry_date,
                                "movie_name": movie.title_ko if movie else exp_title,
                                "movie_id": movie.id if movie else None,
                                "client_name": (
                                    client.client_name if client else cur_client
                                ),
                                "client_id": client.id if client else None,
                                "display_auditorium": (
                                    f"{theater.auditorium}({theater.auditorium_name})"
                                    if theater
                                    else cur_aud
                                ),
                                "auditorium": (
                                    theater.auditorium if theater else cur_aud
                                ),
                                "show_count": str(h).zfill(2),  # ✅ 01, 02..
                                "fare": int(fare_val),
                                "visitor": int(vis),
                                "is_matched": not match_errs,
                                "match_error": " / ".join(match_errs),
                            }
                        )
        return {"data": preview_data}
    except Exception as e:
        return {"error": f"씨네큐 분석 오류: {str(e)}"}


def parse_date(date_val):
    """문자열 또는 date 객체를 date 객체로 통일"""
    if isinstance(date_val, date):
        return date_val
    if isinstance(date_val, str):
        # 날짜 형식이 '2026-01-14' 형태라고 가정
        return datetime.strptime(date_val, "%Y-%m-%d").date()
    return None


def _build_order_changes(valid_data):
    """
    유효 데이터(valid_data)로부터 OrderList/Order 생성·수정 객체 목록을 만든다. (DB 미반영)
    반환: (ols_to_create, orders_to_create, orders_to_update)
    """
    # 1. 극장+영화 조합별 기간(min/max) 집계
    order_data_map = {}  # key: (client_id, movie_id), value: {min_date, max_date}
    all_movie_ids = set()

    for i in valid_data:
        m_id = i["movie_id"]
        c_id = i["client_id"]
        entry_date = parse_date(i["entry_date"])
        if not entry_date:
            continue

        all_movie_ids.add(m_id)
        o_key = (c_id, m_id)
        if o_key not in order_data_map:
            order_data_map[o_key] = {"min": entry_date, "max": entry_date}
        else:
            if entry_date < order_data_map[o_key]["min"]:
                order_data_map[o_key]["min"] = entry_date
            if entry_date > order_data_map[o_key]["max"]:
                order_data_map[o_key]["max"] = entry_date

    # 2. OrderList 처리 (OneToOneField 중복 제외 생성)
    existing_ol_movie_ids = set(
        OrderList.objects.filter(movie_id__in=list(all_movie_ids)).values_list(
            "movie_id", flat=True
        )
    )

    ols_to_create = []
    processed_movie_ids = set()  # 이번 배치 루프 내 중복 방지
    for m_id in all_movie_ids:
        if m_id not in existing_ol_movie_ids and m_id not in processed_movie_ids:
            min_start_date = min(
                [v["min"] for k, v in order_data_map.items() if k[1] == m_id]
            )
            ols_to_create.append(
                OrderList(
                    movie_id=m_id,
                    start_date=min_start_date,
                    is_auto_generated=True,
                    remark="엑셀 업로드 시 자동 생성",
                )
            )
            processed_movie_ids.add(m_id)

    # 3. Order 처리 (극장+영화별 업데이트 또는 생성)
    existing_orders = Order.objects.filter(
        client_id__in=[k[0] for k in order_data_map.keys()],
        movie_id__in=[k[1] for k in order_data_map.keys()],
    )
    existing_o_map = {(o.client_id, o.movie_id): o for o in existing_orders}

    orders_to_create = []
    orders_to_update = []
    for (c_id, m_id), dates in order_data_map.items():
        if (c_id, m_id) in existing_o_map:
            # 기존 오더: 날짜 범위 확장 업데이트
            order = existing_o_map[(c_id, m_id)]
            changed = False
            if not order.release_date or dates["min"] < order.release_date:
                order.release_date = dates["min"]
                order.start_date = dates["min"]
                changed = True
            if (
                not order.last_screening_date
                or dates["max"] > order.last_screening_date
            ):
                order.last_screening_date = dates["max"]
                changed = True
            if changed:
                orders_to_update.append(order)
        else:
            # 신규 생성
            orders_to_create.append(
                Order(
                    client_id=c_id,
                    movie_id=m_id,
                    release_date=dates["min"],
                    start_date=dates["min"],
                    last_screening_date=dates["max"],
                    is_auto_generated=True,
                    remark="엑셀 업로드 시 자동 생성",
                )
            )

    return ols_to_create, orders_to_create, orders_to_update


def _apply_order_changes(ols_to_create, orders_to_create, orders_to_update):
    """_build_order_changes로 만든 객체들을 DB에 반영한다. (호출자가 트랜잭션 관리)"""
    if ols_to_create:
        OrderList.objects.bulk_create(ols_to_create)
    if orders_to_create:
        Order.objects.bulk_create(orders_to_create)
    if orders_to_update:
        Order.objects.bulk_update(
            orders_to_update,
            ["release_date", "start_date", "last_screening_date"],
        )


def preview_order_changes(data_list):
    """
    오더 저장 시 어떤 오더가 생성/갱신될지 미리 계산한다. (DB 미반영 dry-run)
    반환: [{client_name, movie_name, start_date, end_date, status}, ...]
      status = 'create'(신규) | 'update'(기간 갱신) | 'unchanged'(변화 없음)
    """
    valid_data = [i for i in data_list if i.get("movie_id") and i.get("client_id")]
    if not valid_data:
        return []

    # (client_id, movie_id) -> {min, max, 이름}
    order_map = {}
    for i in valid_data:
        entry_date = parse_date(i["entry_date"])
        if not entry_date:
            continue
        k = (i["client_id"], i["movie_id"])
        if k not in order_map:
            order_map[k] = {
                "min": entry_date,
                "max": entry_date,
                "client_name": i.get("client_name"),
                "movie_name": i.get("movie_name"),
            }
        else:
            if entry_date < order_map[k]["min"]:
                order_map[k]["min"] = entry_date
            if entry_date > order_map[k]["max"]:
                order_map[k]["max"] = entry_date

    existing = Order.objects.filter(
        client_id__in=[k[0] for k in order_map.keys()],
        movie_id__in=[k[1] for k in order_map.keys()],
    )
    existing_map = {(o.client_id, o.movie_id): o for o in existing}

    result = []
    for (c_id, m_id), v in order_map.items():
        o = existing_map.get((c_id, m_id))
        if not o:
            status = "create"
        else:
            will_update = (
                (not o.release_date or v["min"] < o.release_date)
                or (not o.last_screening_date or v["max"] > o.last_screening_date)
            )
            status = "update" if will_update else "unchanged"
        result.append(
            {
                "client_id": c_id,
                "movie_id": m_id,
                "client_name": v["client_name"],
                "movie_name": v["movie_name"],
                "start_date": str(v["min"]),
                "end_date": str(v["max"]),
                "status": status,
            }
        )

    rank = {"create": 0, "update": 1, "unchanged": 2}
    result.sort(key=lambda r: (rank[r["status"]], r["movie_name"] or "", r["client_name"] or ""))
    return result


def save_confirmed_orders(data_list):
    """
    엑셀 미리보기 데이터로 오더(OrderList/Order)만 생성/갱신한다. (스코어는 저장하지 않음)
    영화·극장이 모두 매칭된 행만 사용한다.
    """
    valid_data = [i for i in data_list if i.get("movie_id") and i.get("client_id")]
    if not valid_data:
        return {"orderlist_created": 0, "order_created": 0, "order_updated": 0}

    ols, oc, ou = _build_order_changes(valid_data)
    with transaction.atomic():
        _apply_order_changes(ols, oc, ou)

    return {
        "orderlist_created": len(ols),
        "order_created": len(oc),
        "order_updated": len(ou),
    }


def collect_replace_scope(data_list):
    """
    확정 저장 시 '기존 스코어를 삭제할 범위'를 만든다.

    삭제 범위는 (상영일자 × 영화 × 이번 파일에 들어있는 멀티)이다.
    멀티는 Client.theater_kind (CGV / 롯데 / 메가박스 / 씨네큐 / 프리머스 / 일반극장 /
    자동차극장). CGV 파일을 올리면 그 날짜·영화의 CGV 스코어가 통째로 갈아끼워지고
    롯데·메가박스 등 다른 멀티는 건드리지 않는다. 멀티 단위로 전부 지운 뒤 새로 넣으므로
    관/요금/회차가 달라진 옛 행이나, 이번 파일에서 빠진 극장의 옛 행도 남지 않는다.

    반환: {(movie_id, entry_date): {theater_kind 또는 None, ...}}
    """
    client_ids = {
        i["client_id"]
        for i in data_list
        if i.get("movie_id") and i.get("client_id")
    }
    if not client_ids:
        return {}

    # 극장이 아닌 거래처(배급사/제작사/매입처)는 저장 대상이 아니므로 삭제 범위에서도 뺀다.
    kind_of = dict(
        Client.objects.filter(id__in=client_ids)
        .exclude(client_type__in=NON_THEATER_CLIENT_TYPES)
        .values_list("id", "theater_kind")
    )

    scope = {}
    for i in data_list:
        if not i.get("movie_id") or not i.get("client_id"):
            continue
        if i["client_id"] not in kind_of:
            continue
        kind = kind_of.get(i["client_id"])
        scope.setdefault((i["movie_id"], i["entry_date"]), set()).add(kind or None)
    return scope


def _scope_filter(movie_id, entry_date, kinds, source_file=None):
    """(영화 × 상영일자 × 멀티집합)에 해당하는 Score 쿼리셋.

    theater_kind 가 비어있는(NULL/'') 극장도 하나의 그룹으로 취급한다.
    IN (NULL) 은 매칭되지 않으므로 별도 조건으로 OR 한다.

    source_file 이 주어지면 같은 파일명으로 업로드된 행만으로 좁힌다.
    (메일함 CGV/롯데 재업로드 정책 — M001)
    """
    named = sorted(k for k in kinds if k)
    cond = Q()
    if named:
        cond |= Q(client__theater_kind__in=named)
    if any(not k for k in kinds):
        cond |= Q(client__theater_kind__isnull=True) | Q(client__theater_kind="")
    qs = Score.objects.filter(
        Q(movie_id=movie_id, entry_date=entry_date) & cond
    )
    if source_file:
        qs = qs.filter(source_file=source_file)
    return qs


def preview_replace_scope(data_list, source_file=None, replace_by_file=False):
    """
    확정 저장 전, 삭제될 기존 스코어의 규모를 dry-run 으로 조회한다. (DB 미반영)
    replace_by_file 이면 같은 파일명(source_file)으로 올렸던 행만 삭제 범위로 계산한다.
    반환: [{"movie_id", "movie_title", "entry_dates", "existing_count", "theater_count"}]
    """
    scope_source_file = source_file if (replace_by_file and source_file) else None
    scope = collect_replace_scope(data_list)
    if not scope:
        return []

    movie_ids = {movie_id for movie_id, _ in scope}
    titles = dict(
        Movie.objects.filter(id__in=movie_ids).values_list("id", "title_ko")
    )

    # 영화별로 (날짜 / 멀티 / 삭제될 행 수 / 실제 데이터가 있는 극장 수)를 합산
    agg = {}
    for (movie_id, entry_date), kinds in scope.items():
        qs = _scope_filter(movie_id, entry_date, kinds, source_file=scope_source_file)
        a = agg.setdefault(
            movie_id,
            {"dates": set(), "multis": set(), "existing": 0, "theaters": set()},
        )
        a["dates"].add(entry_date)
        a["multis"].update(k or "(미지정)" for k in kinds)
        a["existing"] += qs.count()
        a["theaters"].update(qs.values_list("client_id", flat=True).distinct())

    result = [
        {
            "movie_id": movie_id,
            "movie_title": titles.get(movie_id) or "",
            "entry_dates": sorted(str(d) for d in a["dates"]),
            "multis": sorted(a["multis"]),
            "existing_count": a["existing"],
            "theater_count": len(a["theaters"]),
        }
        for movie_id, a in agg.items()
    ]
    result.sort(key=lambda x: x["movie_title"])
    return result


def save_confirmed_scores(data_list, source_file=None, replace_by_file=False):
    """
    엑셀에서 확정된 데이터를 DB에 벌크로 저장하고 관련 오더(OrderList, Order)를 생성/업데이트함.
    저장된 (영화×극장) 조합에 부율(Rate)이 없으면 국가별 기준 부율을 자동 생성함.

    재업로드 정책: 업로드에 포함된 (상영일자 × 영화 × 멀티)의 기존 스코어를 전부 삭제한 뒤
    이번 파일 내용으로 교체한다. CGV 파일을 올리면 그 날짜·영화의 CGV 스코어가 통째로
    갈아끼워지고 롯데 등 다른 멀티는 유지된다. 관/요금/회차가 바뀌어도, 이번 파일에서
    빠진 극장이 있어도 옛 행이 남지 않는다.

    메일함(CGV/롯데) 예외 — M001: replace_by_file=True 이면 같은 파일명(source_file)으로
    올렸던 기존 행만 삭제한다. 첨부파일명이 다르면 같은 (날짜×영화×멀티)라도 기존 스코어를
    지우지 않고 누적하고, 완전히 같은 파일을 재업로드하면 그 파일 분량만 교체된다.

    반환: {"saved": 저장 건수, "deleted": 삭제 건수, "rates_created": 부율 생성 건수,
           "rates_skipped_no_country": [영화명],
           "skipped_non_theater": [극장으로 분류되지 않아 제외된 거래처명]}
    """
    from .auto_rate import auto_create_rates

    # 1. 유효 데이터 필터링 (영화와 극장이 모두 매칭된 데이터만)
    valid_data = [i for i in data_list if i.get("movie_id") and i.get("client_id")]

    # 1-1. 안전장치: 극장으로 분류되지 않은 거래처(배급사/제작사/매입처)에는 스코어를 저장하지 않는다.
    # 매칭 단계(BulkMatcher)에서 이미 걸러지지만, 수동 극장 매핑 등으로 들어온 값도 여기서 막는다.
    skipped_non_theater = []
    if valid_data:
        non_theater = dict(
            Client.objects.filter(
                id__in={i["client_id"] for i in valid_data},
                client_type__in=NON_THEATER_CLIENT_TYPES,
            ).values_list("id", "client_name")
        )
        if non_theater:
            valid_data = [i for i in valid_data if i["client_id"] not in non_theater]
            skipped_non_theater = sorted(
                {name or "" for name in non_theater.values()}
            )

    if not valid_data:
        return {
            "saved": 0,
            "deleted": 0,
            "rates_created": 0,
            "rates_skipped_no_country": [],
            "skipped_non_theater": skipped_non_theater,
        }

    # 2. 오더(OrderList/Order) 변경분 준비
    ols_to_create, orders_to_create, orders_to_update = _build_order_changes(valid_data)

    # 3. Score 객체 준비
    # 동일 unique 키 행은 관객수를 합산해 병합한다.
    # (예: 엑셀의 '1층'/'2층' 상영관이 등록된 한 관으로 매칭되면 키가 충돌해
    #  Postgres ON CONFLICT가 같은 행을 두 번 갱신하려다 500 에러 발생)
    merged = {}
    for i in valid_data:
        key = (
            i["entry_date"],
            i["client_id"],
            i["movie_id"],
            i["auditorium"],
            i["fare"],
            i["show_count"],
        )
        if key in merged:
            merged[key]["visitor"] += i["visitor"]
        else:
            merged[key] = dict(i)

    scores_to_save = [
        Score(
            entry_date=i["entry_date"],
            client_id=i["client_id"],
            movie_id=i["movie_id"],
            auditorium=i["auditorium"],
            fare=i["fare"],
            show_count=i["show_count"],
            visitor=i["visitor"],
            source_file=source_file or None,
        )
        for i in merged.values()
    ]

    # 4. DB 반영 (트랜잭션 보장: 기존분 삭제 + 오더 + 스코어 + 자동 부율 원자적 처리)
    replace_scope = collect_replace_scope(valid_data)
    # 파일명 단위 교체(M001)는 파일명이 실제로 전달된 경우에만. 없으면 기존 정책으로 폴백.
    scope_source_file = source_file if (replace_by_file and source_file) else None
    deleted_count = 0

    with transaction.atomic():
        # 재업로드 교체: 이번 업로드에 포함된 (상영일자 × 영화 × 멀티)의 기존 스코어를 삭제.
        # 멀티 단위로 통째로 지우므로 관/요금/회차가 바뀐 옛 행도, 이번 파일에서 빠진
        # 극장의 옛 행도 남지 않는다. 파일에 없는 다른 멀티(롯데 등)는 건드리지 않는다.
        # 메일함(M001)에서는 scope_source_file 로 좁혀 같은 파일 분량만 지운다.
        for (movie_id, entry_date), kinds in replace_scope.items():
            deleted, _ = _scope_filter(
                movie_id, entry_date, kinds, source_file=scope_source_file
            ).delete()
            deleted_count += deleted

        _apply_order_changes(ols_to_create, orders_to_create, orders_to_update)

        # Score 저장 (중복 시 관객수 업데이트)
        if scores_to_save:
            Score.objects.bulk_create(
                scores_to_save,
                update_conflicts=True,
                unique_fields=[
                    "entry_date",
                    "client",
                    "movie",
                    "auditorium",
                    "fare",
                    "show_count",
                ],
                update_fields=["visitor", "source_file"],
                batch_size=500,
            )

        # 부율 미등록 (영화×극장) 조합에 국가별 기준 부율 자동 생성
        rate_result = auto_create_rates(valid_data, parse_date)

        # 재업로드로 기존 스코어를 지웠다 다시 넣었으므로, 마지막 상영일을
        # 실제 남아있는 스코어 기준으로 다시 계산한다(줄어드는 경우까지 반영).
        touched_movies = {m for (m, _d) in replace_scope.keys()}
        if touched_movies:
            recalc_last_screening_dates(movie_ids=touched_movies)

    return {
        "saved": len(scores_to_save),
        "deleted": deleted_count,
        "rates_created": rate_result["created"],
        "rates_skipped_no_country": rate_result["skipped_no_country"],
        "skipped_non_theater": skipped_non_theater,
        # 방금 저장한 범위 — 프론트의 '업로드 취소'가 그대로 되돌려 지우는 데 쓴다 (A001)
        "saved_scope": [
            {
                "movie_id": movie_id,
                "entry_date": str(entry_date),
                "multis": sorted(k or "" for k in kinds),
            }
            for (movie_id, entry_date), kinds in replace_scope.items()
        ],
        "saved_source_file": source_file or None,
    }
