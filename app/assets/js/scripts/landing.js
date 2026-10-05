/**
 * Script for landing.ejs
 */
// Requirements
const { URL }                 = require('url')
const fsExtra                 = require('fs-extra')
const StreamZip               = require('node-stream-zip')
const {
    MojangRestAPI,
    getServerStatus
}                             = require('helios-core/mojang')
const {
    RestResponseStatus,
    isDisplayableError,
    validateLocalFile
}                             = require('helios-core/common')
const {
    FullRepair,
    DistributionIndexProcessor,
    MojangIndexProcessor,
    downloadFile
}                             = require('helios-core/dl')
const {
    validateSelectedJvm,
    ensureJavaDirIsRoot,
    javaExecFromRoot,
    discoverBestJvmInstallation,
    latestOpenJDK,
    extractJdk
}                             = require('helios-core/java')

// Internal Requirements
const DiscordWrapper          = require('./assets/js/discordwrapper')
const ProcessBuilder          = require('./assets/js/processbuilder')

// Launch Elements
const launch_content          = document.getElementById('launch_content')
const launch_details          = document.getElementById('launch_details')
const launch_progress         = document.getElementById('launch_progress')
const launch_progress_label   = document.getElementById('launch_progress_label')
const launch_details_text     = document.getElementById('launch_details_text')
const server_selection_button = document.getElementById('server_selection_button')
const user_text               = document.getElementById('user_text')

const loggerLanding = LoggerUtil.getLogger('Landing')

/* =============================================================================
   GUIDE UI/UX — Barre de progression du lancement (landing.ejs #lower #right)
   =============================================================================
   Deux états visuels distincts dans landing.ejs :
   ┌─────────────────────────────────────────────────────────────────────────┐
   │  État normal (loading=false) : #launch_content  (display: inline-flex) │
   │    → Affiche : [PLAY button] | [divider] | [server selection button]   │
   │                                                                         │
   │  État lancement (loading=true) : #launch_details (display: flex)        │
   │    → Affiche : [X%] | [divider] | [progress bar] | [details text]      │
   └─────────────────────────────────────────────────────────────────────────┘
   Pour styler ces zones : sélecteurs dans launcher.css
     #launch_content, #launch_button, #server_selection_button
     #launch_details, #launch_progress, #launch_progress_label, #launch_details_text
   ============================================================================= */

/**
 * Bascule entre l'affichage du bouton PLAY et la barre de progression.
 *
 * GUIDE UI/UX — Appelé au début du lancement (loading=true) puis quand
 * le jeu est lancé ou en cas d'erreur (loading=false).
 * Les transitions sont instantanées (display). Pour ajouter un fade,
 * remplacer par $('#launch_details').fadeIn() etc.
 *
 * @param {boolean} loading True = montre la barre de progression, False = montre le bouton PLAY.
 */
function toggleLaunchArea(loading){
    if(loading){
        launch_details.style.display = 'flex'
        launch_details.style.setProperty('width', '100%', 'important')
        launch_details.style.setProperty('max-width', '100%', 'important')
        launch_content.style.display = 'none'
        setLaunchEnabled(false)
    } else {
        launch_details.style.display = 'none'
        launch_content.style.display = 'inline-flex'
        setLaunchEnabled(ConfigManager.getSelectedServer() != null)
    }
}

/**
 * Set the details text of the loading area.
 * 
 * @param {string} details The new text for the loading details.
 */
function setLaunchDetails(details){
    launch_details_text.innerHTML = details
}

/**
 * Set the value of the loading progress bar and display that value.
 * 
 * @param {number} percent Percentage (0-100)
 */
function setLaunchPercentage(percent){
    launch_progress.setAttribute('max', 100)
    launch_progress.setAttribute('value', percent)
    launch_progress_label.innerHTML = percent + '%'
}

/**
 * Set the value of the OS progress bar and display that on the UI.
 * 
 * @param {number} percent Percentage (0-100)
 */
function setDownloadPercentage(percent){
    remote.getCurrentWindow().setProgressBar(percent/100)
    setLaunchPercentage(percent)
}

/**
 * Enable or disable the launch button.
 * 
 * @param {boolean} val True to enable, false to disable.
 */
function setLaunchEnabled(val){
    document.getElementById('launch_button').disabled = !val
}

// =============================================================================
// GUIDE UI/UX — Bouton PLAY (#launch_button dans landing.ejs)
// =============================================================================
// Ce listener gère toute la logique de lancement :
//   1. Récupère le serveur sélectionné depuis DistroAPI
//   2. Vérifie/télécharge Java si besoin (asyncSystemScan)
//   3. Lance dlAsync() → valide et télécharge les mods
//   4. Lance ProcessBuilder.launch() → spawn du processus Java/Minecraft
//
// IMPORTANT : Ne PAS supprimer ou modifier la logique interne de ce listener.
// Pour des changements visuels (style du bouton, texte) :
//   → Modifier #launch_button dans landing.ejs et dl-theme.css
//   → Pour changer le texte "JOUER" : app/assets/lang/_custom.toml → [landing] launchButton
// =============================================================================
// Bind launch button
document.getElementById('launch_button').addEventListener('click', async e => {
    loggerLanding.info('Launching game..')
    try {
        const server = (await DistroAPI.getDistribution()).getServerById(ConfigManager.getSelectedServer())
        const jExe = ConfigManager.getJavaExecutable(ConfigManager.getSelectedServer())
        if(jExe == null){
            await asyncSystemScan(server.effectiveJavaOptions)
        } else {

            setLaunchDetails(Lang.queryJS('landing.launch.pleaseWait'))
            toggleLaunchArea(true)
            setLaunchPercentage(0, 100)

            const details = await validateSelectedJvm(ensureJavaDirIsRoot(jExe), server.effectiveJavaOptions.supported)
            if(details != null){
                loggerLanding.info('Jvm Details', details)
                await dlAsync()

            } else {
                await asyncSystemScan(server.effectiveJavaOptions)
            }
        }
    } catch(err) {
        loggerLanding.error('Unhandled error in during launch process.', err)
        showLaunchFailure(Lang.queryJS('landing.launch.failureTitle'), Lang.queryJS('landing.launch.failureText'))
    }
})

// GUIDE UI/UX — Bouton Settings (icône ⚙️ dans landing.ejs #internalMedia)
// Sélecteur CSS : #settingsMediaButton, #settingsSVG
// Pour changer l'icône : remplacer le SVG inline dans landing.ejs (lignes 22-26)
// Pour changer la position : modifier #internalMedia dans launcher.css / dl-theme.css
// Bind settings button
document.getElementById('settingsMediaButton').onclick = async e => {
    await prepareSettings()
    openSettingsModal()
}

// NOTE : URL non confirmée — à corriger si ce n'est pas la bonne.
document.getElementById('wikiButton').onclick = () => shell.openExternal('https://www.districtliferp.fr/wiki')

// Avatar overlay removed — no avatar display.

// GUIDE UI/UX — Affichage du compte sélectionné (landing.ejs #user_content)
// updateSelectedAccount() met à jour :
//   - #user_text    → nom d'utilisateur affiché (span dans landing.ejs)
//   - #avatarCanvas → rendu 3D du skin (skinview3d, 100% local)
// Pour modifier le style : surcharger #user_text et #avatarContainer dans dl-theme.css

// Rendu de skin 100% local via skinview3d (Three.js/WebGL, chargé en global via
// assets/js/libs/skinview3d.bundle.js, voir landing.ejs). La texture brute (PNG 64x64)
// est récupérée directement sur le site Azuriom du serveur, où les skins sont gérés
// in-game par les joueurs — plus aucune dépendance à un service de rendu tiers.
const DL_SKIN_API_BASE = 'https://www.districtliferp.fr/api/skin-api/skins/'
function dlSkinUrl(username){
    return `${DL_SKIN_API_BASE}${encodeURIComponent(username)}.png?t=${Date.now()}`
}

// Au tout premier lancement de la fenêtre, le service réseau d'Electron n'est parfois pas
// encore pleinement prêt : la toute première requête HTTPS émise par le renderer peut
// échouer alors que le reste de la session fonctionne normalement. On retente donc
// systématiquement quelques fois avant d'abandonner, plutôt que de considérer un premier
// échec comme définitif.
async function _retryAsync(fn, attempts = 3, delayMs = 900){
    let lastErr
    for(let i = 0; i < attempts; i++){
        try {
            return await fn()
        } catch(e) {
            lastErr = e
            if(i < attempts - 1) await new Promise(r => setTimeout(r, delayMs))
        }
    }
    throw lastErr
}

// Cache des <img> de texture déjà chargées (évite de re-télécharger la même skin
// plusieurs fois pour la carte statut + le podium lors d'un même rafraîchissement).
const _dlSkinImgCache = new Map()
function _loadSkinImage(username){
    if(_dlSkinImgCache.has(username)) return _dlSkinImgCache.get(username)
    const p = _retryAsync(() => new Promise((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('texture de skin introuvable'))
        img.src = dlSkinUrl(username)
    }))
    // Un échec (réseau transitoire, timing au démarrage...) ne doit pas rester en cache
    // indéfiniment : on retire l'entrée pour qu'un appel ultérieur retente un vrai fetch.
    p.catch(() => _dlSkinImgCache.delete(username))
    _dlSkinImgCache.set(username, p)
    return p
}

// Découpe locale (canvas 2D) de la tête de face d'une skin (région 8,8 → 16,16 sur la
// texture 64x64 standard) — utilisé pour les petites icônes (têtes empilées de la carte
// statut, podium des votants) où une instance skinview3d/WebGL par tête serait superflue.
// Si le joueur n'a pas de skin / le site est indisponible, bascule sur le sceau DistrictLife.
async function renderSkinFaceImg(imgEl, username){
    if(!imgEl) return
    try {
        const img = await _loadSkinImage(username)
        const size = 64
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(img, 8, 8, 8, 8, 0, 0, size, size)
        imgEl.src = canvas.toDataURL('image/png')
    } catch(e) {
        loggerLanding.debug(`Rendu local de la tête échoué pour "${username}": ${e.message}`)
        imgEl.src = 'assets/images/SealCircle.png'
    }
}

// Instance unique du SkinViewer 3D de la sidebar (#avatarCanvas) — créée une seule fois,
// puis réutilisée à chaque changement de compte via loadSkin().
let _dlSkinViewer = null
function _getDlSkinViewer(){
    const canvas = document.getElementById('avatarCanvas')
    if(!canvas) return null
    if(!_dlSkinViewer){
        _dlSkinViewer = new window.skinview3d.SkinViewer({
            canvas,
            width: 82,
            height: 91
        })
        _dlSkinViewer.autoRotate = false
        _dlSkinViewer.animation = null
        _dlSkinViewer.controls.enableZoom = false
        _dlSkinViewer.controls.enableRotate = false
        _dlSkinViewer.controls.enablePan = false
    }
    return _dlSkinViewer
}

// Ne garder que la tête affichée (reste du corps masqué) avec un cadrage en plan serré —
// appliqué après un loadSkin() réussi plutôt qu'à la construction du viewer : le faire
// avant le premier rendu complet du modèle laissait le canvas entièrement vide (bug
// constaté en test). Le mesh de la tête est centré à y=4 dans le repère du modèle
// (headMesh.position.y = 4), donc la caméra (qui regarde (0,0,0) par défaut) doit être
// recentrée sur ce point pour cadrer correctement.
function _applyHeadOnlyView(viewer){
    const skinParts = viewer.playerObject.skin
    skinParts.body.visible = false
    skinParts.rightArm.visible = false
    skinParts.leftArm.visible = false
    skinParts.rightLeg.visible = false
    skinParts.leftLeg.visible = false
    // Zoom modéré (la distance caméra est bornée à 10 minimum par skinview3d) : un zoom
    // trop fort combiné à l'angle trois-quarts coupait la tête sur les bords du cadre.
    viewer.zoom = 3.2

    // Vue plongeante trois-quarts : la cible reste le centre de la tête (0,4,0), mais la
    // caméra est placée au-dessus et de côté plutôt que pile en face (ce qui montrait le
    // dessous du menton). distance recalculée avec la même formule que skinview3d
    // (adjustCameraDistance) pour rester cohérente avec le zoom choisi ci-dessus.
    // La cible vise un peu plus haut que le centre géométrique réel de la tête (y=4) :
    // viser pile le centre laissait trop d'espace vide sous la tête dans le cadre (elle
    // paraissait "trop haute"). Viser au-dessus du centre la fait redescendre dans le cadre.
    const target = { x: 0, y: 11, z: 0 }
    let distance = 4.5 + 16.5 / Math.tan((viewer.fov / 180 * Math.PI) / 2) / viewer.zoom
    distance = Math.min(256, Math.max(10, distance))
    const elevation = 18 * Math.PI / 180  // caméra au-dessus du niveau de la tête
    const azimuth = 20 * Math.PI / 180    // décalage latéral léger : garde le visage visible
    const horizontal = distance * Math.cos(elevation)
    viewer.camera.position.set(
        target.x + horizontal * Math.sin(azimuth),
        target.y + distance * Math.sin(elevation),
        target.z + horizontal * Math.cos(azimuth)
    )
    viewer.controls.target.set(target.x, target.y, target.z)
    viewer.camera.lookAt(target.x, target.y, target.z)
    viewer.controls.update()

    // La scène est entièrement statique (pas d'animation, caméra fixe) : on fait un seul
    // rendu puis on coupe la boucle continue de skinview3d (requestAnimationFrame à ~60
    // FPS). Sans ça, ce rendu WebGL continu entre en concurrence avec l'animation CSS de
    // lévitation de la sidebar et la fait saccader.
    viewer.render()
    viewer.renderPaused = true
}

// Bind selected account
function updateSelectedAccount(authUser){
    let username = Lang.queryJS('landing.selectedAccount.noAccountSelected')
    if(authUser != null){
        if(authUser.displayName != null){
            username = authUser.displayName
        }
        const viewer = _getDlSkinViewer()
        if(viewer){
            _retryAsync(() => viewer.loadSkin(dlSkinUrl(username)))
                .then(() => _applyHeadOnlyView(viewer))
                .catch(e => {
                    loggerLanding.debug(`Rendu skin 3D échoué pour "${username}": ${e.message}`)
                })
        }
    }
    user_text.innerHTML = username
}
updateSelectedAccount(ConfigManager.getSelectedAccount())

// Bind selected server
function updateSelectedServer(serv){
    if(isSettingsModalOpen()){
        fullSettingsSave()
    }
    ConfigManager.setSelectedServer(serv != null ? serv.rawServer.id : null)
    ConfigManager.save()
    server_selection_button.innerHTML = '&#8226; ' + (serv != null ? serv.rawServer.name : Lang.queryJS('landing.noSelection'))
    if(isSettingsModalOpen()){
        refreshSettingsValues()
    }
    setLaunchEnabled(serv != null)
}
// Real text is set in uibinder.js on distributionIndexDone.
server_selection_button.innerHTML = '&#8226; ' + Lang.queryJS('landing.selectedServer.loading')
server_selection_button.onclick = async e => {
    e.target.blur()
    await toggleServerSelection(true)
}

// Update Mojang Status Color
const refreshMojangStatuses = async function(){
    loggerLanding.info('Refreshing Mojang Statuses..')

    let status = 'grey'
    let tooltipEssentialHTML = ''
    let tooltipNonEssentialHTML = ''

    const response = await MojangRestAPI.status()
    let statuses
    if(response.responseStatus === RestResponseStatus.SUCCESS) {
        statuses = response.data
    } else {
        loggerLanding.warn('Unable to refresh Mojang service status.')
        statuses = MojangRestAPI.getDefaultStatuses()
    }
    
    greenCount = 0
    greyCount = 0

    for(let i=0; i<statuses.length; i++){
        const service = statuses[i]

        const tooltipHTML = `<div class="mojangStatusContainer">
            <span class="mojangStatusIcon" style="color: ${MojangRestAPI.statusToHex(service.status)};">&#8226;</span>
            <span class="mojangStatusName">${service.name}</span>
        </div>`
        if(service.essential){
            tooltipEssentialHTML += tooltipHTML
        } else {
            tooltipNonEssentialHTML += tooltipHTML
        }

        if(service.status === 'yellow' && status !== 'red'){
            status = 'yellow'
        } else if(service.status === 'red'){
            status = 'red'
        } else {
            if(service.status === 'grey'){
                ++greyCount
            }
            ++greenCount
        }

    }

    if(greenCount === statuses.length){
        if(greyCount === statuses.length){
            status = 'grey'
        } else {
            status = 'green'
        }
    }
    
    document.getElementById('mojangStatusEssentialContainer').innerHTML = tooltipEssentialHTML
    document.getElementById('mojangStatusNonEssentialContainer').innerHTML = tooltipNonEssentialHTML
    document.getElementById('mojang_status_icon').style.color = MojangRestAPI.statusToHex(status)
}

// Avatar des joueurs en ligne dans la carte statut (héros) — têtes empilées,
// construites à partir de players.sample (fourni par le Server List Ping vanilla).
function renderStatusAvatars(sample){
    const el = document.getElementById('dl-bc-status-avatars')
    if(!el) return
    el.innerHTML = ''
    const shown = (sample || []).slice(0, 4)
    shown.forEach(p => {
        const img = document.createElement('img')
        img.className = 'dl-bc-avatar-head'
        img.alt = p.name
        el.appendChild(img)
        renderSkinFaceImg(img, p.name)
    })
    const remaining = (sample ? sample.length : 0) - shown.length
    if(remaining > 0){
        const more = document.createElement('div')
        more.className = 'dl-bc-avatar-more'
        more.textContent = '+' + remaining
        el.appendChild(more)
    }
}

// Statut serveur (carte héros du bento). Le Server List Ping de helios-core n'a pas de
// délai maximal sur la connexion TCP (un hôte injoignable bloque ~20 s côté Windows) :
// on borne à 6 s, puis on bascule en erreur avec un nouvel essai auto toutes les 30 s.
const SERVER_STATUS_TIMEOUT_MS = 6000
const SERVER_STATUS_RETRY_MS = 30000
let serverStatusRetryTimer = null

function withTimeout(promise, ms){
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Délai dépassé (${ms} ms)`)), ms))
    ])
}

const refreshServerStatus = async (fade = false) => {
    loggerLanding.info('Refreshing Server Status')
    const serv = (await DistroAPI.getDistribution()).getServerById(ConfigManager.getSelectedServer())

    let pLabel = Lang.queryJS('landing.serverStatus.server')
    let pVal = Lang.queryJS('landing.serverStatus.offline')

    const statusCard = document.getElementById('dl-bc-status')
    if(serverStatusRetryTimer){
        clearTimeout(serverStatusRetryTimer)
        serverStatusRetryTimer = null
    }
    // Premier chargement (ou réessai manuel depuis l'état erreur) : squelettes
    if(statusCard && statusCard.getAttribute('data-state') !== 'ok') statusCard.setAttribute('data-state', 'loading')

    try {

        const pingStart = Date.now()
        const servStat = await withTimeout(getServerStatus(47, serv.hostname, serv.port), SERVER_STATUS_TIMEOUT_MS)
        const pingMs = Date.now() - pingStart
        pLabel = Lang.queryJS('landing.serverStatus.players')
        pVal = servStat.players.online + '/' + servStat.players.max

        if(statusCard){
            statusCard.setAttribute('data-state', 'ok')
            const sub = document.querySelector('#dl-bc-status-ok .dl-bc-status-sub')
            if(sub) sub.textContent = `${serv.rawServer.name} · Forge ${serv.rawServer.minecraftVersion}`.toUpperCase()
            document.getElementById('dl-bc-players').textContent = servStat.players.online
            document.getElementById('dl-bc-players-max').textContent = servStat.players.max
            document.getElementById('dl-bc-status-ping').innerHTML = `${pingMs} <small>ms</small>`
            const fillPct = servStat.players.max > 0 ? Math.min(100, (servStat.players.online / servStat.players.max) * 100) : 0
            document.getElementById('dl-bc-status-fill-bar').style.width = fillPct + '%'
            renderStatusAvatars(servStat.players.sample)
            // Message du serveur (MOTD, description.text du ping SLP) à la place
            // d'UPTIME / DERNIER REDÉM. (aucune source) et de VERSION / MODS CHARGÉS
            // (redondant pour le joueur, déjà visible/géré dans le launcher) — le MOTD
            // est le seul champ restant à la fois disponible gratuitement et réellement
            // utile (message promo/annonce que l'admin peut changer côté serveur).
            const motdEl = document.getElementById('dl-bc-status-motd')
            if(motdEl) motdEl.textContent = servStat.description?.text?.trim() || '—'
        }

    } catch (err) {
        loggerLanding.warn(`Unable to refresh server status (${serv.hostname}:${serv.port}), assuming offline.`)
        loggerLanding.debug(err)
        if(statusCard){
            statusCard.setAttribute('data-state', 'error')
            const desc = document.getElementById('dl-bc-status-error-desc')
            if(desc) desc.textContent = `${serv.hostname}:${serv.port} ne répond pas (maintenance ou connexion interrompue). Nouvel essai automatique toutes les 30 s — ton installation reste prête.`
        }
        serverStatusRetryTimer = setTimeout(() => refreshServerStatus(false), SERVER_STATUS_RETRY_MS)
    }
    const updateBentoPlayers = () => {
        const el = document.getElementById('dl-bc-players')
        if(el && statusCard && statusCard.getAttribute('data-state') !== 'ok') el.textContent = '–'
    }
    if(fade){
        $('#server_status_wrapper').fadeOut(250, () => {
            document.getElementById('landingPlayerLabel').innerHTML = pLabel
            document.getElementById('player_count').innerHTML = pVal
            updateBentoPlayers()
            $('#server_status_wrapper').fadeIn(500)
        })
    } else {
        document.getElementById('landingPlayerLabel').innerHTML = pLabel
        document.getElementById('player_count').innerHTML = pVal
        updateBentoPlayers()
    }

}

document.getElementById('dl-bc-status-retry').onclick = () => refreshServerStatus(true)
document.getElementById('dl-bc-status-discord-link').onclick = () => {
    const discordUrl = window._dlLinks?.discord || document.getElementById('discordURL')?.href || 'https://discord.gg/7DR8YERnvz'
    shell.openExternal(discordUrl)
}

refreshMojangStatuses()
// Server Status is refreshed in uibinder.js on distributionIndexDone.

// Refresh statuses every hour. The status page itself refreshes every day so...
let mojangStatusListener = setInterval(() => refreshMojangStatuses(true), 60*60*1000)
// Set refresh rate to once every 5 minutes.
let serverStatusListener = setInterval(() => refreshServerStatus(true), 300000)

/**
 * Shows an error overlay, toggles off the launch area.
 * 
 * @param {string} title The overlay title.
 * @param {string} desc The overlay description.
 */
function showLaunchFailure(title, desc){
    setOverlayContent(
        title,
        desc,
        Lang.queryJS('landing.launch.okay')
    )
    setOverlayHandler(null)
    toggleOverlay(true)
    toggleLaunchArea(false)
}

/* System (Java) Scan */

/**
 * Asynchronously scan the system for valid Java installations.
 * 
 * @param {boolean} launchAfter Whether we should begin to launch after scanning. 
 */
async function asyncSystemScan(effectiveJavaOptions, launchAfter = true){

    setLaunchDetails(Lang.queryJS('landing.systemScan.checking'))
    toggleLaunchArea(true)
    setLaunchPercentage(0, 100)

    const jvmDetails = await discoverBestJvmInstallation(
        ConfigManager.getDataDirectory(),
        effectiveJavaOptions.supported
    )

    if(jvmDetails == null) {
        // If the result is null, no valid Java installation was found.
        // Show this information to the user.
        setOverlayContent(
            Lang.queryJS('landing.systemScan.noCompatibleJava'),
            Lang.queryJS('landing.systemScan.installJavaMessage', { 'major': effectiveJavaOptions.suggestedMajor }),
            Lang.queryJS('landing.systemScan.installJava'),
            Lang.queryJS('landing.systemScan.installJavaManually')
        )
        setOverlayHandler(() => {
            setLaunchDetails(Lang.queryJS('landing.systemScan.javaDownloadPrepare'))
            toggleOverlay(false)
            
            try {
                downloadJava(effectiveJavaOptions, launchAfter)
            } catch(err) {
                loggerLanding.error('Unhandled error in Java Download', err)
                showLaunchFailure(Lang.queryJS('landing.systemScan.javaDownloadFailureTitle'), Lang.queryJS('landing.systemScan.javaDownloadFailureText'))
            }
        })
        setDismissHandler(() => {
            $('#overlayContent').fadeOut(250, () => {
                //$('#overlayDismiss').toggle(false)
                setOverlayContent(
                    Lang.queryJS('landing.systemScan.javaRequired', { 'major': effectiveJavaOptions.suggestedMajor }),
                    Lang.queryJS('landing.systemScan.javaRequiredMessage', { 'major': effectiveJavaOptions.suggestedMajor }),
                    Lang.queryJS('landing.systemScan.javaRequiredDismiss'),
                    Lang.queryJS('landing.systemScan.javaRequiredCancel')
                )
                setOverlayHandler(() => {
                    toggleLaunchArea(false)
                    toggleOverlay(false)
                })
                setDismissHandler(() => {
                    toggleOverlay(false, true)

                    asyncSystemScan(effectiveJavaOptions, launchAfter)
                })
                $('#overlayContent').fadeIn(250)
            })
        })
        toggleOverlay(true, true)
    } else {
        // Java installation found, use this to launch the game.
        const javaExec = javaExecFromRoot(jvmDetails.path)
        ConfigManager.setJavaExecutable(ConfigManager.getSelectedServer(), javaExec)
        ConfigManager.save()

        // We need to make sure that the updated value is on the settings UI.
        // Just incase the settings UI is already open.
        settingsJavaExecVal.value = javaExec
        await populateJavaExecDetails(settingsJavaExecVal.value)

        // TODO Callback hell, refactor
        // TODO Move this out, separate concerns.
        if(launchAfter){
            await dlAsync()
        }
    }

}

async function downloadJava(effectiveJavaOptions, launchAfter = true) {

    // TODO Error handling.
    // asset can be null.
    const asset = await latestOpenJDK(
        effectiveJavaOptions.suggestedMajor,
        ConfigManager.getDataDirectory(),
        effectiveJavaOptions.distribution)

    if(asset == null) {
        throw new Error(Lang.queryJS('landing.downloadJava.findJdkFailure'))
    }

    let received = 0
    await downloadFile(asset.url, asset.path, ({ transferred }) => {
        received = transferred
        setDownloadPercentage(Math.trunc((transferred/asset.size)*100))
    })
    setDownloadPercentage(100)

    if(received != asset.size) {
        loggerLanding.warn(`Java Download: Expected ${asset.size} bytes but received ${received}`)
        if(!await validateLocalFile(asset.path, asset.algo, asset.hash)) {
            log.error(`Hashes do not match, ${asset.id} may be corrupted.`)
            // Don't know how this could happen, but report it.
            throw new Error(Lang.queryJS('landing.downloadJava.javaDownloadCorruptedError'))
        }
    }

    // Extract
    // Show installing progress bar.
    remote.getCurrentWindow().setProgressBar(2)

    // Wait for extration to complete.
    const eLStr = Lang.queryJS('landing.downloadJava.extractingJava')
    let dotStr = ''
    setLaunchDetails(eLStr)
    const extractListener = setInterval(() => {
        if(dotStr.length >= 3){
            dotStr = ''
        } else {
            dotStr += '.'
        }
        setLaunchDetails(eLStr + dotStr)
    }, 750)

    const newJavaExec = await extractJdk(asset.path)

    // Extraction complete, remove the loading from the OS progress bar.
    remote.getCurrentWindow().setProgressBar(-1)

    // Extraction completed successfully.
    ConfigManager.setJavaExecutable(ConfigManager.getSelectedServer(), newJavaExec)
    ConfigManager.save()

    clearInterval(extractListener)
    setLaunchDetails(Lang.queryJS('landing.downloadJava.javaInstalled'))

    // TODO Callback hell
    // Refactor the launch functions
    asyncSystemScan(effectiveJavaOptions, launchAfter)

}

// Keep reference to Minecraft Process
let proc
// Is DiscordRPC enabled
let hasRPC = false
// Joined server regex
// Change this if your server uses something different.
const GAME_JOINED_REGEX = /\[.+\]: Sound engine started/
const GAME_LAUNCH_REGEX = /^\[.+\]: (?:MinecraftForge .+ Initialized|ModLauncher .+ starting: .+|Loading Minecraft .+ with Fabric Loader .+)$/
const MIN_LINGER = 5000

const loggerForgeLibs = LoggerUtil.getLogger('ForgeLibraries')

/**
 * Download Forge runtime libraries listed in the version manifest (non-empty URLs),
 * then extract ALL maven-bundled JARs from the Forge installer (slim JAR, universal
 * JAR, and any other embedded artifacts). Must run after the main validation/download
 * cycle but before ProcessBuilder.
 */
async function ensureForgeLibraries(commonDir, serv, modManifest) {
    if (!modManifest || !modManifest.libraries) return

    const libDir = path.join(commonDir, 'libraries')
    const forgeModule = serv.modules.find(m => m.rawModule.type === 'ForgeHosted')
    const installerPath = forgeModule ? forgeModule.getPath() : null

    // Step 1 — download libraries from Maven URLs listed in the version manifest
    for (const lib of modManifest.libraries) {
        const artifact = lib.downloads && lib.downloads.artifact
        if (!artifact || !artifact.path || !artifact.url) continue

        const localPath = path.join(libDir, artifact.path)
        try {
            const stats = await fsExtra.stat(localPath)
            if (!artifact.size || stats.size === artifact.size) continue
            await fsExtra.remove(localPath)
        } catch (_e) { /* file absent — will be downloaded */ }

        loggerForgeLibs.info(`Downloading Forge library: ${lib.name}`)
        await downloadFile(artifact.url, localPath)
    }

    // Step 2 — extract ALL JARs bundled inside the Forge installer's maven/ directory.
    // This covers the slim JAR (forge-X.jar) and the universal JAR (forge-X-universal.jar),
    // neither of which is downloadable directly from Maven.
    if (installerPath && await fsExtra.pathExists(installerPath)) {
        const zip = new StreamZip.async({ file: installerPath })
        try {
            const entries = await zip.entries()
            for (const entryName of Object.keys(entries)) {
                if (!entryName.startsWith('maven/') || entryName.endsWith('/')) continue
                const relativePath = entryName.slice('maven/'.length)
                const localPath = path.join(libDir, relativePath)
                if (await fsExtra.pathExists(localPath)) continue
                const data = await zip.entryData(entryName)
                await fsExtra.ensureDir(path.dirname(localPath))
                await fsExtra.writeFile(localPath, data)
                loggerForgeLibs.info(`Extracted from installer: ${relativePath}`)
            }
        } finally {
            await zip.close()
        }

        // Step 3 — run the Forge installer to patch the Minecraft client and produce
        // forge-X-client.jar (binary-patched Minecraft). This file is not bundled in the
        // installer ZIP and cannot be downloaded; it must be generated at runtime.
        const mcVersion = modManifest.inheritsFrom || modManifest.id.split('-')[0]
        const forgeVersion = modManifest.id  // e.g. "1.16.5-forge-36.2.39"
        const clientJar = path.join(libDir,
            `net/minecraftforge/forge/${forgeVersion.replace('-forge-', '-')}/forge-${forgeVersion.replace('-forge-', '-')}-client.jar`)
        if (!await fsExtra.pathExists(clientJar)) {
            loggerForgeLibs.info('Generating Forge client JAR by running installer…')
            const { execFile } = require('child_process')
            const javaExec = ConfigManager.getJavaExecutable(serv.rawServer.id) || 'java'
            // Create a minimal launcher_profiles.json so the installer accepts the target dir
            const profilesFile = path.join(commonDir, 'launcher_profiles.json')
            if (!await fsExtra.pathExists(profilesFile)) {
                await fsExtra.writeJson(profilesFile, { profiles: {} })
            }
            await new Promise((resolve, reject) => {
                execFile(javaExec, [
                    '-Djava.awt.headless=true',
                    '-jar', installerPath,
                    '--installClient', commonDir
                ], { cwd: commonDir }, (err, stdout, stderr) => {
                    if (err) {
                        loggerForgeLibs.error('Forge installer failed:', stderr || err.message)
                        reject(err)
                    } else {
                        loggerForgeLibs.info('Forge installer completed successfully.')
                        resolve()
                    }
                })
            })
        }
    }
}

const AUTHLIB_INJECTOR_VERSION = '1.2.5'
const AUTHLIB_INJECTOR_URL = `https://github.com/yushijinhun/authlib-injector/releases/download/v${AUTHLIB_INJECTOR_VERSION}/authlib-injector-${AUTHLIB_INJECTOR_VERSION}.jar`

async function ensureAuthlibInjector(commonDir) {
    const injectorPath = path.join(commonDir, 'authlib-injector', `authlib-injector-${AUTHLIB_INJECTOR_VERSION}.jar`)
    if (!await fsExtra.pathExists(injectorPath)) {
        loggerForgeLibs.info('Downloading authlib-injector…')
        await fsExtra.ensureDir(path.dirname(injectorPath))
        await downloadFile(AUTHLIB_INJECTOR_URL, injectorPath)
        loggerForgeLibs.info('authlib-injector downloaded.')
    }
    return injectorPath
}

// Local Yggdrasil server — handles authlib-injector requests so multiplayer is enabled
// without requiring a remote AzAuth/authlib-injector compatible server.
let _yggServer = null

async function startYggdrasilServer(authUser) {
    const http = require('http')
    const uuidNoDash = authUser.uuid.replace(/-/g, '')
    const username = authUser.displayName

    const metadata = JSON.stringify({
        meta: {
            serverName: 'DistrictLife',
            implementationName: 'DistrictLife-Launcher',
            implementationVersion: '1.0.0',
            'feature.non_email_login': false
        },
        skinDomains: []
    })

    const profile = JSON.stringify({ id: uuidNoDash, name: username, properties: [] })

    const server = http.createServer((req, res) => {
        const url = req.url.split('?')[0]
        res.setHeader('Content-Type', 'application/json')
        if (req.method === 'GET' && url === '/') {
            res.writeHead(200); res.end(metadata)
        } else if (req.method === 'GET' && url === '/minecraft/profile') {
            res.writeHead(200); res.end(profile)
        } else if (req.method === 'POST' && url === '/sessionserver/session/minecraft/join') {
            res.writeHead(204); res.end()
        } else if (req.method === 'GET' && url.startsWith('/sessionserver/session/minecraft/hasJoined')) {
            res.writeHead(200); res.end(profile)
        } else if (req.method === 'GET' && url.startsWith('/sessionserver/session/minecraft/profile/')) {
            res.writeHead(200); res.end(profile)
        } else {
            res.writeHead(204); res.end()
        }
    })

    return new Promise((resolve, reject) => {
        server.listen(0, '127.0.0.1', () => {
            _yggServer = server
            const port = server.address().port
            loggerForgeLibs.info(`Local Yggdrasil server listening on port ${port}`)
            resolve(port)
        })
        server.on('error', reject)
    })
}

function stopYggdrasilServer() {
    if (_yggServer) { _yggServer.close(); _yggServer = null }
}

async function dlAsync(login = true) {

    // Login parameter is temporary for debug purposes. Allows testing the validation/downloads without
    // launching the game.

    const loggerLaunchSuite = LoggerUtil.getLogger('LaunchSuite')

    setLaunchDetails(Lang.queryJS('landing.dlAsync.loadingServerInfo'))

    let distro

    try {
        distro = await DistroAPI.refreshDistributionOrFallback()
        onDistroRefresh(distro)
    } catch(err) {
        loggerLaunchSuite.error('Unable to refresh distribution index.', err)
        showLaunchFailure(Lang.queryJS('landing.dlAsync.fatalError'), Lang.queryJS('landing.dlAsync.unableToLoadDistributionIndex'))
        return
    }

    const serv = distro.getServerById(ConfigManager.getSelectedServer())

    if(login) {
        if(ConfigManager.getSelectedAccount() == null){
            loggerLanding.error('You must be logged into an account.')
            return
        }
    }

    setLaunchDetails(Lang.queryJS('landing.dlAsync.pleaseWait'))
    toggleLaunchArea(true)
    setLaunchPercentage(0, 100)

    const fullRepairModule = new FullRepair(
        ConfigManager.getCommonDirectory(),
        ConfigManager.getInstanceDirectory(),
        ConfigManager.getLauncherDirectory(),
        ConfigManager.getSelectedServer(),
        DistroAPI.isDevMode()
    )

    fullRepairModule.spawnReceiver()

    fullRepairModule.childProcess.on('error', (err) => {
        loggerLaunchSuite.error('Error during launch', err)
        showLaunchFailure(Lang.queryJS('landing.dlAsync.errorDuringLaunchTitle'), err.message || Lang.queryJS('landing.dlAsync.errorDuringLaunchText'))
    })
    fullRepairModule.childProcess.on('close', (code, _signal) => {
        if(code !== 0){
            loggerLaunchSuite.error(`Full Repair Module exited with code ${code}, assuming error.`)
            showLaunchFailure(Lang.queryJS('landing.dlAsync.errorDuringLaunchTitle'), Lang.queryJS('landing.dlAsync.seeConsoleForDetails'))
        }
    })

    loggerLaunchSuite.info('Validating files.')
    setLaunchDetails(Lang.queryJS('landing.dlAsync.validatingFileIntegrity'))
    let invalidFileCount = 0
    try {
        invalidFileCount = await fullRepairModule.verifyFiles(percent => {
            setLaunchPercentage(percent)
        })
        setLaunchPercentage(100)
    } catch (err) {
        loggerLaunchSuite.error('Error during file validation.')
        showLaunchFailure(Lang.queryJS('landing.dlAsync.errorDuringFileVerificationTitle'), err.displayable || Lang.queryJS('landing.dlAsync.seeConsoleForDetails'))
        return
    }
    

    if(invalidFileCount > 0) {
        loggerLaunchSuite.info('Downloading files.')
        setLaunchDetails(Lang.queryJS('landing.dlAsync.downloadingFiles'))
        setLaunchPercentage(0)
        try {
            await fullRepairModule.download(percent => {
                setDownloadPercentage(percent)
            })
            setDownloadPercentage(100)
        } catch(err) {
            loggerLaunchSuite.error('Error during file download.')
            showLaunchFailure(Lang.queryJS('landing.dlAsync.errorDuringFileDownloadTitle'), err.displayable || Lang.queryJS('landing.dlAsync.seeConsoleForDetails'))
            return
        }
    } else {
        loggerLaunchSuite.info('No invalid files, skipping download.')
    }

    // Remove download bar.
    remote.getCurrentWindow().setProgressBar(-1)

    fullRepairModule.destroyReceiver()

    // Supprime les mods présents sur le disque qui ne sont plus dans le distribution.json
    const modsDir = path.join(ConfigManager.getInstanceDirectory(), ConfigManager.getSelectedServer(), 'mods')
    if(await fsExtra.pathExists(modsDir)) {
        const expectedMods = new Set(
            serv.modules
                .filter(m => m.rawModule.type === 'File' && m.rawModule.artifact.path?.startsWith('mods/'))
                .map(m => path.basename(m.rawModule.artifact.path))
        )
        const presentFiles = await fsExtra.readdir(modsDir)
        for(const file of presentFiles) {
            if(file.endsWith('.jar') && !expectedMods.has(file)) {
                loggerLaunchSuite.info(`Suppression mod obsolète : ${file}`)
                await fsExtra.remove(path.join(modsDir, file))
            }
        }
    }

    setLaunchDetails(Lang.queryJS('landing.dlAsync.preparingToLaunch'))

    const mojangIndexProcessor = new MojangIndexProcessor(
        ConfigManager.getCommonDirectory(),
        serv.rawServer.minecraftVersion)
    const distributionIndexProcessor = new DistributionIndexProcessor(
        ConfigManager.getCommonDirectory(),
        distro,
        serv.rawServer.id
    )

    const modLoaderData = await distributionIndexProcessor.loadModLoaderVersionJson(serv)
    const versionData = await mojangIndexProcessor.getVersionJson()

    // Download / extract Forge runtime libraries (modlauncher, asm, fmlloader, etc.)
    await ensureForgeLibraries(ConfigManager.getCommonDirectory(), serv, modLoaderData)

    // Download authlib-injector for Azuriom session authentication (multiplayer)
    await ensureAuthlibInjector(ConfigManager.getCommonDirectory())

    if(login) {
        const authUser = ConfigManager.getSelectedAccount()
        loggerLaunchSuite.info(`Sending selected account (${authUser.displayName}) to ProcessBuilder.`)
        const yggPort = await startYggdrasilServer(authUser)
        let pb = new ProcessBuilder(serv, versionData, modLoaderData, authUser, remote.app.getVersion(), yggPort)
        setLaunchDetails(Lang.queryJS('landing.dlAsync.launchingGame'))

        // const SERVER_JOINED_REGEX = /\[.+\]: \[CHAT\] [a-zA-Z0-9_]{1,16} joined the game/
        const SERVER_JOINED_REGEX = new RegExp(`\\[.+\\]: \\[CHAT\\] ${authUser.displayName} joined the game`)

        const onLoadComplete = () => {
            toggleLaunchArea(false)
            if(proc == null) return
            if(hasRPC){
                DiscordWrapper.updateDetails(Lang.queryJS('landing.discord.loading'))
                proc.stdout.on('data', gameStateChange)
            }
            proc.stdout.removeListener('data', tempListener)
            proc.stderr.removeListener('data', gameErrorListener)
            // Masque le launcher une fois le jeu lancé
            remote.getCurrentWindow().hide()
        }
        const start = Date.now()

        // Attach a temporary listener to the client output.
        // Will wait for a certain bit of text meaning that
        // the client application has started, and we can hide
        // the progress bar stuff.
        const tempListener = function(data){
            if(GAME_LAUNCH_REGEX.test(data.trim())){
                const diff = Date.now()-start
                if(diff < MIN_LINGER) {
                    setTimeout(onLoadComplete, MIN_LINGER-diff)
                } else {
                    onLoadComplete()
                }
            }
        }

        // Listener for Discord RPC.
        const gameStateChange = function(data){
            data = data.trim()
            if(SERVER_JOINED_REGEX.test(data)){
                DiscordWrapper.updateDetails(Lang.queryJS('landing.discord.joined'))
            } else if(GAME_JOINED_REGEX.test(data)){
                DiscordWrapper.updateDetails(Lang.queryJS('landing.discord.joining'))
            }
        }

        const gameErrorListener = function(data){
            data = data.trim()
            if(data.indexOf('Could not find or load main class net.minecraft.launchwrapper.Launch') > -1){
                loggerLaunchSuite.error('Game launch failed, LaunchWrapper was not downloaded properly.')
                showLaunchFailure(Lang.queryJS('landing.dlAsync.errorDuringLaunchTitle'), Lang.queryJS('landing.dlAsync.launchWrapperNotDownloaded'))
            }
        }

        try {
            // Build Minecraft process.
            proc = pb.build()

            // Bind listeners to stdout.
            proc.stdout.on('data', tempListener)
            proc.stderr.on('data', gameErrorListener)

            setLaunchDetails(Lang.queryJS('landing.dlAsync.doneEnjoyServer'))

            // Réaffiche le launcher quand le jeu se ferme
            proc.on('close', (code, signal) => {
                loggerLaunchSuite.info('Game closed, showing launcher.')
                proc = null
                stopYggdrasilServer()
                const win = remote.getCurrentWindow()
                win.show()
                win.focus()
                toggleLaunchArea(false)
            })

            // Init Discord Hook
            if(distro.rawDistribution.discord != null && serv.rawServer.discord != null){
                DiscordWrapper.initRPC(distro.rawDistribution.discord, serv.rawServer.discord)
                hasRPC = true
                proc.on('close', (code, signal) => {
                    loggerLaunchSuite.info('Shutting down Discord Rich Presence..')
                    DiscordWrapper.shutdownRPC()
                    hasRPC = false
                })
            }

        } catch(err) {

            loggerLaunchSuite.error('Error during launch', err)
            showLaunchFailure(Lang.queryJS('landing.dlAsync.errorDuringLaunchTitle'), Lang.queryJS('landing.dlAsync.checkConsoleForDetails'))

        }
    }

}

/**
 * News Loading Functions
 */

// DOM Cache
const newsContent                   = document.getElementById('newsContent')
const newsArticleTitle              = document.getElementById('newsArticleTitle')
const newsArticleDate               = document.getElementById('newsArticleDate')
const newsArticleAuthor             = document.getElementById('newsArticleAuthor')
const newsArticleComments           = document.getElementById('newsArticleComments')
const newsNavigationStatus          = document.getElementById('newsNavigationStatus')
const newsArticleContentScrollable  = document.getElementById('newsArticleContentScrollable')
const nELoadSpan                    = document.getElementById('nELoadSpan')

// News slide caches.
let newsActive = false
let newsGlideCount = 0

/**
 * Show the news UI via a slide animation.
 * 
 * @param {boolean} up True to slide up, otherwise false. 
 */
function slide_(up){
    const lCUpper = document.querySelector('#landingContainer > #upper')
    const lCLLeft = document.querySelector('#landingContainer > #lower > #left')
    const lCLCenter = document.querySelector('#landingContainer > #lower > #center')
    const lCLRight = document.querySelector('#landingContainer > #lower > #right')
    const newsBtn = document.querySelector('#landingContainer > #lower > #center #content')
    const landingContainer = document.getElementById('landingContainer')
    const newsContainer = document.querySelector('#landingContainer > #newsContainer')

    newsGlideCount++

    if(up){
        lCUpper.style.top = '-200vh'
        lCLLeft.style.top = '-200vh'
        lCLCenter.style.top = '-200vh'
        lCLRight.style.top = '-200vh'
        newsBtn.style.top = '130vh'
        newsContainer.style.top = '0px'
        //date.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric'})
        //landingContainer.style.background = 'rgba(29, 29, 29, 0.55)'
        landingContainer.style.background = 'rgba(0, 0, 0, 0.50)'
        setTimeout(() => {
            if(newsGlideCount === 1){
                lCLCenter.style.transition = 'none'
                newsBtn.style.transition = 'none'
            }
            newsGlideCount--
        }, 2000)
    } else {
        setTimeout(() => {
            newsGlideCount--
        }, 2000)
        landingContainer.style.background = null
        lCLCenter.style.transition = null
        newsBtn.style.transition = null
        newsContainer.style.top = '100%'
        lCUpper.style.top = '0px'
        lCLLeft.style.top = '0px'
        lCLCenter.style.top = '0px'
        lCLRight.style.top = '0px'
        newsBtn.style.top = '10px'
    }
}

// Bind news button.
document.getElementById('newsButton').onclick = () => {
    // Toggle tabbing.
    if(newsActive){
        $('#landingContainer *').removeAttr('tabindex')
        $('#newsContainer *').attr('tabindex', '-1')
    } else {
        $('#landingContainer *').attr('tabindex', '-1')
        $('#newsContainer, #newsContainer *, #lower, #lower #center *').removeAttr('tabindex')
        if(newsAlertShown){
            $('#newsButtonAlert').fadeOut(2000)
            newsAlertShown = false
            ConfigManager.setNewsCacheDismissed(true)
            ConfigManager.save()
        }
    }
    slide_(!newsActive)
    newsActive = !newsActive
}

// Array to store article meta.
let newsArr = null

// News load animation listener.
let newsLoadingListener = null

/**
 * Set the news loading animation.
 * 
 * @param {boolean} val True to set loading animation, otherwise false.
 */
function setNewsLoading(val){
    if(val){
        const nLStr = Lang.queryJS('landing.news.checking')
        let dotStr = '..'
        nELoadSpan.innerHTML = nLStr + dotStr
        newsLoadingListener = setInterval(() => {
            if(dotStr.length >= 3){
                dotStr = ''
            } else {
                dotStr += '.'
            }
            nELoadSpan.innerHTML = nLStr + dotStr
        }, 750)
    } else {
        if(newsLoadingListener != null){
            clearInterval(newsLoadingListener)
            newsLoadingListener = null
        }
    }
}

// ──────────── PATCH NOTES ────────────
function renderPatchNotes(data) {
    const el = document.getElementById('dl-bc-patch-content')
    if (!el) return
    if (!data || !data.version) {
        el.innerHTML = '<span class="dl-bc-patch-empty">Aucune mise à jour</span>'
        return
    }
    const TAG_LABELS = { new: 'Nouveau', fix: 'Correctif', balance: 'Équilibre', remove: 'Retiré' }
    const items = (data.changes || []).map(c => {
        const type = c.type || 'fix'
        const label = TAG_LABELS[type] || type
        return `<li class="dl-bc-patch-item">
            <span class="dl-bc-patch-tag dl-bc-patch-tag-${_escHtml(type)}">${_escHtml(label)}</span>
            <span>${_escHtml(c.text)}</span>
        </li>`
    }).join('')
    el.innerHTML = `
        <div class="dl-bc-patch-header">
            <span class="dl-bc-patch-version">v${_escHtml(data.version)}</span>
            <span class="dl-bc-patch-date">${_escHtml(data.date || '')}</span>
        </div>
        <ul class="dl-bc-patch-list">${items || '<li class="dl-bc-patch-item" style="justify-content:center;color:rgba(255,255,255,0.3)">—</li>'}</ul>`
}

async function initPatchNotes() {
    try {
        const resp = await fetch('https://distribution.districtliferp.fr/patch.json')
        if (!resp.ok) throw new Error('HTTP ' + resp.status)
        renderPatchNotes(await resp.json())
    } catch (e) {
        const el = document.getElementById('dl-bc-patch-content')
        if (el) el.innerHTML = '<span class="dl-bc-patch-empty">Indisponible</span>'
    }
}

// ─────────────────────────────────────────────────────────
//  PROCHAIN ÉVÉNEMENT — fichier JSON dédié, même principe que
//  patch.json (voir initPatchNotes ci-dessus). Schéma attendu :
//  [{ "title": "...", "date": "2026-10-15T20:30:00", "location": "...",
//     "description": "...", "signupUrl": "https://..." }, ...]
//  (un tableau, pas un objet seul — permet d'en préparer plusieurs à
//  l'avance ; le launcher prend automatiquement le plus proche dans le futur)
// ─────────────────────────────────────────────────────────
let nextEventTimer = null
let nextEventData  = null

function renderEventCountdown(){
    const el = document.getElementById('dl-bc-event-countdown')
    if(!el || !nextEventData) return
    const diffMs = new Date(nextEventData.date).getTime() - Date.now()
    if(diffMs <= 0){
        // L'événement est passé / en cours — on retombe sur l'état vide au prochain fetch.
        clearInterval(nextEventTimer)
        initNextEvent()
        return
    }
    const totalMin = Math.floor(diffMs / 60000)
    const days  = Math.floor(totalMin / 1440)
    const hours = Math.floor((totalMin % 1440) / 60)
    const mins  = totalMin % 60
    el.innerHTML = `
        <span>${days}<small> j</small></span>
        <span>${String(hours).padStart(2, '0')}<small> h</small></span>
        <span>${String(mins).padStart(2, '0')}<small> min</small></span>`
}

function renderNextEvent(evt){
    const card = document.getElementById('dl-bc-event')
    if(!card) return
    clearInterval(nextEventTimer)

    if(!evt){
        nextEventData = null
        card.setAttribute('data-state', 'empty')
        return
    }

    nextEventData = evt
    card.setAttribute('data-state', 'ok')

    const title = document.getElementById('dl-bc-event-title')
    const meta  = document.getElementById('dl-bc-event-meta')
    const cta   = document.getElementById('dl-bc-event-cta')
    if(title) title.textContent = evt.title || ''

    const dateObj = new Date(evt.date)
    // toLocaleString (pas toLocaleDateString) : nécessaire pour que les options heure/minute
    // soient prises en compte de façon fiable avec les options de date combinées.
    const dateStr = dateObj.toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    if(meta) meta.textContent = [dateStr, evt.location].filter(Boolean).join(' · ')

    if(cta){
        cta.textContent = evt.signupUrl ? "S'inscrire →" : 'Détails →'
        cta.onclick = (e) => {
            e.stopPropagation()
            if(evt.signupUrl) shell.openExternal(evt.signupUrl)
        }
    }
    card.onclick = () => { if(evt.signupUrl) shell.openExternal(evt.signupUrl) }

    renderEventCountdown()
    nextEventTimer = setInterval(renderEventCountdown, 60000)
}

async function initNextEvent(){
    try {
        const resp = await fetch('https://distribution.districtliferp.fr/events.json')
        if(!resp.ok) throw new Error('HTTP ' + resp.status)
        const events = await resp.json()
        const now = Date.now()
        const upcoming = (Array.isArray(events) ? events : [])
            .filter(e => e && e.date && new Date(e.date).getTime() > now)
            .sort((a, b) => new Date(a.date) - new Date(b.date))
        renderNextEvent(upcoming[0] || null)
    } catch (e) {
        loggerLanding.debug('Unable to load events.json, showing empty state.', e)
        renderNextEvent(null)
    }
}

// Bento link cells — open URLs in system browser
;(function bindBentoCells() {
    const discordEl   = document.getElementById('dl-bc-discord')
    const voteEl      = document.getElementById('dl-bc-vote')
    const storeEl     = document.getElementById('dl-bc-store')
    const reglementEl = document.getElementById('dl-bc-reglement')
    const discordUrl = document.getElementById('discordURL')?.href || 'https://discord.gg/7DR8YERnvz'
    // Repli synchrone immédiat (avant que link.json n'ait eu le temps de répondre) —
    // initLinks() ci-dessous réassigne ces mêmes onclick dès que le fetch résout.
    if(discordEl)   discordEl.onclick   = () => shell.openExternal(discordUrl)
    if(voteEl)      voteEl.onclick      = () => shell.openExternal('https://www.districtliferp.fr/vote')
    if(storeEl)      storeEl.onclick    = () => shell.openExternal('https://www.districtliferp.fr/shop')
    if(reglementEl) reglementEl.onclick = () => shell.openExternal('https://www.districtliferp.fr/reglement')
})()

// ─────────────────────────────────────────────────────────
//  LIENS DU LAUNCHER (Discord/Voter/Boutique/Règlement/Wiki) — pilotés par
//  link.json, même principe que patch.json/events.json : modifiable sans
//  reconstruire/republier le launcher. Les valeurs codées en dur ci-dessus
//  (et sur le bouton Wiki de la sidebar) restent le repli si le fichier est
//  absent/indisponible — rien ne casse si link.json n'existe pas encore.
// ─────────────────────────────────────────────────────────
async function initLinks(){
    try {
        const resp = await fetch('https://distribution.districtliferp.fr/link.json')
        if(!resp.ok) throw new Error('HTTP ' + resp.status)
        const links = await resp.json()

        const bind = (el, url) => { if(el && url) el.onclick = () => shell.openExternal(url) }
        bind(document.getElementById('dl-bc-discord'),   links.discord)
        bind(document.getElementById('dl-bc-vote'),      links.vote)
        bind(document.getElementById('dl-bc-store'),      links.shop)
        bind(document.getElementById('dl-bc-reglement'), links.reglement)
        bind(document.getElementById('wikiButton'),       links.wiki)
        // Bouton "Support" de Paramètres > À propos — lien Discord statique rendu côté
        // EJS (settings.ejs), jamais branché sur link.json jusqu'ici. On neutralise le
        // href d'origine (lang('settings.supportLink')) et on bascule sur onclick.
        const supportBtn = document.getElementById('settingsAboutSupportButton')
        if(supportBtn && links.discord){
            supportBtn.removeAttribute('href')
            supportBtn.onclick = (e) => { e.preventDefault(); shell.openExternal(links.discord) }
        }
        // Le podium (état vide), la carte statut (lien Discord hors ligne) et l'actu vide
        // ouvrent aussi Discord/Voter — on les aligne sur link.json s'il fournit une valeur.
        window._dlLinks = links
    } catch(e) {
        loggerLanding.debug('Unable to load link.json, keeping hardcoded link defaults.', e)
    }
}

// Bind retry button.
newsErrorRetry.onclick = () => {
    $('#newsErrorFailed').fadeOut(250, () => {
        initNews()
        $('#newsErrorLoading').fadeIn(250)
    })
}

newsArticleContentScrollable.onscroll = (e) => {
    if(e.target.scrollTop > Number.parseFloat($('.newsArticleSpacerTop').css('height'))){
        newsContent.setAttribute('scrolled', '')
    } else {
        newsContent.removeAttribute('scrolled')
    }
}

/**
 * Reload the news without restarting.
 * 
 * @returns {Promise.<void>} A promise which resolves when the news
 * content has finished loading and transitioning.
 */
function reloadNews(){
    return new Promise((resolve, reject) => {
        $('#newsContent').fadeOut(250, () => {
            $('#newsErrorLoading').fadeIn(250)
            initNews().then(() => {
                resolve()
            })
        })
    })
}

let newsAlertShown = false

/**
 * Show the news alert indicating there is new news.
 */
function showNewsAlert(){
    newsAlertShown = true
    $(newsButtonAlert).fadeIn(250)
}

async function digestMessage(str) {
    const msgUint8 = new TextEncoder().encode(str)
    const hashBuffer = await crypto.subtle.digest('SHA-1', msgUint8)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
    return hashHex
}

/**
 * Initialize News UI. This will load the news and prepare
 * the UI accordingly.
 * 
 * @returns {Promise.<void>} A promise which resolves when the news
 * content has finished loading and transitioning.
 */
async function initNews(){

    setNewsLoading(true)

    const news = await loadNews()

    newsArr = news?.articles || null

    if(newsArr == null){
        // News Loading Failed
        setNewsLoading(false)

        await $('#newsErrorLoading').fadeOut(250).promise()
        await $('#newsErrorFailed').fadeIn(250).promise()

        // Bento : état erreur
        const _bcTitle = document.getElementById('dl-bc-news-title')
        const _bcExcerpt = document.getElementById('dl-bc-news-excerpt')
        const _bcThumb = document.getElementById('dl-bc-news-thumb')
        const _bcCta = document.querySelector('#dl-bc-news .dl-bc-cta')
        const _bcNewsErr = document.getElementById('dl-bc-news')
        if(_bcNewsErr) _bcNewsErr.setAttribute('data-state', 'error')
        if(_bcTitle) _bcTitle.textContent = 'Impossible de charger les actualités'
        if(_bcExcerpt) _bcExcerpt.textContent = 'Une erreur est survenue lors du chargement.'
        if(_bcThumb) _bcThumb.style.display = 'none'
        if(_bcCta) _bcCta.style.display = 'none'

    } else if(newsArr.length === 0) {
        // No News Articles
        setNewsLoading(false)

        ConfigManager.setNewsCache({
            date: null,
            content: null,
            dismissed: false
        })
        ConfigManager.save()

        await $('#newsErrorLoading').fadeOut(250).promise()
        await $('#newsErrorNone').fadeIn(250).promise()

        // Bento : pas d'article
        const _bcTitle = document.getElementById('dl-bc-news-title')
        const _bcExcerpt = document.getElementById('dl-bc-news-excerpt')
        const _bcThumb = document.getElementById('dl-bc-news-thumb')
        const _bcCta = document.querySelector('#dl-bc-news .dl-bc-cta')
        const _bcNews = document.getElementById('dl-bc-news')
        if(_bcNews) _bcNews.setAttribute('data-state', 'empty')
        if(_bcTitle) _bcTitle.textContent = 'Calme plat sur le District'
        if(_bcExcerpt) _bcExcerpt.textContent = 'Rejoins Discord pour les annonces.'
        if(_bcThumb) _bcThumb.style.display = 'none'
        if(_bcCta) _bcCta.textContent = 'Ouvrir #annonces →'
        if(_bcNews) _bcNews.onclick = () => shell.openExternal(window._dlLinks?.discord || document.getElementById('discordURL')?.href || 'https://discord.gg/7DR8YERnvz')

    } else {
        // Success
        setNewsLoading(false)

        const lN = newsArr[0]
        const cached = ConfigManager.getNewsCache()
        let newHash = await digestMessage(lN.content)
        let newDate = new Date(lN.date)
        let isNew = false

        if(cached.date != null && cached.content != null){

            if(new Date(cached.date) >= newDate){

                // Compare Content
                if(cached.content !== newHash){
                    isNew = true
                    showNewsAlert()
                } else {
                    if(!cached.dismissed){
                        isNew = true
                        showNewsAlert()
                    }
                }

            } else {
                isNew = true
                showNewsAlert()
            }

        } else {
            isNew = true
            showNewsAlert()
        }

        if(isNew){
            ConfigManager.setNewsCache({
                date: newDate.getTime(),
                content: newHash,
                dismissed: false
            })
            ConfigManager.save()
        }

        const switchHandler = (forward) => {
            let cArt = parseInt(newsContent.getAttribute('article'))
            let nxtArt = forward ? (cArt >= newsArr.length-1 ? 0 : cArt + 1) : (cArt <= 0 ? newsArr.length-1 : cArt - 1)
    
            displayArticle(newsArr[nxtArt], nxtArt+1)
        }

        document.getElementById('newsNavigateRight').onclick = () => { switchHandler(true) }
        document.getElementById('newsNavigateLeft').onclick = () => { switchHandler(false) }
        await $('#newsErrorContainer').fadeOut(250).promise()
        displayArticle(newsArr[0], 1)
        await $('#newsContent').fadeIn(250).promise()

        // Populate bento news cell
        const bentoNews = document.getElementById('dl-bc-news')
        if(bentoNews && newsArr.length > 0) {
            bentoNews.setAttribute('data-state', 'ok')
            const art = newsArr[0]
            const bcTitle   = document.getElementById('dl-bc-news-title')
            const bcExcerpt = document.getElementById('dl-bc-news-excerpt')
            const bcImg     = document.getElementById('dl-bc-news-img')
            const bcThumb   = document.getElementById('dl-bc-news-thumb')
            if(bcTitle) bcTitle.textContent = art.title
            if(bcExcerpt) {
                const tmp = document.createElement('div')
                tmp.innerHTML = art.content
                const txt = (tmp.textContent || tmp.innerText || '').replace(/\s+/g, ' ').trim()
                bcExcerpt.textContent = txt.length > 120 ? txt.slice(0, 120) + '…' : txt
            }
            if(bcImg && art.image) {
                bcImg.src = art.image
            } else if(bcThumb) {
                bcThumb.style.display = 'none'
            }
            if(/\[EVENT\]/i.test(art.title)) {
                bentoNews.classList.add('dl-bc-news-event')
            }
            bentoNews.onclick = () => shell.openExternal(art.link)
        }
    }


}

/**
 * Add keyboard controls to the news UI. Left and right arrows toggle
 * between articles. If you are on the landing page, the up arrow will
 * open the news UI.
 */
document.addEventListener('keydown', (e) => {
    if(newsActive){
        if(e.key === 'ArrowRight' || e.key === 'ArrowLeft'){
            document.getElementById(e.key === 'ArrowRight' ? 'newsNavigateRight' : 'newsNavigateLeft').click()
        }
        // Interferes with scrolling an article using the down arrow.
        // Not sure of a straight forward solution at this point.
        // if(e.key === 'ArrowDown'){
        //     document.getElementById('newsButton').click()
        // }
    } else {
        if(getCurrentView() === VIEWS.landing){
            if(e.key === 'ArrowUp'){
                document.getElementById('newsButton').click()
            }
        }
    }
})

/**
 * Display a news article on the UI.
 * 
 * @param {Object} articleObject The article meta object.
 * @param {number} index The article index.
 */
function displayArticle(articleObject, index){
    newsArticleTitle.innerHTML = articleObject.title
    newsArticleTitle.href = articleObject.link
    newsArticleAuthor.innerHTML = 'by ' + articleObject.author
    newsArticleDate.innerHTML = articleObject.date
    newsArticleComments.innerHTML = articleObject.comments
    newsArticleComments.href = articleObject.commentsLink
    newsArticleContentScrollable.innerHTML = '<div id="newsArticleContentWrapper"><div class="newsArticleSpacerTop"></div>' + articleObject.content + '<div class="newsArticleSpacerBot"></div></div>'
    Array.from(newsArticleContentScrollable.getElementsByClassName('bbCodeSpoilerButton')).forEach(v => {
        v.onclick = () => {
            const text = v.parentElement.getElementsByClassName('bbCodeSpoilerText')[0]
            text.style.display = text.style.display === 'block' ? 'none' : 'block'
        }
    })
    newsNavigationStatus.innerHTML = Lang.query('ejs.landing.newsNavigationStatus', {currentPage: index, totalPages: newsArr.length})
    newsContent.setAttribute('article', index-1)
}

/**
 * Load news information from the RSS feed specified in the
 * distribution index.
 */
async function loadNews(){

    const distroData = await DistroAPI.getDistribution()
    if(!distroData.rawDistribution.rss) {
        loggerLanding.debug('No RSS feed provided.')
        return null
    }

    const promise = new Promise((resolve, reject) => {
        
        const newsFeed = distroData.rawDistribution.rss
        const newsHost = new URL(newsFeed).origin + '/'
        $.ajax({
            url: newsFeed,
            dataType: 'xml',
            success: (data) => {
                const items = $(data).find('item')
                const articles = []

                for(let i=0; i<items.length; i++){
                // JQuery Element
                    const el = $(items[i])

                    // Resolve date.
                    const date = new Date(el.find('pubDate').text()).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric'})

                    // Resolve comments.
                    let comments = el.find('slash\\:comments').text() || '0'
                    comments = comments + ' Comment' + (comments === '1' ? '' : 's')

                    // Fix relative links in content.
                    let content = el.find('content\\:encoded').text()
                    let regex = /src="(?!http:\/\/|https:\/\/)(.+?)"/g
                    let matches
                    while((matches = regex.exec(content))){
                        content = content.replace(`"${matches[1]}"`, `"${newsHost + matches[1]}"`)
                    }

                    let link   = el.find('link').text()
                    let title  = el.find('title').text()
                    let author = el.find('dc\\:creator').text()

                    // Extract thumbnail: enclosure first, fallback to first <img> in content
                    let image = el.find('enclosure').attr('url') || ''
                    if(!image) {
                        const tmpImg = document.createElement('div')
                        tmpImg.innerHTML = content
                        const firstImg = tmpImg.querySelector('img')
                        if(firstImg) image = firstImg.getAttribute('src') || ''
                    }

                    // Generate article.
                    articles.push(
                        {
                            link,
                            title,
                            date,
                            author,
                            content,
                            comments,
                            commentsLink: link + '#comments',
                            image
                        }
                    )
                }
                resolve({
                    articles
                })
            },
            timeout: 6000
        }).catch(err => {
            resolve({
                articles: null
            })
        })
    })

    return await promise
}

// ─────────────────────────────────────────────────────────
//  PODIUM VOTES
// ─────────────────────────────────────────────────────────

function _escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function renderVotePodium(players) {
    const wrap = document.getElementById('dl-bc-podium-wrap')
    const card = document.getElementById('dl-bc-podium')
    if (!wrap) return

    if (!players || players.length === 0) {
        if(card) card.setAttribute('data-state', 'empty')
        wrap.innerHTML = `
            <div class="dl-bc-pod-ghost-stage">
                <span class="dl-bc-pod-ghost"></span>
                <span class="dl-bc-pod-ghost dl-bc-pod-ghost-tall"></span>
                <span class="dl-bc-pod-ghost"></span>
            </div>
            <div class="dl-bc-podium-empty-title">Le podium est vide</div>
            <div class="dl-bc-podium-empty-sub">Premier vote = tête du classement.</div>
            <span class="dl-btn-chip dl-btn-chip-gold" id="dl-bc-podium-vote-cta">Voter maintenant</span>`
        const cta = document.getElementById('dl-bc-podium-vote-cta')
        if(cta) cta.onclick = () => shell.openExternal(window._dlLinks?.vote || 'https://www.districtliferp.fr/vote')
        return
    }

    if(card) card.setAttribute('data-state', 'ok')

    const sorted = [...players].sort((a, b) => a.rank - b.rank)

    const html = sorted.map(p => `
        <div class="dl-bc-pod-row${p.rank === 1 ? ' dl-bc-pod-row-top' : ''}">
            <b class="dl-bc-pod-rank">${p.rank}</b>
            <img class="dl-bc-pod-head" data-username="${_escHtml(p.username)}" alt="${_escHtml(p.username)}">
            <span class="dl-bc-pod-name">${_escHtml(p.username)}</span>
            <span class="dl-bc-pod-vcnt-inline">${p.votes}</span>
        </div>`).join('')

    wrap.innerHTML = html
    // Construit en chaîne (synchrone, pour l'affichage immédiat) : les <img> démarrent
    // sans src, remplies de façon asynchrone juste après via le découpage canvas local.
    wrap.querySelectorAll('.dl-bc-pod-head').forEach(img => {
        renderSkinFaceImg(img, img.dataset.username)
    })
}

async function initVotePodium() {
    const card = document.getElementById('dl-bc-podium')
    if(card) card.setAttribute('data-state', 'loading')
    try {
        const resp = await fetch('https://www.districtliferp.fr/api/api-vote-list/top?limit=3&period=monthly')
        if (!resp.ok) throw new Error('HTTP ' + resp.status)
        const json = await resp.json()
        renderVotePodium(json.data || [])
    } catch (e) {
        if(card) card.setAttribute('data-state', 'error')
        const wrap = document.getElementById('dl-bc-podium-wrap')
        if (wrap) wrap.innerHTML = `
            <div class="dl-bc-podium-empty-title">Classement indisponible</div>
            <span class="dl-bc-cta" id="dl-bc-podium-retry">↻ Réessayer</span>`
        const retry = document.getElementById('dl-bc-podium-retry')
        if(retry) retry.onclick = () => initVotePodium()
    }
}

// ─────────────────────────────────────────────────────────
//  DEV PREVIEW — utilisable dans les DevTools Electron
//  Commandes : dlPreview.votePodium()
// ─────────────────────────────────────────────────────────
window.dlPreview = {
    votePodium() {
        renderVotePodium([
            { rank: 1, username: 'schwarzy2',  votes: 186 },
            { rank: 2, username: 'Mcmathis7',  votes: 76  },
            { rank: 3, username: 'Dralezazou', votes: 74  }
        ])
        console.log('[dlPreview] commandes :', Object.keys(window.dlPreview))
    },
    shopPromos() {
        renderShopPromos([
            { name: 'Grade VIP',      category: 'Grade',      price: 9.99,  original_price: 14.99, image: '', link: 'https://www.districtliferp.fr/shop' },
            { name: 'Kit Démarrage',  category: 'Cosmétique', price: 4.99,  original_price: 7.99,  image: '', link: 'https://www.districtliferp.fr/shop' },
            { name: 'Rang Légendaire',category: 'Grade',      price: 19.99, original_price: null,  image: '', link: 'https://www.districtliferp.fr/shop' }
        ])
        console.log('[dlPreview] commandes :', Object.keys(window.dlPreview))
    }
}
