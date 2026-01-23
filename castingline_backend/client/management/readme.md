1. 극장정보(배급사,제작사,극장 전체)
   python manage.py import_clients C:\Users\leslie\sqltest\client\rawdata\Cust_M.csv
   python manage.py import_clients C:\Users\leslie\sqltest\client\rawdata\Cust_M2.csv

2. 영화관리
   python manage.py import_movie C:\Users\leslie\sqltest\client\rawdata\Title_M.csv
3. 극장관명 정보
   python manage.py import_theater C:\Users\leslie\sqltest\client\rawdata\Theater_M.csv
   python manage.py import_theater C:\Users\leslie\sqltest\client\rawdata\Theater_M2.csv
4. 요금 정보
   python manage.py import_rate C:\Users\leslie\sqltest\client\rawdata\Thea_Fee_M.csv

5. 배급사별 극장명 관리

6. 오더 정보
   python manage.py import_order C:\Users\leslie\sqltest\client\rawdata\Order_T.csv
   python manage.py import_orderlist C:\Users\leslie\sqltest\client\rawdata\Order_M.csv
   
7. 스코어 정보
   python manage.py import_score C:\Users\leslie\sqltest\client\rawdata\day_sale.csv
   python manage.py import_score C:\Users\leslie\sqltest\client\rawdata\Day_Sale_T2.csv
