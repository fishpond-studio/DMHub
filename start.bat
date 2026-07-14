@echo off
chcp 65001 >nul 2>&1
title DMHub

set "ROOT=%~dp0"
cd /d "%ROOT%"

set "MODE=dev"
set "SKIP_INSTALL=0"
set "SKIP_BUILD=0"

:parse_args
if "%~1"=="" goto end_parse
if /i "%~1"=="prod" set "MODE=prod"
if /i "%~1"=="--no-install" set "SKIP_INSTALL=1"
if /i "%~1"=="--no-build" set "SKIP_BUILD=1"
shift
goto parse_args
:end_parse

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found, please install Node.js 20+
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do echo [INFO] Node.js %%v

where pnpm >nul 2>&1
if errorlevel 1 (
    echo [INFO] Installing pnpm...
    call npm install -g pnpm
    if errorlevel 1 (
        echo [ERROR] pnpm install failed
        pause
        exit /b 1
    )
)

for /f "tokens=*" %%v in ('pnpm -v') do echo [INFO] pnpm %%v

if not exist ".env" (
    echo [WARN] .env not found, copying from .env.example...
    copy ".env.example" ".env" >nul 2>&1
    echo [WARN] Please edit .env and set JWT_SECRET and ENCRYPTION_KEY
    start notepad ".env"
    pause
    exit /b 1
)

if not "%SKIP_INSTALL%"=="1" (
    echo [INFO] Installing dependencies...
    call pnpm install
    if errorlevel 1 (
        echo [ERROR] Dependency install failed
        pause
        exit /b 1
    )
)

if not "%SKIP_BUILD%"=="1" (
    echo [INFO] Building shared...
    call pnpm --filter @dmhub/shared build
    if errorlevel 1 (
        echo [ERROR] shared build failed
        pause
        exit /b 1
    )

    echo [INFO] Building dns-providers...
    call pnpm --filter @dmhub/dns-providers build
    if errorlevel 1 (
        echo [ERROR] dns-providers build failed
        pause
        exit /b 1
    )
)

if "%MODE%"=="prod" goto prod_mode
goto dev_mode

:prod_mode
if not "%SKIP_BUILD%"=="1" (
    echo [INFO] Building web...
    call pnpm --filter @dmhub/web build
    if errorlevel 1 (
        echo [ERROR] web build failed
        pause
        exit /b 1
    )

    echo [INFO] Building server...
    call pnpm --filter @dmhub/server build
    if errorlevel 1 (
        echo [ERROR] server build failed
        pause
        exit /b 1
    )
)

if not exist "uploads" mkdir uploads

echo.
echo ============================================================
echo   DMHub - Production
echo ============================================================
echo.
set "NODE_ENV=production"
echo [INFO] Starting server...
start "DMHub Server" cmd /c "cd /d %ROOT% && pnpm --filter @dmhub/server start"
echo [INFO] Server started in background
echo [INFO] http://localhost:8088
echo.
pause
goto :eof

:dev_mode
if not exist "uploads" mkdir uploads

echo.
echo ============================================================
echo   DMHub - Development
echo ============================================================
echo.
echo [INFO] Starting web dev server...
start "DMHub Web" cmd /c "cd /d %ROOT% && pnpm dev:web"
echo [INFO] Starting server dev...
start "DMHub Server" cmd /c "cd /d %ROOT% && pnpm dev:server"
echo.
echo [INFO] Web:    http://localhost:5173
echo [INFO] Server: http://localhost:8088
echo.
pause
goto :eof
