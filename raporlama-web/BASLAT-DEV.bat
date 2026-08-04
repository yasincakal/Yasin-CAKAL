@echo off
chcp 65001 >nul
title Raporlama - Gelistirme Modu
cd /d "%~dp0"
where node >nul 2>&1 || (echo Node.js yok & pause & exit /b 1)
if not exist "node_modules\" call npm install
echo Gelistirme: http://localhost:3000/Raporlar  (ag: 0.0.0.0:3000)
start "" "http://localhost:3000/Raporlar"
call npm run dev
