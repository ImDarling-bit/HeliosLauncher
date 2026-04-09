# Restreindre l'accès au serveur aux joueurs Azuriome

Ce guide explique comment configurer le serveur Minecraft pour n'accepter **que les joueurs authentifiés via Azuriome** (c'est-à-dire ceux qui utilisent le launcher DistrictLife).

---

## Prérequis

- Un serveur Minecraft Forge 1.16.5 fonctionnel
- Un site Azuriome accessible publiquement (`https://azuriom.ap-bts.wstr.fr`)
- Accès au script de démarrage du serveur

---

## Comment ça fonctionne

Le launcher DistrictLife utilise déjà **authlib-injector** côté client pour rediriger l'authentification Minecraft vers Azuriome. En ajoutant le même outil côté serveur, les deux parlent la même langue :

```
Joueur (launcher)                  Serveur Minecraft
      │                                   │
authlib-injector (client)      authlib-injector (serveur)
      │                                   │
      └──────────► Azuriome API ◄─────────┘
```

- Joueur **sans le launcher** → auth Mojang → **connexion refusée**
- Joueur **avec le launcher + compte Azuriome** → **connexion acceptée**

---

## Étape 1 — Télécharger authlib-injector

Télécharge la dernière version depuis GitHub :

```
https://github.com/yushijinhun/authlib-injector/releases
```

Place le fichier `authlib-injector-x.x.x.jar` dans le dossier racine de ton serveur.

> La version utilisée par le launcher DistrictLife est la **1.2.5**. Utilise de préférence la même version pour éviter toute incompatibilité.

---

## Étape 2 — Modifier le script de démarrage

Ajoute l'argument `-javaagent` **avant** le `-jar` dans ta commande de lancement.

Ajoute `-javaagent:authlib-injector-1.2.5.jar=https://azuriom.ap-bts.wstr.fr` **avant** le `-jar`, en conservant tous les autres arguments existants.

### Script actuel → Script modifié

```bash
# Avant
java -Xms128M -XX:MaxRAMPercentage=95.0 -Dterminal.jline=false -Dterminal.ansi=true -jar server.jar nogui

# Après
java -Xms128M -XX:MaxRAMPercentage=95.0 -Dterminal.jline=false -Dterminal.ansi=true -javaagent:authlib-injector-1.2.5.jar=https://azuriom.ap-bts.wstr.fr -jar server.jar nogui
```

> **Important :** L'URL passée à authlib-injector est la **racine de ton site Azuriome**, sans chemin supplémentaire. authlib-injector découvre automatiquement l'API via `/.well-known/yggdrasil-alt-api-key`.

---

## Côté launcher — aucune modification nécessaire

Le launcher DistrictLife gère authlib-injector automatiquement. Le fichier `authlib-injector-1.2.5.jar` est distribué via `distribution.json` et le `processbuilder.js` l'injecte au démarrage de Minecraft :

```js
// processbuilder.js:435
const authlibInjectorJar = path.join(this.commonDir, 'authlib-injector', 'authlib-injector-1.2.5.jar')
if(this.yggdrasilPort && fs.existsSync(authlibInjectorJar)) {
    args.push(`-javaagent:${authlibInjectorJar}=http://127.0.0.1:${this.yggdrasilPort}`)
}
```

---

## Étape 3 — Configurer `server.properties`

Assure-toi que le mode en ligne est activé :

```properties
online-mode=true
```

> Si `online-mode=false`, le serveur n'effectue aucune vérification d'identité et n'importe qui peut se connecter avec n'importe quel pseudo.

---

## Étape 4 — Vérifier que Azuriome expose bien l'API Yggdrasil

Dans un navigateur, ouvre :

```
https://azuriom.ap-bts.wstr.fr/.well-known/yggdrasil-alt-api-key
```

Tu dois obtenir une réponse JSON. Si la page renvoie une erreur 404, vérifie que le plugin **Azuriome Auth** est bien installé et activé sur ton site Azuriome.

---

## Étape 5 — Redémarrer le serveur

Arrête le serveur puis relance-le avec le nouveau script. Au démarrage, tu dois voir dans les logs :

```
[authlib-injector] Authentication server: https://azuriom.ap-bts.wstr.fr
```

---

## Résultat attendu

| Situation | Résultat |
|-----------|----------|
| Joueur avec le launcher + compte Azuriome | ✅ Connexion acceptée |
| Joueur sans le launcher (client vanilla/autre) | ❌ `Failed to verify username` |
| Joueur cracké (offline) | ❌ Refusé (online-mode=true) |

---

## Dépannage

### `Failed to verify username`
- Vérifie que le joueur utilise bien le launcher DistrictLife
- Vérifie que son compte Azuriome est actif

### `Invalid session` au moment de la connexion
- authlib-injector n'est peut-être pas chargé côté serveur → vérifie ton script de démarrage
- Le site Azuriome est inaccessible depuis le serveur → vérifie le réseau

### Le serveur démarre mais l'API Azuriome répond lentement
- Azuriome doit être accessible depuis l'IP du serveur Minecraft
- Vérifie que le pare-feu n'y bloque pas les connexions sortantes HTTPS

---

## Référence

- [authlib-injector GitHub](https://github.com/yushijinhun/authlib-injector)
- [Azuriome Documentation](https://azuriom.com/docs)
- Configuration launcher : `app/assets/js/authmanager.js`
