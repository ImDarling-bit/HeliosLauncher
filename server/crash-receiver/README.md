# Receveur des rapports de crash

Script PHP qui reçoit les rapports de crash envoyés par le launcher
(`app/assets/js/crashreporter.js`) et les range sur le serveur.

## Installation (Plesk)

1. Dans le **Gestionnaire de fichiers** de `distribution.districtliferp.fr`, crée le
   dossier `crash/` à la racine du site (à côté de `distribution.json`).
2. Envoie-y `upload.php` et `config.php`.
3. Vérifie que l'adresse répond (une requête GET doit renvoyer `{"ok":false,"error":"POST uniquement"}`) :
   ```
   curl.exe https://distribution.districtliferp.fr/crash/upload.php
   ```

C'est tout : le launcher envoie déjà vers `https://distribution.districtliferp.fr/crash/upload.php`.

## Où sont les rapports ?

Par défaut dans le dossier `crash-reports/`, **deux niveaux au-dessus** de `upload.php`.
Avec Plesk, c'est en général `/var/www/vhosts/districtliferp.fr/crash-reports/`, en dehors
du dossier public : personne ne peut les télécharger depuis Internet. Tu y accèdes par le
Gestionnaire de fichiers de Plesk (racine de l'abonnement) ou en SFTP.

Les rapports sont rangés **par code d'erreur, puis par pseudo** :

```
crash-reports/
  OutOfMemoryError/
    Roket/
      2026-10-07_224236_d39ad515/
        meta.json          ← pseudo, version du launcher, code de sortie, OS, RAM, options Java
        crash-report.txt   ← le crash-report Minecraft (s'il y en a un)
        hs_err.log         ← crash natif de la JVM (rare)
        latest.log         ← fin de logs/latest.log
        debug.log          ← fin de logs/debug.log
  NoClassDefFoundError/
    Alex_42/
      …
  JVM_crash_natif/
  exit_-1/
```

Le **code d'erreur** est déterminé ainsi :
1. l'exception Java du crash-report, juste après `Description:` (ex. `java.lang.OutOfMemoryError: …` → `OutOfMemoryError`) ;
2. sinon `JVM_crash_natif` si Java lui-même a planté (`hs_err_pid*.log`) ;
3. sinon le code de sortie du jeu (`exit_-1`, `exit_1`…), quand le jeu s'est fermé anormalement sans crash-report.

Il est aussi enregistré dans `meta.json` (`"errorCode"`).

### Numéro de rapport

Après un crash, le launcher affiche au joueur un numéro court (`DL-7F3K-29QA`) à donner au
support. Il est envoyé dans `meta.json` (`"reportId"`) et sert de fin au nom du dossier
(`2026-10-07_224236_DL-7F3K-29QA`) : pour retrouver un rapport, cherche ce numéro dans
`crash-reports/` (ex. `find crash-reports -name '*DL-7F3K-29QA'`).

### Erreurs du launcher

Quand le **launcher** lui-même échoue (vérification ou téléchargement des fichiers,
chargement de la distribution, lancement du jeu…), il envoie aussi un rapport, rangé dans
`Launcher_<code>/<pseudo>/…` (ex. `Launcher_ENOENT`, `Launcher_ENOSPC`, `Launcher_Erreur`) :

- `meta.json` : `"type": "launcher"`, titre et message affichés au joueur, message et pile de
  l'erreur, code (`launcherErrorCode`), OS, RAM, dossier des données ;
- `launcher.log` : les ~3000 dernières lignes de log du launcher (jetons masqués).

Les situations normales (jeu déjà lancé, disque plein, compte non connecté…) ne sont pas
envoyées, et une même erreur n'est envoyée qu'une fois toutes les 10 minutes.

Si le dossier ne peut pas être créé (droits), mets un autre chemin dans `config.php`
(`storage_dir`), de préférence en dehors de `httpdocs`.

## Garde-fous

Le receveur refuse : un envoi sans la bonne clé, plus de 20 envois par heure et par IP (300 en tout),
un fichier vide, un fichier qui n'est pas du vrai gzip, un fichier trop gros avant ou après
décompression, un champ de fichier inconnu, un `meta` trop gros ou mal formé, et tout envoi si
le disque est presque plein. Un fichier binaire (octet nul) n'est pas gardé, le reste du rapport si.
Il refuse aussi d'écrire si `storage_dir` est dans le dossier public du site. Les fichiers sont
toujours enregistrés sous des noms fixes, jamais sous le nom envoyé.

Le launcher ne renvoie pas un rapport refusé (réponse 4xx hors 429) : il le jette pour ne pas
bloquer sa file d'attente.

## Réglages (`config.php`)

| Réglage | Rôle |
|---|---|
| `upload_key` | Doit être identique à `UPLOAD_KEY` dans `crashreporter.js`. Ce n'est pas un vrai secret (il est dans le launcher), juste un filtre anti-spam. |
| `storage_dir` | Dossier de stockage. |
| `max_reports_per_hour` | Nombre max d'envois par adresse IP et par heure, refusés compris (20). |
| `max_reports_per_hour_global` | Nombre max de rapports par heure, tous joueurs confondus (300). |
| `max_file_mb` | Taille max d'un fichier une fois décompressé (16 Mo). |
| `max_total_mb` | Taille max de tout l'envoi (40 Mo). |
| `max_meta_kb` | Taille max du JSON `meta` (256 Ko). |
| `min_free_disk_mb` | Espace disque minimum : en dessous, plus aucun rapport n'est écrit (1024 Mo). |
| `retention_days` | Les rapports plus vieux sont supprimés automatiquement (90 jours). |

## Données personnelles (RGPD)

- Le joueur est informé au premier lancement et peut désactiver l'envoi dans
  Paramètres → Launcher.
- Le launcher masque les jetons de connexion et le nom du compte de l'ordinateur dans
  les chemins avant l'envoi.
- L'adresse IP n'est pas enregistrée en clair (seulement une empreinte pour la limite
  anti-spam).
- Les rapports sont supprimés après `retention_days` jours.

Pense à mentionner cette collecte dans la politique de confidentialité du site.
