import re
import pandas as pd
import numpy as np
from django.db import transaction
from django.db.models import Q, Value
from django.db.models.functions import Replace, Lower
from .models import Score, Movie, Client
from client.models import Theater
from collections import Counter
from order.models import OrderList, Order
from datetime import datetime, date

# ==========================================
# 1. 성능 최적화 및 지능형 중복 해결 매칭 클래스
# ==========================================


class BulkMatcher:
    def __init__(self, theater_kind):
        """
        데이터를 메모리에 로드하고 중복 지점을 지능적으로 처리하기 위한 구조 생성
        """
        self.kind = theater_kind
        clients = Client.objects.filter(theater_kind=theater_kind)

        self.name_to_clients = {}  # 정규화이름 -> [Client 객체 리스트]

        for c in clients:
            names = set()
            if c.excel_theater_name:
                names.add(c.excel_theater_name.replace(" ", "").lower())
            if c.client_name:
                names.add(c.client_name.replace(" ", "").lower())

            for name in names:
                if name not in self.name_to_clients:
                    self.name_to_clients[name] = []
                self.name_to_clients[name].append(c)

        # 상영관 로드 (Key: (client_id, 정규화된 관이름))
        theaters = Theater.objects.annotate(
            name_norm=Lower(Replace("auditorium_name", Value(" "), Value("")))
        )
        self.theater_dict = {(t.client_id, t.name_norm): t for t in theaters}

        # 영화 로드 (전체 속성 필드 반영)
        self.movie_list = list(
            Movie.objects.annotate(
                title_norm=Lower(Replace("title_ko", Value(" "), Value("")))
            )
        )

    def _match_theater_logic(self, client_id, raw_aud):
        """내부용: 특정 클라이언트 내에서 상영관 매칭 시도 (정제 규칙 포함)"""
        if not client_id or not raw_aud:
            return None
        raw_aud_str = str(raw_aud).strip()

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
        return self.theater_dict.get((client_id, clean_core.replace(" ", "").lower()))

    def check_client_and_theater(self, raw_client, raw_aud):
        """
        ✅ 중복 해결 로직: 극장명이 중복되어도 관 이름으로 유일한 극장 하나를 찾아냄.
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
        norm_raw = pure_title.replace(" ", "").lower()

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


def handle_score_file_upload(file):
    name = file.name
    if "롯데" in name:
        return preview_lotte_format(file)
    elif "메가박스" in name:
        return preview_megabox_format(file)
    elif "씨네큐" in name:
        return preview_cineq_format(file)
    elif "CGV" in name:
        return preview_cgv_format(file)
    return {"error": "지원하지 않는 파일 양식입니다."}


def preview_cgv_format(file):
    try:
        header_idx = 14
        df_full = (
            pd.read_csv(file, header=None)
            if file.name.endswith(".csv")
            else pd.read_excel(file, header=None)
        )
        df = (
            pd.read_csv(file, skiprows=header_idx)
            if file.name.endswith(".csv")
            else pd.read_excel(file, skiprows=header_idx)
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
            if pd.notna(row.get("상영관")):
                cur_aud, cur_client, cur_movie = (
                    str(row["상영관"]).strip(),
                    str(row["극장명"]).strip(),
                    str(row["영화명"]).strip(),
                )

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
                movie, exp_title = matcher.find_movie(cur_movie, "", cur_movie)

                for i, col_name in enumerate(show_cols):
                    vis = pd.to_numeric(row.get(col_name), errors="coerce")
                    if vis and vis != 0:
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
                                "fare": int(re.sub(r"[^0-9]", "", price_raw)),
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
            else pd.read_excel(file, skiprows=6)
        )
        df.columns = df.columns.str.strip()
        df = df.dropna(subset=["지점", "상영일"])
        matcher = BulkMatcher(theater_kind="메가박스")
        show_cols = ["특회", "1회", "2회", "3회", "4회", "5회", "6회", "7회"]
        existing_show_cols = [col for col in show_cols if col in df.columns]
        df_melted = df.melt(
            id_vars=["지점", "상영일", "관", "상영영화", "상영종류", "티켓가"],
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
                    "fare": int(
                        pd.to_numeric(
                            str(row["티켓가"]).replace(",", ""), errors="coerce"
                        )
                        or 0
                    ),
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
            else pd.read_excel(file, skiprows=2)
        )
        df.columns = df.columns.str.strip()
        df = df[
            ~df.apply(lambda row: row.astype(str).str.contains("소계").any(), axis=1)
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
                    "fare": int(row["발권금액"] or 0),
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
        df = pd.read_csv(file) if file.name.endswith(".csv") else pd.read_excel(file)
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


def save_confirmed_scores(data_list):
    """
    엑셀에서 확정된 데이터를 DB에 벌크로 저장하고 관련 오더(OrderList, Order)를 생성/업데이트함
    """
    # 1. 유효 데이터 필터링 (영화와 극장이 모두 매칭된 데이터만)
    valid_data = [i for i in data_list if i.get("movie_id") and i.get("client_id")]
    if not valid_data:
        return 0

    # 2. 데이터 집계 및 준비
    order_data_map = {}  # key: (client_id, movie_id), value: {min_date, max_date}
    all_movie_ids = set()

    for i in valid_data:
        m_id = i["movie_id"]
        c_id = i["client_id"]
        entry_date = parse_date(i["entry_date"])
        if not entry_date:
            continue

        all_movie_ids.add(m_id)

        # Order용 (극장+영화 조합의 기간 추출)
        o_key = (c_id, m_id)
        if o_key not in order_data_map:
            order_data_map[o_key] = {"min": entry_date, "max": entry_date}
        else:
            if entry_date < order_data_map[o_key]["min"]:
                order_data_map[o_key]["min"] = entry_date
            if entry_date > order_data_map[o_key]["max"]:
                order_data_map[o_key]["max"] = entry_date

    # 3. OrderList 처리 (OneToOneField 중복 제외 생성)
    # DB에 이미 존재하는 OrderList의 영화 ID들을 조회
    existing_ol_movie_ids = set(
        OrderList.objects.filter(movie_id__in=list(all_movie_ids)).values_list(
            "movie_id", flat=True
        )
    )

    ols_to_create = []
    processed_movie_ids = set()  # 이번 배치 루프 내 중복 방지

    for m_id in all_movie_ids:
        # DB에도 없고, 생성 예정 리스트에도 없는 경우에만 추가
        if m_id not in existing_ol_movie_ids and m_id not in processed_movie_ids:
            # 해당 영화의 데이터 중 가장 이른 날짜를 시작일로 설정
            # (order_data_map에 있는 해당 영화의 모든 client 데이터 중 최소값)
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

    # 4. Order 처리 (극장+영화별 업데이트 또는 생성)
    existing_orders = Order.objects.filter(
        client_id__in=[k[0] for k in order_data_map.keys()],
        movie_id__in=[k[1] for k in order_data_map.keys()],
    )
    existing_o_map = {(o.client_id, o.movie_id): o for o in existing_orders}

    orders_to_create = []
    orders_to_update = []

    for (c_id, m_id), dates in order_data_map.items():
        if (c_id, m_id) in existing_o_map:
            # ✅ 기존 오더가 있는 경우: 날짜 범위 확장 업데이트
            order = existing_o_map[(c_id, m_id)]
            changed = False

            # 개봉일(release_date) 업데이트: 더 빠른 날짜가 들어오면 갱신
            if not order.release_date or dates["min"] < order.release_date:
                order.release_date = dates["min"]
                order.start_date = dates["min"]
                changed = True

            # 마지막 상영일(last_screening_date) 업데이트: 더 늦은 날짜가 들어오면 갱신
            if (
                not order.last_screening_date
                or dates["max"] > order.last_screening_date
            ):
                order.last_screening_date = dates["max"]
                changed = True

            if changed:
                orders_to_update.append(order)
        else:
            # ✅ 오더가 없는 경우: 신규 생성
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

    # 5. Score 객체 준비
    scores_to_save = [
        Score(
            entry_date=i["entry_date"],
            client_id=i["client_id"],
            movie_id=i["movie_id"],
            auditorium=i["auditorium"],
            fare=i["fare"],
            show_count=i["show_count"],
            visitor=i["visitor"],
        )
        for i in valid_data
    ]

    # 6. DB 반영 (트랜잭션 보장)
    try:
        with transaction.atomic():
            # OrderList 생성
            if ols_to_create:
                OrderList.objects.bulk_create(ols_to_create)

            # Order 생성
            if orders_to_create:
                Order.objects.bulk_create(orders_to_create)

            # Order 업데이트
            if orders_to_update:
                Order.objects.bulk_update(
                    orders_to_update,
                    ["release_date", "start_date", "last_screening_date"],
                )

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
                    update_fields=["visitor"],
                    batch_size=500,
                )

        return len(scores_to_save)
    except Exception as e:
        # 로그 기록 등 예외 처리 필요 시 추가
        raise e
