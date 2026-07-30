@echo off
chcp 65001 >nul
title Raporlama Programi
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo [HATA] Node.js yok. Once KURULUM.bat calistirin veya nodejs.org adresinden kurun.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Ilk acilis: paketler yukleniyor...
  call npm install
)

echo.
echo  Raporlama aciliyor...
echo  Tarayici: http://localhost:3000
echo  Durdurmak icin bu pencerede Ctrl+C
echo.

start "" http://localhost:3000
call npm run dev
