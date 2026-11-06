@echo off
setlocal
title Epsilon ERP - Upload code to GitHub
color 0B
cd /d "%~dp0"

rem  Run this on YOUR PC after making changes. It uploads the code (not the Database) to GitHub.
set REPO=https://github.com/rajanbrijlalkushwaha-crypto/supererpsystem.git
set REMOTE=supererp

echo ============================================
echo   UPLOAD CODE TO GITHUB
echo ============================================
echo.

where git >nul 2>nul || (echo Git is not installed on this PC. Install it from https://git-scm.com & pause & exit /b 1)

git remote get-url %REMOTE% >nul 2>nul || git remote add %REMOTE% %REPO%
git remote set-url %REMOTE% %REPO%

rem  name / email on the commit (asked only once)
for /f "delims=" %%e in ('git config user.email') do set GEMAIL=%%e
if "%GEMAIL%"=="" (
  set /p GNAME=Your name for the code history:
  set /p GEMAIL=Your email for the code history:
  call git config --global user.name "%%GNAME%%"
  call git config --global user.email "%%GEMAIL%%"
)

set MSG=
set /p MSG=What did you change? (short note, Enter to skip):
if "%MSG%"=="" set MSG=Update %date% %time%

echo.
echo [1/2] Saving changes...
git add -A
git commit -m "%MSG%"
if errorlevel 1 echo (nothing new to save - uploading what is already saved)

echo.
echo [2/2] Uploading to GitHub...
git push %REMOTE% HEAD:main
if errorlevel 1 (
  color 0C
  echo.
  echo UPLOAD FAILED. Check the internet / GitHub login and run this again.
  pause
  exit /b 1
)

echo.
echo ============================================
echo   DONE. Now run  server-update.cmd  on the server.
echo ============================================
pause
