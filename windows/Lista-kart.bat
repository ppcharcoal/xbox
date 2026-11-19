@echo off
chcp 65001 >nul
cd /d "%~dp0"
xbox-cli.exe --list
echo.
pause
