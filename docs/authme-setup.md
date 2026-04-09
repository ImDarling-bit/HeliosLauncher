# Authentification en jeu avec AuthMe (Arclight + online-mode=false)

Ce guide explique comment forcer les joueurs à s'authentifier avec un mot de passe en jeu grâce à **AuthMe**, compatible avec Arclight (serveur hybride Forge + Bukkit).

---

## Contexte

Le serveur tourne en `online-mode=false` (nécessaire pour les comptes Azuriome). Sans protection supplémentaire, n'importe qui peut se connecter avec n'importe quel pseudo. AuthMe bloque les joueurs dès la connexion jusqu'à ce qu'ils s'authentifient.

```
Joueur rejoint le serveur
        │
        ▼
AuthMe bloque tous les mouvements / commandes
        │
        ▼
/register <mdp> <mdp>  (première fois)
/login <mdp>           (fois suivantes)
        │
        ▼
Accès au serveur
```

---

## Prérequis

- Serveur **Arclight** 1.16.5 (hybride Forge + Bukkit) — déjà en place
- `online-mode=false` dans `server.properties`
- Accès au dossier `plugins/` via Pterodactyl File Manager

---

## Étape 1 — Télécharger AuthMe

Télécharge la dernière version compatible 1.16.5 depuis :
```
https://github.com/AuthMe/AuthMeReloaded/releases
```

Prends le fichier `AuthMe-x.x.x.jar` et place-le dans le dossier `plugins/` du serveur.

---

## Étape 2 — Premier démarrage

Démarre (ou redémarre) le serveur. AuthMe génère automatiquement son dossier de configuration :

```
plugins/
└── AuthMe/
    ├── config.yml        ← configuration principale
    ├── messages/
    │   └── messages_fr.yml
    └── authme.db         ← base de données (SQLite par défaut)
```

---

## Étape 3 — Configurer `config.yml`

Ouvre `plugins/AuthMe/config.yml` et modifie les paramètres clés :

### Paramètres essentiels

```yaml
# Durée max pour se connecter avant d'être expulsé (en secondes)
settings:
  registration:
    timeout: 30          # temps pour s'enregistrer
  restrictions:
    allowedNicknames:    # laisser vide = tous les pseudos autorisés
    noTeleport: false
  sessions:
    sessionExpireInSeconds: 0  # 0 = pas de session persistante

# Langue des messages
settings:
  messagesLanguage: fr

# Forcer l'enregistrement
settings:
  registration:
    force: true          # OBLIGATOIRE — force tous les joueurs à s'enregistrer
    type: PASSWORD       # authentification par mot de passe
```

### Configurer la base de données (SQLite recommandé)

```yaml
DataSource:
  backend: SQLITE        # SQLite = pas besoin de MySQL
```

### Limiter les actions avant login

```yaml
settings:
  restrictions:
    allowMovement: false         # bloque les mouvements
    allowChat: false             # bloque le chat
    allowCommands:               # seules ces commandes sont autorisées avant login
      - /login
      - /l
      - /register
      - /reg
```

---

## Étape 4 — Messages en français

Crée ou modifie `plugins/AuthMe/messages/messages_fr.yml` :

```yaml
login_success: '&aConnexion réussie !'
wrong_password: '&cMot de passe incorrect.'
user_not_registered: '&cVous n''êtes pas enregistré. Tapez /register <mdp> <mdp>'
usage_register: '&cUsage: /register <mot_de_passe> <confirmation>'
usage_log_in: '&cUsage: /login <mot_de_passe>'
timeout: '&cTemps écoulé. Vous avez été expulsé.'
not_logged_in: '&cVous devez vous connecter ! Tapez /login <mot_de_passe>'
reg_msg: '&eBienvenue ! Enregistrez-vous avec /register <mdp> <mdp>'
login_msg: '&eConnectez-vous avec /login <mdp>'
```

---

## Étape 5 — Redémarrer et tester

Redémarre le serveur. Connecte-toi et vérifie que :

1. Tu es bloqué sur place dès la connexion
2. Le message d'enregistrement s'affiche
3. `/register motdepasse motdepasse` fonctionne
4. `/login motdepasse` fonctionne aux connexions suivantes

---

## Commandes utiles (admin)

| Commande | Description |
|----------|-------------|
| `/authme register <pseudo> <mdp>` | Enregistre un joueur manuellement |
| `/authme unregister <pseudo>` | Supprime le compte d'un joueur |
| `/authme changepassword <pseudo> <mdp>` | Change le mot de passe |
| `/authme forcelogin <pseudo>` | Force la connexion d'un joueur |
| `/authme accounts <pseudo>` | Voir les comptes liés à une IP |
| `/authme reload` | Recharge la configuration |

---

## Sécurité supplémentaire — Limiter les tentatives

Dans `config.yml` :

```yaml
Security:
  maxLoginTries: 5          # expulse après 5 tentatives échouées
  tempbanLength: 10         # ban temporaire de 10 minutes
```

---

## Intégration avec Azuriome (optionnel)

Pour que le mot de passe AuthMe soit le même que le mot de passe Azuriome, tu peux configurer AuthMe avec un backend MySQL pointant vers la base de données Azuriome, ou utiliser le hook AuthMe → Azuriome via le plugin **Azuriome Auth**.

Cette configuration avancée dépend de l'accès à la base de données MySQL d'Azuriome et n'est pas obligatoire pour un fonctionnement de base.

---

## Référence

- [AuthMe GitHub](https://github.com/AuthMe/AuthMeReloaded)
- [Documentation AuthMe](https://github.com/AuthMe/AuthMeReloaded/wiki)
- Configuration launcher : `online-mode=false` dans `server.properties`
