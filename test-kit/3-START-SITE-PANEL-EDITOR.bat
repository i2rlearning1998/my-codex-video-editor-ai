@echo off
title 3 - WEBSITE, PANEL and EDITOR (keep this window open)
cd /d "%~dp0.."
if not exist "test-kit\settings.env" (
  echo.
  echo The file test-kit\settings.env does not exist yet.
  echo Copy test-kit\settings.env.example and name the copy settings.env, then run this again.
  pause
  exit /b 1
)
echo Starting website, panel and editor on http://127.0.0.1:5173
echo Leave this window open. Stop it with Ctrl+C.
node --env-file=test-kit\settings.env node_modules\vite\bin\vite.js --host 127.0.0.1 --port 5173 --strictPort
echo.
echo ===== It stopped. If this was not on purpose, screenshot the lines above. =====
pause
