@echo off
REM ============================================================
REM XovenMart deploy helper for Windows
REM Double-click to run. Does:
REM   1. Verifies the DB dump file exists
REM   2. Copies it to a clean (no-space) path
REM   3. Asks for the VPS root password
REM   4. SCPs the dump to the VPS
REM   5. Prints the exact SSH command for the VPS
REM ============================================================

setlocal enabledelayedexpansion

echo.
echo ============================================================
echo  XovenMart deploy helper
echo ============================================================
echo.

REM ---- 1. Locate the dump file ----
set "DUMP_ORIG=H:\Personal\Coding\AI Project\XovenMart\tech\xovenmart-manual-2026-09-16T18-16-55-354Z.sql"
set "DUMP_LOCAL=%USERPROFILE%\xovenmart_dump.sql"

if not exist "%DUMP_ORIG%" (
  echo ERROR: DB dump not found at:
  echo   %DUMP_ORIG%
  echo.
  echo Edit this .bat to point DUMP_ORIG at the real file, then re-run.
  pause
  exit /b 1
)

echo [1/4] Copying dump to clean path...
copy /Y "%DUMP_ORIG%" "%DUMP_LOCAL%" >nul
if errorlevel 1 (
  echo ERROR: copy failed.
  pause
  exit /b 1
)
echo       OK - %DUMP_LOCAL% (%~zA bytes)
echo.

REM ---- 2. Verify scp is available ----
where scp >nul 2>&1
if errorlevel 1 (
  echo ERROR: scp not found. Install OpenSSH Client:
  echo   Settings ^ Apps ^ Optional features ^ Add ^ OpenSSH Client
  echo Then re-run.
  pause
  exit /b 1
)

REM ---- 3. SCP the dump ----
set "VPS_HOST=103.72.65.188"
set "VPS_USER=root"

echo [2/4] Uploading dump to %VPS_USER%@%VPS_HOST%:/root/ ...
echo       (enter the NEW root password you set with passwd on the VPS)
echo.

scp "%DUMP_LOCAL%" %VPS_USER%@%VPS_HOST%:/root/xovenmart-manual-2026-09-16T18-16-55-354Z.sql
if errorlevel 1 (
  echo.
  echo ERROR: scp failed. Common fixes:
  echo   - Make sure you set a NEW root password on the VPS with 'passwd'
  echo   - Make sure port 22 isn't blocked by your ISP
  echo   - Try the same upload via WinSCP: https://winscp.net
  pause
  exit /b 1
)
echo.
echo       OK - dump uploaded.
echo.

REM ---- 4. Print the VPS-side commands ----
echo [3/4] On the VPS, run these commands ONE AT A TIME:
echo.
echo   ssh %VPS_USER%@%VPS_HOST%
echo.
echo     # (inside the SSH session)
echo     ls -la /root/xovenmart-manual-2026-09-16T18-16-55-354Z.sql
echo     bash ^<^(curl -fsSL https://raw.githubusercontent.com/xoventechdev/xovenmart/main/infra/bdix-bootstrap.sh^)
echo.
echo [4/4] When the bootstrap finishes, the script prints 6 follow-up steps.
echo       Do them. Then come back here and I'll do the rest.
echo.
echo ============================================================
pause