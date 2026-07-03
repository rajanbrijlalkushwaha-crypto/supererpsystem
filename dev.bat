@echo off
cd /d "%~dp0"

echo Pulling latest code...
git pull origin main

echo Killing processes on port 3000 and 5000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5000 " ^| findstr "LISTENING"') do (
    echo Killing PID %%a on port 5000
    taskkill /F /PID %%a 2>nul
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    echo Killing PID %%a on port 3000
    taskkill /F /PID %%a 2>nul
)
timeout /t 3 /nobreak >nul

echo Installing dependencies...
call npm install --legacy-peer-deps
cd frontend && call npm install --legacy-peer-deps && cd ..

echo Starting dev server...
npm run dev
