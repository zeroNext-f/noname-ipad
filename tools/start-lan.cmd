@echo off
title noname LAN server - KEEP THIS WINDOW OPEN
cd /d "%~dp0.."

echo.
echo   ============================================================
echo    Starting LAN server for iPad / tablet
echo.
echo    Keep this window OPEN while playing.
echo    Press Ctrl+C to stop.
echo   ============================================================
echo.

node tools\serve.js --lan

echo.
echo   Server stopped.
pause
