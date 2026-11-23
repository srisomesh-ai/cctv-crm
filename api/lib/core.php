<?php
// Core helpers: config, database, JSON in/out, sessions, roles, numbering, activity log.
declare(strict_types=1);

const APP_VERSION = '1.0.0';
const ROLES = ['admin' => 'Admin', 'manager' => 'Manager', 'sales' => 'Sales', 'technician' => 'Technician'];
const STAFF  = ['admin', 'manager'];            // full office access
const OFFICE = ['admin', 'manager', 'sales'];   // office users (not technicians)

$cfg = dirname(__DIR__, 2) . '/config.php';
if (!is_file($cfg)) {
    http_response_code(503);
    header('Content-Type: application/json');
    echo json_encode(['ok' => false, 'error' => 'Not installed yet. Copy config.sample.php to config.php and open install.php.', 'install' => true]);
    exit;
}
require $cfg;
foreach (['DEMO_MODE' => false, 'APP_TZ' => 'Asia/Kolkata', 'APP_URL' => ''] as $k => $v) if (!defined($k)) define($k, $v);
date_default_timezone_set(APP_TZ);

/* ---------------- Database ---------------- */

function db(): PDO {
    static $pdo = null;
    if (!$pdo) {
        $pdo = new PDO('mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4', DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        $pdo->exec("SET time_zone = '" . (new DateTime())->format('P') . "'");
    }
    return $pdo;
}
function q(string $sql, array $p = []): PDOStatement { $st = db()->prepare($sql); $st->execute($p); return $st; }
function row(string $sql, array $p = []): ?array { return q($sql, $p)->fetch() ?: null; }
function rows(string $sql, array $p = []): array { return q($sql, $p)->fetchAll(); }
function val(string $sql, array $p = []) { $v = q($sql, $p)->fetchColumn(); return $v === false ? null : $v; }

function insert(string $table, array $data): int {
    $cols = array_keys($data);
    q('INSERT INTO `' . $table . '` (`' . implode('`,`', $cols) . '`) VALUES (' . implode(',', array_fill(0, count($cols), '?')) . ')', array_values($data));
    return (int)db()->lastInsertId();
}
function update(string $table, int $id, array $data): void {
    if (!$data) return;
    $set = implode(',', array_map(fn($c) => "`$c`=?", array_keys($data)));
    q("UPDATE `$table` SET $set WHERE id=?", [...array_values($data), $id]);
}

/* ---------------- Request / response ---------------- */

function out($data = null): never {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode(['ok' => true, 'data' => $data], JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
    exit;
}
function fail(string $msg, int $code = 400): never {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

/** Request input: JSON body merged over query string */
function input(): array {
    static $in = null;
    if ($in === null) {
        $body = [];
        $raw = file_get_contents('php://input');
        if ($raw !== '' && str_contains((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'json')) $body = json_decode($raw, true) ?: [];
        $in = $body + $_POST + $_GET;
    }
    return $in;
}
function in(string $k, $default = null) { $v = input()[$k] ?? $default; return is_string($v) ? trim($v) : $v; }
function in_int(string $k, int $default = 0): int { $v = in($k); return is_numeric($v) ? (int)$v : $default; }
function need_id(string $k = 'id'): int { $id = in_int($k); if ($id < 1) fail('Missing ' . $k); return $id; }

/**
 * Pick allowed fields from input with types:
 *  s = text, t = long text, i = int, f = decimal, d = date (Y-m-d), dt = datetime, b = bool, e:a|b|c = one of
 * Empty values become NULL (or 0 for numbers when 'i0'/'f0').
 */
function pick(array $spec, ?array $src = null): array {
    $src ??= input();
    $o = [];
    foreach ($spec as $k => $t) {
        if (!array_key_exists($k, $src)) continue;
        $v = $src[$k];
        if (is_string($v)) $v = trim($v);
        $empty = $v === '' || $v === null;
        if (str_starts_with($t, 'e:')) {
            $allowed = explode('|', substr($t, 2));
            if (!in_array((string)$v, $allowed, true)) fail("Invalid value for $k");
            $o[$k] = (string)$v;
            continue;
        }
        $o[$k] = match ($t) {
            's'  => $empty ? null : mb_substr((string)$v, 0, 255),
            't'  => $empty ? null : mb_substr((string)$v, 0, 20000),
            'i'  => $empty ? null : (int)$v,
            'i0' => $empty ? 0 : (int)$v,
            'f'  => $empty ? null : round((float)$v, 2),
            'f0' => $empty ? 0 : round((float)$v, 2),
            'b'  => (int)(bool)$v,
            'd'  => $empty ? null : (preg_match('/^\d{4}-\d{2}-\d{2}/', (string)$v) ? substr((string)$v, 0, 10) : fail("Invalid date for $k")),
            'dt' => $empty ? null : ((($ts = strtotime(str_replace('T', ' ', (string)$v))) !== false) ? date('Y-m-d H:i:s', $ts) : fail("Invalid date/time for $k")),
            default => fail("Bad field type for $k", 500),
        };
    }
    return $o;
}
function require_fields(array $data, array $fields): void {
    foreach ($fields as $f => $label) if (!isset($data[$f]) || $data[$f] === '' || $data[$f] === null) fail("$label is required");
}
function clean_phone(?string $p): ?string {
    if ($p === null) return null;
    $d = preg_replace('/[^\d+]/', '', $p);
    return $d === '' ? null : $d;
}

/* ---------------- Sessions, login, roles ---------------- */

function start_session(): void {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
    session_name('crmsid');
    session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax', 'secure' => $https, 'path' => '/']);
    session_start();
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16));
}
function me(): ?array {
    static $u = false;
    if ($u !== false) return $u;
    start_session();
    $u = null;
    if (!empty($_SESSION['uid'])) {
        $u = row('SELECT id, name, email, phone, role, color, active FROM users WHERE id=?', [(int)$_SESSION['uid']]);
        if (!$u || !$u['active']) { $u = null; unset($_SESSION['uid']); }
    }
    return $u;
}
function uid(): int { return (int)(me()['id'] ?? 0); }
function role(): string { return (string)(me()['role'] ?? ''); }
function is_role(string ...$r): bool { return in_array(role(), $r, true); }
function require_role(string ...$r): void { if (!is_role(...$r)) fail('You do not have permission for this', 403); }

/* ---------------- Settings, numbering, activity ---------------- */

const DEFAULT_SETTINGS = [
    'company_name' => 'My CCTV Company', 'company_tagline' => 'CCTV · Security · Surveillance', 'company_phone' => '', 'company_email' => '',
    'company_address' => '', 'company_gstin' => '', 'company_state' => '', 'currency' => '₹', 'default_gst' => '18',
    'quote_prefix' => 'QT-', 'invoice_prefix' => 'INV-', 'job_prefix' => 'JB-', 'amc_prefix' => 'AMC-',
    'quote_terms' => "1. Prices valid for 15 days.\n2. 50% advance with order, balance on installation.\n3. Warranty as per manufacturer.\n4. Cabling beyond quoted length charged extra.",
    'invoice_terms' => "1. Goods once sold will not be taken back.\n2. Warranty as per manufacturer terms.\n3. Subject to local jurisdiction.",
    'bank_details' => '', 'upi_id' => '', 'sla_hours' => '24',
];
function settings(): array {
    static $s = null;
    if ($s === null) {
        $s = DEFAULT_SETTINGS;
        foreach (rows('SELECT k, v FROM settings') as $r) $s[$r['k']] = $r['v'];
    }
    return $s;
}
function setting(string $k): string { return (string)(settings()[$k] ?? ''); }
function set_setting(string $k, string $v): void { q('INSERT INTO settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v=VALUES(v)', [$k, $v]); }

/** Next running number for quote / invoice / job / amc, e.g. INV-2026-0042 (safe when two people save together) */
function next_no(string $type): string {
    $k = 'seq_' . $type . '_' . date('Y');
    q('INSERT INTO settings (k, v) VALUES (?, "1") ON DUPLICATE KEY UPDATE v = LAST_INSERT_ID(v + 1)', [$k]);
    $n = (int)db()->lastInsertId();
    if ($n === 0) $n = 1;
    return setting($type . '_prefix') . date('Y') . '-' . str_pad((string)$n, 4, '0', STR_PAD_LEFT);
}

/** Timeline entry on a lead / customer / job / doc / amc */
function log_activity(string $entity, int $id, string $kind, string $body): void {
    insert('activities', ['entity' => $entity, 'entity_id' => $id, 'user_id' => uid() ?: null, 'kind' => $kind, 'body' => mb_substr($body, 0, 5000)]);
}
function activities(string $entity, int $id): array {
    return rows('SELECT a.*, u.name AS user_name, u.color AS user_color FROM activities a LEFT JOIN users u ON u.id=a.user_id
                 WHERE a.entity=? AND a.entity_id=? ORDER BY a.id DESC LIMIT 200', [$entity, $id]);
}

/** SQL "LIKE" search over several columns */
function like_where(string $q, array $cols, array &$params): string {
    $q = trim($q);
    if ($q === '') return '1=1';
    $parts = [];
    foreach ($cols as $c) { $parts[] = "$c LIKE ?"; $params[] = '%' . $q . '%'; }
    return '(' . implode(' OR ', $parts) . ')';
}
