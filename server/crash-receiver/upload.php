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
 *   - launcher-log  : derniers logs du launcher, gzip (rapports "type": "launcher")
 * avec l'en-tête X-DL-Crash-Key.
 *
 * Chaque rapport est décompressé et rangé par code d'erreur, puis par pseudo :
 *   <STORAGE_DIR>/<code d'erreur>/<pseudo>/<AAAA-MM-JJ_HHMMSS>_<id>/
 *       meta.json, crash-report.txt, hs_err.log, latest.log, debug.log
 * Le code d'erreur est l'exception Java du crash-report (ex. NoClassDefFoundError,
 * OutOfMemoryError), « JVM_crash_natif » pour un crash de la JVM, sinon le code de
 * sortie du jeu (ex. exit_-1) — voir errorCode() plus bas.
 *
 * Garde-fous : clé, limite par IP et limite globale par heure, taille par fichier et
 * totale (avant et après décompression), vrai gzip non vide uniquement, texte uniquement
 * (pas de fichier binaire), meta limité en taille et en profondeur, espace disque minimum,
 * stockage refusé s'il est dans le dossier public du site.
 *
 * Installation et configuration : voir README.md à côté de ce fichier.
 */

declare(strict_types=1);

$config = (require __DIR__ . '/config.php') + [
    // Valeurs par défaut des réglages ajoutés après coup (un ancien config.php reste valable).
    'max_reports_per_hour'        => 20,
    'max_reports_per_hour_global' => 300,
    'max_file_mb'                 => 16,
    'max_total_mb'                => 40,
    'max_meta_kb'                 => 256,
    'min_free_disk_mb'            => 1024,
    'retention_days'              => 90,
];

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

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
if (!is_string($key) || !hash_equals((string) $config['upload_key'], $key)) {
    reply(403, ['ok' => false, 'error' => 'clé invalide']);
}

// Requête trop grosse dans son ensemble : refusée avant de lire quoi que ce soit.
$maxBytes = (int) $config['max_file_mb'] * 1024 * 1024;
$maxTotal = (int) $config['max_total_mb'] * 1024 * 1024;
if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > $maxTotal) {
    reply(413, ['ok' => false, 'error' => 'envoi trop gros']);
}

// --- Stockage -----------------------------------------------------------------
$storage = rtrim((string) $config['storage_dir'], '/\\');
if (!is_dir($storage) && !mkdir($storage, 0750, true)) {
    reply(500, ['ok' => false, 'error' => 'stockage indisponible']);
}
// Les rapports ne doivent jamais être téléchargeables : on refuse un stockage placé dans
// le dossier public du site (erreur de config.php).
$realStorage = realpath($storage);
$docRoot = realpath((string) ($_SERVER['DOCUMENT_ROOT'] ?? ''));
if ($realStorage === false || ($docRoot !== false && $docRoot !== ''
        && strpos($realStorage . DIRECTORY_SEPARATOR, rtrim($docRoot, '/\\') . DIRECTORY_SEPARATOR) === 0)) {
    reply(500, ['ok' => false, 'error' => 'stockage mal configuré']);
}
// Ceinture et bretelles si le dossier se retrouvait quand même exposé (Apache).
if (!is_file($storage . '/.htaccess')) {
    @file_put_contents($storage . '/.htaccess', "Require all denied\nDeny from all\n");
}
// Disque presque plein : on n'écrit plus rien (évite qu'un envoi en masse remplisse le serveur).
$free = @disk_free_space($storage);
if ($free !== false && $free < (int) $config['min_free_disk_mb'] * 1024 * 1024) {
    reply(507, ['ok' => false, 'error' => 'stockage plein']);
}

// --- Limites d'envois (fenêtre glissante d'une heure) ----------------------------
$rateDir = $storage . '/_ratelimit';
if (!is_dir($rateDir)) {
    mkdir($rateDir, 0750, true);
}
$now = time();

/**
 * Compte un envoi dans $file et dit si la limite est atteinte. Verrou exclusif pendant la
 * lecture et l'écriture, pour que des envois simultanés ne passent pas tous à travers.
 */
function rateLimited(string $file, int $max, int $now): bool
{
    $h = fopen($file, 'c+');
    if ($h === false) {
        return false;
    }
    flock($h, LOCK_EX);
    $hits = json_decode((string) stream_get_contents($h), true);
    $hits = array_values(array_filter(is_array($hits) ? $hits : [], fn($t) => is_int($t) && $t > $now - 3600));
    $limited = count($hits) >= $max;
    if (!$limited) {
        $hits[] = $now;
        ftruncate($h, 0);
        rewind($h);
        fwrite($h, json_encode($hits));
    }
    flock($h, LOCK_UN);
    fclose($h);
    return $limited;
}

$ip = $_SERVER['REMOTE_ADDR'] ?? 'inconnue';
$ipHash = substr(hash('sha256', $ip . $config['upload_key']), 0, 16);
if (rateLimited($rateDir . '/_global.json', (int) $config['max_reports_per_hour_global'], $now)) {
    reply(429, ['ok' => false, 'error' => 'trop de rapports, réessaie plus tard']);
}
if (rateLimited($rateDir . '/' . $ipHash . '.json', (int) $config['max_reports_per_hour'], $now)) {
    reply(429, ['ok' => false, 'error' => 'trop de rapports, réessaie plus tard']);
}

// --- Métadonnées --------------------------------------------------------------
$rawMeta = $_POST['meta'] ?? '';
if (!is_string($rawMeta) || $rawMeta === '' || strlen($rawMeta) > (int) $config['max_meta_kb'] * 1024) {
    reply(400, ['ok' => false, 'error' => 'meta manquant ou invalide']);
}
$meta = json_decode($rawMeta, true, 8);
if (!is_array($meta) || isset($meta[0])) {
    reply(400, ['ok' => false, 'error' => 'meta manquant ou invalide']);
}
$username = preg_match('/^[A-Za-z0-9_]{1,16}$/', (string) ($meta['username'] ?? ''))
    ? $meta['username'] : 'inconnu';

// --- Fichiers -----------------------------------------------------------------
// Champ du formulaire => nom du fichier enregistré (jamais le nom envoyé par le client).
$allowed = [
    'crash-report' => 'crash-report.txt',
    'hs-err'       => 'hs_err.log',
    'latest-log'   => 'latest.log',
    'debug-log'    => 'debug.log',
    'launcher-log' => 'launcher.log',   // erreurs du launcher (type "launcher")
];
// Champs de fichier inconnus : refusés plutôt qu'ignorés en silence.
foreach (array_keys($_FILES) as $field) {
    if (!isset($allowed[$field])) {
        reply(400, ['ok' => false, 'error' => 'champ inconnu']);
    }
}

$decoded = [];
$total = 0;
foreach ($allowed as $field => $target) {
    if (!isset($_FILES[$field]) || $_FILES[$field]['error'] === UPLOAD_ERR_NO_FILE) {
        continue;
    }
    $f = $_FILES[$field];
    // Un seul fichier par champ (pas de tableau field[]=…).
    if (is_array($f['error']) || $f['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) {
        reply(400, ['ok' => false, 'error' => "fichier $field refusé"]);
    }
    if ($f['size'] <= 0 || $f['size'] > $maxBytes) {
        reply(413, ['ok' => false, 'error' => "fichier $field vide ou trop gros"]);
    }
    // Vrai gzip uniquement : gzopen() lirait sinon le fichier brut sans rien dire.
    $magic = (string) file_get_contents($f['tmp_name'], false, null, 0, 2);
    if ($magic !== "\x1f\x8b") {
        reply(400, ['ok' => false, 'error' => "fichier $field : gzip attendu"]);
    }
    // Décompression bornée : on refuse tout ce qui dépasse la limite une fois décompressé.
    $gz = gzopen($f['tmp_name'], 'rb');
    if ($gz === false) {
        reply(400, ['ok' => false, 'error' => "fichier $field illisible"]);
    }
    $content = '';
    while (!gzeof($gz)) {
        $chunk = gzread($gz, 65536);
        if ($chunk === false) {
            gzclose($gz);
            reply(400, ['ok' => false, 'error' => "fichier $field corrompu"]);
        }
        $content .= $chunk;
        if (strlen($content) > $maxBytes || $total + strlen($content) > $maxTotal) {
            gzclose($gz);
            reply(413, ['ok' => false, 'error' => "fichier $field trop gros"]);
        }
    }
    gzclose($gz);
    // Contenu vide une fois décompressé : rien à garder.
    if (trim($content) === '') {
        continue;
    }
    // Les rapports sont des journaux texte : un octet nul trahit un fichier binaire, qu'on
    // ne garde pas (le reste du rapport est conservé).
    if (strpos($content, "\0") !== false) {
        continue;
    }
    $total += strlen($content);
    $decoded[$target] = $content;
}
if (!$decoded) {
    reply(400, ['ok' => false, 'error' => 'aucun fichier exploitable']);
}

// --- Code d'erreur (premier niveau de dossier) ---------------------------------
/**
 * Exception Java qui a fait planter le jeu, lue dans le crash-report :
 * « java.lang.NoClassDefFoundError: com/x/Y » donne « NoClassDefFoundError ».
 * À défaut : « JVM_crash_natif » (hs_err_pid*.log), puis le code de sortie.
 */
function errorCode(array $decoded, array $meta): string
{
    // Erreur du launcher lui-même (échec de téléchargement, de lancement…) :
    // Launcher_<code système ou type d'erreur>, ex. Launcher_ENOENT.
    if (($meta['type'] ?? '') === 'launcher') {
        $code = preg_replace('/[^A-Za-z0-9_]/', '', (string) ($meta['launcherErrorCode'] ?? ''));
        return 'Launcher_' . ($code !== '' ? substr($code, 0, 40) : 'Erreur');
    }
    $report = $decoded['crash-report.txt'] ?? '';
    // Après « Description: », la première ligne du type pkg.NomException / pkg.NomError.
    $afterDescription = preg_split('/^Description:.*$/m', $report, 2)[1] ?? $report;
    if (preg_match('/^\s*(?:[a-z_$][\w$]*\.)+([A-Z][\w$]*(?:Exception|Error|Throwable))\b/m', $afterDescription, $m)) {
        return substr($m[1], 0, 60);
    }
    if (isset($decoded['hs_err.log'])) {
        return 'JVM_crash_natif';
    }
    $exit = $meta['exitCode'] ?? null;
    return is_int($exit) ? 'exit_' . $exit : 'inconnu';
}
// Nom de dossier sûr : lettres, chiffres, _ et - seulement (jamais « . » ni « .. »).
$code = preg_replace('/[^A-Za-z0-9_-]/', '_', errorCode($decoded, $meta));
$meta['errorCode'] = $code;

// --- Enregistrement -----------------------------------------------------------
// Numéro court généré par le launcher (DL-XXXX-XXXX), affiché au joueur pour le
// support : il sert d'identifiant du dossier. À défaut (ancien launcher), id aléatoire.
$reportId = preg_match('/^DL-[A-Z0-9]{4}-[A-Z0-9]{4}$/', (string) ($meta['reportId'] ?? ''))
    ? $meta['reportId'] : null;
$id = $reportId ?? bin2hex(random_bytes(4));
$dir = sprintf('%s/%s/%s/%s_%s', $storage, $code, $username, date('Y-m-d_His'), $id);
if (is_dir($dir)) {
    $dir .= '_' . bin2hex(random_bytes(2));   // même numéro renvoyé dans la même seconde
}
if (!mkdir($dir, 0750, true)) {
    reply(500, ['ok' => false, 'error' => 'écriture impossible']);
}

$meta['receivedAt'] = date(DATE_ATOM);
$meta['ipHash'] = $ipHash; // pas d'IP en clair : juste de quoi regrouper les envois
file_put_contents("$dir/meta.json", json_encode($meta, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE));
foreach ($decoded as $name => $content) {
    file_put_contents("$dir/$name", $content);
    @chmod("$dir/$name", 0640);
}

// --- Nettoyage des vieux rapports (une fois sur 50 environ) ----------------------
// Chaque rapport est daté par le nom de son dossier (AAAA-MM-JJ_HHMMSS_id) ; les
// dossiers pseudo / code d'erreur devenus vides sont supprimés aussi.
function removeTree(string $path): void
{
    $it = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($path, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    foreach ($it as $f) {
        $f->isDir() ? rmdir($f->getPathname()) : unlink($f->getPathname());
    }
    rmdir($path);
}
if (random_int(1, 50) === 1) {
    $limit = date('Y-m-d', $now - (int) $config['retention_days'] * 86400);
    foreach (glob($storage . '/*/*/[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]_*', GLOB_ONLYDIR) ?: [] as $report) {
        if (substr(basename($report), 0, 10) < $limit) {
            removeTree($report);
        }
    }
    foreach (glob($storage . '/*/*', GLOB_ONLYDIR) ?: [] as $player) {
        if (!(new FilesystemIterator($player))->valid()) {
            rmdir($player);
        }
    }
    foreach (glob($storage . '/*', GLOB_ONLYDIR) ?: [] as $codeDir) {
        if (basename($codeDir) !== '_ratelimit' && !(new FilesystemIterator($codeDir))->valid()) {
            rmdir($codeDir);
        }
    }
    // Compteurs d'IP sans envoi depuis plus d'une heure.
    foreach (glob($rateDir . '/*.json') ?: [] as $rf) {
        if (filemtime($rf) < $now - 3600) {
            @unlink($rf);
        }
    }
}

reply(200, ['ok' => true, 'id' => "$code/$username/" . basename($dir), 'reportId' => $reportId]);
