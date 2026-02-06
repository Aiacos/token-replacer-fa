@echo off
REM
REM Build script for Token Replacer - Forgotten Adventures
REM Creates a clean ZIP archive for FoundryVTT / The Forge distribution
REM

setlocal enabledelayedexpansion

REM Configuration
set "MODULE_ID=token-replacer-fa"
set "OUTPUT_ZIP=%MODULE_ID%.zip"

REM Change to script directory (allows running from anywhere)
cd /d "%~dp0"

echo [INFO] Building %MODULE_ID%...

REM Check if module.json exists
if not exist "module.json" (
    echo [ERROR] module.json not found! Are you in the correct directory?
    exit /b 1
)

REM Extract version from module.json using PowerShell
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-Content 'module.json' | ConvertFrom-Json).version"`) do set "VERSION=%%i"

if "%VERSION%"=="" (
    echo [ERROR] Could not extract version from module.json
    exit /b 1
)

echo [INFO] Version: %VERSION%

REM Remove existing ZIP if present
if exist "%OUTPUT_ZIP%" (
    echo [WARN] Removing existing %OUTPUT_ZIP%
    del "%OUTPUT_ZIP%"
)

REM Create ZIP with only required module files using PowerShell
echo [INFO] Creating %OUTPUT_ZIP%...

powershell -NoProfile -Command ^
    "$files = @('module.json', 'README.md'); " ^
    "$dirs = @('scripts', 'lang', 'styles'); " ^
    "$tempDir = Join-Path $env:TEMP 'token-replacer-fa-build'; " ^
    "if (Test-Path $tempDir) { Remove-Item -Recurse -Force $tempDir }; " ^
    "New-Item -ItemType Directory -Path $tempDir | Out-Null; " ^
    "foreach ($file in $files) { if (Test-Path $file) { Copy-Item $file $tempDir } }; " ^
    "foreach ($dir in $dirs) { if (Test-Path $dir) { Copy-Item -Recurse $dir (Join-Path $tempDir $dir) } }; " ^
    "$zipPath = Join-Path (Get-Location) '%OUTPUT_ZIP%'; " ^
    "if (Test-Path $zipPath) { Remove-Item $zipPath }; " ^
    "Compress-Archive -Path (Join-Path $tempDir '*') -DestinationPath $zipPath -CompressionLevel Optimal; " ^
    "Remove-Item -Recurse -Force $tempDir"

REM Verify ZIP was created
if not exist "%OUTPUT_ZIP%" (
    echo [ERROR] Failed to create %OUTPUT_ZIP%
    exit /b 1
)

REM Get ZIP file size
for %%A in ("%OUTPUT_ZIP%") do set "ZIP_SIZE=%%~zA"
set /a "ZIP_SIZE_KB=%ZIP_SIZE% / 1024"

REM Show success message
echo.
echo ========================================
echo   Build successful!
echo ========================================
echo.
echo   Module:  %MODULE_ID%
echo   Version: %VERSION%
echo   Output:  %OUTPUT_ZIP%
echo   Size:    %ZIP_SIZE_KB% KB
echo.

REM Show ZIP contents
echo [INFO] ZIP contents:
powershell -NoProfile -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; $zip = [System.IO.Compression.ZipFile]::OpenRead('%OUTPUT_ZIP%'); $zip.Entries | ForEach-Object { Write-Host ('  ' + $_.FullName) }; $zip.Dispose()"

echo.
echo [INFO] Ready for upload to GitHub releases or The Forge!
echo.
echo   GitHub release example:
echo     gh release create v%VERSION% %OUTPUT_ZIP% module.json --title "v%VERSION%"
echo.

endlocal
