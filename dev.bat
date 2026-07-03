@echo off
cd /d "%~dp0"

echo ========================================
echo  Epsilon ERP - Update and Start
echo ========================================

echo [1/6] Removing git lock if present...
if exist ".git\index.lock" del /F ".git\index.lock"

echo [2/6] Pulling latest code...
git pull origin main

echo [3/6] Killing process on port 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    echo Killing PID %%a
    taskkill /F /PID %%a 2>nul
)
timeout /t 2 /nobreak >nul

echo [4/6] Installing server dependencies...
call npm install --legacy-peer-deps

echo [5/6] Installing and building frontend (fresh)...
cd frontend
if exist node_modules rmdir /S /Q node_modules
call npm install --legacy-peer-deps
call npm run build
cd ..

echo [6/6] Starting server...
node server.js
