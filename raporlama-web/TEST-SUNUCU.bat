@echo off
REM Elle test - hata burada kalir
cd /d "%~dp0"
title Raporlama TEST
echo Klasor: %CD%
node -v
echo.
npm run dev
echo.
echo Bitti. Hata yukarida.
pause
