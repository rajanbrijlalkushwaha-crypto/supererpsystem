@echo off
cd /d "%~dp0"

echo Pulling latest code...
git pull origin main

echo Installing dependencies...
call npm install --legacy-peer-deps
cd frontend && call npm install --legacy-peer-deps && cd ..

echo Starting dev server...
npm run dev
