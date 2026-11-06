@echo off
setlocal
title Epsilon ERP - Update from GitHub
color 0B
cd /d "%~dp0"

rem  Run this on the SERVER. It takes the latest code from GitHub, builds it and restarts the ERP.
rem  Your data is safe: the Database folder, .env and .secrets are never in GitHub and are never touched.
set REPO=https://github.com/rajanbrijlalkushwaha-crypto/supererpsystem.git
set BRANCH=main
set PORT=5000

echo ============================================
echo   EPSILON ERP - UPDATE FROM GITHUB
echo ============================================
echo.

where git >nul 2>nul || (echo Git is not installed on the server. Install it from https://git-scm.com & pause & exit /b 1)
where node >nul 2>nul || (echo Node.js is not installed on the server. Install it from https://nodejs.org & pause & exit /b 1)

rem  first time: connect this folder to GitHub
if not exist ".git" (
  echo First time - connecting this folder to GitHub...
  git init -q
  git remote add origin %REPO%
)
git remote get-url origin >nul 2>nul || git remote add origin %REPO%
git remote set-url origin %REPO%

echo [1/4] Downloading the latest code...
git fetch origin %BRANCH%
if errorlevel 1 goto fail
git reset --hard origin/%BRANCH%
if errorlevel 1 goto fail
git branch -M %BRANCH% >nul 2>nul
git branch --set-upstream-to=origin/%BRANCH% >nul 2>nul

echo.
echo [2/4] Installing new packages (if any)...
call npm install --no-audit --no-fund
if errorlevel 1 goto fail
pushd frontend
call npm install --no-audit --no-fund
if errorlevel 1 (popd & goto fail)

echo.
echo [3/4] Building the screens (takes a few minutes)...
set DISABLE_ESLINT_PLUGIN=true
set CI=false
set GENERATE_SOURCEMAP=false
call npm run build
if errorlevel 1 (popd & goto fail)
popd

echo.
echo [4/4] Restarting the ERP...
rem  stop only the ERP server (the program on port %PORT%), not other Node programs
rem  started with pm2-start.cmd? then PM2 restarts it (and keeps auto start); else the old way in its own window
set PM2_HOME=C:\ProgramData\pm2
set USEPM2=
if exist "%PM2_HOME%\dump.pm2" findstr /C:"epsilon-erp" "%PM2_HOME%\dump.pm2" >nul 2>nul && set USEPM2=1
if defined USEPM2 (
  call pm2 restart epsilon-erp --update-env
  goto started
)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do taskkill /F /PID %%p >nul 2>nul
timeout /t 2 /nobreak >nul
start "Epsilon ERP" cmd /k "cd /d %~dp0 && node server.js"
:started

echo.
echo ============================================
echo   UPDATE COMPLETE
echo   Open: http://localhost   or   http://localhost:%PORT%
if not defined USEPM2 echo   Keep the "Epsilon ERP" window open.
echo ============================================
pause
exit /b 0

:fail
color 0C
echo.
echo ============================================
echo   UPDATE FAILED - the ERP that was running is NOT stopped.
echo   Read the error above, fix it, and run this again.
echo ============================================
pause
exit /b 1
