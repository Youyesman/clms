Write-Host "Starting Backend on Port 8001..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd castingline_backend; .\venv\Scripts\python manage.py runserver 8001"

Write-Host "Starting Frontend on Port 3001 connected to Backend 8001..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd castingline_frontend; `$env:PORT='3001'; `$env:REACT_APP_API_PORT='8001'; npm run start"
