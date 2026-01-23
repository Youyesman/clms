#!/bin/bash

# DB 연결 대기
echo "Waiting for postgres..."
if getent hosts db > /dev/null 2>&1; then
  while ! nc -z db 5432; do
    sleep 0.1
  done
  echo "PostgreSQL started"
else
  echo "Service 'db' not found in network. Skipping wait."
fi

# 정적 파일 모으기
echo "Collecting static files..."
python manage.py collectstatic --noinput

# 마이그레이션 실행
echo "Running migrations..."
python manage.py migrate

# Gunicorn 실행
echo "Starting Gunicorn..."
exec gunicorn castingline_backend.wsgi:application --bind 0.0.0.0:8000 --workers 3 --reload
