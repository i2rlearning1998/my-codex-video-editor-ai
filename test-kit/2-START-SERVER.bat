@echo off
title 2 - SERVER (keep this window open)
cd /d "%~dp0.."
if not exist "test-kit\settings.env" (
  echo.
  echo The file test-kit\settings.env does not exist yet.
  echo Copy test-kit\settings.env.example and name the copy settings.env, then run this again.
  pause
  exit /b 1
)
echo Starting the server. Leave this window open. Stop it with Ctrl+C.
node --env-file=test-kit\settings.env server\run.mjs /server/main.ts
echo.
echo ===== The server stopped. If this was not on purpose, screenshot the lines above. =====
pause
