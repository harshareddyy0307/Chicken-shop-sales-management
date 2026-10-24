@echo off
TITLE Chicken Shop Management System
echo ==========================================================
echo    CHICKEN SHOP MANAGEMENT SYSTEM - LOCAL LAUNCHER
echo ==========================================================
echo.

REM 1. Check & Start Local PostgreSQL
echo [1/3] Ensuring PostgreSQL database is active...
"C:\Program Files\PostgreSQL\18\bin\pg_isready.exe" -p 5435 -h 127.0.0.1 >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Starting PostgreSQL cluster on port 5435...
    "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" -D "C:\Users\Harsha Reddy\AppData\Local\chickenshop_pg" -o "-p 5435" -l "C:\Users\Harsha Reddy\AppData\Local\chickenshop_pg\server.log" start
) else (
    echo PostgreSQL is already active on port 5435.
)

echo.
echo [2/3] Starting Backend API Server (Node.js/Express)...
start "Chicken Shop Backend" cmd /k "cd /d "%~dp0backend" && npm start"

timeout /t 3 /nobreak >nul

echo.
echo [3/3] Starting Frontend Dev Server (React/Vite)...
start "Chicken Shop Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo ==========================================================
echo Application started successfully!
echo Backend API : http://localhost:5000/api/health
echo Frontend UI : http://localhost:5173
echo Database    : Supabase Cloud (Project: sales management)
echo.
echo Default Logins (Phone / 4-digit PIN):
echo   Owner:   7989856610 / 1234
echo   Manager: 9876543211 / 2345
echo   Staff:   9876543212 / 3456
echo ==========================================================
pause
