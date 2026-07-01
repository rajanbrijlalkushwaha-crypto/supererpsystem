@echo off
title Epsilon ERP - Restart
color 0E

echo ============================================
echo   EPSILON ERP - RESTARTING...
echo ============================================
echo.

cd /d "%~dp0"

echo Restarting Backend...
pm2 restart epsilon-backend

echo Restarting Frontend...
pm2 restart epsilon-frontend

echo.
pm2 list
echo.
echo ============================================
echo   Epsilon ERP RESTARTED.
echo   Backend  : http://localhost:5000
echo   Frontend : http://localhost
echo ============================================
pause
