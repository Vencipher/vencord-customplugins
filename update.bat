@echo off
setlocal enabledelayedexpansion

set "CONFIG_FILE=%~dp0plugin_updater_config.txt"
set "PLUGINS_LIST=%~dp0plugins.txt"
set "PLUGINS_EXTRA=%~dp0plugins_extra_files.txt"
set "GITHUB_RAW=https://raw.githubusercontent.com/Vencipher/vencord-customplugins/main"

if exist "%CONFIG_FILE%" (
    set /p VENCORD_DIR=<"%CONFIG_FILE%"
) else (
    echo ==========================================
    echo Vencipher's Plugin Setup
    echo ==========================================
    echo Please enter the full path to your Vencord folder.
    echo Example: C:\Users\YourName\Documents\Vencord
    echo.
    set /p VENCORD_DIR="Path: "
    echo !VENCORD_DIR!>"%CONFIG_FILE%"
)

if not exist "%VENCORD_DIR%\pnpm-lock.yaml" (
    echo.
    echo ERROR: Could not find Vencord at the specified path.
    echo Please delete plugin_updater_config.txt and run this script again.
    pause
    exit /b
)

echo.
echo Fetching plugin list...
curl -s -o "%PLUGINS_LIST%" "%GITHUB_RAW%/plugins.txt"
curl -s -o "%PLUGINS_EXTRA%" "%GITHUB_RAW%/plugins_extra_files.txt"

if not exist "%PLUGINS_LIST%" (
    echo ERROR: Could not download plugin list from GitHub.
    pause
    exit /b
)

echo.
echo Closing Discord...
taskkill /F /IM Discord.exe /T 2>nul
taskkill /F /IM DiscordPTB.exe /T 2>nul
taskkill /F /IM DiscordCanary.exe /T 2>nul

echo.
echo ==========================================
echo Updating Vencipher's Vencord Plugins...
echo ==========================================

cd /d "%VENCORD_DIR%"

echo.
echo Updating dependencies (pnpm install)...
call pnpm install

set "PLUGINS_DIR=src\userplugins"

echo.
echo Downloading Latest Plugins...

for /f "usebackq delims=" %%P in ("%PLUGINS_LIST%") do (
    mkdir "%PLUGINS_DIR%\%%P" 2>nul
    curl -s -o "%PLUGINS_DIR%\%%P\index.tsx" "%GITHUB_RAW%/%%P/index.tsx"
)

if exist "%PLUGINS_EXTRA%" (
    for /f "usebackq tokens=1,2 delims=," %%A in ("%PLUGINS_EXTRA%") do (
        curl -s -o "%PLUGINS_DIR%\%%A\%%B" "%GITHUB_RAW%/%%A/%%B"
    )
)

echo.
echo Rebuilding and Injecting Vencord...
call pnpm build
call pnpm inject

echo.
echo Starting Discord...
if exist "%LOCALAPPDATA%\Discord\Update.exe" (
    start "" "%LOCALAPPDATA%\Discord\Update.exe" --processStart Discord.exe
) else if exist "%LOCALAPPDATA%\DiscordPTB\Update.exe" (
    start "" "%LOCALAPPDATA%\DiscordPTB\Update.exe" --processStart DiscordPTB.exe
) else if exist "%LOCALAPPDATA%\DiscordCanary\Update.exe" (
    start "" "%LOCALAPPDATA%\DiscordCanary\Update.exe" --processStart DiscordCanary.exe
)

echo.
echo ==========================================
echo Update Complete!
echo ==========================================
pause
