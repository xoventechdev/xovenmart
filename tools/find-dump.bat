@echo off
REM ============================================================
REM Diagnostic: list every .sql file in the project folder
REM Run this to find out the exact filename of your dump.
REM ============================================================

echo.
echo Searching H:\Personal\Coding\AI Project\XovenMart for .sql files...
echo.

dir /S /B "H:\Personal\Coding\AI Project\XovenMart\*.sql" 2>nul

echo.
echo ============================================================
echo Searching common alternate locations...
echo.

if exist "H:\Personal\Coding\AI Project\XovenMart\tech\xovenmart-manual-2026-09-16T18-16-55-354Z.sql" (
  echo FOUND expected file.
) else (
  echo NOT FOUND at expected path. See list above for actual location.
)

echo.
echo Listing contents of tech\ folder:
dir /B "H:\Personal\Coding\AI Project\XovenMart\tech\"

echo.
pause