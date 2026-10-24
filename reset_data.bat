@echo off
TITLE Reset Chicken Shop Data
echo ==========================================================
echo    CHICKEN SHOP MANAGEMENT SYSTEM - CLEAR ALL DATA
echo ==========================================================
echo.
echo WARNING: This will remove all transactions, customers,
echo distributors, stock, expenses, and closings from the database!
echo Default login accounts (owner, manager, staff) will be preserved.
echo.
pause
echo.
echo Clearing data...
cd /d "%~dp0backend"
call npm run clear-data
echo.
pause
