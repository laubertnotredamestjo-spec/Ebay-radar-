@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js n'est pas installe. Installe Node.js 20+ depuis https://nodejs.org/
  pause
  exit /b 1
)
echo Ouvre http://localhost:3000 dans ton navigateur.
node server.js
pause
