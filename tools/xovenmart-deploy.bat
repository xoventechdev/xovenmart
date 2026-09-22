@echo off
REM ============================================================
REM XovenMart deploy helper for Windows — v2
REM Right-click → "Run as administrator" if double-click fails
REM ============================================================

setlocal enabledelayedexpansion

echo.
echo ============================================================
echo  XovenMart deploy helper
echo  Started: %DATE% %TIME%
echo ============================================================
echo.

REM ---- 0. Check admin / scp / dump ----
echo [CHECK] Administrator privileges...
net session >nul 2>&1
if errorlevel 1 (
  echo   Not running as Administrator.
  echo   Right-click this .bat and choose "Run as administrator".
  echo.
  echo   Press any key to continue anyway, or close this window.
  pause >nul
) else (
  echo   OK - running as Administrator.
)

echo.
echo [CHECK] scp is available...
where scp >nul 2>&1
if errorlevel 1 (
  echo   NOT FOUND. Install OpenSSH Client:
  echo     Settings ^> Apps ^> Optional features ^> Add ^> OpenSSH Client
  echo   Then close this window and re-run.
  pause
  exit /b 1
) else (
  for /f "tokens=*" %%i in ('where scp') do echo   OK - %%i
)

echo.
echo [CHECK] DB dump file...
set "DUMP_ORIG=H:\Personal\Coding\AI Project\XovenMart\tech\xovenmart-manual-2026-09-16T18-16-55-354Z.sql"
set "DUMP_LOCAL=%USERPROFILE%\xovenmart_dump.sql"

if not exist "%DUMP_ORIG%" (
  echo   NOT FOUND at:
  echo     %DUMP_ORIG%
  echo.
  echo   Do this:
  echo     1. Open File Explorer, navigate to the dump file
  echo     2. Note its actual location
  echo     3. Edit this .bat file:
  echo        - right-click the .bat
  echo        - "Edit" (Notepad)
  echo        - change DUMP_ORIG= line to the actual path
  echo     4. Re-run
  echo.
  pause
  exit /b 1
)
echo   OK - %DUMP_ORIG%
for %%I in ("%DUMP_ORIG%") do echo   Size: %%~zI bytes

echo.
echo [STEP 1] Copying dump to clean path...
copy /Y "%DUMP_ORIG%" "%DUMP_LOCAL%" >nul
if errorlevel 1 (
  echo   ERROR: copy failed.
  pause
  exit /b 1
)
echo   OK - %DUMP_LOCAL%
for %%I in ("%DUMP_LOCAL%") do echo   Copied size: %%~zI bytes

echo.
echo [STEP 2] Uploading to VPS via scp...
set "VPS_HOST=103.72.65.188"
set "VPS_USER=root"

echo   Source: %DUMP_LOCAL%
echo   Dest:   %VPS_USER%@%VPS_HOST%:/root/xovenmart-manual-2026-09-16T18-16-55-354Z.sql
echo.
echo   When prompted, enter the NEW root password you set on the VPS.
echo   (The window will appear frozen while scp runs - this is normal.)
echo.

scp "%DUMP_LOCAL%" %VPS_USER%@%VPS_HOST%:/root/xovenmart-manual-2026-09-16T18-16-55-354Z.sql
set SCP_RC=%errorlevel%
echo.
echo scp exit code: %SCP_RC%

if not "%SCP_RC%"=="0" (
  echo.
  echo ============================================================
  echo  SCP FAILED
  echo ============================================================
  echo.
  echo Common fixes - try them in order:
  echo.
  echo 1. WINSCP (GUI, avoids all cmd-line issues):
  echo    Download: https://winscp.net
  echo    New connection: SFTP, 103.72.65.188, root, [your-new-password]
  echo    Drag xovenmart-manual-2026-09-16T18-16-55-354Z.sql to /root/
  echo.
  echo 2. YOUR ISP BLOCKS PORT 22:
  echo    Try from your phone's mobile hotspot.
  echo    Or use the VPS provider's web console to upload the file.
  echo.
  echo 3. PASSWORD STILL DEFAULT:
  echo    SSH into the VPS (ssh root@103.72.65.188) and run 'passwd'.
  echo.
  pause
  exit /b 1
)

echo.
echo ============================================================
echo  SCP SUCCESS - file is now at:
echo    /root/xovenmart-manual-2026-09-16T18-16-55-354Z.sql
echo ============================================================
echo.
echo NEXT STEP - copy-paste this entire block into your SSH session:
echo.
echo   bash ^<^(curl -fsSL https://raw.githubusercontent.com/xoventechdev/xovenmart/main/infra/deploy-interactive.sh^)
echo.
echo That will walk you through 6 more stages with pauses.
echo.
echo ============================================================
pause