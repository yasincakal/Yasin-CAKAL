@echo off
chcp 65001 >nul
title Raporlama SUNUCU - BU PENCEREYI KAPATMAYIN
cd /d "%~dp0"

echo.
echo Klasor: %CD%
echo.

if not exist "%~dp0package.json" (
  echo [HATA] package.json yok. Yanlis klasordesin.
  echo Beklenen: ...\raporlama-web\package.json
  goto :end
)

where node >nul 2>&1
if errorlevel 1 (
  echo [HATA] Node.js bulunamadi. https://nodejs.org
  goto :end
)

echo Node:
node -v
echo.

if not exist "node_modules\" (
  echo npm install calisiyor...
  call npm install
  if errorlevel 1 (
    echo [HATA] npm install basarisiz.
    goto :end
  )
)

echo.
echo Sunucu basliyor: http://localhost:3000/Raporlar
echo Bu pencere ACIK kalmali.
echo Hata olursa asagida gorunecek.
echo.
echo ----------------------------------------
echo.

REM 10 sn sonra tarayiciyi ac
start "" cmd /c "timeout /t 10 /nobreak >nul & start http://localhost:3000/Raporlar"

call npm run dev > "%~dp0baslat-log.txt" 2>&1
echo.
echo ----------------------------------------
echo Sunucu durdu. Cikis kodu: %ERRORLEVEL%
echo Log dosyasi: %~dp0baslat-log.txt
echo.
type "%~dp0baslat-log.txt"
echo.

:end
echo.
echo Pencereyi kapatmak icin bir tusa basin...
pause >nul
