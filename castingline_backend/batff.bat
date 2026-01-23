@echo off
echo Starting script execution...

:: 1. 극장정보(배급사,제작사,극장 전체)
echo Importing clients...
python manage.py import_clients C:\clms\castingline_backend\client\rawdata\Cust_M.csv
python manage.py import_clients C:\clms\castingline_backend\client\rawdata\Cust_M2.csv

:: 2. 영화관리
echo Importing movies...
python manage.py import_movie C:\clms\castingline_backend\client\rawdata\Title_M.csv

:: 3. 극장관명 정보
echo Importing theaters...
python manage.py import_theater C:\clms\castingline_backend\client\rawdata\Theater_M.csv
python manage.py import_theater C:\clms\castingline_backend\client\rawdata\Theater_M2.csv

:: 4. 요금 정보
echo Importing rates...
python manage.py import_rate C:\clms\castingline_backend\client\rawdata\Thea_Fee_M.csv

:: 5. 배급사별 극장명 관리
echo Note: Distributor theater management command not specified.
:: Add command here if available

:: 6. 오더 정보
echo Importing orders...
python manage.py import_order C:\clms\castingline_backend\client\rawdata\Order_T.csv

:: 7. 스코어 정보
echo Importing scores...
python manage.py import_score C:\clms\castingline_backend\client\rawdata\day_sale.csv
python manage.py import_score C:\clms\castingline_backend\client\rawdata\Day_Sale_T2.csv

echo Importing scores...
python manage.py import_cust_m_fund C:\clms\castingline_backend\client\rawdata\cust_m_fund.csv
python manage.py import_cust_m_fund_d C:\clms\castingline_backend\client\rawdata\cust_m_fund_d.csv

echo Importing theater_map...
:: 넥스트
python manage.py import_theater_map C:\clms\castingline_backend\client\rawdata\theater_map.xls 874 

:: 콘텐츠판다
python manage.py import_theater_map C:\clms\castingline_backend\client\rawdata\theater_map.xls 1422 
echo Script execution completed.
pause