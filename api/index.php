<?php
// JSON API. Every call: /api/?a=<action>  (GET to read, POST with JSON body to change; POST needs the X-CSRF header).
declare(strict_types=1);
require __DIR__ . '/lib/core.php';

$ROUTES = [];
/** Register an action: who may call it (roles, [] = any logged-in user, null = public) and the handler */
function route(string $action, string $method, ?array $roles, callable $fn): void {
    global $ROUTES;
    $ROUTES[$action] = [$method, $roles, $fn];
}
foreach (glob(__DIR__ . '/modules/*.php') as $m) require $m;

set_exception_handler(function (Throwable $e) {
    error_log('[crm] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    $msg = $e instanceof PDOException ? 'Database error' . (str_contains($e->getMessage(), "doesn't exist") ? ' — please run install.php' : '') : 'Something went wrong';
    fail($msg, 500);
});

$a = (string)($_GET['a'] ?? '');
if (!isset($ROUTES[$a])) fail('Unknown action', 404);
[$method, $roles, $fn] = $ROUTES[$a];
if ($_SERVER['REQUEST_METHOD'] !== $method && !($method === 'GET' && $_SERVER['REQUEST_METHOD'] === 'POST')) fail('Use ' . $method, 405);

start_session();
if ($roles !== null) {
    if (!me()) fail('Please log in', 401);
    if ($roles && !in_array(role(), $roles, true)) fail('You do not have permission for this', 403);
}
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $a !== 'login' && !hash_equals((string)$_SESSION['csrf'], (string)($_SERVER['HTTP_X_CSRF'] ?? ''))) {
    fail('Session expired — please reload the page', 419);
}
$fn();
out(null);
