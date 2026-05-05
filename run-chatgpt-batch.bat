@echo off
setlocal
cd /d "%~dp0"

set "NODE_EXE=node"
where node >nul 2>nul
if errorlevel 1 (
  if exist "C:\Program Files\nodejs\node.exe" (
    set "NODE_EXE=C:\Program Files\nodejs\node.exe"
  ) else (
    echo Node.js was not found.
    echo Please install Node.js, or add it to PATH.
    pause
    exit /b 1
  )
)

if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
  set "CHATGPT_CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe"
)
if not defined CHATGPT_CHROME_PATH if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
  set "CHATGPT_CHROME_PATH=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
)

if "%~1"=="" (
  echo Usage:
  echo   run-chatgpt-batch.bat "D:\your-exam-folder"
  echo.
  echo The folder should contain PDF or image files named like:
  echo   2023考研数学一真题.pdf
  echo   2020数学二试卷.pdf
  pause
  exit /b 1
)

"%NODE_EXE%" scripts\chatgpt_batch_web.js --input "%~1" --output "data\chatgpt_outputs"
pause
