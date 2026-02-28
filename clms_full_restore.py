"""
CLMS 전체 DB 복구 자동화 스크립트
=====================================
사용법:
    python clms_full_restore.py <.bak 파일 경로> [새 DB명]

예시:
    python clms_full_restore.py C:\\clmsdb\\clmsdb_backup_2026_02_27.bak
    python clms_full_restore.py C:\\clmsdb\\clmsdb_backup_2026_02_27.bak clms_db_v2

수행 작업:
    1. .bak → 로컬 SQL Server 복원 (clms_restore_temp)
    2. 필요한 테이블 → CSV export (C:\\clms_export\\)
    3. 기존 PostgreSQL DB 삭제 후 새로 생성
    4. Django 마이그레이션
    5. 데이터 import (clients → movies → theaters → rates → orders → scores → fund/share)
    6. 슈퍼유저 생성 (admin / 1)
    7. 임시 SQL Server DB 삭제

요구사항:
    - pyodbc: pip install pyodbc
    - ODBC Driver 17 for SQL Server 설치
    - psycopg2: pip install psycopg2
    - 로컬 SQL Server 실행 중
    - 대상 PostgreSQL 서버 접근 가능
"""

import csv
import os
import subprocess
import sys
import time

# ── 설정 ───────────────────────────────────────────────────────────────────────

# SQL Server
SQLSERVER = "localhost"
MSSQL_TEMP_DB = "clms_restore_temp"      # 복원할 임시 SQL Server DB명
MSSQL_DATA_DIR = r"C:\Program Files\Microsoft SQL Server\MSSQL16.MSSQLSERVER\MSSQL\DATA"

# PostgreSQL
PG_HOST = "116.125.120.94"
PG_PORT = "5432"
PG_USER = "postgres"
PG_PASSWORD = "wkahd88**"

# CSV export 경로
EXPORT_DIR = r"C:\clms_export"

# Django 프로젝트 경로
DJANGO_DIR = r"C:\clms\castingline_backend"
SETTINGS_FILE = os.path.join(DJANGO_DIR, "castingline_backend", "settings.py")

# ── 유틸 함수 ──────────────────────────────────────────────────────────────────

def log(msg, level="INFO"):
    prefix = {"INFO": "✔", "STEP": "\n▶", "WARN": "⚠", "ERROR": "✖"}.get(level, " ")
    print(f"{prefix}  {msg}", flush=True)


def run(cmd, cwd=None, env=None, timeout=None):
    """명령 실행 후 실패 시 종료"""
    result = subprocess.run(cmd, shell=True, cwd=cwd, env=env,
                            capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        log(f"명령 실패: {cmd}", "ERROR")
        log(result.stderr or result.stdout, "ERROR")
        sys.exit(1)
    return result.stdout.strip()


def sqlcmd(query, database=None):
    db_flag = f"-d {database}" if database else ""
    cmd = f'sqlcmd -S {SQLSERVER} -E {db_flag} -Q "{query}"'
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return result.stdout, result.returncode


def psql(query, database="postgres"):
    env = os.environ.copy()
    env["PGPASSWORD"] = PG_PASSWORD
    psql_exe = r"C:\Program Files\PostgreSQL\14\bin\psql.exe"
    cmd = f'"{psql_exe}" -h {PG_HOST} -p {PG_PORT} -U {PG_USER} -d {database} -c "{query}"'
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, env=env)
    return result.stdout.strip(), result.returncode


def manage(command, cwd=DJANGO_DIR, timeout=7200):
    """python manage.py <command> 실행"""
    result = subprocess.run(
        f"python manage.py {command}",
        shell=True, cwd=cwd,
        capture_output=True, text=True, timeout=timeout
    )
    output = (result.stdout + result.stderr).strip()
    if result.returncode != 0:
        log(f"manage.py {command} 실패:\n{output}", "ERROR")
        sys.exit(1)
    return output


# ── STEP 1: .bak 파일 복원 ─────────────────────────────────────────────────────

def step1_restore_bak(bak_path):
    log("STEP 1: .bak 파일을 로컬 SQL Server에 복원", "STEP")
    log(f"파일: {bak_path}")

    # 논리 파일명 조회
    out, _ = sqlcmd(
        f"RESTORE FILELISTONLY FROM DISK = '{bak_path}'"
    )
    lines = [l for l in out.splitlines() if l.strip() and not l.startswith("-")]
    # 첫 번째 실제 데이터 행에서 LogicalName 추출
    data_logical = log_logical = None
    for line in lines:
        parts = line.split()
        if len(parts) < 2:
            continue
        if parts[1] == "D" and data_logical is None:
            data_logical = parts[0]
        elif parts[1] == "L" and log_logical is None:
            log_logical = parts[0]

    if not data_logical or not log_logical:
        # fallback: 직접 sqlcmd로 조회
        result = subprocess.run(
            f'sqlcmd -S {SQLSERVER} -E -Q "RESTORE FILELISTONLY FROM DISK = \'{bak_path}\'" -h-1 -W',
            shell=True, capture_output=True, text=True
        )
        lines2 = [l.strip() for l in result.stdout.splitlines() if l.strip()]
        for line in lines2:
            parts = line.split()
            if len(parts) >= 2:
                if parts[-1] == "D" and data_logical is None:
                    data_logical = parts[0]
                elif parts[-1] == "L" and log_logical is None:
                    log_logical = parts[0]

    log(f"논리 파일명: data={data_logical}, log={log_logical}")

    # 기존 임시 DB 제거
    sqlcmd(f"""
        IF EXISTS (SELECT name FROM sys.databases WHERE name = '{MSSQL_TEMP_DB}')
        BEGIN
            ALTER DATABASE [{MSSQL_TEMP_DB}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
            DROP DATABASE [{MSSQL_TEMP_DB}];
        END
    """)

    # 복원
    mdf_path = os.path.join(MSSQL_DATA_DIR, f"{MSSQL_TEMP_DB}.mdf")
    ldf_path = os.path.join(MSSQL_DATA_DIR, f"{MSSQL_TEMP_DB}_log.ldf")
    restore_sql = (
        f"RESTORE DATABASE [{MSSQL_TEMP_DB}] "
        f"FROM DISK = '{bak_path}' "
        f"WITH MOVE '{data_logical}' TO '{mdf_path}', "
        f"MOVE '{log_logical}' TO '{ldf_path}', "
        f"REPLACE, STATS = 10"
    )
    log("복원 중... (용량에 따라 수 분 소요)")
    result = subprocess.run(
        f'sqlcmd -S {SQLSERVER} -E -Q "{restore_sql}"',
        shell=True, capture_output=True, text=True, timeout=3600
    )
    if result.returncode != 0:
        log(f"복원 실패:\n{result.stderr}", "ERROR")
        sys.exit(1)
    log("SQL Server 복원 완료")


# ── STEP 2: CSV Export ──────────────────────────────────────────────────────────

def step2_export_csv():
    log("STEP 2: SQL Server 테이블 → CSV export", "STEP")
    import pyodbc

    os.makedirs(EXPORT_DIR, exist_ok=True)

    conn = pyodbc.connect(
        f"DRIVER={{ODBC Driver 17 for SQL Server}};"
        f"SERVER={SQLSERVER};"
        f"DATABASE={MSSQL_TEMP_DB};"
        f"Trusted_Connection=yes;"
    )
    cursor = conn.cursor()

    # 테이블 존재 여부 확인 (day_sale vs day_sale_t)
    cursor.execute(
        "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES "
        "WHERE TABLE_NAME IN ('day_sale','day_sale_t','Day_Sale_T2')"
    )
    day_tables = {row[0] for row in cursor.fetchall()}
    day_sale_tbl = "day_sale_t" if "day_sale_t" in day_tables else "day_sale"

    # Cust_M vs Cust_M2 중복 처리
    cursor.execute(
        "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='Cust_M2'"
    )
    has_cust_m2 = cursor.fetchone()[0] > 0

    if has_cust_m2:
        cust_m_query = "SELECT * FROM [Cust_M]"  # Cust_M이 더 많은 컬럼 보유
    else:
        cust_m_query = "SELECT * FROM [Cust_M]"

    EXPORTS = [
        ("Cust_M.csv",        cust_m_query),
        ("Title_M.csv",       "SELECT * FROM [Title_M]"),
        ("Theater_M.csv",     "SELECT * FROM [Theater_M]"),
        ("Thea_Fee_M.csv",    "SELECT * FROM [Thea_Fee_M]"),
        ("Order_T.csv",       "SELECT * FROM [Order_T]"),
        ("Order_M.csv",       "SELECT * FROM [Order_M]"),
        ("day_sale.csv",      f"SELECT * FROM [{day_sale_tbl}]"),
        ("cust_m_fund.csv",   "SELECT * FROM [cust_m_fund]"),
        ("cust_m_fund_d.csv", "SELECT * FROM [cust_m_fund_d]"),
        ("T_Share.csv",       "SELECT * FROM [T_Share]"),
    ]

    # Theater_M2 선택적 추가
    cursor.execute(
        "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='Theater_M2'"
    )
    if cursor.fetchone()[0] > 0:
        EXPORTS.insert(3, ("Theater_M2.csv", "SELECT * FROM [Theater_M2]"))

    # Day_Sale_T2 선택적 추가
    if "Day_Sale_T2" in day_tables:
        EXPORTS.append(("Day_Sale_T2.csv", "SELECT * FROM [Day_Sale_T2]"))

    for csv_name, query in EXPORTS:
        out_path = os.path.join(EXPORT_DIR, csv_name)
        log(f"  {csv_name} export 중...")
        cursor.execute(query)
        cols = [c[0] for c in cursor.description]
        rows = cursor.fetchall()
        with open(out_path, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(cols)
            w.writerows(rows)
        log(f"  → {len(rows):,}건")

    cursor.close()
    conn.close()
    log("CSV export 완료")


# ── STEP 3: PostgreSQL DB 생성 ─────────────────────────────────────────────────

def step3_create_pg_db(db_name):
    log(f"STEP 3: PostgreSQL DB '{db_name}' 생성", "STEP")

    # 기존 접속 세션 종료 후 삭제
    psql(
        f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='{db_name}'"
    )
    psql(f"DROP DATABASE IF EXISTS {db_name}")
    _, rc = psql(f"CREATE DATABASE {db_name}")
    if rc != 0:
        log(f"DB 생성 실패: {db_name}", "ERROR")
        sys.exit(1)
    log(f"DB '{db_name}' 생성 완료")


# ── STEP 4: settings.py 수정 ───────────────────────────────────────────────────

def step4_update_settings(db_name):
    log(f"STEP 4: settings.py → DB명을 '{db_name}'으로 변경", "STEP")

    with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
        content = f.read()

    import re
    new_content = re.sub(
        r'("NAME"\s*:\s*)"[^"]*"',
        f'\\1"{db_name}"',
        content
    )

    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        f.write(new_content)

    log(f"settings.py 수정 완료")


# ── STEP 5: 마이그레이션 ───────────────────────────────────────────────────────

def step5_migrate():
    log("STEP 5: Django 마이그레이션", "STEP")
    out = manage("migrate")
    log("마이그레이션 완료")


# ── STEP 6: 데이터 import ─────────────────────────────────────────────────────

def step6_import_data():
    log("STEP 6: 데이터 import", "STEP")

    def imp(cmd_name, csv_name, timeout=7200):
        csv_path = os.path.join(EXPORT_DIR, csv_name)
        if not os.path.exists(csv_path):
            log(f"{csv_name} 없음, 건너뜀", "WARN")
            return
        log(f"  import {cmd_name} ← {csv_name}")
        out = manage(f'{cmd_name} "{csv_path}"', timeout=timeout)
        # 마지막 출력 줄 표시
        last = [l for l in out.splitlines() if l.strip()]
        if last:
            log(f"  → {last[-1]}")

    # 1. 거래처 (Cust_M만 - 전체 컬럼 포함)
    imp("import_clients", "Cust_M.csv")

    # 2. 영화
    imp("import_movie", "Title_M.csv")

    # 3. 극장관명
    imp("import_theater", "Theater_M.csv")
    imp("import_theater", "Theater_M2.csv")   # 없으면 자동 건너뜀

    # 4. 요금
    imp("import_rate", "Thea_Fee_M.csv")

    # 5. 오더
    imp("import_order", "Order_T.csv")
    imp("import_orderlist", "Order_M.csv")

    # 6. 스코어 (대용량 - fast 버전 사용)
    log("  스코어 import (고속 COPY 방식)...")
    imp("import_score_fast", "day_sale.csv",    timeout=3600)
    imp("import_score_fast", "Day_Sale_T2.csv", timeout=3600)

    # 7. Fund
    imp("import_cust_m_fund",   "cust_m_fund.csv")
    imp("import_cust_m_fund_d", "cust_m_fund_d.csv")

    # 8. 배분율(Rate/Share)
    imp("import_share", "T_Share.csv")

    # 9. 영화 데이터 업데이트
    imp("update_movie",  "Title_M.csv")
    imp("update_movies", "Title_M.csv")

    # 10. 배급사별 극장명 매핑 (theater_map.xls - 프로젝트 내 고정 파일)
    theater_map_xls = os.path.join(DJANGO_DIR, "client", "rawdata", "theater_map.xls")
    if os.path.exists(theater_map_xls):
        for dist_id, dist_name in [(874, "넥스트엔터테인먼트월드"), (1422, "콘텐츠판다")]:
            log(f"  import_theater_map ← {dist_name} (ID={dist_id})")
            out = manage(f'import_theater_map "{theater_map_xls}" {dist_id}')
            last = [l for l in out.splitlines() if l.strip()]
            if last:
                log(f"  → {last[-1]}")
    else:
        log(f"theater_map.xls 없음, 건너뜀: {theater_map_xls}", "WARN")

    log("데이터 import 완료")


# ── STEP 7: 슈퍼유저 생성 ────────────────────────────────────────────────────

def step7_create_superuser():
    log("STEP 7: 슈퍼유저 생성 (admin / 1)", "STEP")
    script = (
        "from django.contrib.auth import get_user_model; "
        "U = get_user_model(); "
        "U.objects.filter(username='admin').delete(); "
        "U.objects.create_superuser('admin', 'admin@clms.com', '1')"
    )
    out = manage(f'shell -c "{script}"')
    log("슈퍼유저 생성 완료 (admin / 1)")


# ── STEP 7b: Client별 User 계정 생성 ─────────────────────────────────────────

def step7b_create_client_users():
    log("STEP 7b: Client login_id/login_password → User 계정 생성", "STEP")
    out = manage("create_client_users")
    last = [l for l in out.splitlines() if l.strip()]
    if last:
        log(f"  → {last[-1]}")
    log("Client User 계정 생성 완료")


# ── STEP 8: 임시 SQL Server DB 삭제 ──────────────────────────────────────────

def step8_cleanup_mssql():
    log("STEP 8: 임시 SQL Server DB 삭제", "STEP")
    sqlcmd(f"""
        ALTER DATABASE [{MSSQL_TEMP_DB}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
        DROP DATABASE [{MSSQL_TEMP_DB}];
    """)
    log(f"'{MSSQL_TEMP_DB}' 삭제 완료")


# ── 메인 ──────────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    bak_path = sys.argv[1]
    db_name = sys.argv[2] if len(sys.argv) >= 3 else "clms_db_new"

    if not os.path.exists(bak_path):
        log(f".bak 파일을 찾을 수 없습니다: {bak_path}", "ERROR")
        sys.exit(1)

    start = time.time()
    log("=" * 60)
    log(f"CLMS 전체 DB 복구 시작")
    log(f"  .bak 파일: {bak_path}")
    log(f"  새 DB명  : {db_name}")
    log("=" * 60)

    step1_restore_bak(bak_path)
    step2_export_csv()
    step3_create_pg_db(db_name)
    step4_update_settings(db_name)
    step5_migrate()
    step6_import_data()
    step7_create_superuser()
    step7b_create_client_users()
    step8_cleanup_mssql()

    elapsed = int(time.time() - start)
    log("=" * 60)
    log(f"전체 복구 완료! (소요시간: {elapsed // 60}분 {elapsed % 60}초)")
    log(f"  PostgreSQL DB: {db_name} @ {PG_HOST}")
    log(f"  슈퍼유저: admin / 1")
    log("=" * 60)


if __name__ == "__main__":
    main()
