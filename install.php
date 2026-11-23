<?php
// One-time setup: creates the tables, your admin login, and (optionally) demo data.
// After setup this page only says "already installed" — it never overwrites data.
declare(strict_types=1);

// Step 1: database details → test the connection → write config.php
if (!is_file(__DIR__ . '/config.php')) {
    $dbStep = true;
    $db = ['host' => 'localhost', 'name' => '', 'user' => '', 'pass' => ''];
    if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['db_name'])) {
        foreach ($db as $k => $_) $db[$k] = trim((string)($_POST['db_' . $k] ?? ''));
        try {
            new PDO('mysql:host=' . $db['host'] . ';dbname=' . $db['name'] . ';charset=utf8mb4', $db['user'], $db['pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
            $e = fn($v) => var_export($v, true);
            $cfg = "<?php\n// Written by install.php. Never stored in Git.\n"
                 . 'define(\'DB_HOST\', ' . $e($db['host']) . ");\ndefine('DB_NAME', " . $e($db['name']) . ");\ndefine('DB_USER', " . $e($db['user']) . ");\ndefine('DB_PASS', " . $e($db['pass']) . ");\n"
                 . "define('DEMO_MODE', " . (!empty($_POST['demo_mode']) ? 'true' : 'false') . ");\ndefine('APP_TZ', 'Asia/Kolkata');\n";
            if (@file_put_contents(__DIR__ . '/config.php', $cfg) === false) $err = 'Could not save config.php — check folder permissions.';
            else { header('Location: install.php'); exit; }
        } catch (Throwable $ex) {
            $err = 'Could not connect to the database: ' . $ex->getMessage();
        }
    }
} else {
    // Load the API code without running a request
    function route(string $a, string $m, ?array $r, callable $f): void {}
    require __DIR__ . '/api/lib/core.php';
    require __DIR__ . '/api/lib/schema.php';
    require __DIR__ . '/api/lib/seed.php';
    foreach (glob(__DIR__ . '/api/modules/*.php') as $m) require $m;
    try {
        install_schema();
        $installed = (int)val('SELECT COUNT(*) FROM users') > 0;
    } catch (Throwable $e) {
        $msg = 'Database error: ' . htmlspecialchars($e->getMessage()) . '<br>Check the details in config.php.';
    }
    if (!isset($msg) && $installed) {
        $msg = '✅ Already installed. <a href="./">Open the CRM →</a>';
    } elseif (!isset($msg) && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $name = trim((string)($_POST['name'] ?? ''));
        $email = mb_strtolower(trim((string)($_POST['email'] ?? '')));
        $pass = (string)($_POST['password'] ?? '');
        if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($pass) < 6) {
            $err = 'Enter your name, a valid email and a password of at least 6 characters.';
        } else {
            insert('users', ['name' => $name, 'email' => $email, 'role' => 'admin', 'password_hash' => password_hash($pass, PASSWORD_DEFAULT), 'color' => '#4f46e5']);
            if (trim((string)($_POST['company'] ?? '')) !== '') set_setting('company_name', trim((string)$_POST['company']));
            if (!empty($_POST['demo'])) seed_demo(false);
            if (trim((string)($_POST['company'] ?? '')) !== '') set_setting('company_name', trim((string)$_POST['company']));
            $msg = '🎉 Installed! <a href="./">Open the CRM and log in →</a>' . (!empty($_POST['demo']) ? '<br><small>Demo team logins use the password <b>demo123</b> (e.g. priya@demo.crm, suresh@demo.crm).</small>' : '');
        }
    }
}
?><!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Install CRM</title>
<style>body{font-family:system-ui,sans-serif;background:#f1f5f9;margin:0;padding:40px 16px;color:#0f172a}.b{max-width:440px;margin:auto;background:#fff;border-radius:16px;padding:28px;box-shadow:0 10px 30px -15px #0003}
h1{font-size:22px;margin:0 0 6px}p{color:#475569}label{display:block;font-size:13px;font-weight:600;margin:14px 0 5px}input[type=text],input[type=email],input[type=password]{width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #cbd5e1;border-radius:10px;font:inherit}
button{margin-top:20px;width:100%;padding:13px;border:0;border-radius:10px;background:#4f46e5;color:#fff;font:600 15px system-ui;cursor:pointer}.e{background:#fee2e2;color:#991b1b;padding:10px;border-radius:10px;margin-top:12px}a{color:#4f46e5}</style></head>
<body><div class="b"><h1>CRM setup</h1>
<?php if (isset($msg)): ?><p><?= $msg ?></p>
<?php elseif (!empty($dbStep)): ?>
<p><b>Step 1 of 2</b> — your MySQL database (hPanel → Databases → MySQL Databases).</p>
<?php if (!empty($err)) echo '<div class="e">' . htmlspecialchars($err) . '</div>'; ?>
<form method="post">
  <label>Database name</label><input type="text" name="db_name" value="<?= htmlspecialchars($db['name']) ?>" placeholder="u123456789_crm" required>
  <label>Database user</label><input type="text" name="db_user" value="<?= htmlspecialchars($db['user']) ?>" placeholder="u123456789_crm" required>
  <label>Database password</label><input type="password" name="db_pass" required>
  <label>Database host</label><input type="text" name="db_host" value="<?= htmlspecialchars($db['host']) ?>">
  <label style="display:flex;gap:8px;align-items:center;font-weight:500"><input type="checkbox" name="demo_mode" value="1" checked> Demo site (one-tap role logins on the login page)</label>
  <button>Connect</button>
</form>
<?php else: ?>
<p><b>Step 2 of 2</b> — create the first admin login.</p>
<?php if (!empty($err)) echo '<div class="e">' . htmlspecialchars($err) . '</div>'; ?>
<form method="post">
  <label>Company name</label><input type="text" name="company" placeholder="e.g. Secure Eye CCTV Solutions">
  <label>Your name</label><input type="text" name="name" required>
  <label>Email (login)</label><input type="email" name="email" required>
  <label>Password</label><input type="password" name="password" minlength="6" required>
  <label style="display:flex;gap:8px;align-items:center;font-weight:500"><input type="checkbox" name="demo" value="1" <?= DEMO_MODE ? 'checked' : '' ?>> Add demo data (sample customers, leads, jobs, invoices)</label>
  <button>Install</button>
</form>
<?php endif; ?>
</div></body></html>
