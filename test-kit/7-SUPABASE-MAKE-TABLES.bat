@echo off
title 7 - Supabase: make the tables (once)
cd /d "%~dp0.."
echo.
echo You will need: your Supabase PROJECT REF (20 letters) and your DATABASE PASSWORD.
echo.
echo ===== Step 1 of 3: log in to Supabase (a browser window opens) =====
call npx --yes supabase@2.122.0 login
if errorlevel 1 goto failed
echo.
set /p REF=Step 2 of 3: type your PROJECT REF and press Enter: 
call npx --yes supabase@2.122.0 link --project-ref %REF%
if errorlevel 1 goto failed
echo.
echo ===== Step 3 of 3: making the tables. It will ask Y or n. Type Y and Enter. =====
call npx --yes supabase@2.122.0 db push
if errorlevel 1 goto failed
echo.
echo ===== DONE. The tables are made. You can close this window. =====
pause
exit /b 0
:failed
echo.
echo ===== SOMETHING FAILED. Screenshot this whole window and send it. =====
pause
exit /b 1
