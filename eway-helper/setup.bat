@echo off
rem One-time setup of the E-Way Helper on this PC.
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Install it from https://nodejs.org ^(LTS^) and run this again. & pause & exit /b 1)
echo Installing...
call npm install --omit=dev --no-audit --no-fund || (echo Install failed. & pause & exit /b 1)
echo.
echo In the ERP open: Delivery Challan ^> E-Way Helper ^> Pair this PC, and note the 6-digit code.
set /p ERP=ERP address (e.g. http://192.168.1.10:5000):
set /p CODE=Pairing code:
node index.js --pair %ERP% %CODE% || (pause & exit /b 1)
echo Starting the helper with Windows...
if not exist "%APPDATA%\EpsilonEwayHelper" mkdir "%APPDATA%\EpsilonEwayHelper"
>"%APPDATA%\EpsilonEwayHelper\install-dir.txt" echo %~dp0.
copy /y "%~dp0start-hidden.vbs" "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Epsilon E-Way Helper.vbs" >nul
wscript "%~dp0start-hidden.vbs"
echo Done. The helper now runs in the background (log: %APPDATA%\EpsilonEwayHelper\helper.log).
pause
