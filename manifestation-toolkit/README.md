# Manifestation Toolkit

Application mobile open source, gratuite et anonyme pour les manifestations : chat local, carte
collaborative, fiches juridiques hors ligne et purge d'urgence. React Native + Expo (SDK 58) +
TypeScript, pour Android et iOS.

## Principes

- **Aucun compte.** Un pseudo + un UUID généré sur le téléphone (`Pseudo#48F2`). L'UUID complet
  ne quitte jamais l'appareil.
- **Utilisable à une main, sous stress.** Toutes les actions sont dans le tiers inférieur de
  l'écran ; le haut ne contient que de l'information.
- **Main maîtresse.** Réglage Gaucher / Droitier : le bouton PURGE, les boutons principaux
  (Envoyer, Signaler, Retour) et l'onglet le plus important passent du côté du pouce.
- **Lisible.** Mode sombre permanent (`#121212`), fort contraste, texte ≥ 18 px, cibles tactiles
  ≥ 56 px (64 px pour les actions principales), retour haptique.

## Modules

| Module | Fichier | Notes |
|---|---|---|
| Accueil / anonymat / rôle | `src/screens/OnboardingScreen.tsx` | Pseudo, rôle (Manifestant·e, Street medic, Ravitaillement, Protection), main |
| Réglages | `src/screens/SettingsScreen.tsx` | Main, rôle, partage de position |
| Chat local | `src/screens/ChatScreen.tsx`, `src/services/chatSocket.ts` | WebSocket, reconnexion auto, messages rapides en un tap |
| Carte | `src/screens/MapScreen.tsx`, `src/services/api.ts` | `react-native-maps`, signalements Danger / Nasse / Soins / Ravitaillement, expiration après 1 h |
| Droits (wiki hors ligne) | `src/screens/WikiScreen.tsx`, `src/data/wiki.json` | Embarqué dans l'app, recherche en bas d'écran |
| Purge d'urgence | `src/components/PanicButton.tsx` | Maintenir 0,8 s : coupe le réseau, vide la mémoire, `AsyncStorage.clear()`, retour à l'accueil |

La règle de placement se trouve dans `src/hooks/useHand.ts` : dans une rangée, les enfants sont
écrits `[secondaire…, PRINCIPAL]` et `flexDirection` vaut `row` (droitier) ou `row-reverse`
(gaucher).

### Ce que la purge efface (et n'efface pas)

Elle efface le profil, les réglages, l'historique du chat et le cache de la carte. Elle
n'efface **pas** l'app elle-même, les fiches juridiques (publiques, intégrées à l'app), le cache
de tuiles de la carte du système, ni ce que les serveurs ont déjà reçu.

## Démarrer

```bash
cd manifestation-toolkit
npm install
cp .env.example .env.local     # puis renseigne tes URLs
npx expo run:android           # ou: npx expo run:ios
```

`react-native-maps` est un module natif : l'app ne tourne pas dans Expo Go, il faut un build de
développement (`expo run:*`).

### Configuration

| Variable | Rôle |
|---|---|
| `EXPO_PUBLIC_WS_URL` | WebSocket du chat, ex. `wss://chat.mondomaine.org/ws` |
| `EXPO_PUBLIC_API_URL` | API REST de la carte, ex. `https://api.mondomaine.org` |
| `GOOGLE_MAPS_ANDROID_KEY` | Clé Google Maps SDK for Android (sans elle, la carte Android est vide) |

Le protocole attendu côté serveur est décrit dans [`docs/PROTOCOL.md`](docs/PROTOCOL.md).

### Vérifications

```bash
npm run typecheck
npm run lint
```

## Build & release automatiques

### Publier sur GitHub (Windows)

Double-clique sur `publier-github.bat`, à la racine de ce dossier. Le script :

1. crée le dépôt GitHub avec `gh` (ou réutilise celui déjà configuré) et pousse tout le code,
   GitHub Action compris ;
2. enregistre les URLs des serveurs et, en option, la clé Google Maps et le keystore Android ;
3. pousse un tag `vX.Y.Z`, ce qui lance le build ;
4. suit le build en direct, puis ouvre la Release.

Pour publier une mise à jour, modifie le code et relance le fichier.

Prérequis : [Git for Windows](https://git-scm.com/download/win) et
[GitHub CLI](https://cli.github.com) (`winget install GitHub.cli`).

### Le workflow

Deux copies existent :

- `.github/workflows/build-and-release.yml` **dans ce dossier** : pour le dépôt dédié (app à la
  racine), déclenché par les tags `v*` ;
- `.github/workflows/build-and-release.yml` **à la racine du dépôt du launcher** : app dans
  `manifestation-toolkit/`, déclenché par `toolkit-v*` pour ne pas croiser le `build.yml` du
  launcher (`v*`).

```bash
git tag v1.0.1 && git push origin v1.0.1   # dépôt dédié
```

Étapes :

1. **Ubuntu** : `expo prebuild` + `gradlew assembleRelease` → `app-release.apk`
2. **macOS** : `expo prebuild` + `xcodebuild archive` non signé → `app-release.ipa`
3. **Release GitHub** avec les deux fichiers. Si iOS échoue, l'APK est publié quand même.

À configurer dans *Settings → Secrets and variables → Actions* :

| Type | Nom | Requis |
|---|---|---|
| Variable | `EXPO_PUBLIC_WS_URL`, `EXPO_PUBLIC_API_URL` | oui |
| Secret | `GOOGLE_MAPS_ANDROID_KEY` | pour la carte Android |
| Secret | `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | recommandé (sinon clé de debug) |

Créer une clé Android et l'encoder :

```bash
keytool -genkeypair -v -keystore release.keystore -alias toolkit -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 release.keystore   # → secret ANDROID_KEYSTORE_BASE64
```

Garde cette clé précieusement : sans elle, les utilisateurs ne pourront pas mettre l'app à jour
sans la désinstaller.

### À propos de l'IPA iOS

Apple n'autorise l'installation que d'apps signées. L'IPA produit est **non signé** : il
s'installe via AltStore ou Sideloadly (qui le re-signent avec un identifiant Apple), ou doit être
signé avec un compte Apple Developer. Pour TestFlight / App Store, remplace l'étape
`xcodebuild` par `npx eas-cli build --platform ios --local --output app-release.ipa` avec tes
identifiants Apple configurés dans EAS.

## Avertissement juridique

Les fiches de `src/data/wiki.json` sont des informations générales sur le droit français. Elles
ne remplacent pas un·e avocat·e et doivent être relues régulièrement (champ `version`).
