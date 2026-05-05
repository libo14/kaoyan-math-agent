@echo off
setlocal
cd /d "%~dp0"
title Math Tutor Agent Browser Launcher

echo ==========================================
echo   Math Tutor Agent - Browser Version
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed on Windows.
  echo Please install Node.js LTS first:
  echo https://nodejs.org/
  echo.
  pause
  exit /b 1
)

echo Starting local server...
echo.
echo Open this address in your browser:
echo http://127.0.0.1:5188
echo.
set PORT=5188
start "" "http://127.0.0.1:5188"
node src\server.js

echo.
echo Server stopped.
pause
