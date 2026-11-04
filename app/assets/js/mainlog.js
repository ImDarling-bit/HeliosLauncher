/**
 * Journal du processus principal d'Electron, pour les rapports envoyés au serveur
 * (voir crashreporter.js). Installé tout au début de index.js.
 *
 * Garde en mémoire :
 * - les logs du processus principal (console.*, mises à jour, erreurs non gérées) ;
 * - une copie de la console de chaque fenêtre (événement « console-message »), qui
 *   survit si la fenêtre plante ;
 * - les plantages des processus d'Electron (fenêtre, GPU, utilitaires).
 *
 * Si la fenêtre du launcher plante, un rapport est écrit dans <launcher>/crash-queue :
 * il est envoyé au prochain démarrage (CrashReporter.flushQueue).
 * Rien d'autre n'est écrit sur le disque.
 */
const crypto = require('crypto')
const fs     = require('fs')
const os     = require('os')
const path   = require('path')
const util   = require('util')
const zlib   = require('zlib')

const MAX_LINES = 3000
const MAX_LINE_LENGTH = 4000
const ANSI = /\x1b\[[0-9;]*m/g

const mainLines = []
const windowLines = []

function push(buffer, line){
    buffer.push(line)
    if(buffer.length > MAX_LINES) buffer.splice(0, buffer.length - MAX_LINES)
}

function format(args){
    return args.map(a => typeof a === 'string' ? a : util.inspect(a, { depth: 4, breakLength: 160 }))
        .join(' ')
        .replace(ANSI, '')
        .slice(0, MAX_LINE_LENGTH)
}

function stamp(){
    return new Date().toISOString()
}

exports.log = function(level, ...args){
    try {
        push(mainLines, `[${stamp()}] [${level}] ${format(args)}`)
    } catch(_err) {
        // Ne jamais casser un log à cause du tampon.
    }
}

exports.install = function(){
    if(globalThis.__dlMainLogInstalled) return
    globalThis.__dlMainLogInstalled = true
    for(const level of ['log', 'info', 'warn', 'error', 'debug']){
        const original = console[level].bind(console)
        console[level] = (...args) => {
            exports.log(level, ...args)
            original(...args)
        }
    }
    // « Monitor » : on note l'erreur sans changer le comportement par défaut d'Electron.
    process.on('uncaughtExceptionMonitor', (err, origin) => {
        exports.log('fatal', `Exception non gérée (${origin}) :`, err)
    })
    process.on('unhandledRejection', (reason) => {
        exports.log('error', 'Promesse rejetée sans gestion :', reason)
    })
    process.on('warning', (warning) => {
        exports.log('warn', 'Avertissement Node :', warning)
    })
}

/**
 * Branche les événements d'Electron. À appeler une fois « app » disponible.
 *
 * @param {Electron.App} app
 */
exports.attach = function(app){
    const LEVELS = { 0: 'debug', 1: 'info', 2: 'warn', 3: 'error' }
    app.on('web-contents-created', (_e, contents) => {
        const label = () => {
            try {
                return contents.getType() + ' ' + (contents.getURL() || '').replace(/^file:\/\/.*\/app\//, 'app/')
            } catch(_err) {
                return 'fenêtre'
            }
        }
        // Electron 35+ : un seul objet événement ; versions plus anciennes : arguments séparés.
        contents.on('console-message', (e, legacyLevel, legacyMessage, legacyLine, legacySource) => {
            try {
                const message = e?.message ?? legacyMessage
                const level = typeof e?.level === 'string' ? e.level : (LEVELS[legacyLevel] ?? 'log')
                const line = e?.lineNumber ?? legacyLine
                const source = (e?.sourceId ?? legacySource ?? '').replace(/^file:\/\/.*\/app\//, 'app/')
                push(windowLines, `[${stamp()}] [${level}] ${String(message).replace(ANSI, '').slice(0, MAX_LINE_LENGTH)}${source ? `  (${source}:${line})` : ''}`)
            } catch(_err) {
                // ignoré
            }
        })
        contents.on('did-fail-load', (_ev, code, desc, url) => {
            exports.log('error', `Chargement échoué (${label()}) : ${code} ${desc} ${url}`)
        })
        contents.on('unresponsive', () => exports.log('warn', `Fenêtre qui ne répond plus (${label()})`))
        contents.on('responsive', () => exports.log('info', `Fenêtre de nouveau réactive (${label()})`))
    })
    app.on('render-process-gone', (_e, contents, details) => {
        exports.log('fatal', `Processus de fenêtre arrêté : ${details.reason} (code ${details.exitCode})`)
        // Fermeture normale (launcher quitté) : rien à signaler.
        if(details.reason === 'clean-exit') return
        queueRendererCrash(app, details)
    })
    app.on('child-process-gone', (_e, details) => {
        exports.log(details.reason === 'clean-exit' ? 'info' : 'error',
            `Processus ${details.type}${details.name ? ' (' + details.name + ')' : ''} arrêté : ${details.reason} (code ${details.exitCode})`)
    })
}

/**
 * @returns {string} Le journal du processus principal puis la copie de la console des
 *     fenêtres, du plus ancien au plus récent.
 */
exports.getText = function(){
    return '===== Processus principal d\'Electron =====\n' + mainLines.join('\n')
        + '\n\n===== Console des fenêtres (copie gardée par le processus principal) =====\n' + windowLines.join('\n')
}

// ── Plantage de la fenêtre du launcher ──────────────────────────────────────

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

// Compte sélectionné, lu directement dans config.json (le processus principal ne
// charge pas ConfigManager).
function selectedAccount(userData){
    try {
        const config = JSON.parse(fs.readFileSync(path.join(userData, 'config.json'), 'utf8'))
        if(config?.settings?.launcher?.sendCrashReports === false) return { disabled: true }
        const acc = config?.authenticationDatabase?.[config?.selectedAccount]
        return { username: acc?.displayName ?? null, uuid: acc?.uuid ?? null, serverId: config?.selectedServer ?? null }
    } catch(_err) {
        return {}
    }
}

function queueRendererCrash(app, details){
    try {
        const userData = app.getPath('userData')
        const account = selectedAccount(userData)
        if(account.disabled) return
        const reportId = generateReportId()
        const dir = path.join(userData, 'crash-queue', `${Date.now()}-${process.pid}-fenetre`)
        fs.mkdirSync(dir, { recursive: true })
        const meta = {
            type: 'launcher',
            reportId,
            launcherVersion: app.getVersion(),
            serverId: account.serverId ?? null,
            username: account.username ?? null,
            uuid: account.uuid ?? null,
            launcherErrorCode: `Fenetre_${String(details.reason).replace(/[^A-Za-z0-9]/g, '_')}`,
            errorTitle: 'La fenêtre du launcher a planté',
            errorDescription: `Raison : ${details.reason}, code de sortie ${details.exitCode}`,
            errorMessage: null,
            errorStack: null,
            occurredAt: new Date().toISOString(),
            os: `${os.platform()} ${os.release()} (${os.arch()})`,
            totalMemoryGB: Math.round(os.totalmem() / 1073741824),
            freeMemoryGB: Math.round(os.freemem() / 1073741824)
        }
        const text = redact(exports.getText()).slice(-4 * 1024 * 1024)
        fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta))
        fs.writeFileSync(path.join(dir, 'launcher-log.gz'), zlib.gzipSync(Buffer.from(text, 'utf8')))
        exports.log('info', `Plantage de la fenêtre mis en file d'attente : ${reportId}`)
    } catch(err) {
        exports.log('error', 'Impossible de mettre le plantage de la fenêtre en file d\'attente :', err)
    }
}

/** Même masquage que crashreporter.js (jetons, nom du compte de l'ordinateur). */
function redact(text){
    return text
        .replace(/(--accessToken[\s,=]+)[^\s,\]]+/gi, '$1***')
        .replace(/("?(?:access_?token|accessToken|clientToken|session(?:Id)?)"?\s*[:=]\s*"?)[A-Za-z0-9._:-]{8,}/gi, '$1***')
        .replace(/(token:)[A-Za-z0-9._-]{16,}/gi, '$1***')
        .replace(/([A-Za-z]:[\\/]+Users[\\/]+)[^\\/\r\n:*?"<>|]+/gi, '$1<user>')
        .replace(/(\/home\/)[^/\s]+/g, '$1<user>')
        .replace(/(\/Users\/)[^/\s]+/g, '$1<user>')
}
