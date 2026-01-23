# Deployment Guide (Ubuntu 22.04 + Apache2)

This directory contains scripts and configuration files to deploy the CLMS application on an Ubuntu server without Docker.

## Prerequisites
- **OS**: Ubuntu 22.04 LTS
- **User**: Assumed `ubuntu` (default for AWS EC2). If different, update paths in `clms-backend.service` and `clms.conf`.
- **Project Location**: Assumed `/home/clms`

## Deployment Steps

0.  **기존 Docker 서비스 중지**:
    만약 현재 서버에서 Docker로 서비스가 실행 중이라면, 포트 충돌(80번 등)을 방지하기 위해 먼저 중지해야 합니다.
    ```bash
    cd /home/clms # 기존 docker-compose.yml이 있는 위치
    sudo docker-compose down
    ```

1.  **Transfer Files**: Copy the entire project to the server (e.g., via `git clone` or `scp`).
    ```bash
    # (Example) 만약 로컬에서 올린다면:
    scp -r c:\clms root@your_server_ip:/home/clms
    ```

2.  **Backend Setup**:
    ```bash
    cd /home/clms/deployment
    chmod +x setup_backend.sh
    ./setup_backend.sh
    ```
    *Important: After setup, create a `.env` file in `castingline_backend/` with your production secrets (DB_PASSWORD, SECRET_KEY, etc).*

3.  **Frontend Setup**:
    ```bash
    chmod +x setup_frontend.sh
    ./setup_frontend.sh
    ```

4.  **Configure System Services**:
    - **Gunicorn Service**:
      ```bash
      sudo cp clms-backend.service /etc/systemd/system/
      sudo systemctl start clms-backend
      sudo systemctl enable clms-backend
      ```
    - **Apache Configuration**:
      ```bash
      sudo cp clms.conf /etc/apache2/sites-available/
      sudo a2enmod proxy proxy_http rewrite
      sudo a2ensite clms
      sudo systemctl reload apache2
      ```

## Troubleshooting
- Check Gunicorn status: `sudo systemctl status clms-backend`
- Check Apache logs: `/var/log/apache2/error.log`
