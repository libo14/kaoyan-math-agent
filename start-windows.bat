@echo off
setlocal
cd /d "%~dp0"
title Math Tutor Agent Launcher

echo ==========================================
echo   Math Tutor Agent - Windows Launcher
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed on Windows.
  echo.
  echo Please install Node.js LTS first:
  echo https://nodejs.org/
  echo.
  echo After installation, double-click this file again.
  echo.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm is not available on Windows.
  echo Please reinstall Node.js LTS and make sure "Add to PATH" is enabled.
  echo.
  pause
  exit /b 1
)

if not exist node_modules\.bin\electron.cmd (
  echo Installing Windows dependencies. This may take a few minutes...
  echo.
  npm install
  if errorlevel 1 (
    echo.
    echo npm install failed. Please check the error message above.
    echo.
    pause
    exit /b 1
  )
)

npm start
set APP_EXIT=%ERRORLEVEL%
echo.
echo App exited with code %APP_EXIT%.
echo If the app window did not open, please send me the lines above this message.
echo.
pause
exit /b %APP_EXIT%
