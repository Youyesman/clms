# Ubuntu 22.04 베이스 이미지
FROM ubuntu:22.04

# 환경 변수 설정
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV DEBIAN_FRONTEND=noninteractive

# 필수 패키지 설치
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-dev \
    libpq-dev \
    gcc \
    netcat \
    && rm -rf /var/lib/apt/lists/*

# python3 -> python 심볼릭 링크
RUN ln -s /usr/bin/python3 /usr/bin/python

WORKDIR /app

# 의존성 설치
COPY requirements.txt /app/
RUN pip3 install --no-cache-dir --upgrade pip && \
    pip3 install --no-cache-dir -r requirements.txt && \
    pip3 install gunicorn

# 소스 복사
COPY . /app/

# Entrypoint 스크립트 복사 및 실행 권한 부여
COPY entrypoint.sh /app/
RUN chmod +x /app/entrypoint.sh

# 포트 노출
EXPOSE 8000

# 실행
ENTRYPOINT ["/app/entrypoint.sh"]

