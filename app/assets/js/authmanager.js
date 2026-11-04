/**
 * AuthManager
 * 
 * This module aims to abstract login procedures. Results from Mojang's REST api
 * are retrieved through our Mojang module. These results are processed and stored,
 * if applicable, in the config using the ConfigManager. All login procedures should
 * be made through this module.
 * 
 * @module authmanager
 */
// Requirements
const ConfigManager          = require('./configmanager')
const { LoggerUtil }         = require('helios-core')
const { RestResponseStatus } = require('helios-core/common')
const { MojangRestAPI, MojangErrorCode } = require('helios-core/mojang')
const { MicrosoftAuth, MicrosoftErrorCode } = require('helios-core/microsoft')
const { AZURE_CLIENT_ID }    = require('./ipcconstants')
const Lang = require('./langloader')
const { AuthClient }         = require('azuriom-auth')

// Client Azuriom — URL du site sans slash final
const azuriomClient = new AuthClient('https://www.districtliferp.fr')

const log = LoggerUtil.getLogger('AuthManager')

// Error messages

function microsoftErrorDisplayable(errorCode) {
    switch (errorCode) {
        case MicrosoftErrorCode.NO_PROFILE:
            return {
                title: Lang.queryJS('auth.microsoft.error.noProfileTitle'),
                desc: Lang.queryJS('auth.microsoft.error.noProfileDesc')
            }
        case MicrosoftErrorCode.NO_XBOX_ACCOUNT:
            return {
                title: Lang.queryJS('auth.microsoft.error.noXboxAccountTitle'),
                desc: Lang.queryJS('auth.microsoft.error.noXboxAccountDesc')
            }
        case MicrosoftErrorCode.XBL_BANNED:
            return {
                title: Lang.queryJS('auth.microsoft.error.xblBannedTitle'),
                desc: Lang.queryJS('auth.microsoft.error.xblBannedDesc')
            }
        case MicrosoftErrorCode.UNDER_18:
            return {
                title: Lang.queryJS('auth.microsoft.error.under18Title'),
                desc: Lang.queryJS('auth.microsoft.error.under18Desc')
            }
        case MicrosoftErrorCode.UNKNOWN:
            return {
                title: Lang.queryJS('auth.microsoft.error.unknownTitle'),
                desc: Lang.queryJS('auth.microsoft.error.unknownDesc')
            }
    }
}

function mojangErrorDisplayable(errorCode) {
    switch(errorCode) {
        case MojangErrorCode.ERROR_METHOD_NOT_ALLOWED:
            return {
                title: Lang.queryJS('auth.mojang.error.methodNotAllowedTitle'),
                desc: Lang.queryJS('auth.mojang.error.methodNotAllowedDesc')
            }
        case MojangErrorCode.ERROR_NOT_FOUND:
            return {
                title: Lang.queryJS('auth.mojang.error.notFoundTitle'),
                desc: Lang.queryJS('auth.mojang.error.notFoundDesc')
            }
        case MojangErrorCode.ERROR_USER_MIGRATED:
            return {
                title: Lang.queryJS('auth.mojang.error.accountMigratedTitle'),
                desc: Lang.queryJS('auth.mojang.error.accountMigratedDesc')
            }
        case MojangErrorCode.ERROR_INVALID_CREDENTIALS:
            return {
                title: Lang.queryJS('auth.mojang.error.invalidCredentialsTitle'),
                desc: Lang.queryJS('auth.mojang.error.invalidCredentialsDesc')
            }
        case MojangErrorCode.ERROR_RATELIMIT:
            return {
                title: Lang.queryJS('auth.mojang.error.tooManyAttemptsTitle'),
                desc: Lang.queryJS('auth.mojang.error.tooManyAttemptsDesc')
            }
        case MojangErrorCode.ERROR_INVALID_TOKEN:
            return {
                title: Lang.queryJS('auth.mojang.error.invalidTokenTitle'),
                desc: Lang.queryJS('auth.mojang.error.invalidTokenDesc')
            }
        case MojangErrorCode.ERROR_ACCESS_TOKEN_HAS_PROFILE:
            return {
                title: Lang.queryJS('auth.mojang.error.tokenHasProfileTitle'),
                desc: Lang.queryJS('auth.mojang.error.tokenHasProfileDesc')
            }
        case MojangErrorCode.ERROR_CREDENTIALS_MISSING:
            return {
                title: Lang.queryJS('auth.mojang.error.credentialsMissingTitle'),
                desc: Lang.queryJS('auth.mojang.error.credentialsMissingDesc')
            }
        case MojangErrorCode.ERROR_INVALID_SALT_VERSION:
            return {
                title: Lang.queryJS('auth.mojang.error.invalidSaltVersionTitle'),
                desc: Lang.queryJS('auth.mojang.error.invalidSaltVersionDesc')
            }
        case MojangErrorCode.ERROR_UNSUPPORTED_MEDIA_TYPE:
            return {
                title: Lang.queryJS('auth.mojang.error.unsupportedMediaTypeTitle'),
                desc: Lang.queryJS('auth.mojang.error.unsupportedMediaTypeDesc')
            }
        case MojangErrorCode.ERROR_GONE:
            return {
                title: Lang.queryJS('auth.mojang.error.accountGoneTitle'),
                desc: Lang.queryJS('auth.mojang.error.accountGoneDesc')
            }
        case MojangErrorCode.ERROR_UNREACHABLE:
            return {
                title: Lang.queryJS('auth.mojang.error.unreachableTitle'),
                desc: Lang.queryJS('auth.mojang.error.unreachableDesc')
            }
        case MojangErrorCode.ERROR_NOT_PAID:
            return {
                title: Lang.queryJS('auth.mojang.error.gameNotPurchasedTitle'),
                desc: Lang.queryJS('auth.mojang.error.gameNotPurchasedDesc')
            }
        case MojangErrorCode.UNKNOWN:
            return {
                title: Lang.queryJS('auth.mojang.error.unknownErrorTitle'),
                desc: Lang.queryJS('auth.mojang.error.unknownErrorDesc')
            }
        default:
            throw new Error(`Unknown error code: ${errorCode}`)
    }
}

// Functions

/**
 * Add a Mojang account. This will authenticate the given credentials with Mojang's
 * authserver. The resultant data will be stored as an auth account in the
 * configuration database.
 * 
 * @param {string} username The account username (email if migrated).
 * @param {string} password The account password.
 * @returns {Promise.<Object>} Promise which resolves the resolved authenticated account object.
 */
exports.addMojangAccount = async function(username, password) {
    try {
        const response = await MojangRestAPI.authenticate(username, password, ConfigManager.getClientToken())
        console.log(response)
        if(response.responseStatus === RestResponseStatus.SUCCESS) {

            const session = response.data
            if(session.selectedProfile != null){
                const ret = ConfigManager.addMojangAuthAccount(session.selectedProfile.id, session.accessToken, username, session.selectedProfile.name)
                if(ConfigManager.getClientToken() == null){
                    ConfigManager.setClientToken(session.clientToken)
                }
                ConfigManager.save()
                return ret
            } else {
                return Promise.reject(mojangErrorDisplayable(MojangErrorCode.ERROR_NOT_PAID))
            }

        } else {
            return Promise.reject(mojangErrorDisplayable(response.mojangErrorCode))
        }
        
    } catch (err){
        log.error(err)
        return Promise.reject(mojangErrorDisplayable(MojangErrorCode.UNKNOWN))
    }
}

const AUTH_MODE = { FULL: 0, MS_REFRESH: 1, MC_REFRESH: 2 }

/**
 * Perform the full MS Auth flow in a given mode.
 * 
 * AUTH_MODE.FULL = Full authorization for a new account.
 * AUTH_MODE.MS_REFRESH = Full refresh authorization.
 * AUTH_MODE.MC_REFRESH = Refresh of the MC token, reusing the MS token.
 * 
 * @param {string} entryCode FULL-AuthCode. MS_REFRESH=refreshToken, MC_REFRESH=accessToken
 * @param {*} authMode The auth mode.
 * @returns An object with all auth data. AccessToken object will be null when mode is MC_REFRESH.
 */
async function fullMicrosoftAuthFlow(entryCode, authMode) {
    try {

        let accessTokenRaw
        let accessToken
        if(authMode !== AUTH_MODE.MC_REFRESH) {
            const accessTokenResponse = await MicrosoftAuth.getAccessToken(entryCode, authMode === AUTH_MODE.MS_REFRESH, AZURE_CLIENT_ID)
            if(accessTokenResponse.responseStatus === RestResponseStatus.ERROR) {
                return Promise.reject(microsoftErrorDisplayable(accessTokenResponse.microsoftErrorCode))
            }
            accessToken = accessTokenResponse.data
            accessTokenRaw = accessToken.access_token
        } else {
            accessTokenRaw = entryCode
        }
        
        const xblResponse = await MicrosoftAuth.getXBLToken(accessTokenRaw)
        if(xblResponse.responseStatus === RestResponseStatus.ERROR) {
            return Promise.reject(microsoftErrorDisplayable(xblResponse.microsoftErrorCode))
        }
        const xstsResonse = await MicrosoftAuth.getXSTSToken(xblResponse.data)
        if(xstsResonse.responseStatus === RestResponseStatus.ERROR) {
            return Promise.reject(microsoftErrorDisplayable(xstsResonse.microsoftErrorCode))
        }
        const mcTokenResponse = await MicrosoftAuth.getMCAccessToken(xstsResonse.data)
        if(mcTokenResponse.responseStatus === RestResponseStatus.ERROR) {
            return Promise.reject(microsoftErrorDisplayable(mcTokenResponse.microsoftErrorCode))
        }
        const mcProfileResponse = await MicrosoftAuth.getMCProfile(mcTokenResponse.data.access_token)
        if(mcProfileResponse.responseStatus === RestResponseStatus.ERROR) {
            return Promise.reject(microsoftErrorDisplayable(mcProfileResponse.microsoftErrorCode))
        }
        return {
            accessToken,
            accessTokenRaw,
            xbl: xblResponse.data,
            xsts: xstsResonse.data,
            mcToken: mcTokenResponse.data,
            mcProfile: mcProfileResponse.data
        }
    } catch(err) {
        log.error(err)
        return Promise.reject(microsoftErrorDisplayable(MicrosoftErrorCode.UNKNOWN))
    }
}

/**
 * Calculate the expiry date. Advance the expiry time by 10 seconds
 * to reduce the liklihood of working with an expired token.
 * 
 * @param {number} nowMs Current time milliseconds.
 * @param {number} epiresInS Expires in (seconds)
 * @returns 
 */
function calculateExpiryDate(nowMs, epiresInS) {
    return nowMs + ((epiresInS-10)*1000)
}

/**
 * Add a Microsoft account. This will pass the provided auth code to Mojang's OAuth2.0 flow.
 * The resultant data will be stored as an auth account in the configuration database.
 * 
 * @param {string} authCode The authCode obtained from microsoft.
 * @returns {Promise.<Object>} Promise which resolves the resolved authenticated account object.
 */
exports.addMicrosoftAccount = async function(authCode) {

    const fullAuth = await fullMicrosoftAuthFlow(authCode, AUTH_MODE.FULL)

    // Advance expiry by 10 seconds to avoid close calls.
    const now = new Date().getTime()

    const ret = ConfigManager.addMicrosoftAuthAccount(
        fullAuth.mcProfile.id,
        fullAuth.mcToken.access_token,
        fullAuth.mcProfile.name,
        calculateExpiryDate(now, fullAuth.mcToken.expires_in),
        fullAuth.accessToken.access_token,
        fullAuth.accessToken.refresh_token,
        calculateExpiryDate(now, fullAuth.accessToken.expires_in)
    )
    ConfigManager.save()

    return ret
}

/**
 * Remove a Mojang account. This will invalidate the access token associated
 * with the account and then remove it from the database.
 * 
 * @param {string} uuid The UUID of the account to be removed.
 * @returns {Promise.<void>} Promise which resolves to void when the action is complete.
 */
exports.removeMojangAccount = async function(uuid){
    try {
        const authAcc = ConfigManager.getAuthAccount(uuid)
        const response = await MojangRestAPI.invalidate(authAcc.accessToken, ConfigManager.getClientToken())
        if(response.responseStatus === RestResponseStatus.SUCCESS) {
            ConfigManager.removeAuthAccount(uuid)
            ConfigManager.save()
            return Promise.resolve()
        } else {
            log.error('Error while removing account', response.error)
            return Promise.reject(response.error)
        }
    } catch (err){
        log.error('Error while removing account', err)
        return Promise.reject(err)
    }
}

/**
 * Remove a Microsoft account. It is expected that the caller will invoke the OAuth logout
 * through the ipc renderer.
 * 
 * @param {string} uuid The UUID of the account to be removed.
 * @returns {Promise.<void>} Promise which resolves to void when the action is complete.
 */
exports.removeMicrosoftAccount = async function(uuid){
    try {
        ConfigManager.removeAuthAccount(uuid)
        ConfigManager.save()
        return Promise.resolve()
    } catch (err){
        log.error('Error while removing account', err)
        return Promise.reject(err)
    }
}

/**
 * Validate the selected account with Mojang's authserver. If the account is not valid,
 * we will attempt to refresh the access token and update that value. If that fails, a
 * new login will be required.
 * 
 * @returns {Promise.<boolean>} Promise which resolves to true if the access token is valid,
 * otherwise false.
 */
async function validateSelectedMojangAccount(){
    const current = ConfigManager.getSelectedAccount()
    const response = await MojangRestAPI.validate(current.accessToken, ConfigManager.getClientToken())

    if(response.responseStatus === RestResponseStatus.SUCCESS) {
        const isValid = response.data
        if(!isValid){
            const refreshResponse = await MojangRestAPI.refresh(current.accessToken, ConfigManager.getClientToken())
            if(refreshResponse.responseStatus === RestResponseStatus.SUCCESS) {
                const session = refreshResponse.data
                ConfigManager.updateMojangAuthAccount(current.uuid, session.accessToken)
                ConfigManager.save()
            } else {
                log.error('Error while validating selected profile:', refreshResponse.error)
                log.info('Account access token is invalid.')
                return false
            }
            log.info('Account access token validated.')
            return true
        } else {
            log.info('Account access token validated.')
            return true
        }
    }
    
}

/**
 * Validate the selected account with Microsoft's authserver. If the account is not valid,
 * we will attempt to refresh the access token and update that value. If that fails, a
 * new login will be required.
 * 
 * @returns {Promise.<boolean>} Promise which resolves to true if the access token is valid,
 * otherwise false.
 */
async function validateSelectedMicrosoftAccount(){
    const current = ConfigManager.getSelectedAccount()
    const now = new Date().getTime()
    const mcExpiresAt = current.expiresAt
    const mcExpired = now >= mcExpiresAt

    if(!mcExpired) {
        return true
    }

    // MC token expired. Check MS token.

    const msExpiresAt = current.microsoft.expires_at
    const msExpired = now >= msExpiresAt

    if(msExpired) {
        // MS expired, do full refresh.
        try {
            const res = await fullMicrosoftAuthFlow(current.microsoft.refresh_token, AUTH_MODE.MS_REFRESH)

            ConfigManager.updateMicrosoftAuthAccount(
                current.uuid,
                res.mcToken.access_token,
                res.accessToken.access_token,
                res.accessToken.refresh_token,
                calculateExpiryDate(now, res.accessToken.expires_in),
                calculateExpiryDate(now, res.mcToken.expires_in)
            )
            ConfigManager.save()
            return true
        } catch(_err) {
            return false
        }
    } else {
        // Only MC expired, use existing MS token.
        try {
            const res = await fullMicrosoftAuthFlow(current.microsoft.access_token, AUTH_MODE.MC_REFRESH)

            ConfigManager.updateMicrosoftAuthAccount(
                current.uuid,
                res.mcToken.access_token,
                current.microsoft.access_token,
                current.microsoft.refresh_token,
                current.microsoft.expires_at,
                calculateExpiryDate(now, res.mcToken.expires_in)
            )
            ConfigManager.save()
            return true
        }
        catch(_err) {
            return false
        }
    }
}

/**
 * Add an Azuriom account. Authenticates with the Azuriom API and stores
 * the result in the configuration database.
 *
 * @param {string} email    The user's email address on the Azuriom site.
 * @param {string} password The user's password.
 * @returns {Promise.<Object>} Resolves with the stored account object.
 */
exports.addAzuriomAccount = async function(email, password) {
    // Espaces en début et en fin retirés : un copier-coller en ajoute souvent un, et le
    // site refusait alors un mot de passe pourtant correct.
    email = String(email ?? '').trim()
    password = String(password ?? '').trim()
    const failKey = email.toLowerCase()
    let response
    try {
        response = await azuriomClient.login(email, password)
    } catch(err) {
        log.error('Azuriom login error', err)
        // itty-fetcher lève un objet avec « status » (code HTTP) quand le site répond une
        // erreur, et une vraie erreur réseau (TypeError « fetch failed », code système)
        // quand le site ne répond pas.
        const httpStatus = typeof err?.status === 'number' ? err.status : null
        if(httpStatus === 401 || httpStatus === 422) {
            return Promise.reject(credentialFailure(email, err, httpStatus))
        }
        const unreachable = httpStatus == null
        const title = Lang.queryJS(unreachable ? 'auth.azuriom.error.unreachableTitle' : 'auth.azuriom.error.unknownTitle')
        const desc = Lang.queryJS(unreachable ? 'auth.azuriom.error.unreachableDesc' : 'auth.azuriom.error.unknownDesc')
        const reportId = CrashReporter().reportAuthError({
            kind: 'login',
            code: unreachable ? 'SITE_INJOIGNABLE' : `HTTP_${httpStatus}`,
            email, title, description: desc, error: err,
            extra: { httpStatus }
        })
        return Promise.reject({ title, desc: withSupport(desc, reportId) })
    }

    if(response.status !== 'success') {
        // Mot de passe ou email refusé : rapport seulement à partir du 3e échec d'affilée.
        if(response.reason === 'invalid_credentials' || response.status === 'error' && !response.reason) {
            return Promise.reject(credentialFailure(email, response, null))
        }
        // Autre refus du site (double authentification, compte banni, email non
        // vérifié…) : bloquant, toujours envoyé.
        const title = Lang.queryJS('auth.azuriom.error.unknownTitle')
        const reason = response.requires2fa ? '2FA' : String(response.reason || 'REFUS').toUpperCase()
        const desc = response.requires2fa
            ? Lang.queryJS('auth.azuriom.error.twoFactorDesc')
            : (typeof response.message === 'string' && response.message ? escapeHtml(response.message) : Lang.queryJS('auth.azuriom.error.unknownDesc'))
        const reportId = CrashReporter().reportAuthError({
            kind: 'login', code: reason, email, title, description: desc, response
        })
        return Promise.reject({ title, desc: withSupport(desc, reportId) })
    }

    loginFailures.delete(failKey)
    const ret = ConfigManager.addAzuriomAuthAccount(
        response.uuid,
        response.accessToken,
        email,
        response.username
    )
    ConfigManager.save()
    return ret
}

// Échecs « mauvais identifiants » d'affilée, par email (remis à zéro à la connexion).
const loginFailures = new Map()
const LOGIN_FAILURES_BEFORE_REPORT = 3

function credentialFailure(email, detail, httpStatus){
    const key = email.toLowerCase()
    const count = (loginFailures.get(key) ?? 0) + 1
    loginFailures.set(key, count)
    const title = Lang.queryJS('auth.azuriom.error.invalidCredentialsTitle')
    const desc = Lang.queryJS('auth.azuriom.error.invalidCredentialsDesc')
    if(count < LOGIN_FAILURES_BEFORE_REPORT) return { title, desc }
    const reportId = CrashReporter().reportAuthError({
        kind: 'login', code: 'IDENTIFIANTS', email, title, description: desc,
        response: detail, extra: { httpStatus, consecutiveFailures: count }
    })
    return { title, desc: withSupport(desc, reportId) }
}

function escapeHtml(text){
    return String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[c])
}

/** Ajoute au message la ligne du support (numéro du rapport s'il y en a un). */
function withSupport(desc, reportId){
    return desc + '<br><br>' + (reportId
        ? Lang.queryJS('support.reportSent', { id: reportId })
        : Lang.queryJS('support.contact'))
}
exports.withSupport = withSupport

// Chargé à la demande : crashreporter.js dépend de ConfigManager, déjà initialisé ici.
function CrashReporter(){
    return require('./crashreporter')
}

/**
 * Remove an Azuriom account. Invalidates the token server-side then
 * removes the account from the local configuration database.
 *
 * @param {string} uuid The UUID of the account to remove.
 * @returns {Promise.<void>}
 */
exports.removeAzuriomAccount = async function(uuid) {
    try {
        const authAcc = ConfigManager.getAuthAccount(uuid)
        if(authAcc) {
            await azuriomClient.logout(authAcc.accessToken)
        }
    } catch(err) {
        // Token peut déjà être expiré — on ignore l'erreur de logout
        log.warn('Azuriom logout failed (token may already be invalid):', err.message)
    }
    ConfigManager.removeAuthAccount(uuid)
    ConfigManager.save()
    return Promise.resolve()
}

/**
 * Validate the selected Azuriom account by verifying the access token
 * against the Azuriom API.
 *
 * @returns {Promise.<boolean>} True si le token est valide, false sinon.
 */
async function validateSelectedAzuriomAccount() {
    const current = ConfigManager.getSelectedAccount()
    try {
        await azuriomClient.verify(current.accessToken)
        log.info('Azuriom account token validated.')
        return true
    } catch(err) {
        // Network error → auth server unreachable → allow offline play with stored token
        const isNetworkError = err.code === 'ECONNREFUSED'
            || err.code === 'ENOTFOUND'
            || err.code === 'ETIMEDOUT'
            || err.code === 'ECONNRESET'
            || err.type === 'system'
        if(isNetworkError) {
            log.warn('Azuriom auth server unreachable, proceeding offline:', err.message)
            return true
        }
        log.warn('Azuriom token validation failed:', err.message)
        // Session perdue : le compte va être retiré du launcher, on envoie tout ce qu'on
        // sait pour comprendre pourquoi (réponse du site, compte concerné).
        lastSessionReportId = CrashReporter().reportAuthError({
            kind: 'session',
            code: typeof err?.status === 'number' ? `HTTP_${err.status}` : 'PERDUE',
            email: current?.username ?? null,
            username: current?.displayName ?? null,
            uuid: current?.uuid ?? null,
            title: Lang.queryJS('uibinder.validateAccount.failedMessageTitle'),
            description: 'Session refusée par le site, le compte a été retiré du launcher.',
            error: err,
            extra: { httpStatus: typeof err?.status === 'number' ? err.status : null }
        })
        return false
    }
}

let lastSessionReportId = null
/** Numéro du rapport envoyé lors de la dernière session perdue (ou null). */
exports.consumeSessionReportId = function(){
    const id = lastSessionReportId
    lastSessionReportId = null
    return id
}

/**
 * Validate the selected auth account.
 *
 * @returns {Promise.<boolean>} Promise which resolves to true if the access token is valid,
 * otherwise false.
 */
exports.validateSelected = async function(){
    const current = ConfigManager.getSelectedAccount()

    if(current.type === 'microsoft') {
        return await validateSelectedMicrosoftAccount()
    } else if(current.type === 'azuriom') {
        return await validateSelectedAzuriomAccount()
    } else {
        return await validateSelectedMojangAccount()
    }

}
