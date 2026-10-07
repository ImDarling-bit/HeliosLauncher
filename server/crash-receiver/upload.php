<?php
/**
 * Receveur des rapports de crash du launcher DistrictLife.
 *
 * Le launcher (app/assets/js/crashreporter.js) envoie en POST multipart :
 *   - meta          : JSON (pseudo, version du launcher, code de sortie, OS, RAM…)
 *   - crash-report  : crash-report Minecraft compressé en gzip (facultatif)
 *   - hs-err        : crash natif de la JVM, gzip (facultatif)
 *   - latest-log    : logs/latest.log (fin du fichier), gzip (facultatif)
 *   - debug-log     : logs/debug.log (fin du fichier), gzip (facultatif)
 * avec l'en-tête X-DL-Crash-Key.
 *
 * Chaque rapport est décompressé et rangé dans :
 *   <STORAGE_DIR>/<AAAA-MM-JJ>/<HHMMSS>_<pseudo>_<id>/
 *       meta.json, crash-report.txt, hs_err.log, latest.log, debug.log
 *
 * Installation et configuration : voir README.md à côté de ce fichier.
 */

declare(strict_types=1);

$config = require __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

function reply(int $status, array $body): void
{
    http_response_code($status);
    echo json_encode($body);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    reply(405, ['ok' => false, 'error' => 'POST uniquement']);
}

$key = $_SERVER['HTTP_X_DL_CRASH_KEY'] ?? '';
if (!hash_equals($config['upload_key'], $key)) {
    reply(403, ['ok' => false, 'error' => 'clé invalide']);
}

$storage = rtrim($config['storage_dir'], '/\\');
if (!is_dir($storage) && !mkdir($storage, 0750, true)) {
    reply(500, ['ok' => false, 'error' => 'stockage indisponible']);
}

// --- Limite d'envois par IP (fenêtre glissante d'une heure) ---------------------
$ip = $_SERVER['REMOTE_ADDR'] ?? 'inconnue';
$ipHash = substr(hash('sha256', $ip . $config['upload_key']), 0, 16);
$rateDir = $storage . '/_ratelimit';
if (!is_dir($rateDir)) {
    mkdir($rateDir, 0750, true);
}
$rateFile = $rateDir . '/' . $ipHash . '.json';
$now = time();
$hits = is_file($rateFile) ? (json_decode((string) file_get_contents($rateFile), true) ?: []) : [];
$hits = array_values(array_filter($hits, fn($t) => is_int($t) && $t > $now - 3600));
if (count($hits) >= $config['max_reports_per_hour']) {
    reply(429, ['ok' => false, 'error' => 'trop de rapports, réessaie plus tard']);
}
$hits[] = $now;
file_put_contents($rateFile, json_encode($hits), LOCK_EX);

// --- Métadonnées --------------------------------------------------------------
$meta = json_decode($_POST['meta'] ?? '', true);
if (!is_array($meta)) {
    reply(400, ['ok' => false, 'error' => 'meta manquant ou invalide']);
}
$username = preg_match('/^[A-Za-z0-9_]{1,16}$/', (string) ($meta['username'] ?? ''))
    ? $meta['username'] : 'inconnu';

// --- Fichiers -----------------------------------------------------------------
// Champ du formulaire => nom du fichier enregistré.
$allowed = [
    'crash-report' => 'crash-report.txt',
    'hs-err'       => 'hs_err.log',
    'latest-log'   => 'latest.log',
    'debug-log'    => 'debug.log',
];
$maxBytes = $config['max_file_mb'] * 1024 * 1024;
$decoded = [];
foreach ($allowed as $field => $target) {
    if (!isset($_FILES[$field]) || $_FILES[$field]['error'] === UPLOAD_ERR_NO_FILE) {
        continue;
    }
    if ($_FILES[$field]['error'] !== UPLOAD_ERR_OK || $_FILES[$field]['size'] > $maxBytes) {
        reply(413, ['ok' => false, 'error' => "fichier $field refusé"]);
    }
    // Décompression bornée : on refuse tout ce qui dépasse la limite une fois décompressé.
    $gz = gzopen($_FILES[$field]['tmp_name'], 'rb');
    if ($gz === false) {
        reply(400, ['ok' => false, 'error' => "fichier $field illisible"]);
    }
    $content = '';
    while (!gzeof($gz)) {
        $content .= gzread($gz, 65536);
        if (strlen($content) > $maxBytes) {
            gzclose($gz);
            reply(413, ['ok' => false, 'error' => "fichier $field trop gros"]);
        }
    }
    gzclose($gz);
    $decoded[$target] = $content;
}
if (!$decoded) {
    reply(400, ['ok' => false, 'error' => 'aucun fichier']);
}

// --- Enregistrement -----------------------------------------------------------
$id = bin2hex(random_bytes(4));
$dir = sprintf('%s/%s/%s_%s_%s', $storage, date('Y-m-d'), date('His'), $username, $id);
if (!mkdir($dir, 0750, true)) {
    reply(500, ['ok' => false, 'error' => 'écriture impossible']);
}

$meta['receivedAt'] = date(DATE_ATOM);
$meta['ipHash'] = $ipHash; // pas d'IP en clair : juste de quoi regrouper les envois
file_put_contents("$dir/meta.json", json_encode($meta, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
foreach ($decoded as $name => $content) {
    file_put_contents("$dir/$name", $content);
}

// --- Nettoyage des vieux rapports (une fois sur 50 environ) ----------------------
if (random_int(1, 50) === 1) {
    $limit = date('Y-m-d', $now - $config['retention_days'] * 86400);
    foreach (glob($storage . '/[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]', GLOB_ONLYDIR) ?: [] as $day) {
        if (basename($day) < $limit) {
            $it = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($day, FilesystemIterator::SKIP_DOTS),
                RecursiveIteratorIterator::CHILD_FIRST
            );
            foreach ($it as $f) {
                $f->isDir() ? rmdir($f->getPathname()) : unlink($f->getPathname());
            }
            rmdir($day);
        }
    }
}

reply(200, ['ok' => true, 'id' => basename($dir)]);
