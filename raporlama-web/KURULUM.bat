@echo off
chcp 65001 >nul
title Raporlama Programi - Kurulum
cd /d "%~dp0"

echo.
echo  ========================================
echo   Raporlama Programi - PC Kurulum
echo  ========================================
echo.
echo  Klasor: %CD%
echo.

REM ZIP icinden / Temp'ten calistirmayi engelle
echo %CD% | findstr /I /C:"\Temp\" /C:"\AppData\Local\Temp" /C:".zip" >nul
if not errorlevel 1 (
  echo [HATA] Programi ZIP icinden veya Temp klasorunden calistiriyorsun.
  echo.
  echo Dogru kurulum:
  echo  1^) ZIP dosyasina SAG TIK -^> "Tumunu ayikla..." / Extract All
  echo  2^) Ornek hedef: C:\Users\pc34\raporlama-web-src
  echo  3^) Icindeki "raporlama-web" klasorunu su yola kopyala:
  echo       C:\Users\pc34\raporlama-web
  echo  4^) C:\Users\pc34\raporlama-web\KURULUM.bat dosyasina cift tikla
  echo.
  echo ZIP'i acip dogrudan Temp'ten calistirma.
  echo.
  pause
  exit /b 1
)

if not exist "%~dp0package.json" (
  echo [HATA] package.json bulunamadi.
  echo Bu bat dosyasi "raporlama-web" klasorunun ICINDE olmali.
  echo.
  echo Beklenen yol ornegi:
  echo   C:\Users\pc34\raporlama-web\KURULUM.bat
  echo   C:\Users\pc34\raporlama-web\package.json
  echo.
  pause
  exit /b 1
)

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
  echo.
  echo [HATA] npm install basarisiz.
  echo Yukaridaki hatayi kontrol edin.
  echo Klasorun yazilabilir oldugundan ve internete eristiginizden emin olun.
  echo.
  pause
  exit /b 1
)

echo.
echo ========================================
echo  Kurulum BASARILI.
echo  Simdi BASLAT.bat ile acabilirsiniz.
echo ========================================
echo.
pause
