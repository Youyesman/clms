#!/bin/bash
# 운영 DB(clms_db_new) 백업 — GitHub Actions(db-backup.yml)가 매일 KST 03:00에 실행.
# 서버 보관: /home/clms/backups 에 14일 롤링 + 최신본 latest.dump 심볼릭 링크.
# 복원: sudo -u postgres pg_restore --clean --if-exists -d clms_db_new <파일>
set -euo pipefail

BACKUP_DIR=/home/clms/backups
DB_NAME=clms_db_new
KEEP_DAYS=14

mkdir -p "$BACKUP_DIR"
STAMP=$(TZ=Asia/Seoul date +%Y%m%d_%H%M%S)
FILE="$BACKUP_DIR/${DB_NAME}_${STAMP}.dump"

# 커스텀 포맷(-Fc)은 자체 압축이라 2.5GB DB 기준 약 90MB
sudo -u postgres pg_dump -Fc "$DB_NAME" > "$FILE"

ln -sf "$FILE" "$BACKUP_DIR/latest.dump"

# KEEP_DAYS 지난 덤프 삭제 (심볼릭 링크는 -type f 조건으로 제외)
find "$BACKUP_DIR" -maxdepth 1 -name "${DB_NAME}_*.dump" -type f -mtime +"$KEEP_DAYS" -delete

echo "backup done: $FILE ($(du -h "$FILE" | cut -f1))"
echo "--- backups on disk ---"
ls -lh "$BACKUP_DIR" | tail -n +2
echo "--- disk free ---"
df -h "$BACKUP_DIR" | tail -1
