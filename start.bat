@echo off
title PharmaCare - Startup
color 0A

echo.
echo  =========================================
echo    PharmaCare Management System
echo  =========================================
echo.

:: Step 1: Check / Start PostgreSQL
echo [1/4] Checking PostgreSQL...
sc query postgresql-x64-18 | find "RUNNING" >nul 2>&1
if %errorlevel% == 0 (
    echo       PostgreSQL is already running.
) else (
    echo       Starting PostgreSQL service...
    net start postgresql-x64-18
    if %errorlevel% neq 0 (
        echo  [ERROR] Failed to start PostgreSQL. Try running as Administrator.
        pause
        exit /b 1
    )
    timeout /t 3 /nobreak >nul
    echo       PostgreSQL started successfully.
)

:: Step 2: Verify DB connection
echo.
echo [2/4] Verifying database connection...
set PGPASSWORD=admin123
pg_isready -U postgres -h localhost -p 5432 >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Cannot connect to PostgreSQL on port 5432.
    pause
    exit /b 1
)
echo       Database is accepting connections.

:: Step 3: Clear corrupted .next cache (fixes EINVAL readlink crash)
echo.
echo [3/4] Clearing .next build cache...
if exist ".next" (
    rmdir /s /q ".next" 2>nul
    if exist ".next" (
        echo  [WARN] Could not fully clear .next cache. Continuing anyway...
    ) else (
        echo       .next cache cleared successfully.
    )
) else (
    echo       No .next cache found. Skipping.
)

:: Step 4: Apply any pending Prisma migrations
echo.
echo [4/4] Applying Prisma migrations (if any)...
call npx prisma migrate deploy
if %errorlevel% neq 0 (
    echo  [ERROR] Prisma migration failed.
    pause
    exit /b 1
)
echo       Migrations done.

:: Launch Next.js dev server
echo.
echo  =========================================
echo    Starting PharmaCare on port 3000...
echo  =========================================
echo.
echo   App URL  ^: http://localhost:3000
echo   Admin    ^: admin@pharmacare.local / Admin@123
echo   Manager  ^: manager@pharmacare.local / Manager@123
echo.
echo   Press Ctrl+C to stop the server.
echo.

:: Open browser automatically after a short delay
start "" cmd /c "timeout /t 5 >nul && start http://localhost:3000"

npm run dev
