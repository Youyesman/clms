"""
SQL Server clms_restore DB에서 필요한 테이블을 UTF-8 CSV로 export
"""
import pyodbc
import csv
import os

os.makedirs(r'C:\clms_export', exist_ok=True)

conn = pyodbc.connect(
    'DRIVER={ODBC Driver 17 for SQL Server};'
    'SERVER=localhost;'
    'DATABASE=clms_restore;'
    'Trusted_Connection=yes;'
)

# (출력 CSV 파일명, SQL 쿼리)
EXPORTS = [
    # Cust_M: Cust_M2에 없는 클라이언트만 (중복 방지)
    ('Cust_M.csv',
     'SELECT * FROM [Cust_M] WHERE ctm_code NOT IN (SELECT ctm_code FROM [Cust_M2])'),
    # Cust_M2: 전체 (더 많은 컬럼 보유 - ctm_area_s2, multi, dir_k 등)
    ('Cust_M2.csv',
     'SELECT * FROM [Cust_M2]'),
    ('Title_M.csv',     'SELECT * FROM [Title_M]'),
    ('Theater_M.csv',   'SELECT * FROM [Theater_M]'),
    ('Theater_M2.csv',  'SELECT * FROM [Theater_M2]'),
    ('Thea_Fee_M.csv',  'SELECT * FROM [Thea_Fee_M]'),
    ('Order_T.csv',     'SELECT * FROM [Order_T]'),
    ('Order_M.csv',     'SELECT * FROM [Order_M]'),
    ('day_sale.csv',    'SELECT * FROM [day_sale_t]'),   # 실제 테이블명: day_sale_t
    ('Day_Sale_T2.csv', 'SELECT * FROM [Day_Sale_T2]'),
]

cursor = conn.cursor()

for csv_name, query in EXPORTS:
    out_path = rf'C:\clms_export\{csv_name}'
    print(f'Exporting -> {out_path} ...', flush=True)

    cursor.execute(query)
    columns = [col[0] for col in cursor.description]
    rows = cursor.fetchall()

    with open(out_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(columns)
        writer.writerows(rows)

    print(f'  -> {len(rows):,} rows exported', flush=True)

cursor.close()
conn.close()
print('\nAll done!')
