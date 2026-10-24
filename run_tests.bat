@echo off
TITLE Run Chicken Shop Acceptance Tests
echo ==========================================================
echo    CHICKEN SHOP MANAGEMENT SYSTEM - TEST SUITE
echo ==========================================================
echo.
cd /d "%~dp0backend"
npm test
pause
