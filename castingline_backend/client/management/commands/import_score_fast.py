"""
import_score_fast: PostgreSQL COPY 방식으로 Score 데이터를 고속 적재
- 18M 건 기준 기존 ORM 방식(30분+) 대비 3~5분으로 단축
- psycopg2 COPY FROM STDIN 사용 (Django ORM 우회)
- 중복 데이터는 자동 SKIP (ON CONFLICT DO NOTHING)

사용법:
    python manage.py import_score_fast C:\clms_export\day_sale.csv
    python manage.py import_score_fast C:\clms_export\Day_Sale_T2.csv
"""

import csv
import io
from datetime import datetime, timezone

import psycopg2
import psycopg2.extras
from django.conf import settings
from django.core.management.base import BaseCommand


def parse_date(date_str):
    try:
        if date_str and date_str.strip():
            return datetime.strptime(date_str.strip(), "%Y%m%d").date().isoformat()
        return None
    except ValueError:
        return None


class Command(BaseCommand):
    help = "PostgreSQL COPY 방식으로 Score 데이터 고속 import"

    def add_arguments(self, parser):
        parser.add_argument("csv_file", type=str)
        parser.add_argument(
            "--batch-size",
            type=int,
            default=50000,
            help="한 번에 COPY할 행 수 (기본값: 50000)",
        )

    def handle(self, *args, **options):
        file_path = options["csv_file"]
        batch_size = options["batch_size"]
        now_str = datetime.now(timezone.utc).isoformat()

        db = settings.DATABASES["default"]
        conn = psycopg2.connect(
            host=db["HOST"],
            port=db["PORT"],
            dbname=db["NAME"],
            user=db["USER"],
            password=db["PASSWORD"],
        )
        cursor = conn.cursor()

        # ── 1. client_code → id 맵 로드 ──────────────────────────────
        self.stdout.write("Loading client map...", ending=" ")
        self.stdout.flush()
        cursor.execute("SELECT client_code, id FROM client_client")
        client_map = {code: str(pk) for code, pk in cursor.fetchall()}
        self.stdout.write(f"{len(client_map):,} clients")

        # ── 2. movie_code → id 맵 로드 ───────────────────────────────
        self.stdout.write("Loading movie map...", ending=" ")
        self.stdout.flush()
        cursor.execute("SELECT movie_code, id FROM movie_movie")
        movie_map = {code: str(pk) for code, pk in cursor.fetchall()}
        self.stdout.write(f"{len(movie_map):,} movies")

        # ── 3. 임시 테이블 생성 ───────────────────────────────────────
        cursor.execute("""
            CREATE TEMP TABLE tmp_score (
                entry_date      DATE,
                client_id       INTEGER,
                movie_id        INTEGER,
                auditorium      VARCHAR(10),
                fare            VARCHAR(10),
                show_count      VARCHAR(10),
                visitor         VARCHAR(10),
                created_date    TIMESTAMPTZ,
                updated_date    TIMESTAMPTZ
            )
        """)
        conn.commit()

        # ── 4. CSV 읽어서 COPY ───────────────────────────────────────
        total_read = 0
        total_copied = 0

        def flush_batch(batch_rows):
            """batch_rows (list of tuples) → 임시 테이블 COPY"""
            buf = io.StringIO()
            for row in batch_rows:
                # None 값을 PostgreSQL COPY 형식의 \N으로 변환
                line = "\t".join(
                    r"\N" if r is None else str(r).replace("\\", "\\\\").replace("\t", " ").replace("\n", " ")
                    for r in row
                )
                buf.write(line + "\n")
            buf.seek(0)
            cursor.copy_from(buf, "tmp_score", sep="\t", null=r"\N",
                             columns=("entry_date", "client_id", "movie_id",
                                      "auditorium", "fare", "show_count",
                                      "visitor", "created_date", "updated_date"))

        batch = []

        with open(file_path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                total_read += 1
                entry_date  = parse_date(row.get("show_ymd"))
                client_id   = client_map.get(row.get("ctm_code"))
                movie_id    = movie_map.get(row.get("tt_code"))
                auditorium  = (row.get("screen") or "")[:10] or None
                fare        = (row.get("fee_code") or "")[:10] or None
                show_count  = (row.get("show_num") or "")[:10] or None
                visitor     = (row.get("show_visitor") or "")[:10] or None

                batch.append((
                    entry_date, client_id, movie_id,
                    auditorium, fare, show_count, visitor,
                    now_str, now_str,
                ))

                if len(batch) >= batch_size:
                    flush_batch(batch)
                    total_copied += len(batch)
                    batch = []
                    self.stdout.write(f"\r  {total_copied:,} rows copied...", ending="")
                    self.stdout.flush()

        if batch:
            flush_batch(batch)
            total_copied += len(batch)

        conn.commit()
        self.stdout.write(f"\r  {total_copied:,} rows in temp table")

        # ── 5. 임시 테이블 → 본 테이블 (중복 SKIP) ───────────────────
        self.stdout.write("Inserting into score_score (ON CONFLICT DO NOTHING)...", ending=" ")
        self.stdout.flush()
        cursor.execute("""
            INSERT INTO score_score
                (entry_date, client_id, movie_id, auditorium, fare,
                 show_count, visitor, created_date, updated_date)
            SELECT
                entry_date, client_id, movie_id, auditorium, fare,
                show_count, visitor, created_date, updated_date
            FROM tmp_score
            ON CONFLICT ON CONSTRAINT unique_score_record DO NOTHING
        """)
        inserted = cursor.rowcount
        conn.commit()
        cursor.close()
        conn.close()

        self.stdout.write(self.style.SUCCESS(
            f"\nDone: {inserted:,} inserted, {total_copied - inserted:,} skipped (duplicates)"
        ))
