/**
 * Rapports de crash : quand le jeu se ferme anormalement, le launcher envoie le
 * crash-report, latest.log et la fin de debug.log au serveur DistrictLife pour que le
 * staff puisse analyser les crashs côté client.
 *
 * - Uniquement en cas de crash : code de sortie ≠ 0, nouveau fichier dans
 *   crash-reports/, ou crash natif de la JVM (hs_err_pid*.log). Une fermeture normale
 *   n'envoie rien, une fermeture par le bouton « Fermer le jeu » non plus.
 * - Le joueur est informé au premier lancement et peut désactiver l'envoi dans les
 *   Paramètres (ConfigManager.getSendCrashReports).
 * - Les données sensibles sont masquées avant l'envoi (jetons de session, nom du
 *   compte Windows/macOS/Linux dans les chemins).
 * - Si l'envoi échoue (pas d'Internet…), le rapport est gardé dans
 *   <launcher>/crash-queue et renvoyé au prochain démarrage du launcher.
 *
 * Le receveur côté serveur est dans server/crash-receiver/ (PHP).
 */
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
    { key: 'debug-log',    maxBytes: 3 * 1024 * 1024 }
]

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
    if(!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json().catch(() => ({}))
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
 */
exports.handleGameExit = async function(session){
    try {
        if(!ConfigManager.getSendCrashReports()) return
        if(session.closedByLauncher) return

        const crashReports = await filesSince(path.join(session.gameDir, 'crash-reports'), session.startedAt, n => n.endsWith('.txt'))
        const hsErrs = await filesSince(session.gameDir, session.startedAt, n => /^hs_err_pid\d+\.log$/.test(n))
        const abnormalExit = session.exitCode != null && session.exitCode !== 0
        if(!abnormalExit && crashReports.length === 0 && hsErrs.length === 0) return

        logger.info(`Crash détecté (code ${session.exitCode}, ${crashReports.length} crash-report, ${hsErrs.length} hs_err), préparation du rapport.`)

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
            logger.info('Rapport de crash envoyé.', res?.id ?? '')
        } catch(err) {
            logger.warn('Envoi du rapport de crash impossible, il sera renvoyé au prochain démarrage.', err.message)
            await enqueue(`${Date.now()}-${process.pid}`, meta, files)
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
                logger.warn('Rapport de crash en attente toujours pas envoyé.', id, err.message)
                return
            }
        }
    } catch(err) {
        logger.error('Erreur pendant l\'envoi des rapports en attente.', err)
    }
}

exports._redact = redact
