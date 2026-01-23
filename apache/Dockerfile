FROM httpd:2.4-alpine

# 설정 파일 복사
COPY clms.conf /usr/local/apache2/conf/clms.conf

# 기본 httpd.conf 맨 아래에 우리 설정을 Include 하도록 수정
RUN echo "Include conf/clms.conf" >> /usr/local/apache2/conf/httpd.conf
###################################