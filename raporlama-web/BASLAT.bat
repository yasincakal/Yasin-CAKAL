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

REM Yerel IP bul
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  set IP=%%a
  goto :found
)
:found
set IP=%IP: =%

echo.
echo  ========================================
echo   Raporlama Programi - Ag Erisimi
echo  ========================================
echo.
echo  Bu PC:     http://localhost:3000/Raporlar
if defined IP echo  Agdan:    http://%IP%:3000/Raporlar
echo.
echo  Diger kullanicilar Chrome ile ag adresini acabilir.
echo  Windows Firewall'da 3000 portuna izin verin.
echo  Durdurmak icin Ctrl+C
echo.

if not exist ".next\" (
  echo Ilk acilis build aliniyor...
  call npm run build
)

start "" "http://localhost:3000/Raporlar"
call npm start
