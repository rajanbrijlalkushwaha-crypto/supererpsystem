@echo off
setlocal
title Epsilon ERP - Stop (PM2)
color 0C
cd /d "%~dp0"

rem  Stops the ERP that pm2-start.cmd started. It will NOT start by itself at the next switch-on
rem  until pm2-start.cmd is run again.
set APP=epsilon-erp
set PM2_HOME=C:\ProgramData\pm2

echo ============================================
echo   EPSILON ERP - STOP
echo ============================================
echo.

where pm2 >nul 2>nul || (echo PM2 is not installed - nothing to stop. & pause & exit /b 0)

call pm2 delete %APP%
call pm2 save --force

echo.
call pm2 list
echo.
echo ============================================
echo   ERP STOPPED.  Run pm2-start.cmd to start it again.
echo ============================================
pause
