/**
 * Verrou de partie : sait si un jeu lancé par le launcher tourne encore, pour ne
 * jamais toucher au dossier mods pendant que Minecraft a ses .jar ouverts (sinon
 * NoClassDefFoundError / ClosedChannelException en jeu) et pour empêcher de lancer
 * une deuxième instance.
 *
 * Le PID du jeu est écrit dans <instance>/<serveur>/.dl-game.lock au lancement et le
 * fichier est supprimé à la fermeture du jeu. Le verrou survit donc à un redémarrage
 * du launcher (le jeu est lancé en mode détaché) : au prochain démarrage, on vérifie
 * que ce PID est toujours vivant ET que c'est bien un processus Java, pour ne pas être
 * trompé par un PID réutilisé par le système.
 */
const { execFile } = require('child_process')
const fs           = require('fs-extra')
const path         = require('path')

const ConfigManager = require('./configmanager')
const { LoggerUtil } = require('helios-core')

const logger = LoggerUtil.getLogger('GameLock')

const LOCK_FILE = '.dl-game.lock'

function lockPath(serverId){
    return path.join(ConfigManager.getInstanceDirectory(), serverId, LOCK_FILE)
}

function isPidAlive(pid){
    try {
        process.kill(pid, 0)
        return true
    } catch(err) {
        // EPERM : le processus existe mais appartient à un autre utilisateur.
        return err.code === 'EPERM'
    }
}

// Vérifie que le PID est un processus Java (java / javaw). En cas de doute (commande
// indisponible), on considère que oui : mieux vaut bloquer une mise à jour à tort que
// corrompre le dossier mods.
function isJavaProcess(pid){
    return new Promise(resolve => {
        const [cmd, args] = process.platform === 'win32'
            ? ['tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH']]
            : ['ps', ['-p', String(pid), '-o', 'comm=']]
        execFile(cmd, args, { windowsHide: true }, (err, stdout) => {
            if(err) return resolve(true)
            resolve(/java/i.test(stdout))
        })
    })
}

/**
 * Enregistre le processus du jeu qui vient d'être lancé et libère le verrou à sa
 * fermeture.
 *
 * @param {string} serverId Le serveur lancé.
 * @param {import('child_process').ChildProcess} child Le processus du jeu.
 */
exports.recordLaunch = function(serverId, child){
    const file = lockPath(serverId)
    try {
        fs.outputJsonSync(file, { pid: child.pid, startedAt: new Date().toISOString() })
    } catch(err) {
        logger.warn('Impossible d\'écrire le verrou de partie.', err)
    }
    child.once('exit', () => {
        fs.remove(file).catch(() => {})
    })
}

/**
 * Retourne le jeu lancé par le launcher qui tourne encore pour ce serveur, ou null.
 * Un verrou périmé (jeu fermé, crash, PC redémarré) est supprimé au passage.
 *
 * @param {string} serverId Le serveur.
 * @returns {Promise<{pid: number}|null>}
 */
exports.getRunningGame = async function(serverId){
    const file = lockPath(serverId)
    let lock
    try {
        lock = await fs.readJson(file)
    } catch(_err) {
        return null
    }
    if(lock?.pid && isPidAlive(lock.pid) && await isJavaProcess(lock.pid)){
        return { pid: lock.pid }
    }
    await fs.remove(file).catch(() => {})
    return null
}

/**
 * Ferme le jeu et attend qu'il soit réellement arrêté (max ~15 s).
 *
 * @param {number} pid Le PID du jeu.
 * @returns {Promise<boolean>} true si le jeu est fermé.
 */
exports.closeGame = async function(pid){
    try {
        process.kill(pid)
    } catch(err) {
        if(err.code === 'ESRCH') return true
        logger.error('Impossible de fermer le jeu.', err)
        return false
    }
    for(let i = 0; i < 30; i++){
        if(!isPidAlive(pid)) return true
        await new Promise(r => setTimeout(r, 500))
    }
    return !isPidAlive(pid)
}
