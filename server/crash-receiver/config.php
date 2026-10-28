<?php
// Configuration du receveur de rapports de crash (voir README.md).
return [
    // Doit être identique à UPLOAD_KEY dans app/assets/js/crashreporter.js.
    'upload_key' => 'dl-crash-2026-a7f3c91e',

    // Où ranger les rapports. Mets un dossier HORS du dossier public du site, pour que
    // personne ne puisse les télécharger depuis Internet. Par défaut : deux niveaux
    // au-dessus de ce fichier (ex. /var/www/vhosts/<domaine>/crash-reports).
    'storage_dir' => dirname(__DIR__, 2) . '/crash-reports',

    // Limites anti-abus.
    'max_reports_per_hour' => 20,          // par adresse IP (envois refusés compris)
    'max_reports_per_hour_global' => 300,  // tous joueurs confondus
    'max_file_mb' => 16,                   // par fichier, une fois décompressé
    'max_total_mb' => 40,                  // pour tout l'envoi
    'max_meta_kb' => 256,                  // taille du JSON meta
    'min_free_disk_mb' => 1024,            // en dessous, plus aucun rapport n'est écrit

    // Les rapports plus vieux que ça sont supprimés automatiquement (RGPD).
    'retention_days' => 90,
];
