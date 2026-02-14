@echo off
REM
REM Version Sync Script for Foundry VTT Modules
REM Reads version from module.json and updates CLAUDE.md and main.js
REM

setlocal EnableDelayedExpansion

REM Change to script directory (allows running from anywhere)
cd /d "%~dp0"

REM ─── Read module.json ────────────────────────────────────────────────

if not exist "module.json" (
    echo [ERROR] module.json not found!
    exit /b 1
)

REM Extract version from module.json using PowerShell
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-Content 'module.json' | ConvertFrom-Json).version"`) do set "VERSION=%%i"

if "%VERSION%"=="" (
    echo [ERROR] Could not extract version from module.json
    exit /b 1
)

echo ========================================
echo   Version Sync Script
echo ========================================
echo.
echo   Version: %VERSION%
echo.

REM ─── Update CLAUDE.md ────────────────────────────────────────────────

echo [1/2] Updating CLAUDE.md...

if not exist "CLAUDE.md" (
    echo [WARNING] CLAUDE.md not found, skipping
) else (
    REM Update version line in CLAUDE.md using PowerShell
    powershell -NoProfile -Command "(Get-Content 'CLAUDE.md') -replace '^\*\*Version:\*\* .*$', '**Version:** %VERSION%' | Set-Content 'CLAUDE.md' -Encoding UTF8"
    echo   OK
)

REM ─── Update scripts/main.js ──────────────────────────────────────────

echo [2/2] Updating scripts/main.js...

if not exist "scripts\main.js" (
    echo [ERROR] scripts\main.js not found!
    exit /b 1
)

REM Update @version in JSDoc comment
powershell -NoProfile -Command "(Get-Content 'scripts\main.js') -replace '^ \* @version .*$', ' * @version %VERSION%' | Set-Content 'scripts\main.js' -Encoding UTF8"

REM Update console.log version string
powershell -NoProfile -Command "(Get-Content 'scripts\main.js') -replace 'Initializing Token Replacer - Forgotten Adventures v[0-9.]*`', 'Initializing Token Replacer - Forgotten Adventures v%VERSION%`' | Set-Content 'scripts\main.js' -Encoding UTF8"

echo   OK

REM ─── Summary ─────────────────────────────────────────────────────────

echo.
echo ========================================
echo   Version Sync Complete!
echo ========================================
echo.
echo   Updated files:
echo     - CLAUDE.md
echo     - scripts\main.js
echo.
echo   All files now reference version: %VERSION%
echo.

endlocal
