@echo off
rem ===========================================================================
rem  Manifestation Toolkit - creation du depot GitHub + premiere release
rem
rem  1. Copie l'app dans un dossier neuf, hors du depot du launcher
rem  2. Cree le depot GitHub et pousse le code (avec le GitHub Action)
rem  3. Configure les variables et secrets du workflow
rem  4. Pousse le tag v1.0.0, ce qui lance le build APK + IPA
rem
rem  Prerequis : Git for Windows et GitHub CLI (gh). Double-clic ou :
rem    manifestation-toolkit\scripts\publier-github.bat
rem ===========================================================================
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
title Manifestation Toolkit - Publication GitHub

rem Dossier de l'app = parent du dossier de ce script
for %%I in ("%~dp0..") do set "SRC=%%~fI"

echo.
echo ==== Manifestation Toolkit : publication sur GitHub ====
echo Source : %SRC%
echo.

rem --- Verifications -----------------------------------------------------------
if not exist "%SRC%\package.json" goto :err_src
if not exist "%SRC%\.github\workflows\build-and-release.yml" goto :err_src

where git >nul 2>&1 || goto :err_git
where gh  >nul 2>&1 || goto :err_gh

gh auth status >nul 2>&1
if errorlevel 1 (
    echo Connexion a GitHub requise...
    gh auth login --web --git-protocol https
    gh auth status >nul 2>&1 || goto :err_auth
)

rem Identite Git pour le commit
set "GIT_NAME="
set "GIT_MAIL="
for /f "delims=" %%A in ('git config --global user.name 2^>nul') do set "GIT_NAME=%%A"
for /f "delims=" %%A in ('git config --global user.email 2^>nul') do set "GIT_MAIL=%%A"
if not defined GIT_NAME set /p "GIT_NAME=Nom pour les commits Git (pseudo accepte) : "
if not defined GIT_MAIL set /p "GIT_MAIL=E-mail pour les commits Git (ex. pseudo@users.noreply.github.com) : "
if not defined GIT_NAME goto :err_identity
if not defined GIT_MAIL goto :err_identity

rem --- Parametres ----------------------------------------------------------------
set "REPO=manifestation-toolkit"
set /p "REPO=Nom du depot GitHub [manifestation-toolkit] : "

set "VIS=public"
set /p "VIS=Visibilite public / private [public] : "
if /i not "%VIS%"=="public" if /i not "%VIS%"=="private" goto :err_vis

set "DEST=%USERPROFILE%\Documents\%REPO%"
set /p "DEST=Dossier local du nouveau depot [%DEST%] : "
if exist "%DEST%\*" goto :err_dest

set "VERSION=v1.0.0"
set /p "VERSION=Tag de la premiere release [v1.0.0] : "
if /i not "%VERSION:~0,1%"=="v" goto :err_version

echo.
echo URLs de tes serveurs prives. Laisse vide pour remplir plus tard sur GitHub.
set "WS_URL="
set "API_URL="
set /p "WS_URL=  WebSocket du chat, ex. wss://chat.mondomaine.org/ws : "
set /p "API_URL=  API REST de la carte, ex. https://api.mondomaine.org : "

echo.
echo Recapitulatif :
echo   Depot      : %REPO% [%VIS%]
echo   Dossier    : %DEST%
echo   Release    : %VERSION%
echo.
choice /c ON /m "Continuer"
if errorlevel 2 goto :abort

rem --- 1. Copie --------------------------------------------------------------
echo.
echo [1/4] Copie des fichiers...
robocopy "%SRC%" "%DEST%" /E /NFL /NDL /NJH /NJS /NP /XD node_modules android ios .expo dist web-build >nul
if errorlevel 8 goto :err_copy

rem --- 2. Depot Git + GitHub -------------------------------------------------
echo [2/4] Creation du depot...
pushd "%DEST%" || goto :err_copy
git init -q -b main || goto :err_git_op
git config user.name "%GIT_NAME%"
git config user.email "%GIT_MAIL%"
git add -A || goto :err_git_op
git commit -q -m "Manifestation Toolkit : MVP initial" || goto :err_git_op

gh repo create "%REPO%" --%VIS% --source . --remote origin --push --description "Boite a outils open source, gratuite et anonyme pour les manifestations (React Native / Expo)"
if errorlevel 1 goto :err_create

rem --- 3. Variables et secrets ----------------------------------------------
echo.
echo [3/4] Configuration du GitHub Action...
if defined WS_URL  gh variable set EXPO_PUBLIC_WS_URL  --body "%WS_URL%"
if defined API_URL gh variable set EXPO_PUBLIC_API_URL --body "%API_URL%"

echo.
choice /c ON /m "Ajouter maintenant la cle Google Maps Android (sinon la carte Android sera vide)"
if errorlevel 2 goto :skip_maps
echo Colle la cle quand gh la demande (elle ne s'affiche pas) :
gh secret set GOOGLE_MAPS_ANDROID_KEY
:skip_maps

echo.
choice /c ON /m "Configurer une cle de signature Android .keystore (recommande)"
if errorlevel 2 goto :skip_keystore
set "KS="
set /p "KS=Chemin du fichier .keystore : "
if not defined KS goto :skip_keystore
rem Retire les guillemets si le chemin a ete colle via "Copier en tant que chemin"
set "KS=%KS:"=%"
if not exist "%KS%" (
    echo Fichier introuvable, etape ignoree.
    goto :skip_keystore
)
powershell -NoProfile -Command "[Convert]::ToBase64String([IO.File]::ReadAllBytes($env:KS))" > "%TEMP%\mt-keystore.b64"
gh secret set ANDROID_KEYSTORE_BASE64 < "%TEMP%\mt-keystore.b64"
del /q "%TEMP%\mt-keystore.b64"
echo Saisie masquee des informations de la cle :
gh secret set ANDROID_KEYSTORE_PASSWORD
gh secret set ANDROID_KEY_ALIAS
gh secret set ANDROID_KEY_PASSWORD
:skip_keystore

rem --- 4. Tag = lancement du build ------------------------------------------
echo.
echo [4/4] Lancement du build...
git tag -a "%VERSION%" -m "Release %VERSION%" || goto :err_git_op
git push origin "%VERSION%" || goto :err_git_op

set "REPO_URL="
for /f "delims=" %%U in ('gh repo view --json url -q .url') do set "REPO_URL=%%U"
popd

echo.
echo ==== Termine ====
echo Depot   : %REPO_URL%
echo Build   : %REPO_URL%/actions  (environ 20 a 40 minutes)
echo Release : %REPO_URL%/releases  (APK + IPA une fois le build fini)
echo.
echo Pour une nouvelle version plus tard, depuis %DEST% :
echo   git tag v1.0.1
echo   git push origin v1.0.1
echo.
start "" "%REPO_URL%/actions"
pause
exit /b 0

rem --- Erreurs ---------------------------------------------------------------
:err_src
echo ERREUR : lance ce script depuis manifestation-toolkit\scripts\ ^(package.json ou workflow introuvable^).
goto :fail
:err_git
echo ERREUR : Git n'est pas installe. https://git-scm.com/download/win
goto :fail
:err_gh
echo ERREUR : GitHub CLI n'est pas installe. https://cli.github.com  ^(ou : winget install GitHub.cli^)
goto :fail
:err_auth
echo ERREUR : connexion GitHub echouee. Relance : gh auth login
goto :fail
:err_identity
echo ERREUR : nom et e-mail Git requis.
goto :fail
:err_vis
echo ERREUR : visibilite invalide, tape public ou private.
goto :fail
:err_dest
echo ERREUR : le dossier "%DEST%" existe deja. Choisis-en un autre ou supprime-le.
goto :fail
:err_version
echo ERREUR : le tag doit commencer par v, ex. v1.0.0.
goto :fail
:err_copy
echo ERREUR : copie impossible vers "%DEST%".
goto :fail
:err_create
popd
echo ERREUR : creation du depot impossible. Le nom "%REPO%" existe peut-etre deja sur ton compte.
echo Le dossier local "%DEST%" est pret : supprime-le ou pousse-le a la main.
goto :fail
:err_git_op
popd
echo ERREUR : une commande Git a echoue ^(voir ci-dessus^).
goto :fail
:abort
echo Annule.
pause
exit /b 1
:fail
echo.
pause
exit /b 1
