/**
 * Rapports de crash : quand le jeu se ferme anormalement, le launcher envoie le
 * crash-report, latest.log et la fin de debug.log au serveur DistrictLife pour que le
 * staff puisse analyser les crashs côté client.
 *
 * - Uniquement en cas de crash : code de sortie ≠ 0, nouveau fichier dans
 *   crash-reports/, ou crash natif de la JVM (hs_err_pid*.log). Une fermeture normale
 *   n'envoie rien, une fermeture par le bouton « Fermer le jeu » non plus.
 * - Chaque rapport porte un numéro court (DL-XXXX-XXXX) affiché au joueur dans la
 *   fenêtre « Le jeu s'est fermé », à donner au support.
 * - Le joueur est informé au premier lancement et peut désactiver l'envoi dans les
 *   Paramètres (ConfigManager.getSendCrashReports).
 * - Les données sensibles sont masquées avant l'envoi (jetons de session, nom du
 *   compte Windows/macOS/Linux dans les chemins).
 * - Si l'envoi échoue (pas d'Internet…), le rapport est gardé dans
 *   <launcher>/crash-queue et renvoyé au prochain démarrage du launcher.
 *
 * Le receveur côté serveur est dans server/crash-receiver/ (PHP).
 */
const crypto = require('crypto')
const fs   = require('fs-extra')
const os   = require('os')
const path = require('path')
const zlib = require('zlib')

const ConfigManager  = require('./configmanager')
const { LoggerUtil } = require('helios-core')

const logger = LoggerUtil.getLogger('CrashReporter')

const UPLOAD_URL = 'https://distribution.districtliferp.fr/crash/upload.php'
// Clé anti-spam, à reporter dans server/crash-receiver/config.php. Elle est lisible
// dans le launcher : ce n'est pas un secret, juste un filtre contre les envois au hasard.
const UPLOAD_KEY = 'dl-crash-2026-a7f3c91e'
const UPLOAD_TIMEOUT_MS = 30000
const MAX_QUEUED_REPORTS = 10

// Taille maximale gardée par fichier (on garde la FIN du fichier, là où est le crash).
const FILES = [
    { key: 'crash-report', maxBytes: 2 * 1024 * 1024 },
    { key: 'hs-err',       maxBytes: 2 * 1024 * 1024 },
    { key: 'latest-log',   maxBytes: 4 * 1024 * 1024 },
    { key: 'debug-log',    maxBytes: 3 * 1024 * 1024 },
    { key: 'launcher-log', maxBytes: 2 * 1024 * 1024 }
]

// Une même erreur du launcher n'est envoyée qu'une fois toutes les 10 minutes.
const LAUNCHER_ERROR_COOLDOWN_MS = 10 * 60 * 1000
const recentLauncherErrors = new Map()

// Numéro de rapport court à donner au support : DL-XXXX-XXXX (sans 0/O ni 1/I).
const REPORT_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function generateReportId(){
    const bytes = crypto.randomBytes(8)
    let out = ''
    for(let i = 0; i < 8; i++){
        out += REPORT_ID_ALPHABET[bytes[i] % REPORT_ID_ALPHABET.length]
        if(i === 3) out += '-'
    }
    return `DL-${out}`
}

// Appelle un callback du launcher sans laisser une erreur d'affichage casser l'envoi.
function notify(cb, value){
    if(typeof cb !== 'function') return
    try {
        cb(value)
    } catch(err) {
        logger.warn('Erreur dans le callback du rapport de crash.', err)
    }
}

function queueDir(){
    return path.join(ConfigManager.getLauncherDirectory(), 'crash-queue')
}

/**
 * Masque les données qui n'ont rien à faire sur le serveur.
 *
 * @param {string} text Le contenu d'un log.
 * @returns {string}
 */
function redact(text){
    return text
        // Jetons de session (arguments de lancement, JSON, en-têtes).
        .replace(/(--accessToken[\s,=]+)[^\s,\]]+/gi, '$1***')
        .replace(/("?(?:access_?token|accessToken|clientToken|session(?:Id)?)"?\s*[:=]\s*"?)[A-Za-z0-9._:-]{8,}/gi, '$1***')
        .replace(/(token:)[A-Za-z0-9._-]{16,}/gi, '$1***')
        // Nom du compte de l'ordinateur dans les chemins.
        .replace(/([A-Za-z]:[\\/]+Users[\\/]+)[^\\/\r\n:*?"<>|]+/gi, '$1<user>')
        .replace(/(\/home\/)[^/\s]+/g, '$1<user>')
        .replace(/(\/Users\/)[^/\s]+/g, '$1<user>')
}

// Lit la fin d'un fichier (au plus maxBytes), masque et compresse.
async function readTailGz(file, maxBytes){
    const { size } = await fs.stat(file)
    const start = Math.max(0, size - maxBytes)
    const fd = await fs.open(file, 'r')
    try {
        const buf = Buffer.alloc(size - start)
        await fs.read(fd, buf, 0, buf.length, start)
        let text = buf.toString('utf8')
        if(start > 0) text = `[… ${start} octets tronqués au début …]\n` + text
        return zlib.gzipSync(Buffer.from(redact(text), 'utf8'))
    } finally {
        await fs.close(fd)
    }
}

// Fichiers modifiés depuis le lancement (avec 2 s de marge) correspondant au filtre.
async function filesSince(dir, startedAt, filter){
    try {
        const names = (await fs.readdir(dir)).filter(filter)
        const stats = await Promise.all(names.map(async n => ({ name: n, mtime: (await fs.stat(path.join(dir, n))).mtimeMs })))
        return stats.filter(s => s.mtime >= startedAt - 2000).sort((a, b) => b.mtime - a.mtime).map(s => path.join(dir, s.name))
    } catch(_err) {
        return []
    }
}

async function upload(meta, files){
    const form = new FormData()
    form.append('meta', JSON.stringify(meta))
    for(const [key, buf] of Object.entries(files)){
        form.append(key, new Blob([buf], { type: 'application/gzip' }), `${key}.gz`)
    }
    const res = await fetch(UPLOAD_URL, {
        method: 'POST',
        headers: { 'X-DL-Crash-Key': UPLOAD_KEY },
        body: form,
        signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS)
    })
    if(!res.ok) {
        const err = new Error(`HTTP ${res.status}`)
        err.status = res.status
        throw err
    }
    return res.json().catch(() => ({}))
}

/** Refus définitif du receveur (rapport invalide) : inutile de le renvoyer plus tard. */
function isRejected(err){
    return typeof err?.status === 'number' && err.status >= 400 && err.status < 500 && err.status !== 429
}

async function enqueue(id, meta, files){
    const dir = path.join(queueDir(), id)
    await fs.ensureDir(dir)
    await fs.writeJson(path.join(dir, 'meta.json'), meta)
    for(const [key, buf] of Object.entries(files)){
        await fs.writeFile(path.join(dir, `${key}.gz`), buf)
    }
    // On ne garde que les derniers rapports en attente.
    const all = (await fs.readdir(queueDir())).sort()
    for(const old of all.slice(0, Math.max(0, all.length - MAX_QUEUED_REPORTS))){
        await fs.remove(path.join(queueDir(), old))
    }
}

/**
 * À appeler quand le jeu se ferme. Détecte un crash et envoie le rapport.
 *
 * @param {Object} session
 * @param {string} session.serverId Le serveur lancé.
 * @param {string} session.gameDir Le dossier du jeu (instances/<serveur>).
 * @param {number} session.startedAt Date.now() au lancement.
 * @param {number|null} session.exitCode Le code de sortie du jeu.
 * @param {string|null} session.signal Le signal reçu, le cas échéant.
 * @param {boolean} session.closedByLauncher Le jeu a été fermé par le launcher.
 * @param {Object} session.account Le compte (displayName, uuid).
 * @param {string} session.launcherVersion La version du launcher.
 * @param {function} [session.onCrash] Appelé dès qu'un crash est détecté (même si
 *     l'envoi est désactivé) avec { reportId, reportsEnabled }.
 * @param {function} [session.onReportId] Appelé si le serveur renvoie un numéro de
 *     rapport différent de celui généré par le launcher.
 */
exports.handleGameExit = async function(session){
    try {
        if(session.closedByLauncher) return

        const crashReports = await filesSince(path.join(session.gameDir, 'crash-reports'), session.startedAt, n => n.endsWith('.txt'))
        const hsErrs = await filesSince(session.gameDir, session.startedAt, n => /^hs_err_pid\d+\.log$/.test(n))
        const abnormalExit = session.exitCode != null && session.exitCode !== 0
        if(!abnormalExit && crashReports.length === 0 && hsErrs.length === 0) return

        // Numéro court affiché au joueur et inclus dans le rapport (le receveur l'utilise
        // comme identifiant du dossier, voir server/crash-receiver/upload.php).
        const reportsEnabled = ConfigManager.getSendCrashReports()
        const reportId = reportsEnabled ? generateReportId() : null
        notify(session.onCrash, { reportId, reportsEnabled, exitCode: session.exitCode })
        if(!reportsEnabled) return

        logger.info(`Crash détecté (code ${session.exitCode}, ${crashReports.length} crash-report, ${hsErrs.length} hs_err), préparation du rapport ${reportId}.`)

        const sources = {
            'crash-report': crashReports[0],
            'hs-err':       hsErrs[0],
            'latest-log':   path.join(session.gameDir, 'logs', 'latest.log'),
            'debug-log':    path.join(session.gameDir, 'logs', 'debug.log')
        }
        const files = {}
        for(const { key, maxBytes } of FILES){
            const file = sources[key]
            if(file && await fs.pathExists(file)){
                files[key] = await readTailGz(file, maxBytes)
            }
        }

        const meta = {
            reportId,
            launcherVersion: session.launcherVersion,
            serverId: session.serverId,
            username: session.account?.displayName ?? null,
            uuid: session.account?.uuid ?? null,
            exitCode: session.exitCode,
            signal: session.signal,
            startedAt: new Date(session.startedAt).toISOString(),
            endedAt: new Date().toISOString(),
            crashReportName: crashReports[0] ? path.basename(crashReports[0]) : null,
            os: `${os.platform()} ${os.release()} (${os.arch()})`,
            totalMemoryGB: Math.round(os.totalmem() / 1073741824),
            javaMaxRAM: ConfigManager.getMaxRAM(session.serverId),
            javaMinRAM: ConfigManager.getMinRAM(session.serverId),
            jvmOptions: ConfigManager.getJVMOptions(session.serverId)
        }

        try {
            const res = await upload(meta, files)
            logger.info('Rapport de crash envoyé.', reportId, res?.id ?? '')
            // Numéro renvoyé par le receveur (normalement identique au nôtre).
            if(typeof res?.reportId === 'string' && res.reportId && res.reportId !== reportId){
                notify(session.onReportId, res.reportId)
            }
        } catch(err) {
            if(isRejected(err)) {
                logger.warn('Rapport de crash refusé par le receveur, il ne sera pas renvoyé.', err.message)
            } else {
                logger.warn('Envoi du rapport de crash impossible, il sera renvoyé au prochain démarrage.', err.message)
                await enqueue(`${Date.now()}-${process.pid}`, meta, files)
            }
        }
    } catch(err) {
        logger.error('Erreur pendant la préparation du rapport de crash.', err)
    }
}

/**
 * Renvoie les rapports restés en attente (envoi précédent échoué).
 */
exports.flushQueue = async function(){
    try {
        if(!ConfigManager.getSendCrashReports()) return
        if(!await fs.pathExists(queueDir())) return
        for(const id of (await fs.readdir(queueDir())).sort()){
            const dir = path.join(queueDir(), id)
            try {
                const meta = await fs.readJson(path.join(dir, 'meta.json'))
                const files = {}
                for(const { key } of FILES){
                    const file = path.join(dir, `${key}.gz`)
                    if(await fs.pathExists(file)) files[key] = await fs.readFile(file)
                }
                await upload({ ...meta, queued: true }, files)
                await fs.remove(dir)
                logger.info('Rapport de crash en attente envoyé.', id)
            } catch(err) {
                if(isRejected(err)) {
                    // Refusé pour de bon : on le jette pour ne pas bloquer la file.
                    await fs.remove(dir).catch(() => {})
                    logger.warn('Rapport de crash en attente refusé par le receveur, supprimé.', id, err.message)
                    continue
                }
                logger.warn('Rapport de crash en attente toujours pas envoyé.', id, err.message)
                return
            }
        }
    } catch(err) {
        logger.error('Erreur pendant l\'envoi des rapports en attente.', err)
    }
}

/**
 * Code court d'une erreur du launcher, utilisé pour ranger le rapport côté serveur
 * (dossier Launcher_<code>) : le code système (ENOENT, ENOSPC, EPERM…), sinon celui
 * trouvé dans les dernières lignes de log, sinon le type d'erreur.
 */
function launcherErrorCode(error, logText){
    if(error?.code && /^[A-Z][A-Z0-9_]{2,}$/.test(error.code)) return error.code
    const lastErrors = logText.split('\n').slice(-200).reverse()
    for(const line of lastErrors){
        const m = line.match(/\b(E[A-Z]{2,}[A-Z0-9_]*):/)
        if(m) return m[1]
    }
    if(error?.name && error.name !== 'Error') return error.name
    return 'Erreur'
}

/**
 * Envoie au serveur une erreur du launcher (échec du lancement, du téléchargement, de
 * la vérification des fichiers…) avec les derniers logs du launcher.
 *
 * @param {Object} report
 * @param {string} report.title Le titre affiché au joueur.
 * @param {string} report.description Le message affiché au joueur.
 * @param {*} report.error L'erreur d'origine (facultatif).
 * @param {string} report.launcherVersion La version du launcher.
 */
exports.reportLauncherError = async function(report){
    try {
        if(!ConfigManager.getSendCrashReports()) return
        const error = report.error instanceof Error ? report.error : (report.error != null ? new Error(String(report.error?.message ?? report.error)) : null)
        if(report.error?.code && error && !error.code) error.code = report.error.code

        const key = `${report.title}|${error?.message ?? report.description}`
        const last = recentLauncherErrors.get(key)
        if(last && Date.now() - last < LAUNCHER_ERROR_COOLDOWN_MS) return
        recentLauncherErrors.set(key, Date.now())

        const logText = require('./logbuffer').getText()
        const serverId = ConfigManager.getSelectedServer()
        const account = ConfigManager.getSelectedAccount()
        const meta = {
            type: 'launcher',
            launcherVersion: report.launcherVersion,
            serverId,
            username: account?.displayName ?? null,
            uuid: account?.uuid ?? null,
            launcherErrorCode: launcherErrorCode(error, logText),
            errorTitle: redact(String(report.title ?? '')),
            errorDescription: redact(String(report.description ?? '').replace(/<[^>]+>/g, ' ')),
            errorMessage: error ? redact(String(error.message)) : null,
            errorStack: error?.stack ? redact(String(error.stack)) : null,
            occurredAt: new Date().toISOString(),
            os: `${os.platform()} ${os.release()} (${os.arch()})`,
            totalMemoryGB: Math.round(os.totalmem() / 1073741824),
            freeMemoryGB: Math.round(os.freemem() / 1073741824),
            dataDirectory: redact(ConfigManager.getDataDirectory()),
            javaMaxRAM: serverId ? ConfigManager.getMaxRAM(serverId) : null
        }
        const maxBytes = FILES.find(f => f.key === 'launcher-log').maxBytes
        const files = { 'launcher-log': zlib.gzipSync(Buffer.from(redact(logText.slice(-maxBytes)), 'utf8')) }

        try {
            const res = await upload(meta, files)
            logger.info('Erreur du launcher envoyée au serveur.', res?.id ?? '')
        } catch(err) {
            if(isRejected(err)) {
                logger.warn('Erreur du launcher refusée par le receveur, elle ne sera pas renvoyée.', err.message)
            } else {
                logger.warn('Envoi de l\'erreur du launcher impossible, elle sera renvoyée au prochain démarrage.', err.message)
                await enqueue(`${Date.now()}-${process.pid}-launcher`, meta, files)
            }
        }
    } catch(err) {
        logger.error('Erreur pendant la préparation du rapport d\'erreur du launcher.', err)
    }
}

exports._redact = redact
exports._generateReportId = generateReportId
exports._launcherErrorCode = launcherErrorCode
