#!/usr/bin/env bash
# 로컬 DB(.env)를 바라보는 Django 개발 서버 실행
# 사용법: ./run_local.sh [포트]   (기본 8000)
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env ]; then
    echo "오류: .env 가 없습니다." >&2
    exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

echo "DB → ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
exec ./venv/bin/python manage.py runserver "${1:-8000}"
