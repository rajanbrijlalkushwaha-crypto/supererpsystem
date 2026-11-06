@echo off
setlocal
title Epsilon ERP - Start (PM2)
color 0A
cd /d "%~dp0"

rem  Starts the ERP with PM2 (keeps it running, restarts it if it crashes)
rem  and makes it start by itself whenever the server PC is switched on.
rem  Run it with right-click > "Run as administrator".
set APP=epsilon-erp
set PORT=5000
set PM2_HOME=C:\ProgramData\pm2

echo ============================================
echo   EPSILON ERP - START WITH PM2
echo ============================================
echo.

net session >nul 2>nul || (color 0C & echo Please right-click this file and choose "Run as administrator". & pause & exit /b 1)
where node >nul 2>nul || (color 0C & echo Node.js is not installed. Install it from https://nodejs.org & pause & exit /b 1)

rem  1. PM2 itself
for /f "delims=" %%r in ('npm root -g') do set NPMROOT=%%r
if not exist "%NPMROOT%\pm2\bin\pm2" (
  echo Installing PM2...
  call npm install -g pm2
)
if not exist "%NPMROOT%\pm2\bin\pm2" (color 0C & echo PM2 could not be installed. & pause & exit /b 1)
for /f "delims=" %%n in ('where node') do if not defined NODEEXE set NODEEXE=%%n
set PM2="%NODEEXE%" "%NPMROOT%\pm2\bin\pm2"

rem  one PM2 folder for everyone (you and the start-up task use the same list)
if not exist "%PM2_HOME%" mkdir "%PM2_HOME%"
setx PM2_HOME "%PM2_HOME%" /M >nul

rem  2. stop a copy started the old way (start.bat window) so the port is free
%PM2% delete %APP% >nul 2>nul
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do taskkill /F /PID %%p >nul 2>nul
timeout /t 2 /nobreak >nul

rem  3. start the ERP and remember it
echo Starting the ERP...
%PM2% start server.js --name %APP% --cwd "%~dp0." --time
if errorlevel 1 (color 0C & echo Could not start. & pause & exit /b 1)
%PM2% save

rem  4. start by itself when the PC is switched on (even before anyone logs in)
set BOOT=%PM2_HOME%\boot.cmd
> "%BOOT%" echo @echo off
>> "%BOOT%" echo set PM2_HOME=%PM2_HOME%
>> "%BOOT%" echo cd /d "%~dp0"
>> "%BOOT%" echo %PM2% resurrect
schtasks /Create /F /TN "Epsilon ERP" /SC ONSTART /DELAY 0000:30 /RU SYSTEM /RL HIGHEST /TR "\"%BOOT%\"" >nul
if errorlevel 1 (echo Could not set the auto start - the ERP is running now, but run this again after a restart.) else (echo Auto start when the PC is switched on: ON)

echo.
%PM2% list
echo.
echo ============================================
echo   ERP IS RUNNING  -  http://localhost   or   http://localhost:%PORT%
echo   You can close this window. It keeps running.
echo   Logs:  pm2 logs %APP%
echo ============================================
pause
