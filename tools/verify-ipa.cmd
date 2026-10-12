@echo off
chcp 65001 >nul
title noname - verify IPA signature
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0verify-ipa.ps1" %*
echo.
echo Press any key to close...
pause >nul
