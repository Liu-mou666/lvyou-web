@echo off
echo 正在结束可能占用携程配置的 Playwright Chrome 进程...
for /f "tokens=2" %%i in ('tasklist /FI "IMAGENAME eq chrome.exe" /FO LIST ^| findstr /I "PID"') do (
  wmic process where "ProcessId=%%i" get ExecutablePath 2>nul | findstr /I "ms-playwright" >nul
  if not errorlevel 1 taskkill /F /PID %%i >nul 2>&1
)
echo 完成。若仍报错，请手动关闭 Chrome 窗口后重试 scrape:login
pause
