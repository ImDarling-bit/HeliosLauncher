/**
 * Fonds d'écran du launcher, chargés depuis le serveur DistrictLife au lieu d'être
 * embarqués dans l'installeur.
 *
 * Le dossier https://distribution.districtliferp.fr/photo/ contient les images et un
 * index.json qui les liste. Formats acceptés pour index.json :
 *   ["1.jpg", "2.png", …]
 *   { "photos": ["1.jpg", …] }        (ou "images" / "files" / "backgrounds")
 *   [{ "name": "1.jpg" }, { "file": "2.jpg" }, { "url": "https://…/3.jpg" }, …]
 * Pour ajouter ou retirer un fond : déposer / supprimer l'image dans photo/ et mettre
 * index.json à jour. Aucune nouvelle version du launcher n'est nécessaire.
 *
 * Un fond est tiré au hasard à chaque démarrage. Les dernières images affichées sont
 * gardées en cache dans <launcher>/backgrounds-cache pour avoir un fond même hors
 * ligne ; sans réseau ni cache, le fond reste uni (couleur du thème).
 */
/* global document, window */
const fs   = require('fs-extra')
const path = require('path')
const { pathToFileURL } = require('url')

const ConfigManager  = require('./configmanager')
const { LoggerUtil } = require('helios-core')

const logger = LoggerUtil.getLogger('Backgrounds')

const PHOTO_BASE_URL = 'https://distribution.districtliferp.fr/photo/'
const INDEX_URL = PHOTO_BASE_URL + 'index.json'
const FETCH_TIMEOUT_MS = 8000
const MAX_CACHED = 6
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif)$/i

function cacheDir(){
    return path.join(ConfigManager.getLauncherDirectory(), 'backgrounds-cache')
}

// Transforme le contenu d'index.json en liste d'URL d'images.
function parseIndex(json){
    let list = json
    if(!Array.isArray(list) && list && typeof list === 'object'){
        list = list.photos ?? list.images ?? list.files ?? list.backgrounds ?? []
    }
    if(!Array.isArray(list)) return []
    return list
        .map(entry => typeof entry === 'string' ? entry : (entry?.url ?? entry?.name ?? entry?.file))
        .filter(name => typeof name === 'string' && IMAGE_EXT.test(name.split('?')[0]))
        .map(name => /^https?:\/\//i.test(name)
            ? name
            : PHOTO_BASE_URL + name.split('/').map(encodeURIComponent).join('/'))
}

async function fetchBuffer(url){
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if(!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`)
    return res
}

// Nom de fichier du cache, stable pour une URL donnée.
function cacheName(url){
    const base = decodeURIComponent(url.split('?')[0].split('/').pop()).replace(/[^\w.-]/g, '_')
    return base || 'fond.jpg'
}

async function remember(url, buffer){
    try {
        await fs.ensureDir(cacheDir())
        await fs.writeFile(path.join(cacheDir(), cacheName(url)), buffer)
        // On ne garde que les images les plus récentes.
        const files = await Promise.all((await fs.readdir(cacheDir())).map(async f => ({
            f, t: (await fs.stat(path.join(cacheDir(), f))).mtimeMs
        })))
        files.sort((a, b) => b.t - a.t)
        for(const { f } of files.slice(MAX_CACHED)){
            await fs.remove(path.join(cacheDir(), f))
        }
    } catch(err) {
        logger.debug('Impossible de mettre le fond en cache.', err)
    }
}

async function randomCached(){
    try {
        const files = (await fs.readdir(cacheDir())).filter(f => IMAGE_EXT.test(f))
        if(files.length === 0) return null
        return path.join(cacheDir(), files[Math.floor(Math.random() * files.length)])
    } catch(_err) {
        return null
    }
}

function setBackground(url){
    document.body.style.backgroundImage = `url("${url}")`
}

/**
 * Choisit un fond au hasard dans index.json et l'affiche dès qu'il est chargé.
 * Repli sur une image du cache si le serveur ne répond pas.
 */
exports.applyRandomBackground = async function(){
    try {
        const urls = parseIndex(await (await fetchBuffer(INDEX_URL)).json())
        if(urls.length === 0) throw new Error('index.json ne contient aucune image')
        const url = urls[Math.floor(Math.random() * urls.length)]
        // Téléchargé en entier avant affichage : pas d'image à moitié chargée.
        const buffer = Buffer.from(await (await fetchBuffer(url)).arrayBuffer())
        // URL/Blob du navigateur (dans un module Node, « URL » est celle de Node).
        setBackground(window.URL.createObjectURL(new window.Blob([buffer])))
        await remember(url, buffer)
        logger.info('Fond d\'écran :', url)
    } catch(err) {
        logger.warn('Fonds d\'écran du serveur indisponibles, utilisation du cache.', err.message)
        const cached = await randomCached()
        if(cached) setBackground(pathToFileURL(cached).href)
    }
}

exports._parseIndex = parseIndex
