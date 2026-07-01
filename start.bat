@echo off
title Epsilon ERP - Start
color 0A

echo ============================================
echo   EPSILON ERP - STARTING...
echo ============================================
echo.

:: Check if PM2 is installed
where pm2 >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] PM2 not found. Installing PM2...
    npm install -g pm2
    npm install -g pm2-windows-startup
)

:: Move to project root
cd /d "%~dp0"

echo [1/3] Starting Backend Server (port 5000)...
echo [2/3] Starting Frontend Server (port 3000)...
pm2 start ecosystem.config.js

echo.
echo [3/3] Saving PM2 process list...
pm2 save

echo.
echo ============================================
pm2 list
echo ============================================
echo.
echo   Backend  : http://localhost:5000
echo   Frontend : http://localhost
echo.
echo ============================================
pause
