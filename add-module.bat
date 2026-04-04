@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

:: ============================================================
::  DistrictLife — Ajout de module dans distribution.json
:: ============================================================

set "SCRIPT_DIR=%~dp0"
set "DISTRO_JSON=%SCRIPT_DIR%distribution.json"
set "BASE_URL=https://distribution.ap-bts.wstr.fr"

if not exist "%DISTRO_JSON%" (
    echo [ERREUR] distribution.json introuvable : %DISTRO_JSON%
    pause & exit /b 1
)

echo.
echo  ================================================
echo   DistrictLife - Ajout de module
echo  ================================================
echo.

:: --- Type de module ---
echo  Types disponibles :
echo   1. ForgeMod   (mod place dans mods/)
echo   2. File        (fichier/dossier custom)
echo.
set /p "TYPE_CHOICE= Type [1/2] : "

if "%TYPE_CHOICE%"=="1" (
    set "MODULE_TYPE=ForgeMod"
    echo  [Type] ForgeMod
) else if "%TYPE_CHOICE%"=="2" (
    set "MODULE_TYPE=File"
    echo  [Type] File
) else (
    echo [ERREUR] Choix invalide.
    pause & exit /b 1
)

echo.

:: --- Fichier source ---
set /p "FILE_PATH= Chemin complet du fichier : "
set "FILE_PATH=%FILE_PATH:"=%"

if not exist "%FILE_PATH%" (
    echo [ERREUR] Fichier introuvable : %FILE_PATH%
    pause & exit /b 1
)

for %%F in ("%FILE_PATH%") do set "FILE_NAME=%%~nxF"

echo  [Fichier] %FILE_NAME%

:: --- Calcul size et MD5 via PowerShell ---
echo.
echo  Calcul MD5 et taille...

for /f %%S in ('powershell -NoProfile -Command "(Get-Item '%FILE_PATH%').Length"') do set "FILE_SIZE=%%S"
for /f %%H in ('powershell -NoProfile -Command "(Get-FileHash '%FILE_PATH%' -Algorithm MD5).Hash.ToLower()"') do set "FILE_MD5=%%H"

echo  [Taille] %FILE_SIZE% octets
echo  [MD5]    %FILE_MD5%

echo.

:: --- Infos du module ---
set /p "MODULE_ID= ID du module (ex: curse:fancymenu:2.14.9) : "
set /p "MODULE_NAME= Nom affiche (ex: FancyMenu) : "

:: --- URL ---
echo.
echo  URL de base : %BASE_URL%
set /p "URL_PATH= Chemin URL apres la base (ex: /mods/fancymenu-2.14.9.jar) : "
set "MODULE_URL=%BASE_URL%%URL_PATH%"
echo  [URL] %MODULE_URL%

:: --- Path de destination (File uniquement) ---
set "ARTIFACT_PATH_LINE="
if "%MODULE_TYPE%"=="File" (
    echo.
    echo  Chemin de destination relatif au gameDir
    echo  Exemples :
    echo    config/fancymenu/layouts/mainmenu.txt
    echo    resourcepacks/monpack.zip
    echo    options.txt
    echo.
    set /p "DEST_PATH= Chemin de destination : "
    set "ARTIFACT_PATH_LINE=,\n            \"path\": \"!DEST_PATH:\=\\!\""
)

:: --- Generation du bloc JSON ---
echo.
echo  Generation du module JSON...

set "JSON_BLOCK={\"id\": \"%MODULE_ID%\", \"name\": \"%MODULE_NAME%\", \"type\": \"%MODULE_TYPE%\", \"artifact\": {\"size\": %FILE_SIZE%, \"MD5\": \"%FILE_MD5%\", \"url\": \"%MODULE_URL%\"%ARTIFACT_PATH_LINE%}}"

:: --- Affichage recap ---
echo.
echo  ================================================
echo   RECAP
echo  ================================================
echo   ID      : %MODULE_ID%
echo   Nom     : %MODULE_NAME%
echo   Type    : %MODULE_TYPE%
echo   Taille  : %FILE_SIZE% octets
echo   MD5     : %FILE_MD5%
echo   URL     : %MODULE_URL%
if "%MODULE_TYPE%"=="File" echo   Dest    : %DEST_PATH%
echo  ================================================
echo.

set /p "CONFIRM= Ajouter ce module dans distribution.json ? [O/N] : "
if /i not "%CONFIRM%"=="O" (
    echo Annule.
    pause & exit /b 0
)

:: --- Injection dans distribution.json via PowerShell ---
powershell -NoProfile -Command ^
    "$distro = Get-Content '%DISTRO_JSON%' -Raw | ConvertFrom-Json;" ^
    "$server = $distro.servers[0];" ^
    "$newModule = @{" ^
    "    id = '%MODULE_ID%';" ^
    "    name = '%MODULE_NAME%';" ^
    "    type = '%MODULE_TYPE%';" ^
    "    artifact = @{" ^
    "        size = %FILE_SIZE%;" ^
    "        MD5 = '%FILE_MD5%';" ^
    "        url = '%MODULE_URL%'" ^
    "    }" ^
    "};" ^
    "if ('%MODULE_TYPE%' -eq 'File') { $newModule.artifact['path'] = '%DEST_PATH:\=/%' };" ^
    "$server.modules += [PSCustomObject]$newModule;" ^
    "$distro | ConvertTo-Json -Depth 10 | Set-Content '%DISTRO_JSON%' -Encoding UTF8;" ^
    "Write-Host '[OK] Module ajoute dans distribution.json'"

if %ERRORLEVEL% neq 0 (
    echo [ERREUR] Echec de la mise a jour de distribution.json
    pause & exit /b 1
)

echo.
echo  ================================================
echo   ETAPES SUIVANTES
echo  ================================================
echo   1. Uploadez le fichier sur votre serveur :
echo      %MODULE_URL%
echo.
echo   2. Deployez distribution.json mis a jour sur :
echo      %BASE_URL%/distribution.json
echo.
echo   3. Au prochain lancement, le launcher
echo      telechargera automatiquement le fichier.
echo  ================================================
echo.

pause
endlocal
