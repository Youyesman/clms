"""KOBIS(영화관입장권통합전산망) 배급사 회원 계정 기본 목록.

DB(KobisDistributorAccount) 시드/폴백용. 실제 관리는 DB(설정 모달)에서 한다.
aprv_no(인증번호)는 KOBIS 로그인 화면의 SMS 인증번호 칸에 쓰는 값(계정별 고정).
"""

KOBIS_ACCOUNTS = [
    {"name": "NEW", "user": "20062460", "password": "newnew3166", "aprv_no": "4207dbaa"},
    {"name": "바이포엠", "user": "by4m", "password": "by4mstudio", "aprv_no": "15308065"},
    {"name": "블루필름웍스", "user": "bluefilmworks", "password": "jackson8848", "aprv_no": ""},
    {"name": "인디스토리", "user": "indiestory", "password": "indiestory1998", "aprv_no": "b1cd91a2"},
    {"name": "플레이그램", "user": "playgram", "password": "playgram5390", "aprv_no": "f21a3941"},
    {"name": "썬더필름", "user": "thunderfilm", "password": "thunderfilm01", "aprv_no": "30e73165"},
    {"name": "SMG홀딩스", "user": "smgholdings01", "password": "smghsmgh1234", "aprv_no": "36c91935"},
    {"name": "콘텐츠판다", "user": "panda2013", "password": "panda202300", "aprv_no": "b0ffa72f"},
    {"name": "에무필름즈", "user": "emufilms", "password": "emufilms2025", "aprv_no": "209381ca"},
    {"name": "스튜디오산타클로스엔터테인먼트", "user": "santa2021", "password": "santaent2021", "aprv_no": ""},
    {"name": "더하세(부흥)", "user": "thehase300", "password": "againthehase300", "aprv_no": "71341b71"},
    {"name": "킨스튜디오", "user": "kinstdo", "password": "kin20240601", "aprv_no": "0ff02e1d"},
    {"name": "길갈", "user": "gilgal77912", "password": "town11281017", "aprv_no": "d2807779"},
    {"name": "모토", "user": "motto", "password": "ahxhrlatnsah1227", "aprv_no": "61c0ffb5"},
    {"name": "판씨네마", "user": "20030118", "password": "pancinema498", "aprv_no": "7bce81be"},
    {"name": "리틀빅픽처스", "user": "littlebig", "password": "little0501", "aprv_no": ""},
    {"name": "트윈플러스", "user": "twinp", "password": "partners22", "aprv_no": "c3212550"},
    {"name": "명필름랩", "user": "oyster", "password": "2024dltjrghk", "aprv_no": "41397407"},
    {"name": "메리크리스마스", "user": "mech", "password": "mech1234", "aprv_no": ""},
]
