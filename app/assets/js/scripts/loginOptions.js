/**
 * Script for loginOptions.ejs — Azuriom authentication form.
 * Remplace l'ancien écran de choix Microsoft / Mojang.
 */

// Éléments du formulaire
const loginOptionsCancelContainer = document.getElementById('loginOptionCancelContainer')
const loginOptionCancelButton     = document.getElementById('loginOptionCancelButton')
const loginOptionsEmailError      = document.getElementById('loginOptionsEmailError')
const loginOptionsEmail           = document.getElementById('loginOptionsEmail')
const loginOptionsPasswordError   = document.getElementById('loginOptionsPasswordError')
const loginOptionsPassword        = document.getElementById('loginOptionsPassword')
const loginOptionsButton          = document.getElementById('loginOptionsButton')
const loginOptionsForm            = document.getElementById('loginOptionsForm')

// Variables de contrôle internes : email valide / mot de passe renseigné
let loe = false, lop = false

// ─── Variables de navigation (assignées depuis uibinder.js ou settings.js) ────
// loginOptionsViewOnLoginSuccess : vue cible après connexion réussie
// loginOptionsViewOnCancel       : vue cible si l'utilisateur annule
// loginOptionsViewCancelHandler  : callback optionnel à exécuter à l'annulation
// loginOptionsViewOnLoginCancel  : conservé pour compatibilité (plus utilisé)
let loginOptionsViewOnLoginSuccess = VIEWS.landing
let loginOptionsViewOnCancel       = VIEWS.loginOptions
let loginOptionsViewCancelHandler  = null
let loginOptionsViewOnLoginCancel  // compatibilité ascendante — non utilisé

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Affiche ou masque le bouton Annuler.
 * @param {boolean} val
 */
function loginOptionsCancelEnabled(val) {
    if(val) {
        $(loginOptionsCancelContainer).show()
    } else {
        $(loginOptionsCancelContainer).hide()
    }
}

/**
 * Affiche un message d'erreur sur un élément span.
 * @param {HTMLElement} element
 * @param {string} value
 */
function showLoginOptionsError(element, value) {
    element.innerHTML = value
    element.style.opacity = 1
}

/**
 * Anime un span d'erreur avec un effet de secousse.
 * @param {HTMLElement} element
 */
function shakeLoginOptionsError(element) {
    if(element.style.opacity == 1) {
        element.classList.remove('shake')
        void element.offsetWidth
        element.classList.add('shake')
    }
}

/**
 * Valide le champ email / identifiant (non vide).
 * @param {string} value
 */
function validateLoginOptionsEmail(value) {
    if(value) {
        loginOptionsEmailError.style.opacity = 0
        loe = true
        if(lop) loginOptionsDisabled(false)
    } else {
        loe = false
        showLoginOptionsError(loginOptionsEmailError, Lang.queryJS('loginOptions.error.requiredValue'))
        loginOptionsDisabled(true)
    }
}

/**
 * Valide le champ mot de passe (non vide).
 * @param {string} value
 */
function validateLoginOptionsPassword(value) {
    if(value) {
        loginOptionsPasswordError.style.opacity = 0
        lop = true
        if(loe) loginOptionsDisabled(false)
    } else {
        lop = false
        showLoginOptionsError(loginOptionsPasswordError, Lang.queryJS('loginOptions.error.requiredValue'))
        loginOptionsDisabled(true)
    }
}

// Validation en temps réel + shake au blur
loginOptionsEmail.addEventListener('focusout', (e) => {
    validateLoginOptionsEmail(e.target.value)
    shakeLoginOptionsError(loginOptionsEmailError)
})
loginOptionsPassword.addEventListener('focusout', (e) => {
    validateLoginOptionsPassword(e.target.value)
    shakeLoginOptionsError(loginOptionsPasswordError)
})
loginOptionsEmail.addEventListener('input', (e) => { validateLoginOptionsEmail(e.target.value) })
loginOptionsPassword.addEventListener('input', (e) => { validateLoginOptionsPassword(e.target.value) })

// ─── États du bouton ──────────────────────────────────────────────────────────

/**
 * Active ou désactive le bouton de connexion.
 * @param {boolean} v true = désactivé
 */
function loginOptionsDisabled(v) {
    if(loginOptionsButton.disabled !== v) {
        loginOptionsButton.disabled = v
    }
}

/**
 * Bascule l'état "chargement" du bouton (texte + spinner).
 * @param {boolean} v
 */
function loginOptionsLoading(v) {
    if(v) {
        loginOptionsButton.setAttribute('loading', true)
        loginOptionsButton.innerHTML = loginOptionsButton.innerHTML.replace(
            Lang.queryJS('loginOptions.login'),
            Lang.queryJS('loginOptions.loggingIn')
        )
    } else {
        loginOptionsButton.removeAttribute('loading')
        loginOptionsButton.innerHTML = loginOptionsButton.innerHTML.replace(
            Lang.queryJS('loginOptions.loggingIn'),
            Lang.queryJS('loginOptions.login')
        )
    }
}

/**
 * Active ou désactive tous les champs du formulaire.
 * @param {boolean} v true = désactivé
 */
function loginOptionsFormDisabled(v) {
    loginOptionsDisabled(v)
    loginOptionCancelButton.disabled = v
    loginOptionsEmail.disabled = v
    loginOptionsPassword.disabled = v
}

// ─── Annulation ───────────────────────────────────────────────────────────────

loginOptionCancelButton.onclick = (e) => {
    switchView(getCurrentView(), loginOptionsViewOnCancel, 500, 500, () => {
        loginOptionsEmail.value    = ''
        loginOptionsPassword.value = ''
        loginOptionsCancelEnabled(false)
        if(loginOptionsViewCancelHandler != null) {
            loginOptionsViewCancelHandler()
            loginOptionsViewCancelHandler = null
        }
    })
}

// Désactive le comportement par défaut du formulaire HTML
loginOptionsForm.onsubmit = () => { return false }

// ─── Soumission du formulaire ─────────────────────────────────────────────────

loginOptionsButton.addEventListener('click', () => {
    loginOptionsFormDisabled(true)
    loginOptionsLoading(true)

    AuthManager.addAzuriomAccount(loginOptionsEmail.value, loginOptionsPassword.value)
        .then((account) => {
            // Mise à jour du compte sélectionné dans la landing
            updateSelectedAccount(account)

            // Animation succès
            loginOptionsButton.innerHTML = loginOptionsButton.innerHTML.replace(
                Lang.queryJS('loginOptions.loggingIn'),
                Lang.queryJS('loginOptions.success')
            )
            $('.circle-loader').toggleClass('load-complete')
            $('.checkmark').toggle()

            setTimeout(() => {
                switchView(VIEWS.loginOptions, loginOptionsViewOnLoginSuccess, 500, 500, async () => {
                    if(loginOptionsViewOnLoginSuccess === VIEWS.settings) {
                        await prepareSettings()
                    }
                    // Réinitialisation pour la prochaine utilisation
                    loginOptionsViewOnLoginSuccess = VIEWS.landing
                    loginOptionsCancelEnabled(false)
                    loginOptionsViewCancelHandler = null
                    loginOptionsEmail.value    = ''
                    loginOptionsPassword.value = ''
                    loe = false
                    lop = false
                    $('.circle-loader').toggleClass('load-complete')
                    $('.checkmark').toggle()
                    loginOptionsLoading(false)
                    loginOptionsButton.innerHTML = loginOptionsButton.innerHTML.replace(
                        Lang.queryJS('loginOptions.success'),
                        Lang.queryJS('loginOptions.login')
                    )
                    loginOptionsFormDisabled(false)
                    loginOptionsDisabled(true) // désactivé tant que les champs sont vides
                })
            }, 1000)
        })
        .catch((err) => {
            loginOptionsLoading(false)

            const displayableError = (err && err.title) ? err : {
                title: Lang.queryJS('loginOptions.error.unknownTitle'),
                desc:  Lang.queryJS('loginOptions.error.unknownDesc')
            }

            setOverlayContent(displayableError.title, displayableError.desc, Lang.queryJS('loginOptions.tryAgain'))
            setOverlayHandler(() => {
                loginOptionsFormDisabled(false)
                toggleOverlay(false)
            })
            toggleOverlay(true)
        })
})
