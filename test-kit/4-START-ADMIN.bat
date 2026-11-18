@echo off
title 4 - ADMIN (keep this window open)
cd /d "%~dp0.."
if not exist "test-kit\settings.env" (
  echo.
  echo The file test-kit\settings.env does not exist yet.
  echo Copy test-kit\settings.env.example and name the copy settings.env, then run this again.
  pause
  exit /b 1
)
echo Starting the Admin on http://127.0.0.1:4300
echo Leave this window open. Stop it with Ctrl+C.
node --env-file=test-kit\settings.env owner\run.mjs /owner/server/main.ts serve
echo.
echo ===== It stopped. If this was not on purpose, screenshot the lines above. =====
pause
