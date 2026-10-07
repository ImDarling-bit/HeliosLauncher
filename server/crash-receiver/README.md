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

```
crash-reports/
  2026-10-07/
    204109_Roket_e50e6c6e/
      meta.json          ← pseudo, version du launcher, code de sortie, OS, RAM, options Java
      crash-report.txt   ← le crash-report Minecraft (s'il y en a un)
      hs_err.log         ← crash natif de la JVM (rare)
      latest.log         ← fin de logs/latest.log
      debug.log          ← fin de logs/debug.log
```

Si le dossier ne peut pas être créé (droits), mets un autre chemin dans `config.php`
(`storage_dir`), de préférence en dehors de `httpdocs`.

## Réglages (`config.php`)

| Réglage | Rôle |
|---|---|
| `upload_key` | Doit être identique à `UPLOAD_KEY` dans `crashreporter.js`. Ce n'est pas un vrai secret (il est dans le launcher), juste un filtre anti-spam. |
| `storage_dir` | Dossier de stockage. |
| `max_reports_per_hour` | Nombre max de rapports par adresse IP et par heure (20). |
| `max_file_mb` | Taille max d'un fichier une fois décompressé (16 Mo). |
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
