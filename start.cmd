@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 24.7 or newer is required. Install it from https://nodejs.org/
  pause
  exit /b 1
)
node -e "process.exit(typeof require('node:crypto').argon2 === 'function' ? 0 : 1)" >nul 2>nul
if errorlevel 1 (
  echo Node.js 24.7 or newer is required for online mode.
  pause
  exit /b 1
)
if not exist "node_modules\vite\bin\vite.js" goto install
if not exist "node_modules\fastify\package.json" goto install
if not exist "node_modules\@fastify\cookie\package.json" goto install
goto run
:install
call npm.cmd ci
if errorlevel 1 (
  pause
  exit /b 1
)
:run
call npm.cmd run dev -- --open
pause
