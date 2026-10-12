@echo off
title noname - share game data to iPad  (KEEP THIS WINDOW OPEN)
cd /d "%~dp0.."

echo.
echo   ============================================================
echo    Sharing game data over LAN for the iPad app
echo.
echo    KEEP THIS WINDOW OPEN during the whole sync.
echo    The address to type into the app is printed below.
echo    Press Ctrl+C to stop.
echo   ============================================================
echo.

node tools\share.js

echo.
echo   Server stopped.
pause
