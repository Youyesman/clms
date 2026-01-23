# --- Stage 1: Build ---
FROM node:18-alpine AS builder

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install

COPY . .
RUN yarn build

# --- Stage 2: Serve via Apache ---
FROM httpd:2.4-alpine

# 빌드 결과물 복사
COPY --from=builder /app/build/ /usr/local/apache2/htdocs/

# .htaccess 복사
COPY .htaccess /usr/local/apache2/htdocs/.htaccess

# Apache 설정 수정: mod_rewrite 활성화 및 .htaccess 허용
RUN sed -i '/LoadModule rewrite_module/s/^#//g' /usr/local/apache2/conf/httpd.conf && \
    sed -i 's#AllowOverride [Nn]one#AllowOverride All#' /usr/local/apache2/conf/httpd.conf
