<?php
// Login, logout, current user, password, team (users), company settings, demo reset.
declare(strict_types=1);

function public_user(array $u): array {
    return ['id' => (int)$u['id'], 'name' => $u['name'], 'email' => $u['email'], 'phone' => $u['phone'], 'role' => $u['role'], 'color' => $u['color']];
}
function boot_data(): array {
    $u = me();
    return [
        'user' => $u ? public_user($u) : null,
        'csrf' => $_SESSION['csrf'],
        'demo' => DEMO_MODE,
        'roles' => ROLES,
        'settings' => $u ? array_intersect_key(settings(), DEFAULT_SETTINGS) : ['company_name' => setting('company_name'), 'company_tagline' => setting('company_tagline')],
        'users' => $u ? rows('SELECT id, name, role, color, phone FROM users WHERE active=1 ORDER BY name') : [],
        'demo_logins' => DEMO_MODE ? rows("SELECT u.email, u.name, u.role FROM users u WHERE u.active=1 AND u.id IN (SELECT MIN(id) FROM users WHERE active=1 GROUP BY role) ORDER BY FIELD(u.role,'admin','manager','sales','technician')") : [],
        'version' => APP_VERSION,
    ];
}

route('me', 'GET', null, fn() => out(boot_data()));

route('login', 'POST', null, function () {
    $email = mb_strtolower((string)in('email', ''));
    $pass = (string)in('password', '');
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? '');
    $keys = ['ip:' . $ip, 'u:' . $email];
    foreach ($keys as $k) if (val('SELECT 1 FROM login_fails WHERE k=? AND n>=6 AND until_ts>?', [$k, time()])) fail('Too many attempts. Try again in 15 minutes.', 429);
    // Demo: one tap logs in as a role (password not needed)
    if (DEMO_MODE && in('demo')) {
        $u = row('SELECT * FROM users WHERE role=? AND active=1 ORDER BY id LIMIT 1', [(string)in('demo')]);
    } else {
        $u = row('SELECT * FROM users WHERE (email=? OR phone=?) AND active=1', [$email, clean_phone($email)]);
        if (!$u || !password_verify($pass, $u['password_hash'])) {
            foreach ($keys as $k) q('INSERT INTO login_fails (k, n, until_ts) VALUES (?, 1, ?) ON DUPLICATE KEY UPDATE n = IF(until_ts < UNIX_TIMESTAMP(), 1, n + 1), until_ts = VALUES(until_ts)', [$k, time() + 900]);
            fail('Wrong email or password');
        }
    }
    if (!$u) fail('No such user');
    foreach ($keys as $k) q('DELETE FROM login_fails WHERE k=?', [$k]);
    session_regenerate_id(true);
    $_SESSION['uid'] = (int)$u['id'];
    q('UPDATE users SET last_login=NOW() WHERE id=?', [$u['id']]);
    out(boot_data());
});

route('logout', 'POST', [], function () { $_SESSION = []; session_destroy(); out(true); });

route('change_password', 'POST', [], function () {
    $u = row('SELECT * FROM users WHERE id=?', [uid()]);
    if (!password_verify((string)in('current', ''), $u['password_hash'])) fail('Current password is wrong');
    $new = (string)in('password', '');
    if (strlen($new) < 6) fail('New password must be at least 6 characters');
    q('UPDATE users SET password_hash=? WHERE id=?', [password_hash($new, PASSWORD_DEFAULT), uid()]);
    out(true);
});

/* ---------------- Team ---------------- */

route('users_list', 'GET', STAFF, function () {
    out(rows("SELECT u.id, u.name, u.email, u.phone, u.role, u.color, u.active, u.last_login, u.created_at,
        (SELECT COUNT(*) FROM jobs j WHERE j.assigned_to=u.id AND j.status NOT IN ('completed','cancelled')) AS open_jobs,
        (SELECT COUNT(*) FROM jobs j WHERE j.assigned_to=u.id AND j.status='completed' AND j.completed_at >= DATE_FORMAT(CURDATE(),'%Y-%m-01')) AS done_month,
        (SELECT COUNT(*) FROM leads l WHERE l.assigned_to=u.id AND l.stage NOT IN ('won','lost')) AS open_leads
        FROM users u ORDER BY u.active DESC, FIELD(u.role,'admin','manager','sales','technician'), u.name"));
});

route('user_save', 'POST', ['admin'], function () {
    $id = in_int('id');
    $d = pick(['name' => 's', 'email' => 's', 'phone' => 's', 'role' => 'e:' . implode('|', array_keys(ROLES)), 'color' => 's', 'active' => 'b']);
    if (isset($d['email'])) $d['email'] = mb_strtolower($d['email']);
    if (isset($d['phone'])) $d['phone'] = clean_phone($d['phone']);
    if (!$id) require_fields($d, ['name' => 'Name', 'email' => 'Email', 'role' => 'Role']);
    if (!empty($d['email']) && !filter_var($d['email'], FILTER_VALIDATE_EMAIL)) fail('Please enter a valid email');
    if (!empty($d['email']) && val('SELECT id FROM users WHERE email=? AND id<>?', [$d['email'], $id])) fail('This email is already used');
    if ($id === uid() && (isset($d['role']) && $d['role'] !== 'admin' || (isset($d['active']) && !$d['active']))) fail('You cannot remove your own admin access');
    $pass = (string)in('password', '');
    if ($pass !== '') { if (strlen($pass) < 6) fail('Password must be at least 6 characters'); $d['password_hash'] = password_hash($pass, PASSWORD_DEFAULT); }
    if (!$id) { if (empty($d['password_hash'])) fail('Set a password for the new user'); $id = insert('users', $d); }
    else update('users', $id, $d);
    out(['id' => $id]);
});

/* ---------------- Settings ---------------- */

route('settings_save', 'POST', ['admin'], function () {
    foreach (DEFAULT_SETTINGS as $k => $_) {
        if (array_key_exists($k, input())) set_setting($k, mb_substr(trim((string)in($k)), 0, 4000));
    }
    out(true);
});

route('demo_reset', 'POST', ['admin'], function () {
    if (!DEMO_MODE) fail('Only available in demo mode', 403);
    require_once __DIR__ . '/../lib/schema.php';
    require_once __DIR__ . '/../lib/seed.php';
    seed_demo(true);
    out(true);
});
