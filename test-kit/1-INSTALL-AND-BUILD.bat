@echo off
title 1 - Install and build
cd /d "%~dp0.."
echo.
echo ===== Step 1 of 2: installing (can take 3 to 10 minutes) =====
call npm install
if errorlevel 1 goto failed
echo.
echo ===== Step 2 of 2: building (can take 3 to 10 minutes) =====
call npm run build
if errorlevel 1 goto failed
echo.
echo ===== DONE. You can close this window. =====
pause
exit /b 0
:failed
echo.
echo ===== SOMETHING FAILED. Take a screenshot of this window and send it. =====
pause
exit /b 1
