@echo off
title noname - check Apple GSA connectivity
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0check-gsa.ps1"
echo.
echo Press any key to close...
pause >nul
