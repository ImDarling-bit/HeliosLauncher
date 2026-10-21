@echo off
rem ===========================================================================
rem  Manifestation Toolkit - publication sur GitHub + build automatique
rem
rem  Double-clic sur ce fichier, place a la racine du dossier de l'app.
rem   1. Cree le depot GitHub (ou reutilise celui deja configure)
rem   2. Pousse tout le code, GitHub Action compris
rem   3. Enregistre les URLs serveurs et, en option, les secrets
rem   4. Pousse un tag vX.Y.Z : le GitHub Action compile l'APK et l'IPA
rem   5. Suit le build en direct puis ouvre la Release
rem
rem  Relancable sans risque : chaque relance publie une nouvelle version.
rem  Prerequis : Git for Windows + GitHub CLI (winget install GitHub.cli)
rem ===========================================================================
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
title Manifestation Toolkit - Publication GitHub
cd /d "%~dp0"

echo.
echo ==== Manifestation Toolkit : publication sur GitHub ====
echo Dossier : %CD%
echo.

rem --- Verifications -----------------------------------------------------------
if not exist "package.json" goto :err_src
if not exist ".github\workflows\build-and-release.yml" goto :err_src
where git >nul 2>&1 || goto :err_git
where gh  >nul 2>&1 || goto :err_gh

gh auth status >nul 2>&1
if errorlevel 1 goto :login
goto :logged
:login
echo Connexion a GitHub requise : une page va s'ouvrir dans ton navigateur.
gh auth login --web --git-protocol https
gh auth status >nul 2>&1 || goto :err_auth
:logged

rem --- 1. Depot Git local --------------------------------------------------
echo [1/5] Preparation du depot local...
if exist ".git" goto :has_git
git init -q -b main || goto :err_git_op
:has_git

rem Identite Git : globale si elle existe, sinon demandee et gardee pour ce depot
set "GIT_NAME="
set "GIT_MAIL="
for /f "delims=" %%A in ('git config user.name 2^>nul') do set "GIT_NAME=%%A"
for /f "delims=" %%A in ('git config user.email 2^>nul') do set "GIT_MAIL=%%A"
if defined GIT_NAME if defined GIT_MAIL goto :has_identity
set /p "GIT_NAME=Nom pour les commits Git (un pseudo suffit) : "
set /p "GIT_MAIL=E-mail pour les commits Git (ex. pseudo@users.noreply.github.com) : "
if not defined GIT_NAME goto :err_identity
if not defined GIT_MAIL goto :err_identity
git config user.name "%GIT_NAME%"
git config user.email "%GIT_MAIL%"
:has_identity

git add -A || goto :err_git_op
set "DIRTY="
for /f "delims=" %%A in ('git status --porcelain') do set "DIRTY=1"
if not defined DIRTY goto :no_changes
git commit -q -m "Manifestation Toolkit : mise a jour" || goto :err_git_op
:no_changes
git rev-parse --verify HEAD >nul 2>&1 || goto :err_empty

set "BRANCH=main"
for /f "delims=" %%B in ('git branch --show-current') do set "BRANCH=%%B"

rem --- 2. Depot GitHub -------------------------------------------------------
echo [2/5] Depot GitHub...
git remote get-url origin >nul 2>&1
if not errorlevel 1 goto :has_remote

set "REPO=manifestation-toolkit"
set /p "REPO=Nom du depot GitHub [manifestation-toolkit] : "
gh repo view "%REPO%" >nul 2>&1
if not errorlevel 1 goto :repo_exists

set "VIS=public"
set /p "VIS=Visibilite public / private [public] : "
if /i not "%VIS%"=="public" if /i not "%VIS%"=="private" goto :err_vis
gh repo create "%REPO%" --%VIS% --source . --remote origin --description "Boite a outils open source, gratuite et anonyme pour les manifestations (React Native / Expo)"
if errorlevel 1 goto :err_create
goto :has_remote

:repo_exists
echo Le depot "%REPO%" existe deja sur ton compte : il sera utilise.
set "REPO_URL="
for /f "delims=" %%U in ('gh repo view "%REPO%" --json url -q .url') do set "REPO_URL=%%U"
git remote add origin "%REPO_URL%.git" || goto :err_git_op

:has_remote
git push -u origin "%BRANCH%"
if errorlevel 1 goto :err_push

set "REPO_URL="
for /f "delims=" %%U in ('gh repo view --json url -q .url') do set "REPO_URL=%%U"
echo Code en ligne : %REPO_URL%

rem --- 3. Variables et secrets ----------------------------------------------
echo.
echo [3/5] Configuration du GitHub Action
set "HAS_WS="
for /f "delims=" %%V in ('gh variable list --json name -q ".[].name" 2^>nul ^| findstr /x "EXPO_PUBLIC_WS_URL"') do set "HAS_WS=1"
if defined HAS_WS goto :vars_done
echo URLs de tes serveurs prives. Laisse vide pour remplir plus tard sur GitHub.
set "WS_URL="
set "API_URL="
set /p "WS_URL=  WebSocket du chat, ex. wss://chat.mondomaine.org/ws : "
set /p "API_URL=  API REST de la carte, ex. https://api.mondomaine.org : "
if defined WS_URL  gh variable set EXPO_PUBLIC_WS_URL  --body "%WS_URL%"
if defined API_URL gh variable set EXPO_PUBLIC_API_URL --body "%API_URL%"
:vars_done

set "HAS_MAPS="
for /f "delims=" %%V in ('gh secret list --json name -q ".[].name" 2^>nul ^| findstr /x "GOOGLE_MAPS_ANDROID_KEY"') do set "HAS_MAPS=1"
if defined HAS_MAPS goto :skip_maps
choice /c ON /m "Ajouter la cle Google Maps Android (sinon la carte Android sera vide)"
if errorlevel 2 goto :skip_maps
echo Colle la cle quand gh la demande (elle reste masquee) :
gh secret set GOOGLE_MAPS_ANDROID_KEY
:skip_maps

set "HAS_KS="
for /f "delims=" %%V in ('gh secret list --json name -q ".[].name" 2^>nul ^| findstr /x "ANDROID_KEYSTORE_BASE64"') do set "HAS_KS=1"
if defined HAS_KS goto :skip_keystore
choice /c ON /m "Configurer une cle de signature Android .keystore (recommande)"
if errorlevel 2 goto :skip_keystore
set "KS="
set /p "KS=Chemin du fichier .keystore : "
if not defined KS goto :skip_keystore
rem Retire les guillemets si le chemin a ete colle via "Copier en tant que chemin"
set "KS=%KS:"=%"
if not exist "%KS%" goto :ks_missing
powershell -NoProfile -Command "[Convert]::ToBase64String([IO.File]::ReadAllBytes($env:KS))" > "%TEMP%\mt-keystore.b64"
gh secret set ANDROID_KEYSTORE_BASE64 < "%TEMP%\mt-keystore.b64"
del /q "%TEMP%\mt-keystore.b64"
echo Saisie masquee des informations de la cle :
gh secret set ANDROID_KEYSTORE_PASSWORD
gh secret set ANDROID_KEY_ALIAS
gh secret set ANDROID_KEY_PASSWORD
goto :skip_keystore
:ks_missing
echo Fichier introuvable, etape ignoree.
:skip_keystore

rem --- 4. Tag = declenchement du GitHub Action -----------------------------
echo.
echo [4/5] Nouvelle version
git fetch -q --tags origin >nul 2>&1
set "LAST="
for /f "delims=" %%T in ('git tag --list "v*" --sort=-v:refname') do if not defined LAST set "LAST=%%T"
if defined LAST echo Derniere version publiee : %LAST%
:ask_version
set "VERSION=v1.0.0"
if defined LAST set "VERSION="
if defined LAST set /p "VERSION=Numero de la nouvelle version, ex. v1.0.1 : "
if not defined LAST set /p "VERSION=Numero de version a publier [v1.0.0] : "
if not defined VERSION goto :ask_version
if /i not "%VERSION:~0,1%"=="v" (
    echo Le numero doit commencer par v, ex. v1.0.1
    goto :ask_version
)
git rev-parse -q --verify "refs/tags/%VERSION%" >nul 2>&1
if errorlevel 1 goto :tag_ok
echo La version %VERSION% existe deja, choisis-en une autre.
goto :ask_version
:tag_ok
git tag -a "%VERSION%" -m "Release %VERSION%" || goto :err_git_op
git push origin "%VERSION%" || goto :err_push

rem --- 5. Suivi du build -----------------------------------------------------
echo.
echo [5/5] GitHub Action lance. Recherche du build...
set "RUN="
set /a TRIES=0
:find_run
timeout /t 10 /nobreak >nul
for /f "delims=" %%R in ('gh run list --workflow build-and-release.yml --branch "%VERSION%" --limit 1 --json databaseId -q ".[0].databaseId" 2^>nul') do set "RUN=%%R"
if defined RUN goto :watch
set /a TRIES+=1
if %TRIES% lss 9 goto :find_run
echo Build introuvable pour l'instant. Suis-le ici : %REPO_URL%/actions
start "" "%REPO_URL%/actions"
goto :done

:watch
echo Build en cours (environ 20 a 40 minutes). Tu peux fermer cette fenetre :
echo le build continue sur GitHub. Page du build : %REPO_URL%/actions/runs/%RUN%
echo.
gh run watch %RUN% --interval 30 --exit-status
if errorlevel 1 goto :run_failed
echo.
echo Build reussi.
start "" "%REPO_URL%/releases/tag/%VERSION%"
goto :done

:run_failed
echo.
echo Le build a echoue ou a ete annule. Detail des erreurs :
echo   %REPO_URL%/actions/runs/%RUN%
echo Si seul iOS a echoue, la Release contient quand meme l'APK.
start "" "%REPO_URL%/actions/runs/%RUN%"

:done
echo.
echo ==== Termine ====
echo Depot   : %REPO_URL%
echo Release : %REPO_URL%/releases/tag/%VERSION%
echo Pour publier une mise a jour : modifie le code puis relance ce fichier.
echo.
pause
exit /b 0

rem --- Erreurs ---------------------------------------------------------------
:err_src
echo ERREUR : place ce fichier a la racine du dossier manifestation-toolkit
echo ^(a cote de package.json^).
goto :fail
:err_git
echo ERREUR : Git n'est pas installe. https://git-scm.com/download/win
echo ou : winget install Git.Git
goto :fail
:err_gh
echo ERREUR : GitHub CLI n'est pas installe. https://cli.github.com
echo ou : winget install GitHub.cli   puis ferme et rouvre la fenetre.
goto :fail
:err_auth
echo ERREUR : connexion GitHub echouee. Relance : gh auth login
goto :fail
:err_identity
echo ERREUR : nom et e-mail Git requis.
goto :fail
:err_empty
echo ERREUR : aucun fichier a publier.
goto :fail
:err_vis
echo ERREUR : visibilite invalide, tape public ou private.
goto :fail
:err_create
echo ERREUR : creation du depot impossible ^(voir le message ci-dessus^).
goto :fail
:err_push
echo ERREUR : envoi vers GitHub refuse ^(voir le message ci-dessus^).
echo Si le depot existait deja avec un autre historique, choisis un autre nom :
echo supprime le dossier .git ici puis relance ce fichier.
goto :fail
:err_git_op
echo ERREUR : une commande Git a echoue ^(voir ci-dessus^).
goto :fail
:fail
echo.
pause
exit /b 1
