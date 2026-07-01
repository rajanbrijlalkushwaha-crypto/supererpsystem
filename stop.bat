@echo off
title Epsilon ERP - Stop
color 0C

echo ============================================
echo   EPSILON ERP - STOPPING...
echo ============================================
echo.

cd /d "%~dp0"

pm2 stop epsilon-backend
pm2 stop epsilon-frontend

echo.
pm2 list
echo.
echo ============================================
echo   Epsilon ERP STOPPED.
echo ============================================
pause
