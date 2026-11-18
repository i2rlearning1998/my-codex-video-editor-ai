@echo off
title 5 - Create the Admin account (only once)
cd /d "%~dp0.."
if not exist "test-kit\settings.env" (
  echo.
  echo The file test-kit\settings.env does not exist yet.
  echo Copy test-kit\settings.env.example and name the copy settings.env, then run this again.
  pause
  exit /b 1
)
set /p OWNER_EMAIL=Type your email for the Admin login and press Enter: 
echo.
node --env-file=test-kit\settings.env owner\run.mjs /owner/server/main.ts create-owner --email %OWNER_EMAIL% --replace
echo.
echo ===== Copy the 2-step secret shown above into your Authenticator app. =====
echo ===== Then close this window. Do not run this again unless you must. =====
pause
