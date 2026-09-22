@echo off
REM ============================================================
REM XovenMart deploy helper for Windows — v3
REM Right-click -> Run as administrator if double-click fails
REM Finds the dump file by *pattern* instead of exact name.
REM ============================================================

setlocal enabledelayedexpansion

echo.
echo ============================================================
echo  XovenMart deploy helper (v3)
echo  Started: %DATE% %TIME%
echo ============================================================
echo.

echo [CHECK] Administrator privileges...
net session >nul 2>&1
if errorlevel 1 (
  echo   WARNING: Not running as Administrator.
  echo   Right-click this .bat and choose "Run as administrator".
  pause >nul
) else (
  echo   OK - running as Administrator.
)

echo.
echo [CHECK] scp...
where scp >nul 2>&1
if errorlevel 1 (
  echo   NOT FOUND. Settings ^> Apps ^> Optional features ^> OpenSSH Client.
  pause
  exit /b 1
) else (
  for /f "tokens=*" %%i in ('where scp') do echo   OK - %%i
)

echo.
echo [FIND] Looking for the DB dump file by pattern: xovenmart-manual-*.sql
echo.

REM Scan the project root + tech/ for the dump file
set "FOUND_PATH="
for /f "delims=" %%F in ('dir /S /B "H:\Personal\Coding\AI Project\XovenMart\xovenmart-manual-*.sql" 2^>nul') do (
  set "FOUND_PATH=%%F"
  goto :found
)

REM Fallback: search Downloads + Desktop in case user moved it
for /f "delims=" %%F in ('dir /S /B "%USERPROFILE%\Downloads\xovenmart-manual-*.sql" 2^>nul') do (
  set "FOUND_PATH=%%F"
  goto :found
)
for /f "delims=" %%F in ('dir /S /B "%USERPROFILE%\Desktop\xovenmart-manual-*.sql" 2^>nul') do (
  set "FOUND_PATH=%%F"
  goto :found
)

echo   NOT FOUND anywhere. Run tools\find-dump.bat first to see actual filenames.
echo.
echo   Or paste the .sql file into H:\Personal\Coding\AI Project\XovenMart\
echo   (any subfolder) and re-run.
pause
exit /b 1

:found
echo   FOUND: !FOUND_PATH!
for %%I in ("!FOUND_PATH!") do echo   Size: %%~zI bytes

REM Use just the basename going forward
for %%I in ("!FOUND_PATH!") do set "DUMP_BASENAME=%%~nxI"
set "DUMP_LOCAL=%USERPROFILE%\!DUMP_BASENAME!"
echo.
echo [STEP 1] Copying to %DUMP_LOCAL% ...
copy /Y "!FOUND_PATH!" "!DUMP_LOCAL!" >nul
if errorlevel 1 (
  echo   ERROR: copy failed. Disk full?
  pause
  exit /b 1
)
echo   OK

echo.
echo [STEP 2] Uploading to VPS ...
set "VPS_HOST=103.72.65.188"
set "VPS_USER=root"

echo   Source: !DUMP_LOCAL!
echo   Dest:   %VPS_USER%@%VPS_HOST%:/root/!DUMP_BASENAME!
echo.
echo   Enter the NEW root password when prompted.
echo.

scp "!DUMP_LOCAL!" %VPS_USER%@%VPS_HOST%:/root/!DUMP_BASENAME!
set SCP_RC=%errorlevel%

echo.
echo scp exit code: %SCP_RC%

if not "%SCP_RC%"=="0" (
  echo.
  echo ============================================================
  echo  SCP FAILED - common fixes:
  echo   1. Use WinSCP: https://winscp.net  (drag the file to /root/)
  echo   2. Run 'passwd' on the VPS first to change default password
  echo   3. ISP blocks port 22 - try mobile hotspot
  echo ============================================================
  pause
  exit /b 1
)

echo.
echo ============================================================
echo  SCP SUCCESS.
echo  File on VPS: /root/!DUMP_BASENAME!
echo ============================================================
echo.
echo Run this on the VPS now (paste the whole line into your SSH session):
echo.
echo   bash ^<^(curl -fsSL https://raw.githubusercontent.com/xoventechdev/xovenmart/main/infra/deploy-interactive.sh^)
echo.
pause