import imaplib
import email
from email.policy import default
import os
import pandas as pd
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import re

# 설정
IMAP_SERVER = "imap.naver.com"
SMTP_SERVER = "smtp.naver.com"
SMTP_PORT = 587
EMAIL_ACCOUNT = "yyw0209_02@naver.com"
PASSWORD = "wkahd88**"
DOWNLOAD_DIR = "./attachments"
TO_EMAIL = "yyw0209_02@naver.com"
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

# 로그인 (IMAP)
mail = imaplib.IMAP4_SSL(IMAP_SERVER)
mail.login(EMAIL_ACCOUNT, PASSWORD)
mail.select("inbox")

# 메일 검색
status, messages = mail.search(None, 'ALL')
email_ids = messages[0].split()[-10:]  # 최근 10개

# 데이터 분석 결과 저장
results = []
processed_files = set()  # 중복 파일명을 추적하기 위한 집합
global_data_dict = {}  # 모든 파일의 데이터를 통합적으로 저장

for eid in email_ids:
    status, msg_data = mail.fetch(eid, '(RFC822)')
    raw_email = msg_data[0][1]
    msg = email.message_from_bytes(raw_email, policy=default)

    # ✅ 발신자 필터링
    from_ = msg.get("From")
    if "line0405@outlook.kr" not in from_:
        continue  # 발신자가 다르면 skip

    subject = msg["subject"]
    print(f"\n📬 제목: {subject}")

    # 첨부파일 찾기
    for part in msg.walk():
        content_disposition = part.get("Content-Disposition")
        if content_disposition and "attachment" in content_disposition:
            filename = part.get_filename()
            if filename:
                # 이미 처리된 파일명인지 확인
                if filename in processed_files:
                    print(f"⚠️ 이미 처리된 파일: {filename}, 건너뜀")
                    continue
                processed_files.add(filename)  # 파일명을 처리된 목록에 추가

                file_path = os.path.join(DOWNLOAD_DIR, filename)
                with open(file_path, "wb") as f:
                    f.write(part.get_payload(decode=True))
                print(f"📎 저장된 첨부파일: {filename}")

                # 파일 열기 (Excel)
                try:
                    if filename.endswith((".xls", ".xlsx")):
                        # 엑셀 파일 읽기 (헤더가 10번째 줄에 위치)
                        df = pd.read_excel(file_path, skiprows=9)

                        # 이전 값을 저장하기 위한 변수
                        last_theater = None
                        last_movie = None
                        last_screen = None
                        # 회차별 시간표 저장 (예: "1회": "16:30")
                        showtime_values = {}

                        for idx, row in df.iterrows():
                            # C, E, F열 값 가져오기 (빈칸이면 이전 값 사용)
                            theater = row.iloc[2] if pd.notna(
                                row.iloc[2]) else last_theater
                            movie = row.iloc[4] if pd.notna(
                                row.iloc[4]) else last_movie
                            screen = row.iloc[5] if pd.notna(
                                row.iloc[5]) else last_screen

                            # 빈칸이 아닌 경우에만 이전 값 업데이트
                            if pd.notna(row.iloc[2]):
                                last_theater = theater
                            if pd.notna(row.iloc[4]):
                                last_movie = movie
                            if pd.notna(row.iloc[5]):
                                last_screen = screen

                            # 필수 데이터가 없으면 건너뛰기
                            if not (theater and movie and screen):
                                continue

                            # G열: 가격
                            price = row.iloc[6]
                            if pd.isna(price) or str(price).strip() == "계":
                                continue
                            price_cleaned = str(price).replace("원", "")

                            # H열~T열에서 시간표와 관객수 추출
                            for col_idx in range(7, 20):  # H열(7) ~ T열(19)
                                value = row.iloc[col_idx]
                                if pd.notna(value):
                                    # 회차 (예: "1회")
                                    showtime = df.columns[col_idx]
                                    # "HH:MM" 형식 (시간표만 있는 경우)
                                    if re.match(r'^\d{1,2}:\d{2}$', str(value)):
                                        showtime_values[showtime] = str(
                                            value)  # 시간표 저장
                                    # 숫자만 있는 경우 (관객수)
                                    elif str(value).isdigit():
                                        audience = int(value)

                                        # 🔍 위로 올라가며 시간값 찾기
                                        showtime_value = None
                                        for prev_idx in range(idx - 1, -1, -1):
                                            prev_value = df.iloc[prev_idx, col_idx]
                                            if pd.notna(prev_value) and re.match(r'^\d{1,2}:\d{2}$', str(prev_value)):
                                                showtime_value = str(
                                                    prev_value)
                                                break

                                        if not showtime_value:
                                            showtime_value = f"no_time_{idx}_{col_idx}"

                                        key = (theater, price_cleaned,
                                               showtime, showtime_value)
                                        if key not in global_data_dict:
                                            global_data_dict[key] = {
                                                'movie': movie,
                                                'screens': set(),
                                                'audience': 0,
                                                'filenames': set()
                                            }
                                        global_data_dict[key]['screens'].add(
                                            screen)
                                        global_data_dict[key]['audience'] += audience
                                        global_data_dict[key]['filenames'].add(
                                            filename)
                    else:
                        print("❌ 지원되지 않는 파일 형식")
                        continue
                except Exception as e:
                    print(f"❌ 파일 처리 중 오류: {e}")

# 모든 파일 처리 후 결과 출력
if global_data_dict:
    result_text = ""
    for (theater, price, showtime, showtime_value), data in global_data_dict.items():
        screens = ", ".join(data['screens'])
        filenames = ", ".join(data['filenames'])
        total_audience = data['audience']
        movie = data['movie']  # 첫 번째 영화명 사용
        # 시간표가 없는 경우 출력 조정
        if "no_time" in showtime_value:
            audience_info = f"{showtime}: {total_audience}명"
        else:
            audience_info = f"{showtime}({showtime_value}): {total_audience}명"
        result_text += f"🏢 극장명: {theater} | 🎥 영화: {movie} | 🏟 상영관: {screens}\n"
        result_text += f"📎 파일: {filenames}\n"
        result_text += f"💰 가격: {price}\n"
        result_text += f"👥 상영 시간별 관객: {audience_info}\n"
        result_text += f"📊 총 관객: {total_audience}명\n\n"
    if result_text:
        results.append(result_text)

# IMAP 로그아웃
mail.logout()

# 이메일 전송
if results:
    try:
        # SMTP 설정
        smtp = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        smtp.starttls()
        smtp.login(EMAIL_ACCOUNT, PASSWORD)

        # 이메일 메시지 구성
        msg = MIMEMultipart()
        msg["From"] = EMAIL_ACCOUNT
        msg["To"] = TO_EMAIL
        msg["Subject"] = "CGV 상영 데이터 분석 결과"

        # 본문 작성
        body = "CGV 상영 데이터 분석 결과입니다:\n\n" + "\n".join(results)
        msg.attach(MIMEText(body, "plain", "utf-8"))

        # 이메일 전송
        smtp.send_message(msg)
        print("✅ 분석 결과 이메일 전송 완료")
        smtp.quit()
    except Exception as e:
        print(f"❌ 이메일 전송 중 오류: {e}")
else:
    print("⚠️ 분석된 데이터가 없습니다.")
