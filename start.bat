@echo off
title Epsilon ERP - Start
color 0A

cd /d "%~dp0"

echo ============================================
echo   EPSILON ERP - STARTING...
echo ============================================
echo.

echo Killing any existing Node processes...
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul

echo Starting Backend (port 5000)...
start "Epsilon Backend" cmd /k "cd /d %~dp0 && node server.js"

echo Starting Frontend (port 3000)...
start "Epsilon Frontend" cmd /k "cd /d %~dp0 && npx serve -s frontend\build -l 3000"

echo.
echo ============================================
echo   Epsilon ERP STARTED!
echo   Backend  : http://localhost:5000
echo   Frontend : http://localhost:3000
echo   Web      : http://localhost
echo ============================================
echo.
echo Two windows opened - do not close them.
pause
