@echo off
setlocal enabledelayedexpansion

set "CONFIG_FILE=%~dp0plugin_updater_config.txt"

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

mkdir "%PLUGINS_DIR%\BigFileUpload" 2>nul
mkdir "%PLUGINS_DIR%\EncryptedText" 2>nul
mkdir "%PLUGINS_DIR%\FakeDeafen" 2>nul
mkdir "%PLUGINS_DIR%\UserColors" 2>nul
mkdir "%PLUGINS_DIR%\InvisibleDetector" 2>nul

echo.
echo Downloading Latest Plugins...

curl -s -o "%PLUGINS_DIR%\BigFileUpload\index.tsx" https://raw.githubusercontent.com/Vencipher/vencord-customplugins/main/BigFileUpload/index.tsx
curl -s -o "%PLUGINS_DIR%\BigFileUpload\native.ts" https://raw.githubusercontent.com/Vencipher/vencord-customplugins/main/BigFileUpload/native.ts
curl -s -o "%PLUGINS_DIR%\EncryptedText\index.tsx" https://raw.githubusercontent.com/Vencipher/vencord-customplugins/main/EncryptedText/index.tsx
curl -s -o "%PLUGINS_DIR%\FakeDeafen\index.tsx" https://raw.githubusercontent.com/Vencipher/vencord-customplugins/main/FakeDeafen/index.tsx
curl -s -o "%PLUGINS_DIR%\UserColors\index.tsx" https://raw.githubusercontent.com/Vencipher/vencord-customplugins/main/UserColors/index.tsx
curl -s -o "%PLUGINS_DIR%\InvisibleDetector\index.tsx" https://raw.githubusercontent.com/Vencipher/vencord-customplugins/main/InvisibleDetector/index.tsx

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
