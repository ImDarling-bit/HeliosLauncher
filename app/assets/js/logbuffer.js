/**
 * Garde en mémoire les dernières lignes de log du launcher (console du renderer, y
 * compris les logs du processus de téléchargement helios-core qui y sont relayés),
 * pour les joindre aux rapports d'erreur envoyés au serveur (voir crashreporter.js).
 *
 * Installé tout au début de preloader.js. Rien n'est écrit sur le disque.
 */
const util = require('util')

const MAX_LINES = 3000
const MAX_LINE_LENGTH = 4000
const ANSI = /\x1b\[[0-9;]*m/g

const lines = []

function format(args){
    return args.map(a => typeof a === 'string' ? a : util.inspect(a, { depth: 4, breakLength: 160 }))
        .join(' ')
        .replace(ANSI, '')
        .slice(0, MAX_LINE_LENGTH)
}

exports.install = function(){
    if(globalThis.__dlLogBufferInstalled) return
    globalThis.__dlLogBufferInstalled = true
    for(const level of ['log', 'info', 'warn', 'error', 'debug']){
        const original = console[level].bind(console)
        console[level] = (...args) => {
            try {
                lines.push(`[${new Date().toISOString()}] [${level}] ${format(args)}`)
                if(lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES)
            } catch(_err) {
                // Ne jamais casser un log à cause du tampon.
            }
            original(...args)
        }
    }
}

/**
 * @returns {string} Les dernières lignes de log, de la plus ancienne à la plus récente.
 */
exports.getText = function(){
    return lines.join('\n')
}
