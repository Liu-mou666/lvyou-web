@echo off
cd /d "%~dp0"
echo ========================================
echo  旅优 - 携程登录
echo  目录: %CD%
echo  若提示「配置目录被占用」，先双击 kill-ctrip-browser.cmd
echo ========================================
call npm.cmd run scrape:login
pause
