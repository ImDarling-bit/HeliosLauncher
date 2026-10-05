/**
 * Core UI functions are initialized in this file. This prevents
 * unexpected errors from breaking the core features. Specifically,
 * actions in this file should not require the usage of any internal
 * modules, excluding dependencies.
 */
// Requirements
const $                              = require('jquery')
const {ipcRenderer, shell, webFrame} = require('electron')
const remote                         = require('@electron/remote')
const isDev                          = require('./assets/js/isdev')
const { LoggerUtil }                 = require('helios-core')
const Lang                           = require('./assets/js/langloader')

const loggerUICore             = LoggerUtil.getLogger('UICore')
const loggerAutoUpdater        = LoggerUtil.getLogger('AutoUpdater')

// Log deprecation and process warnings.
process.traceProcessWarnings = true
process.traceDeprecation = true

// Disable eval function.
window.eval = global.eval = function () {
    throw new Error('Sorry, this app does not support window.eval().')
}

// Display warning when devtools window is opened.
remote.getCurrentWebContents().on('devtools-opened', () => {
    console.log('%cThe console is dark and full of terrors.', 'color: white; -webkit-text-stroke: 4px #a02d2a; font-size: 60px; font-weight: bold')
    console.log('%cIf you\'ve been told to paste something here, you\'re being scammed.', 'font-size: 16px')
    console.log('%cUnless you know exactly what you\'re doing, close this window.', 'font-size: 16px')
})

// Disable zoom, needed for darwin.
webFrame.setZoomLevel(0)
webFrame.setVisualZoomLevelLimits(1, 1)

// Initialize auto updates in production environments.
let updateCheckListener
// GUIDE — Mise à jour obligatoire au démarrage : seule la TOUTE PREMIÈRE vérification
// (celle lancée au lancement du launcher, cas 'ready' ci-dessous) affiche la page de
// mise à jour (update.ejs) : progression du téléchargement, puis choix d'installer —
// refuser ferme le launcher. Les vérifications suivantes (toutes les 30 min en tâche
// de fond, ou via le bouton "Vérifier les mises à jour") redeviennent manuelles : on
// ne force jamais la fermeture du launcher pendant qu'il est déjà utilisé. Dans tous
// les cas l'installation passe par la page (état 'installing'), jamais par
// l'assistant d'installation natif.
let isInitialUpdateCheck = true
if(!isDev){
    ipcRenderer.on('autoUpdateNotification', (event, arg, info) => {
        switch(arg){
            case 'checking-for-update':
                loggerAutoUpdater.info('Checking for update..')
                settingsUpdateButtonStatus(Lang.queryJS('uicore.autoUpdate.checkingForUpdateButton'), true)
                break
            case 'update-available':
                loggerAutoUpdater.info('New update available', info.version)

                if(process.platform === 'darwin'){
                    info.darwindownload = `https://github.com/ImDarling-bit/HeliosLauncher/releases/download/v${info.version}/DistrictLife-Launcher-setup-${info.version}-${process.arch === 'arm64' ? 'arm64' : 'x64'}.dmg`
                    showUpdateUI(info)
                } else if(isInitialUpdateCheck){
                    // Démarrage : la page de mise à jour suit le téléchargement.
                    showUpdatePage('downloading', info.version)
                }

                populateSettingsUpdateInformation(info)
                break
            case 'download-progress':
                if(isUpdatePageVisible()){
                    setUpdatePageProgress(info)
                }
                break
            case 'update-downloaded':
                loggerAutoUpdater.info('Update ' + info.version + ' ready to be installed.')
                if(isInitialUpdateCheck){
                    // Démarrage : mise à jour obligatoire avant de pouvoir continuer.
                    isInitialUpdateCheck = false
                    showUpdatePage('ready', info.version)
                } else {
                    settingsUpdateButtonStatus(Lang.queryJS('uicore.autoUpdate.installNowButton'), false, () => {
                        installUpdateNow(info.version)
                    })
                    showUpdateUI(info)
                }
                break
            case 'update-not-available':
                loggerAutoUpdater.info('No new update found.')
                settingsUpdateButtonStatus(Lang.queryJS('uicore.autoUpdate.checkForUpdatesButton'))
                isInitialUpdateCheck = false
                break
            case 'ready':
                updateCheckListener = setInterval(() => {
                    isInitialUpdateCheck = false
                    ipcRenderer.send('autoUpdateAction', 'checkForUpdate')
                }, 1800000)
                ipcRenderer.send('autoUpdateAction', 'checkForUpdate')
                break
            case 'realerror':
                isInitialUpdateCheck = false
                // Échec pendant le téléchargement initial : on ne bloque pas le launcher.
                if(isUpdatePageVisible() && $('#updateContainer').attr('state') === 'downloading'){
                    hideUpdatePage()
                }
                if(info != null && info.code != null){
                    if(info.code === 'ERR_UPDATER_INVALID_RELEASE_FEED'){
                        loggerAutoUpdater.info('No suitable releases found.')
                    } else if(info.code === 'ERR_XML_MISSED_ELEMENT'){
                        loggerAutoUpdater.info('No releases found.')
                    } else {
                        loggerAutoUpdater.error('Error during update check..', info)
                        loggerAutoUpdater.debug('Error Code:', info.code)
                    }
                }
                break
            default:
                loggerAutoUpdater.info('Unknown argument', arg)
                break
        }
    })
}

/**
 * Send a notification to the main process changing the value of
 * allowPrerelease. If we are running a prerelease version, then
 * this will always be set to true, regardless of the current value
 * of val.
 * 
 * @param {boolean} val The new allow prerelease value.
 */
function changeAllowPrerelease(val){
    ipcRenderer.send('autoUpdateAction', 'allowPrereleaseChange', val)
}

/**
 * Affiche la page de mise à jour (update.ejs) dans l'état demandé :
 * - 'downloading' : téléchargement en cours, barre de progression (seul « Quitter » est proposé) ;
 * - 'ready'       : mise à jour téléchargée, obligatoire — « Mettre à jour » l'installe,
 *                   « Quitter » ferme le launcher (aucune autre façon de continuer) ;
 * - 'installing'  : installation en cours, le launcher va se fermer puis redémarrer.
 *
 * @param {'downloading'|'ready'|'installing'} state L'état à afficher.
 * @param {string} version La version installée, affichée sous le titre.
 */
function showUpdatePage(state, version){
    const titles = {
        downloading: 'uicore.autoUpdate.downloadingTitle',
        ready: 'uicore.autoUpdate.mandatoryUpdateTitle',
        installing: 'uicore.autoUpdate.installingTitle'
    }
    const descs = {
        downloading: 'uicore.autoUpdate.downloadingDesc',
        ready: 'uicore.autoUpdate.mandatoryUpdateDesc',
        installing: 'uicore.autoUpdate.installingDesc'
    }
    const container = document.getElementById('updateContainer')
    container.setAttribute('state', state)
    document.getElementById('updateTitle').textContent = Lang.queryJS(titles[state])
    document.getElementById('updateVersion').textContent = `v${version}`
    document.getElementById('updateDesc').innerHTML = Lang.queryJS(descs[state], { version })

    const installButton = document.getElementById('updateInstallButton')
    installButton.textContent = Lang.queryJS('uicore.autoUpdate.mandatoryUpdateConfirm')
    installButton.onclick = () => installUpdateNow(version)

    const quitButton = document.getElementById('updateQuitButton')
    quitButton.textContent = Lang.queryJS('uicore.autoUpdate.mandatoryUpdateQuit')
    quitButton.onclick = () => remote.getCurrentWindow().close()

    if(state === 'downloading'){
        setUpdatePageProgress({ percent: 0 })
    } else if(state === 'installing'){
        document.getElementById('updateProgressText').textContent = ''
    }

    if(container.style.display === 'none'){
        $(container).fadeIn(250)
    }
    document.activeElement.blur()
}

/**
 * Met à jour la barre de progression de la page de mise à jour.
 *
 * @param {{percent: number, bytesPerSecond?: number, transferred?: number, total?: number}} progress
 * L'objet 'download-progress' d'electron-updater.
 */
function setUpdatePageProgress(progress){
    const percent = Math.max(0, Math.min(100, progress.percent || 0))
    document.getElementById('updateProgressBar').style.width = `${percent}%`
    let text = `${Math.floor(percent)} %`
    if(progress.total){
        const mb = (bytes) => (bytes / 1048576).toFixed(1)
        text += ` — ${mb(progress.transferred)} / ${mb(progress.total)} Mo`
    }
    document.getElementById('updateProgressText').textContent = text
}

function isUpdatePageVisible(){
    return document.getElementById('updateContainer').style.display !== 'none'
}

function hideUpdatePage(){
    $('#updateContainer').fadeOut(250)
}

/**
 * Passe la page de mise à jour en état 'installing' puis demande au processus
 * principal d'installer (silencieusement) et de relancer le launcher. Le court délai
 * laisse le temps à l'utilisateur de voir que l'installation démarre avant que la
 * fenêtre ne se ferme.
 *
 * @param {string} version La version installée.
 */
function installUpdateNow(version){
    showUpdatePage('installing', version)
    setTimeout(() => {
        ipcRenderer.send('autoUpdateAction', 'installUpdateNow')
    }, 1200)
}

function showUpdateUI(info){
    //TODO Make this message a bit more informative `${info.version}`
    document.getElementById('image_seal_container').setAttribute('update', true)
    document.getElementById('image_seal_container').onclick = () => {
        /*setOverlayContent('Update Available', 'A new update for the launcher is available. Would you like to install now?', 'Install', 'Later')
        setOverlayHandler(() => {
            if(!isDev){
                ipcRenderer.send('autoUpdateAction', 'installUpdateNow')
            } else {
                console.error('Cannot install updates in development environment.')
                toggleOverlay(false)
            }
        })
        setDismissHandler(() => {
            toggleOverlay(false)
        })
        toggleOverlay(true, true)*/
        prepareSettings().then(() => openSettingsModal())
    }
}

/* jQuery Example
$(function(){
    loggerUICore.info('UICore Initialized');
})*/

document.addEventListener('readystatechange', function () {
    if (document.readyState === 'interactive'){
        loggerUICore.info('UICore Initializing..')

        // Bind close button.
        Array.from(document.getElementsByClassName('fCb')).map((val) => {
            val.addEventListener('click', e => {
                const window = remote.getCurrentWindow()
                window.close()
            })
        })

        // Maximize button disabled — window size is fixed.

        // Bind minimize button.
        Array.from(document.getElementsByClassName('fMb')).map((val) => {
            val.addEventListener('click', e => {
                const window = remote.getCurrentWindow()
                window.minimize()
                document.activeElement.blur()
            })
        })

        // Remove focus from social media buttons once they're clicked.
        Array.from(document.getElementsByClassName('mediaURL')).map(val => {
            val.addEventListener('click', e => {
                document.activeElement.blur()
            })
        })

    } else if(document.readyState === 'complete'){

        //266.01
        //170.8
        //53.21
        // Bind progress bar length to length of bot wrapper
        //const targetWidth = document.getElementById("launch_content").getBoundingClientRect().width
        //const targetWidth2 = document.getElementById("server_selection").getBoundingClientRect().width
        //const targetWidth3 = document.getElementById("launch_button").getBoundingClientRect().width

        document.getElementById('launch_details').style.maxWidth = 266.01
        document.getElementById('launch_progress').style.width = 170.8
        document.getElementById('launch_details_right').style.maxWidth = 170.8
        document.getElementById('launch_progress_label').style.width = 53.21
        
    }

}, false)

/**
 * Open web links in the user's default browser.
 */
$(document).on('click', 'a[href^="http"]', function(event) {
    event.preventDefault()
    shell.openExternal(this.href)
})

/**
 * Opens DevTools window if you hold (ctrl + shift + i).
 * This will crash the program if you are using multiple
 * DevTools, for example the chrome debugger in VS Code. 
 */
document.addEventListener('keydown', function (e) {
    if((e.key === 'I' || e.key === 'i') && e.ctrlKey && e.shiftKey){
        let window = remote.getCurrentWindow()
        window.toggleDevTools()
    }
})