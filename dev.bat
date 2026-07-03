@echo off
cd /d "%~dp0"

echo ========================================
echo  Epsilon ERP - Update and Start
echo ========================================

echo [1/5] Force pulling latest code from git...
git fetch origin main
git reset --hard origin/main

echo [2/5] Killing all old node processes...
taskkill /F /IM node.exe 2>nul
timeout /t 3 /nobreak >nul

echo [3/5] Installing server dependencies...
call npm install --legacy-peer-deps

echo [4/5] Installing frontend dependencies...
cd frontend
call npm install --legacy-peer-deps
cd ..

echo [5/5] Starting server (frontend + backend)...
npm run dev
