"""
원격 SQL Server(clmsdb)에서 필요한 테이블을 UTF-8 CSV로 export
- 서버: 211.57.203.40,1433 (SQL 인증: logsen)
- 대상: C:\\clms_export\\
- day_sale_t(1,084만 행)는 배치로 스트리밍 export (메모리 안전)
"""
import pyodbc
import csv
import os
import sys
import time

OUT_DIR = r"C:\clms_export"
os.makedirs(OUT_DIR, exist_ok=True)

conn = pyodbc.connect(
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=211.57.203.40,1433;"
    "DATABASE=clmsdb;"
    "UID=logsen;"
    "PWD=kk338790!@;"
    "TrustServerCertificate=yes;",
    timeout=60,
)

# (출력 CSV 파일명, SQL 쿼리)
EXPORTS = [
    # Cust_M: Cust_M2에 없는 클라이언트만 (중복 방지)
    ("Cust_M.csv",
     "SELECT * FROM [Cust_M] WHERE ctm_code NOT IN (SELECT ctm_code FROM [Cust_M2])"),
    ("Cust_M2.csv",      "SELECT * FROM [Cust_M2]"),
    ("Title_M.csv",      "SELECT * FROM [Title_M]"),
    ("Theater_M.csv",    "SELECT * FROM [Theater_M]"),
    ("Theater_M2.csv",   "SELECT * FROM [Theater_M2]"),
    ("Thea_Fee_M.csv",   "SELECT * FROM [Thea_Fee_M]"),
    ("Order_T.csv",      "SELECT * FROM [Order_T]"),
    ("Order_M.csv",      "SELECT * FROM [Order_M]"),
    ("cust_m_fund.csv",  "SELECT * FROM [cust_m_fund]"),
    ("cust_m_fund_d.csv","SELECT * FROM [cust_m_fund_d]"),
    ("T_Share.csv",      "SELECT * FROM [T_Share]"),
    ("Day_Sale_T2.csv",  "SELECT * FROM [Day_Sale_T2]"),
    # 가장 큰 테이블 - 마지막
    ("day_sale.csv",     "SELECT * FROM [day_sale_t]"),
]

BATCH = 50000

for csv_name, query in EXPORTS:
    out_path = os.path.join(OUT_DIR, csv_name)
    t0 = time.time()
    print(f"Exporting -> {out_path} ...", flush=True)

    cursor = conn.cursor()
    cursor.execute(query)
    columns = [col[0] for col in cursor.description]

    total = 0
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(columns)
        while True:
            rows = cursor.fetchmany(BATCH)
            if not rows:
                break
            writer.writerows(rows)
            total += len(rows)
            if total % 500000 == 0:
                print(f"    ... {total:,} rows", flush=True)
    cursor.close()
    print(f"  -> {total:,} rows  ({time.time()-t0:.1f}s)", flush=True)

conn.close()
print("\nAll done!", flush=True)
