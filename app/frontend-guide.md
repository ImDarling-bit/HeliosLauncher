# Guide — Modifier le frontend de DistrictLife Launcher

## Vue d'ensemble de l'architecture frontend

```
app/
├── app.ejs              ← Point d'entrée HTML (charge tout)
├── frame.ejs            ← Barre de titre (boutons min/max/fermer)
├── landing.ejs          ← Écran principal (après connexion)
├── login.ejs            ← Formulaire Mojang (legacy)
├── loginOptions.ejs     ← Choix de connexion (Azuriom / Microsoft)
├── welcome.ejs          ← Écran de bienvenue (premier lancement)
├── waiting.ejs          ← Écran d'attente OAuth Microsoft
├── settings.ejs         ← Paramètres
├── overlay.ejs          ← Modale d'erreur/confirmation
├── assets/
│   ├── css/
│   │   ├── launcher.css   ← CSS de base upstream (ne pas toucher)
│   │   └── dl-theme.css   ← Thème DistrictLife (modifier ici)
│   ├── js/scripts/
│   │   ├── landing.js     ← Logique écran principal
│   │   ├── loginOptions.js
│   │   ├── settings.js
│   │   ├── uibinder.js    ← Navigation entre vues
│   │   └── uicore.js      ← Init IPC / chargement
│   └── lang/
│       └── _custom.toml   ← Tous les textes à personnaliser
```

---

## Règle d'or : ne jamais toucher aux IDs fonctionnels

Le JS du launcher cible des éléments par `id` et `class` précis. Supprimer ou renommer ces éléments casse silencieusement les fonctionnalités.

**IDs critiques à ne pas supprimer :**

| ID / Classe | Rôle fonctionnel |
|---|---|
| `#launch_button` | Déclenche le lancement de Minecraft |
| `#launch_progress` | Barre de progression téléchargement |
| `#launch_progress_label` | Pourcentage affiché |
| `#launch_details_text` | Texte d'état (validation, download…) |
| `#launch_content` / `#launch_details` | Toggles JS (affichage/masquage) |
| `#server_selection_button` | Sélection du serveur |
| `#player_count` | Compteur de joueurs (mis à jour par JS) |
| `#mojang_status_icon` | Point de statut Mojang |
| `#newsButton` | Bascule le panneau news |
| `#newsNavigateLeft/Right` | Navigation articles |
| `#user_text` | Nom du joueur connecté |
| `#avatarContainer` | Avatar joueur |
| `#image_seal_container` | Indicateur de mise à jour |
| `#landingContainer` | Conteneur principal (géré par `uibinder.js`) |

---

## 1. Modifier les textes et URLs

Tout passe par `app/assets/lang/_custom.toml`. Ce fichier surcharge `en_US.toml`.

```toml
[ejs.app]
title = "Mon Launcher"           # Titre de la fenêtre

[ejs.landing]
mediaDiscordURL   = "https://discord.gg/XXXXX"
mediaXURL         = "https://x.com/monserveur"
mediaInstagramURL = "#"          # "#" = désactiver le lien
mediaYouTubeURL   = "#"

[ejs.welcome]
welcomeHeader      = "BIENVENUE SUR MON SERVEUR"
welcomeDescription = "Description affichée à la première connexion."

[ejs.loginOptions]
azuriomSubheader = "CONNEXION MON SERVEUR"
loginButton      = "SE CONNECTER"
```

> Les clés `[ejs.*]` sont injectées dans les templates `.ejs` via `<%- lang('...') %>`.
> Les clés `[js.*]` sont utilisées dans les scripts JS via `Lang.queryJS('...')`.

---

## 2. Modifier le thème visuel

**Toutes les surcharges CSS vont dans `app/assets/css/dl-theme.css`.** Ce fichier est chargé *après* `launcher.css`, ses règles ont donc la priorité.

### Changer les couleurs principales

```css
/* Fond global */
body {
    background: #1a1a2e !important;
    color: #e0e0e0 !important;
}

/* Barre de titre */
#frameBar {
    background-color: #16213e !important;
}

/* Bouton Jouer */
#launch_button {
    background: #e94560 !important;
    color: #ffffff !important;
}
```

### Changer la police

Les polices sont déclarées dans `launcher.css` avec `@font-face`. Pour ajouter une police :

1. Placer le fichier `.ttf` / `.woff2` dans `app/assets/fonts/`
2. Dans `dl-theme.css` :

```css
@font-face {
    font-family: 'MaPolice';
    src: url('../fonts/MaPolice.ttf');
}

body, button {
    font-family: 'MaPolice', sans-serif !important;
}
```

### Changer le fond d'écran

Le fond est actuellement une image base64 inline dans `app/app.ejs` (ligne 12). Pour le remplacer par un fichier :

1. Ajouter l'image dans `app/assets/images/backgrounds/`
2. Dans `app/app.ejs`, remplacer la ligne du `background-image` :

```html
<style>
    body {
        background: url('assets/images/backgrounds/mon-fond.jpg') no-repeat center center fixed;
        background-size: cover;
        -webkit-user-select: none;
    }
</style>
```

> **Attention :** ne pas supprimer `background-size: cover` et `-webkit-user-select: none`.

---

## 3. Modifier le HTML d'une page

### Structure de `landing.ejs`

```
#landingContainer
├── #upper
│   ├── #left         → logo/sceau (invisible dans dl-theme, conservé pour JS)
│   ├── #content      → zone centrale (hero card injectée via landing.js)
│   └── #right        → user info + boutons médias
└── #lower
    ├── #left         → statut serveur / Mojang
    ├── #center       → bouton news
    └── #right        → bouton Jouer + progression
```

### Ajouter un élément visuel sans toucher au JS

La méthode sûre est d'ajouter du HTML autour des éléments existants, pas à l'intérieur :

```html
<!-- landing.ejs — exemple : bannière au-dessus du bouton jouer -->
<div id="right">
    <div class="bot_wrapper">
        <div id="launch_content">
            <!-- AJOUT OK : élément décoratif avant le bouton -->
            <div class="dl-server-badge">FORGE 1.16.5</div>

            <!-- NE PAS TOUCHER : requis par landing.js -->
            <button id="launch_button">...</button>
            <div class="bot_divider"></div>
            <button id="server_selection_button" ...>...</button>
        </div>
        <div id="launch_details">
            <!-- NE PAS TOUCHER : rempli dynamiquement -->
        </div>
    </div>
</div>
```

### Changer les icônes des réseaux sociaux

Les icônes sont des SVGs inline dans `landing.ejs`. Pour changer une icône, remplacer uniquement le contenu du `<svg>` — ne pas modifier l'`id` du `<a>` parent :

```html
<!-- Garder l'id et href intacts -->
<a href="<%- lang('landing.mediaDiscordURL') %>" class="mediaURL" id="discordURL">
    <!-- Remplacer uniquement le SVG -->
    <svg class="mediaSVG" viewBox="0 0 24 24">
        <path d="...nouveau chemin SVG..."/>
    </svg>
</a>
```

---

## 4. Modifier les logos et images

| Fichier | Usage |
|---|---|
| `app/assets/images/logo.png` | Logo affiché dans le sceau (`#image_seal`) |
| `app/assets/images/logo.ico` | Icône de la fenêtre Windows |
| `app/assets/images/LoadingSeal.png` | Image centrale de l'écran de chargement |
| `build/` | Icônes de l'installeur (512×512 PNG, ICO) |

> L'image `LoadingText.png` a été supprimée du projet — ne pas la référencer.

---

## 5. Ce qu'il ne faut jamais faire

| Action | Pourquoi c'est dangereux |
|---|---|
| Supprimer ou renommer un `id` listé ci-dessus | Le JS cherche l'élément par ID — `null` → crash silencieux ou erreur |
| Modifier `launcher.css` directement | Fichier upstream, sera écrasé à la prochaine mise à jour |
| Déplacer `#launch_details` hors de `#launch_content` | `landing.js` toggle ces deux divs ensemble |
| Retirer `display: none` de `#landingContainer` | La visibilité est gérée par `uibinder.js` |
| Toucher à `uicore.js` ou `uibinder.js` | Gèrent le cycle de vie des vues et l'IPC Electron |
| Modifier la structure de `frame.ejs` | Les boutons système sont liés à l'IPC main process |

---

## 6. Workflow recommandé

```bash
# 1. Lancer en mode dev (rechargement à chaud partiel)
npm start

# 2. Ouvrir les DevTools dans la fenêtre Electron
#    Ctrl+Shift+I (Windows) — inspecter les IDs, tester le CSS

# 3. Modifier dl-theme.css ou les .ejs

# 4. Relancer npm start pour voir les changements EJS
#    (les CSS sont pris en compte sans relance complète)
```

> Les fichiers `.ejs` ne se rechargent pas à chaud — un redémarrage `npm start` est nécessaire après chaque modification HTML.
