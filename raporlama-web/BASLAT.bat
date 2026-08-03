@echo off
chcp 65001 >nul
title Raporlama Programi - SUNUCU (bu pencereyi KAPATMAYIN)
cd /d "%~dp0"

echo %CD% | findstr /I /C:"\Temp\" /C:"\AppData\Local\Temp" >nul
if not errorlevel 1 (
  echo [HATA] ZIP/Temp icinden calistiriyorsun.
  echo Once ayikla: C:\Users\pc34\raporlama-web
  pause
  exit /b 1
)

if not exist "%~dp0package.json" (
  echo [HATA] package.json yok.
  echo Bu dosya C:\Users\pc34\raporlama-web icinde olmali.
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo [HATA] Node.js yok.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Paketler yukleniyor...
  call npm install
  if errorlevel 1 (
    echo [HATA] npm install basarisiz.
    pause
    exit /b 1
  )
)

set IP=
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  set IP=%%a
  goto :gotip
)
:gotip
if defined IP set IP=%IP: =%

echo.
echo  ========================================
echo   SUNUCU BASLIYOR - PENCEREYI KAPATMAYIN
echo  ========================================
echo.
echo  Bu PC : http://localhost:3000/Raporlar
if defined IP echo  Ag   : http://%IP%:3000/Raporlar
echo.
echo  Hazir olunca Chrome acilacak.
echo  Bu siyah pencere ACİK kalmali.
echo.

REM Tarayiciyi 8 sn sonra ac (sunucu ayaga kalksin)
start "" cmd /c "timeout /t 8 /nobreak >nul & start http://localhost:3000/Raporlar"

call npm run dev
echo.
echo [HATA] Sunucu durdu veya baslamadi.
echo Yukaridaki kirmizi/hata satirlarini kontrol edin.
pause
