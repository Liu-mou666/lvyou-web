@echo off
cd /d "%~dp0"
echo 启动开发服务器: %CD%
call npm.cmd run dev
