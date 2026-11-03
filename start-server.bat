@echo off
chcp 65001 >nul
title CRE 오류의 방 - 로컬 서버
cd /d "%~dp0"

where npm >/dev/null 2>nul
if errorlevel 1 (
  echo [오류] Node.js가 설치되어 있지 않습니다.
  echo https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행하세요.
  start "" https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules (
  echo 처음 실행: 필요한 패키지를 설치합니다. 1~2분 걸립니다...
  call npm install
)

echo.
echo 로컬 서버를 시작합니다. 브라우저가 열리면 http://localhost:5173 을 확인하세요.
echo 서버를 끄려면 이 창을 닫거나 Ctrl+C 를 누르세요.
echo.
start "" http://localhost:5173
call npm run dev
pause
