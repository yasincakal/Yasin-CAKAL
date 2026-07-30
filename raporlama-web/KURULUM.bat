@echo off
chcp 65001 >nul
title Raporlama Programi - Kurulum
cd /d "%~dp0"

echo.
echo  ========================================
echo   Raporlama Programi - PC Kurulum
echo  ========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [HATA] Node.js bulunamadi.
  echo Lutfen once Node.js kurun: https://nodejs.org
  echo LTS surumunu indirip kurun, sonra bu dosyayi tekrar calistirin.
  echo.
  pause
  exit /b 1
)

echo Node.js bulundu.
node -v
echo.
echo Bagimliliklar yukleniyor (npm install)...
call npm install
if errorlevel 1 (
  echo [HATA] npm install basarisiz.
  pause
  exit /b 1
)

echo.
echo Kurulum tamam. Simdi BASLAT.bat ile acabilirsiniz.
echo.
pause
