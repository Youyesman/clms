"""씨네큐 스코어(score.cineq.co.kr) 배급사 계정 목록.

한 번의 크롤로 아래 모든 배급사 계정에 로그인해 관객현황(Admin002)을 수집한다.
※ 자격증명 평문 보관 — DB(CineQDistributorAccount) 시드용. 운영 관리는 DB에서 한다.
"""

CINEQ_ACCOUNTS = [
    {"name": "NEW", "user": "neww", "password": "new3490@"},
    {"name": "SMG홀딩스", "user": "hong@smg-h.com", "password": "dg0220231129"},
    {"name": "CJ CGV", "user": "kooks1014@naver.com", "password": "cgvcgv2018"},
    {"name": "TCO(더콘텐츠온)", "user": "nuripark2002@tcokr.com", "password": "tcon2580"},
    {"name": "에무필름즈", "user": "emufilms.kr@gmail.com", "password": "emufilms2025"},
    {"name": "썬더필름", "user": "thunderfilm@naver.com", "password": "thun01**"},
    {"name": "리틀빅픽쳐스", "user": "doohee.park@gmail.com", "password": "tjdfudsla"},
    {"name": "메리크리스마스", "user": "cinejoo@naver.com", "password": "mech1234"},
    {"name": "바이포엠", "user": "roy@by4m.co.kr", "password": "by4mstudio@by4m.co.kr"},
    {"name": "버킷스튜디오", "user": "contents@bucketstudio.co.kr", "password": "bucket3430"},
    {"name": "블루필름웍스", "user": "gid35@naver.com", "password": "jack8848"},
    {"name": "스튜디오산타클로스엔터테인먼트", "user": "santaclausent2024@gmail.com", "password": "santa2024!!"},
    {"name": "인디스토리", "user": "cine1998@naver.com", "password": "indi0617"},
    {"name": "콘텐츠판다", "user": "hankim@its-new.co.kr", "password": "newnew1234"},
    {"name": "키다리스튜디오", "user": "ech@kidaristudio.com", "password": "kidari0228"},
    {"name": "킨스튜디오(힘내라 대한민국)", "user": "kinstdo@gmail.com", "password": "kin2024!"},
    {"name": "트윈플러스", "user": "dlwoals6509@naver.com", "password": "partners22"},
    {"name": "판씨네마", "user": "pancinema01@gmail.com", "password": "pancinema!0710"},
    {"name": "플레이그램", "user": "playgram.content@gmail.com", "password": "playgram5390"},
]
