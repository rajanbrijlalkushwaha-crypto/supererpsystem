@echo off
cd /d "%~dp0"

echo Pulling latest code...
git pull origin main

echo Stopping old server processes...
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul

echo Installing dependencies...
call npm install --legacy-peer-deps
cd frontend && call npm install --legacy-peer-deps && cd ..

echo Starting dev server...
npm run dev
