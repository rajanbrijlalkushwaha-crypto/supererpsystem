@echo off
title Epsilon ERP - Update
color 0B

echo ============================================
echo   EPSILON ERP - UPDATING...
echo ============================================
echo.

cd /d "%~dp0"

echo [1/4] Pulling latest code from GitHub...
git fetch --all
git reset --hard epsilonportal/main 2>nul || git reset --hard origin/main

echo.
echo [2/4] Installing any new dependencies...
call npm install --silent
cd frontend
call npm install --silent
cd ..

echo.
echo [3/4] Building frontend...
cd frontend
set DISABLE_ESLINT_PLUGIN=true
set CI=false
call npx react-scripts build
cd ..

echo.
echo [4/4] Killing old node processes...
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul

echo.
echo Starting Backend (port 5000)...
start "Epsilon Backend" cmd /k "cd /d %~dp0 && node server.js"

echo Starting Frontend (port 3000)...
start "Epsilon Frontend" cmd /k "cd /d %~dp0 && npx serve -s frontend\build -l 3000"

echo.
echo ============================================
echo   UPDATE COMPLETE!
echo   Backend  : http://localhost:5000
echo   Frontend : http://localhost:3000
echo   Web      : http://localhost
echo ============================================
pause
