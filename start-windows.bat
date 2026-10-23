@echo off
setlocal
cd /d "%~dp0"
title Marktplaats Sniper

echo.
echo  ==========================================
echo    Marktplaats Sniper
echo  ==========================================
echo.

rem ---- 1. Node.js zoeken (en zo nodig installeren) ----
where node >nul 2>&1
if not errorlevel 1 goto :node_found
echo Node.js is niet gevonden. Node.js LTS wordt nu geinstalleerd via winget...
winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
set "PATH=%PATH%;%ProgramFiles%\nodejs"
where node >nul 2>&1
if not errorlevel 1 goto :node_found
echo.
echo Node.js kon niet automatisch worden geinstalleerd.
echo Installeer de LTS-versie via https://nodejs.org en start dit bestand daarna opnieuw.
goto :fout

:node_found
node -e "const [a,b]=process.versions.node.split('.').map(Number); process.exit(a>20||(a===20&&b>=9)?0:1)"
if errorlevel 1 (
    echo Je Node.js-versie is te oud. Installeer de LTS-versie via https://nodejs.org
    goto :fout
)

rem ---- 2. Pakketten installeren ----
echo Pakketten installeren/controleren...
call npm install --no-fund --no-audit --loglevel=error
if errorlevel 1 goto :fout

rem ---- 3. App bouwen (alleen als de code veranderd is) ----
powershell -NoProfile -Command "$b = Get-Item '.next\BUILD_ID' -ErrorAction SilentlyContinue; if (-not $b) { exit 1 }; $changed = Get-ChildItem -Path app,components,lib -Recurse -File | Where-Object { $_.LastWriteTime -gt $b.LastWriteTime }; $config = Get-Item instrumentation.ts,next.config.ts,package.json | Where-Object { $_.LastWriteTime -gt $b.LastWriteTime }; if ($changed -or $config) { exit 1 } else { exit 0 }"
if errorlevel 1 (
    echo App bouwen, dit duurt ongeveer een minuut...
    call npm run build
    if errorlevel 1 goto :fout
)

rem ---- 4. Starten ----
echo.
echo De app start nu en opent vanzelf in je browser: http://localhost:3000
echo Laat dit venster open: sluit je het, dan stopt de sniper.
echo Vraagt Windows om netwerktoegang? Kies "Toestaan" als je ook op je telefoon wilt kijken.
echo.
set OPEN_BROWSER=1
call npm run start
echo.
echo De app is gestopt.
pause
exit /b 0

:fout
echo.
echo Er ging iets mis. Bekijk de melding hierboven.
pause
exit /b 1
