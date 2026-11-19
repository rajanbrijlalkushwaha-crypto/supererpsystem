@echo off
setlocal
title Epsilon ERP - Update from GitHub
color 0B
cd /d "%~dp0"

rem  needs administrator (PM2 restart + auto start) - ask once, then run again as administrator
net session >nul 2>nul && goto admin
echo Asking for administrator permission...
set "SELF=%~f0"
rem  /k keeps the administrator window open at the end, so any error stays on screen
powershell -NoProfile -Command "Start-Process cmd.exe -ArgumentList ('/k ' + [char]34 + $env:SELF + [char]34) -Verb RunAs"
echo The update continues in the new "Administrator" window - this one closes in 10 seconds.
timeout /t 10 >nul
exit /b
:admin
rem  git: trust this folder when run as administrator
set GIT_CONFIG_COUNT=1
set GIT_CONFIG_KEY_0=safe.directory
set GIT_CONFIG_VALUE_0=*
rem  run from a copy in TEMP: the update replaces this file, and Windows misreads a batch file changed while it runs
if /i not "%~1"=="/run" (copy /y "%~f0" "%TEMP%\epsilon-erp-update.cmd" >nul & call "%TEMP%\epsilon-erp-update.cmd" /run "%~dp0." & exit /b)
cd /d "%~2"
set "ERPDIR=%~2"

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
echo [4/4] Restarting the ERP with PM2 (stop, then start - no extra window)...
if not defined ERPDIR set "ERPDIR=%CD%"
call "%ERPDIR%\pm2-start.cmd" quiet
if errorlevel 1 goto failstart
rem  safety net: if the ERP does not answer after the PM2 start, show why and start it the old way (own window)
powershell -NoProfile -Command "for ($i=0; $i -lt 6; $i++) { try { $null = Invoke-WebRequest -UseBasicParsing -TimeoutSec 10 http://localhost:%PORT%/; exit 0 } catch { Start-Sleep -Seconds 5 } }; exit 1"
if errorlevel 1 (
  color 0E
  echo.
  echo The ERP did not start with PM2. Its last messages:
  call pm2 logs epsilon-erp --lines 30 --nostream
  call pm2 delete epsilon-erp >nul 2>nul
  echo.
  echo Starting the ERP in its own window instead - keep the "Epsilon ERP" window open.
  start "Epsilon ERP" cmd /k "cd /d "%ERPDIR%" && node server.js"
)
title Epsilon ERP - Update from GitHub

echo.
echo ============================================
echo   UPDATE COMPLETE
echo   Open: http://localhost   or   http://localhost:%PORT%
echo   Runs in the background with PM2 - no window to keep open.
echo ============================================
pause
exit /b 0

:failstart
color 0C
echo.
echo ============================================
echo   UPDATE DONE BUT THE ERP DID NOT START.
echo   Read the error above, then run pm2-start.cmd as administrator.
echo ============================================
pause
exit /b 1

:fail
color 0C
echo.
echo ============================================
echo   UPDATE FAILED - the ERP that was running is NOT stopped.
echo   Read the error above, fix it, and run this again.
echo ============================================
pause
exit /b 1
