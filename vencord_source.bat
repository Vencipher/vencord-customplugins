@echo off
setlocal enabledelayedexpansion
title Vencord From-Source Installer

reg add HKCU\Console /v VirtualTerminalLevel /t REG_DWORD /d 1 /f >nul 2>&1
for /F %%a in ('"prompt $E & for %%b in (1) do rem"') do set "ESC=%%a"
set "C_CYAN=%ESC%[96m"
set "C_GREEN=%ESC%[92m"
set "C_YELLOW=%ESC%[93m"
set "C_RED=%ESC%[91m"
set "C_BOLD=%ESC%[1m"
set "C_DIM=%ESC%[2m"
set "C_RESET=%ESC%[0m"

cls
echo.
echo %C_CYAN%%C_BOLD%  ==============================================%C_RESET%
echo %C_CYAN%%C_BOLD%        Vencord  From-Source  Installer        %C_RESET%
echo %C_CYAN%%C_BOLD%  ==============================================%C_RESET%
echo.
echo %C_DIM%  This script will automatically:%C_RESET%
echo   %C_DIM%1.%C_RESET% Install Git, Node.js LTS and pnpm   %C_DIM%(if missing)%C_RESET%
echo   %C_DIM%2.%C_RESET% Clone the Vencord source repository
echo   %C_DIM%3.%C_RESET% Install all dependencies
echo   %C_DIM%4.%C_RESET% Build Vencord
echo   %C_DIM%5.%C_RESET% Launch the Vencord Installer         %C_DIM%(patch Discord Desktop)%C_RESET%
echo.
echo %C_YELLOW%  Press any key to start, or close this window to cancel.%C_RESET%
pause >nul
echo.

winget --version >nul 2>&1
if %errorlevel% neq 0 (
    echo %C_RED%  [ERROR] winget is not available on this system.%C_RESET%
    echo.
    echo  Please install the dependencies manually, then re-run this script:
    echo    Git    -^>  https://git-scm.com/downloads
    echo    Node   -^>  https://nodejs.org/en/download/
    echo    pnpm   -^>  https://pnpm.io/installation
    echo.
    pause
    exit /b 1
)

echo %C_CYAN%  [1/5] Checking for Git...%C_RESET%
git --version >nul 2>&1
if %errorlevel% == 0 (
    for /f "tokens=*" %%v in ('git --version 2^>nul') do echo %C_GREEN%        Already installed: %%v%C_RESET%
) else (
    echo %C_YELLOW%        Not found. Installing Git via winget...%C_RESET%
    winget install --id Git.Git -e --source winget --accept-source-agreements --accept-package-agreements
    if !errorlevel! neq 0 (
        echo %C_RED%  [ERROR] Git installation failed.%C_RESET%
        echo         Please install manually: https://git-scm.com/downloads
        pause
        exit /b 1
    )
    echo %C_GREEN%        Git installed successfully.%C_RESET%
)

echo.
echo %C_CYAN%  [2/5] Checking for Node.js...%C_RESET%
node --version >nul 2>&1
if %errorlevel% == 0 (
    for /f "tokens=*" %%v in ('node --version 2^>nul') do echo %C_GREEN%        Already installed: Node.js %%v%C_RESET%
) else (
    echo %C_YELLOW%        Not found. Installing Node.js LTS via winget...%C_RESET%
    winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-source-agreements --accept-package-agreements
    if !errorlevel! neq 0 (
        echo %C_RED%  [ERROR] Node.js installation failed.%C_RESET%
        echo         Please install manually: https://nodejs.org/en/download/
        pause
        exit /b 1
    )
    echo %C_GREEN%        Node.js installed successfully.%C_RESET%
)

echo.
echo %C_DIM%        Refreshing PATH from registry...%C_RESET%
for /f "tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%B"
for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USR_PATH=%%B"
if defined SYS_PATH if defined USR_PATH set "PATH=%SYS_PATH%;%USR_PATH%"
if defined SYS_PATH if not defined USR_PATH set "PATH=%SYS_PATH%"

echo.
echo %C_CYAN%  [3/5] Checking for pnpm...%C_RESET%
pnpm --version >nul 2>&1
if %errorlevel% == 0 (
    for /f "tokens=*" %%v in ('pnpm --version 2^>nul') do echo %C_GREEN%        Already installed: pnpm %%v%C_RESET%
) else (
    echo %C_YELLOW%        Not found. Installing pnpm via npm...%C_RESET%
    npm install -g pnpm
    if !errorlevel! neq 0 (
        echo %C_RED%  [ERROR] pnpm installation failed.%C_RESET%
        echo         Please install manually: https://pnpm.io/installation
        pause
        exit /b 1
    )
    echo %C_GREEN%        pnpm installed successfully.%C_RESET%
    for /f "tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%B"
    for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USR_PATH=%%B"
    if defined SYS_PATH if defined USR_PATH set "PATH=%SYS_PATH%;%USR_PATH%"
)

echo.
echo %C_DIM%        Verifying all tools are accessible...%C_RESET%
set "TOOLS_OK=1"
git --version >nul 2>&1   || set "TOOLS_OK=0"
node --version >nul 2>&1  || set "TOOLS_OK=0"
pnpm --version >nul 2>&1  || set "TOOLS_OK=0"

if "%TOOLS_OK%"=="0" (
    echo.
    echo %C_RED%  [WARNING] One or more tools could not be found in PATH right now.%C_RESET%
    echo.
    echo  This can happen when a fresh install hasn't been picked up yet.
    echo  %C_YELLOW%Please close this window and run vencord_source.bat again.%C_RESET%
    echo  ^(You only need to do this once — they are already installed.^)
    echo.
    pause
    exit /b 1
)
echo %C_GREEN%        git / node / pnpm — all good!%C_RESET%

echo.
echo %C_CYAN%  [4/5] Setting up the Vencord repository...%C_RESET%
set "VENCORD_DIR=%USERPROFILE%\Documents\Vencord"

if exist "%VENCORD_DIR%\.git" (
    echo %C_YELLOW%        Existing folder found. Pulling latest changes...%C_RESET%
    cd /d "%VENCORD_DIR%"
    git pull
    if !errorlevel! neq 0 (
        echo %C_RED%  [ERROR] git pull failed. Check your internet connection.%C_RESET%
        pause
        exit /b 1
    )
) else (
    echo %C_DIM%        Cloning into: %VENCORD_DIR%%C_RESET%
    cd /d "%USERPROFILE%\Documents"
    git clone https://github.com/Vendicated/Vencord
    if !errorlevel! neq 0 (
        echo %C_RED%  [ERROR] Failed to clone the Vencord repository.%C_RESET%
        echo         Check your internet connection and try again.
        pause
        exit /b 1
    )
    cd /d "%VENCORD_DIR%"
)
echo %C_GREEN%        Repository ready.%C_RESET%

echo.
echo %C_DIM%        Installing Vencord dependencies (pnpm install --frozen-lockfile)...%C_RESET%
pnpm install --frozen-lockfile
if !errorlevel! neq 0 (
    echo %C_RED%  [ERROR] Dependency installation failed.%C_RESET%
    pause
    exit /b 1
)
echo %C_GREEN%        Dependencies installed.%C_RESET%

echo.
echo %C_CYAN%  [5/5] Building Vencord (pnpm build)...%C_RESET%
echo %C_DIM%        This may take a minute or two.%C_RESET%
echo.
pnpm build
if !errorlevel! neq 0 (
    echo.
    echo %C_RED%  [ERROR] Build failed.%C_RESET%
    echo         Check the output above for details.
    pause
    exit /b 1
)

echo.
echo %C_GREEN%%C_BOLD%  ==============================================  %C_RESET%
echo %C_GREEN%%C_BOLD%   Build successful! Launching the installer...  %C_RESET%
echo %C_GREEN%%C_BOLD%  ==============================================  %C_RESET%
echo.
echo %C_YELLOW%  The Vencord Installer will open now.%C_RESET%
echo   - Select your Discord Desktop installation
echo   - Click %C_BOLD%Install%C_RESET%
echo   - Then restart Discord
echo.
echo  Press any key to continue to the installer...
pause >nul
echo.

pnpm inject

echo.
echo %C_GREEN%%C_BOLD%  ==============================================  %C_RESET%
echo %C_GREEN%%C_BOLD%   All done! Restart Discord and enjoy.          %C_RESET%
echo %C_GREEN%%C_BOLD%  ==============================================  %C_RESET%
echo.
echo %C_DIM%  Your Vencord source is saved at:%C_RESET%
echo   %VENCORD_DIR%
echo.
echo %C_DIM%  To rebuild after changes, run this script again or open a terminal
echo  in that folder and run: pnpm build%C_RESET%
echo.
pause
endlocal
