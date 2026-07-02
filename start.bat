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

echo Starting Epsilon ERP Server (port 3000)...
start "Epsilon ERP" cmd /k "cd /d %~dp0 && node server.js"

echo.
echo ============================================
echo   Epsilon ERP STARTED!
echo   Open: http://localhost
echo   LAN:  http://192.168.1.3
echo ============================================
echo.
echo Do NOT close the opened window.
pause
