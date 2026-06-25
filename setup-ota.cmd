@echo off
cd /d "%~dp0"
echo 全国 OTA 测试: %CD%
call npm.cmd run setup:ota
pause
