# Discord Rich Presence (RPC)

Ce guide explique comment fonctionne le Discord Rich Presence dans le launcher DistrictLife et comment le configurer.

---

## Comment ça fonctionne

Quand un joueur lance Minecraft depuis le launcher, le launcher se connecte à Discord via IPC et affiche une activité sur le profil du joueur :

```
Joue à DistrictLife
┌─────────────────────────────────┐
│ [logo serveur]  Waiting for Client..   │
│                 Server: DistrictLife   │
│ [logo launcher] ⏱ depuis 5 min        │
└─────────────────────────────────┘
```

L'activité se met à jour automatiquement selon l'état du jeu :

| État | Texte affiché |
|------|--------------|
| Jeu en cours de chargement | `Loading game..` |
| Joueur en train de rejoindre | `Sailing to Westeros!` |
| Joueur connecté au serveur | `Playing DistrictLife` |

---

## Configuration dans `distribution.json`

Le RPC nécessite deux blocs de configuration.

### 1. Bloc global (racine du fichier)

```json
{
    "discord": {
        "clientId": "1488427560298876968",
        "smallImageKey": "seal-circle",
        "smallImageText": "DistrictLife"
    }
}
```

| Champ | Description |
|-------|-------------|
| `clientId` | ID de l'application Discord (voir ci-dessous) |
| `smallImageKey` | Clé de la petite image (logo du launcher) |
| `smallImageText` | Tooltip de la petite image |

### 2. Bloc serveur (dans chaque entrée `servers[]`)

```json
{
    "discord": {
        "shortId": "DistrictLife",
        "largeImageKey": "server-districtlife",
        "largeImageText": "DistrictLife - Forge 1.16.5"
    }
}
```

| Champ | Description |
|-------|-------------|
| `shortId` | Nom court affiché dans `Server: {shortId}` |
| `largeImageKey` | Clé de la grande image (logo du serveur) |
| `largeImageText` | Tooltip de la grande image |

---

## Créer une application Discord

1. Va sur [https://discord.com/developers/applications](https://discord.com/developers/applications)
2. Clique sur **New Application** → donne-lui le nom `DistrictLife`
3. Copie l'**Application ID** → c'est ton `clientId`
4. Va dans l'onglet **Rich Presence → Art Assets**
5. Upload les images et note leurs **clés** (`smallImageKey`, `largeImageKey`)

---

## Fichiers concernés

| Fichier | Rôle |
|---------|------|
| `app/assets/js/discordwrapper.js` | Initialisation, mise à jour et arrêt du RPC |
| `app/assets/js/scripts/landing.js` | Appelle `initRPC`, `updateDetails`, `shutdownRPC` |
| `app/assets/lang/en_US.toml` | Textes affichés (`[js.discord]`, `[js.landing.discord]`) |
| `distribution.ap-bts.wstr.fr/distribution.json` | Clés d'images et `clientId` |

---

## Personnaliser les textes

Dans `app/assets/lang/_custom.toml`, tu peux surcharger les textes par défaut :

```toml
[js.discord]
waiting = "En attente du client..."
state = "Serveur : {shortId}"

[js.landing.discord]
loading = "Chargement du jeu..."
joining = "Connexion au serveur..."
joined = "En jeu sur DistrictLife"
```

---

## Cycle de vie du RPC

```
Clic sur PLAY
     │
     ▼
initRPC()          ← démarre quand Minecraft se lance
     │
     ▼
updateDetails()    ← "Loading game.." pendant le chargement
     │
     ▼
updateDetails()    ← "Joining.." quand Sound Engine démarre
     │
     ▼
updateDetails()    ← "Joined" quand le joueur entre dans le serveur
     │
     ▼
shutdownRPC()      ← Minecraft se ferme
```

La détection du statut se fait en lisant le stdout de Minecraft :
- `Sound engine started` → joueur en train de charger
- `Connecting to default server` → joueur en train de rejoindre

Ces regex sont dans `landing.js` :
```js
const GAME_JOINED_REGEX = /\[.+\]: Sound engine started/
const SERVER_JOINED_REGEX = /\[.+\]: Connecting to default server/
```

---

## Dépannage

### Le RPC ne s'affiche pas
- Discord doit être ouvert **avant** de lancer Minecraft
- Vérifie que le `clientId` dans `distribution.json` est correct
- Vérifie dans Discord : **Paramètres → Activité** → que l'affichage est activé

### L'image ne s'affiche pas
- Les clés d'images sont sensibles à la casse
- L'image doit être uploadée dans l'onglet **Rich Presence → Art Assets** de l'application Discord
- Il peut y avoir un délai de quelques minutes après l'upload

### Erreur `ENOENT` dans les logs
- Discord n'est pas installé ou pas ouvert — le RPC est simplement désactivé silencieusement, ce n'est pas une erreur bloquante
