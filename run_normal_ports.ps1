Write-Host "Starting Backend on Port 8000..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd castingline_backend; .\venv\Scripts\python manage.py runserver 8000"

Write-Host "Starting Frontend on Port 3000 connected to Backend 8000..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd castingline_frontend; `$env:PORT='3000'; `$env:REACT_APP_API_PORT='8000'; npm run start"
