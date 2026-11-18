@echo off
title 6 - TUNNEL for Claude (keep this window open)
cd /d "%~dp0.."
echo Look for the line with https://....trycloudflare.com and copy that address.
echo Leave this window open. Stop it with Ctrl+C.
cloudflared tunnel --url http://127.0.0.1:4400
echo.
echo ===== The tunnel stopped. =====
pause
