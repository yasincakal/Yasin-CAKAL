@echo off
chcp 65001 >nul
title Raporlama Programi
cd /d "%~dp0"

echo %CD% | findstr /I /C:"\Temp\" /C:"\AppData\Local\Temp" /C:".zip" >nul
if not errorlevel 1 (
  echo [HATA] ZIP/Temp icinden calistiriyorsun.
  echo Once ZIP'i kalici bir klasore AYIKLA:
  echo   C:\Users\pc34\raporlama-web
  echo Sonra oradaki BASLAT.bat'i ac.
  pause
  exit /b 1
)

if not exist "%~dp0package.json" (
  echo [HATA] package.json yok. Bat dosyasi raporlama-web klasorunde olmali.
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo [HATA] Node.js yok. Once KURULUM.bat calistirin veya nodejs.org adresinden kurun.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Ilk acilis: paketler yukleniyor...
  call npm install
  if errorlevel 1 (
    echo [HATA] npm install basarisiz. Once KURULUM.bat ile kurun.
    pause
    exit /b 1
  )
)

REM Yerel IP bul
set IP=
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  set IP=%%a
  goto :found
)
:found
if defined IP set IP=%IP: =%

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
  if errorlevel 1 (
    echo [HATA] Build basarisiz.
    pause
    exit /b 1
  )
)

start "" "http://localhost:3000/Raporlar"
call npm start
if errorlevel 1 (
  echo.
  echo [HATA] Sunucu baslamadi.
  pause
)
