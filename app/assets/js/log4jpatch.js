/**
 * Correctif log4j (Log4Shell et suites) : Forge 1.16.5 fournit log4j 2.15.0, qui bloque
 * l'attaque principale mais pas les failles corrigées ensuite (2.16, 2.17). Le launcher
 * télécharge donc log4j 2.17.1 depuis Maven Central, vérifie l'empreinte SHA-1 officielle,
 * et le met à la place de 2.15.0 au lancement du jeu.
 *
 * Tout ou rien : si un des trois fichiers manque ou ne correspond pas, on garde la version
 * fournie par Forge et le jeu se lance normalement.
 */
const crypto  = require('crypto')
const fs      = require('fs-extra')
const path    = require('path')

const VERSION = '2.17.1'
const MAVEN = 'https://repo1.maven.org/maven2/org/apache/logging/log4j'

// Empreintes publiées par Apache sur Maven Central (fichiers .sha1).
const LIBS = [
    { artifact: 'log4j-api', sha1: 'd771af8e336e372fb5399c99edabe0919aeaf5b2' },
    { artifact: 'log4j-core', sha1: '779f60f3844dadc3ef597976fcb1e5127b1f343d' },
    { artifact: 'log4j-slf4j18-impl', sha1: 'ca499d751f4ddd8afb016ef698c30be0da1d09f7' }
]

/** Argument JVM ajouté en plus (sans effet néfaste, protège aussi une version plus ancienne). */
exports.JVM_ARGS = ['-Dlog4j2.formatMsgNoLookups=true']

async function sha1Of(file) {
    const hash = crypto.createHash('sha1')
    hash.update(await fs.readFile(file))
    return hash.digest('hex')
}

async function isValid(file, sha1) {
    try {
        return await fs.pathExists(file) && await sha1Of(file) === sha1
    } catch (_err) {
        return false
    }
}

/**
 * Télécharge (si besoin) et vérifie log4j 2.17.1.
 *
 * @param {string} commonDir Dossier commun du launcher.
 * @param {(url: string, to: string) => Promise<void>} download Fonction de téléchargement.
 * @param {{info: Function, warn: Function}} logger
 * @returns {Promise<{[id: string]: string} | null>} Chemins par identifiant Maven sans version
 *          (ex. org.apache.logging.log4j:log4j-core), ou null si le correctif n'est pas prêt.
 */
exports.ensure = async function(commonDir, download, logger) {
    const out = {}
    for (const lib of LIBS) {
        const file = path.join(commonDir, 'libraries', 'org', 'apache', 'logging', 'log4j',
            lib.artifact, VERSION, `${lib.artifact}-${VERSION}.jar`)
        if (!await isValid(file, lib.sha1)) {
            try {
                await fs.ensureDir(path.dirname(file))
                logger.info(`Téléchargement de ${lib.artifact} ${VERSION}…`)
                await download(`${MAVEN}/${lib.artifact}/${VERSION}/${lib.artifact}-${VERSION}.jar`, file)
            } catch (err) {
                logger.warn(`Correctif log4j : téléchargement de ${lib.artifact} impossible (${err.message}).`)
                return null
            }
            if (!await isValid(file, lib.sha1)) {
                logger.warn(`Correctif log4j : empreinte de ${lib.artifact} incorrecte, fichier supprimé.`)
                await fs.remove(file).catch(() => {})
                return null
            }
        }
        out[`org.apache.logging.log4j:${lib.artifact}`] = file
    }
    return out
}
