@echo off
:: Demo Shield — Setup Script (Windows)
:: Double-click this file to run it

setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
set "LIB_DIR=%SCRIPT_DIR%lib"
set "TARGET=%LIB_DIR%\compromise.min.js"
set "CDN_URL=https://unpkg.com/compromise/builds/compromise.min.js"

echo.
echo  +------------------------------------------+
echo  ^|        Demo Shield -- Setup              ^|
echo  +------------------------------------------+
echo.

:: ── Step 1: Create lib\ if missing ────────────────────────────────────────
if not exist "%LIB_DIR%" mkdir "%LIB_DIR%"

:: ── Step 2: Download compromise.min.js ────────────────────────────────────
if exist "%TARGET%" (
  echo [OK]  NLP library already present -- skipping download.
) else (
  echo [...]  Downloading NLP library ^(compromise.js^)...

  powershell -NoProfile -Command ^
    "try { Invoke-WebRequest -Uri '%CDN_URL%' -OutFile '%TARGET%' -UseBasicParsing; exit 0 } catch { Write-Host $_.Exception.Message; exit 1 }"

  if errorlevel 1 (
    echo.
    echo [ERROR] Download failed. Please check your internet connection and try again.
    goto :end
  )

  echo [OK]  NLP library downloaded.
)

:: ── Step 3: Open Chrome to the extensions page ────────────────────────────
echo.
echo [...]  Opening Chrome extensions page...
echo.
echo  When Chrome opens, follow these steps:
echo.
echo    1. Turn on  "Developer mode"  (toggle, top-right corner)
echo    2. Click    "Load unpacked"
echo    3. Navigate to this folder and click "Select Folder":
echo       %SCRIPT_DIR%
echo    4. Click the Demo Shield icon in the toolbar to pin it
echo.

:: Try common Chrome install paths
set "CHROME="
for %%P in (
  "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
  "%LocalAppData%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
  "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
  "%ProgramFiles%\BraveSoftware\Brave-Browser\Application\brave.exe"
) do (
  if exist %%P (
    if "!CHROME!"=="" set "CHROME=%%P"
  )
)

if defined CHROME (
  start "" "!CHROME!" "chrome://extensions/"
) else (
  echo  [NOTE] Could not find Chrome automatically.
  echo         Please open Chrome and go to: chrome://extensions/
)

echo [OK]  Setup complete.

:end
echo.
pause
