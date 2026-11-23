<?php
// Jobs: installations, complaints / service tickets, AMC visits, site surveys. Technicians see only their own jobs.
declare(strict_types=1);

const JOB_TYPES = ['installation', 'complaint', 'service', 'amc_visit', 'survey'];
const JOB_STATUS = ['new', 'scheduled', 'in_progress', 'on_hold', 'completed', 'cancelled'];

function job_access(int $id): array {
    $j = row('SELECT * FROM jobs WHERE id=?', [$id]) ?? fail('Job not found', 404);
    if (role() === 'technician' && (int)$j['assigned_to'] !== uid()) fail('This job is not assigned to you', 403);
    return $j;
}

route('jobs_list', 'GET', [], function () {
    $p = [];
    $w = [like_where((string)in('q', ''), ['j.number', 'j.title', 'c.name', 'c.phone', 'j.address'], $p)];
    if (role() === 'technician' || in('mine')) { $w[] = 'j.assigned_to=?'; $p[] = uid(); }
    elseif ($a = in_int('assigned_to')) { $w[] = 'j.assigned_to=?'; $p[] = $a; }
    if (($t = (string)in('type', '')) !== '') {
        if ($t === 'tickets') $w[] = "j.type IN ('complaint','service')";
        else { $w[] = 'j.type=?'; $p[] = $t; }
    }
    if ($cid = in_int('customer_id')) { $w[] = 'j.customer_id=?'; $p[] = $cid; }
    switch ($st = (string)in('status', '')) {
        case '': break;
        case 'open': $w[] = "j.status NOT IN ('completed','cancelled')"; break;
        case 'today': $w[] = "DATE(j.scheduled_at)=CURDATE() AND j.status<>'cancelled'"; break;
        case 'overdue': $w[] = "j.scheduled_at < CURDATE() AND j.status NOT IN ('completed','cancelled')"; break;
        case 'unassigned': $w[] = "j.assigned_to IS NULL AND j.status NOT IN ('completed','cancelled') AND (j.scheduled_at IS NULL OR j.scheduled_at < DATE_ADD(CURDATE(), INTERVAL 8 DAY))"; break;
        default: $w[] = 'j.status=?'; $p[] = $st;
    }
    if ($from = (string)in('from', '')) { $w[] = 'j.scheduled_at >= ?'; $p[] = $from . ' 00:00:00'; }
    if ($to = (string)in('to', '')) { $w[] = 'j.scheduled_at <= ?'; $p[] = $to . ' 23:59:59'; }
    out(rows("SELECT j.*, c.name AS customer_name, c.phone AS customer_phone, u.name AS assigned_name, u.color AS assigned_color,
        TIMESTAMPDIFF(HOUR, j.created_at, COALESCE(j.completed_at, NOW())) AS age_hours
        FROM jobs j LEFT JOIN customers c ON c.id=j.customer_id LEFT JOIN users u ON u.id=j.assigned_to
        WHERE " . implode(' AND ', $w) . "
        ORDER BY FIELD(j.status,'in_progress','scheduled','new','on_hold','completed','cancelled'),
                 FIELD(j.priority,'urgent','high','normal','low'), j.scheduled_at IS NULL, j.scheduled_at, j.id DESC LIMIT 1000", $p));
});

route('job_get', 'GET', [], function () {
    $id = need_id();
    job_access($id);
    $j = row('SELECT j.*, c.name AS customer_name, c.phone AS customer_phone, c.alt_phone AS customer_alt_phone, c.address AS customer_address,
                     c.city AS customer_city, u.name AS assigned_name, u.phone AS assigned_phone, cr.name AS created_name, a.number AS amc_number, d.number AS doc_number
              FROM jobs j LEFT JOIN customers c ON c.id=j.customer_id LEFT JOIN users u ON u.id=j.assigned_to LEFT JOIN users cr ON cr.id=j.created_by
              LEFT JOIN amc a ON a.id=j.amc_id LEFT JOIN docs d ON d.id=j.doc_id WHERE j.id=?', [$id]);
    $j['items'] = rows('SELECT ji.*, p.name, p.unit, p.price FROM job_items ji JOIN products p ON p.id=ji.product_id WHERE ji.job_id=? ORDER BY ji.id', [$id]);
    $j['files'] = rows('SELECT f.*, u.name AS user_name FROM files f LEFT JOIN users u ON u.id=f.user_id WHERE f.entity="job" AND f.entity_id=? ORDER BY f.id', [$id]);
    $j['payments'] = rows('SELECT p.*, u.name AS received_name FROM payments p LEFT JOIN users u ON u.id=p.received_by WHERE p.job_id=? ORDER BY p.id', [$id]);
    $j['activities'] = activities('job', $id);
    $j['history'] = $j['customer_id'] && role() !== 'technician' ? rows("SELECT id, number, type, title, status, completed_at FROM jobs WHERE customer_id=? AND id<>? ORDER BY id DESC LIMIT 10", [$j['customer_id'], $id]) : [];
    out($j);
});

route('job_save', 'POST', OFFICE, function () {
    $id = in_int('id');
    $d = pick(['type' => 'e:' . implode('|', JOB_TYPES), 'title' => 's', 'customer_id' => 'i', 'address' => 't', 'contact_phone' => 's', 'description' => 't',
               'priority' => 'e:low|normal|high|urgent', 'scheduled_at' => 'dt', 'assigned_to' => 'i', 'charge' => 'f0', 'amc_id' => 'i', 'doc_id' => 'i']);
    if (isset($d['contact_phone'])) $d['contact_phone'] = clean_phone($d['contact_phone']);
    if (!empty($d['customer_id'])) {
        $c = row('SELECT * FROM customers WHERE id=?', [$d['customer_id']]) ?? fail('Customer not found');
        if (empty($d['address'])) $d['address'] = $c['address'];
        if (empty($d['contact_phone'])) $d['contact_phone'] = $c['phone'];
    }
    if (!$id) {
        require_fields($d, ['title' => 'Title', 'customer_id' => 'Customer']);
        $d['number'] = next_no('job');
        $d['status'] = !empty($d['assigned_to']) && !empty($d['scheduled_at']) ? 'scheduled' : 'new';
        $d['created_by'] = uid();
        $id = insert('jobs', $d);
        log_activity('job', $id, 'system', ucfirst(str_replace('_', ' ', $d['type'] ?? 'job')) . ' created');
        if (!empty($d['customer_id'])) log_activity('customer', (int)$d['customer_id'], 'system', 'Job ' . $d['number'] . ': ' . $d['title']);
    } else {
        $old = row('SELECT * FROM jobs WHERE id=?', [$id]) ?? fail('Job not found', 404);
        if (isset($d['assigned_to']) && (int)$d['assigned_to'] !== (int)$old['assigned_to']) {
            log_activity('job', $id, 'status', 'Assigned to ' . ($d['assigned_to'] ? val('SELECT name FROM users WHERE id=?', [$d['assigned_to']]) : 'nobody'));
        }
        if ($old['status'] === 'new' && !empty($d['assigned_to'] ?? $old['assigned_to']) && !empty($d['scheduled_at'] ?? $old['scheduled_at'])) $d['status'] = 'scheduled';
        update('jobs', $id, $d);
    }
    out(['id' => $id]);
});

/** Status change: start / hold / complete (with resolution + payment collected) / cancel / reopen */
route('job_status', 'POST', [], function () {
    $id = need_id();
    $j = job_access($id);
    $st = (string)in('status');
    if (!in_array($st, JOB_STATUS, true)) fail('Unknown status');
    if (role() === 'technician' && in_array($st, ['cancelled', 'new'], true)) fail('Ask the office to cancel this job', 403);
    $d = ['status' => $st];
    if ($st === 'in_progress' && !$j['started_at']) $d['started_at'] = date('Y-m-d H:i:s');
    if ($st === 'completed') {
        $d['completed_at'] = date('Y-m-d H:i:s');
        $d['resolution'] = mb_substr(trim((string)in('resolution', '')), 0, 5000) ?: null;
        if ($d['resolution'] === null) fail('Write what was done');
        if (($r = in_int('rating')) >= 1 && $r <= 5) $d['rating'] = $r;
    }
    if (in_array($st, ['new', 'scheduled', 'in_progress', 'on_hold'], true)) $d['completed_at'] = null;
    update('jobs', $id, $d);
    $label = ['new' => 'Reopened', 'scheduled' => 'Scheduled', 'in_progress' => 'Started', 'on_hold' => 'On hold', 'completed' => 'Completed', 'cancelled' => 'Cancelled'][$st];
    log_activity('job', $id, 'status', $label . (in('note') ? ' · ' . in('note') : '') . ($st === 'completed' ? ' · ' . $d['resolution'] : ''));
    $amt = round((float)in('collected', 0), 2);
    if ($st === 'completed' && $amt > 0) {
        insert('payments', ['job_id' => $id, 'customer_id' => $j['customer_id'], 'amount' => $amt, 'mode' => in_array(in('mode'), PAY_MODES, true) ? in('mode') : 'cash',
            'ref' => mb_substr((string)in('ref', ''), 0, 80) ?: null, 'paid_on' => date('Y-m-d'), 'received_by' => uid()]);
        q('UPDATE jobs SET collected = collected + ? WHERE id=?', [$amt, $id]);
        log_activity('job', $id, 'system', 'Collected ₹' . number_format($amt, 2));
    }
    if ($st === 'completed' && $j['customer_id']) log_activity('customer', (int)$j['customer_id'], 'system', 'Job ' . $j['number'] . ' completed');
    out(true);
});

route('job_item_add', 'POST', [], function () {
    $id = need_id('job_id');
    $j = job_access($id);
    $pid = need_id('product_id');
    $qty = max(1, in_int('qty', 1));
    $p = row('SELECT * FROM products WHERE id=?', [$pid]) ?? fail('Product not found');
    if ($p['track_stock'] && $p['stock'] < $qty && !in('force')) fail('Only ' . $p['stock'] . ' ' . $p['unit'] . ' in stock', 409);
    insert('job_items', ['job_id' => $id, 'product_id' => $pid, 'qty' => $qty]);
    stock_change($pid, -$qty, 'job', $j['number']);
    log_activity('job', $id, 'system', 'Used ' . $qty . ' × ' . $p['name']);
    out(true);
});

route('job_item_remove', 'POST', [], function () {
    $it = row('SELECT * FROM job_items WHERE id=?', [need_id()]) ?? fail('Not found', 404);
    $j = job_access((int)$it['job_id']);
    q('DELETE FROM job_items WHERE id=?', [$it['id']]);
    stock_change((int)$it['product_id'], (int)$it['qty'], 'return', $j['number'], 'Removed from job');
    out(true);
});

route('job_delete', 'POST', STAFF, function () {
    $id = need_id();
    $j = row('SELECT * FROM jobs WHERE id=?', [$id]) ?? fail('Not found', 404);
    if (val('SELECT COUNT(*) FROM payments WHERE job_id=?', [$id])) fail('This job has payments — cancel it instead');
    foreach (rows('SELECT * FROM job_items WHERE job_id=?', [$id]) as $it) stock_change((int)$it['product_id'], (int)$it['qty'], 'return', $j['number'], 'Job deleted');
    foreach (['DELETE FROM job_items WHERE job_id=?', 'DELETE FROM jobs WHERE id=?', 'DELETE FROM activities WHERE entity="job" AND entity_id=?'] as $sql) q($sql, [$id]);
    out(true);
});

/* ---------------- Photos & files ---------------- */

route('file_upload', 'POST', [], function () {
    $entity = (string)in('entity');
    if (!in_array($entity, ['job', 'customer', 'lead'], true)) fail('Unknown record');
    $eid = need_id('entity_id');
    if ($entity === 'job') job_access($eid); elseif (!is_role(...OFFICE)) fail('No permission', 403);
    $f = $_FILES['file'] ?? null;
    if (!$f || $f['error'] !== UPLOAD_ERR_OK) fail('Upload failed — try a smaller file');
    if ($f['size'] > 12 * 1024 * 1024) fail('File is larger than 12 MB');
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']) ?: 'application/octet-stream';
    $ext = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'application/pdf' => 'pdf'][$mime] ?? fail('Only photos (JPG/PNG/WEBP) or PDF');
    $dir = dirname(__DIR__, 2) . '/uploads/' . date('Y/m');
    if (!is_dir($dir) && !mkdir($dir, 0755, true)) fail('Cannot save files on the server', 500);
    $name = bin2hex(random_bytes(10)) . '.' . $ext;
    // Phone photos are large: shrink to 1600px JPEG when GD is available
    if ($ext !== 'pdf' && function_exists('imagecreatefromstring') && ($img = @imagecreatefromstring((string)file_get_contents($f['tmp_name'])))) {
        $w = imagesx($img); $h = imagesy($img); $s = min(1, 1600 / max($w, $h));
        $out = imagecreatetruecolor((int)($w * $s), (int)($h * $s));
        imagefill($out, 0, 0, imagecolorallocate($out, 255, 255, 255));
        imagecopyresampled($out, $img, 0, 0, 0, 0, (int)($w * $s), (int)($h * $s), $w, $h);
        $name = preg_replace('/\.\w+$/', '.jpg', $name);
        imagejpeg($out, $dir . '/' . $name, 82);
        $mime = 'image/jpeg';
    } elseif (!move_uploaded_file($f['tmp_name'], $dir . '/' . $name)) fail('Cannot save the file', 500);
    $path = 'uploads/' . date('Y/m') . '/' . $name;
    $fid = insert('files', ['entity' => $entity, 'entity_id' => $eid, 'path' => $path, 'name' => mb_substr((string)$f['name'], 0, 190), 'mime' => $mime,
        'size' => (int)filesize(dirname(__DIR__, 2) . '/' . $path), 'user_id' => uid()]);
    log_activity($entity, $eid, 'system', 'Added ' . ($ext === 'pdf' ? 'a document' : 'a photo'));
    out(['id' => $fid, 'path' => $path]);
});

route('file_delete', 'POST', [], function () {
    $f = row('SELECT * FROM files WHERE id=?', [need_id()]) ?? fail('Not found', 404);
    if ($f['entity'] === 'job') job_access((int)$f['entity_id']);
    if (!is_role(...STAFF) && (int)$f['user_id'] !== uid()) fail('You can delete only your own uploads', 403);
    q('DELETE FROM files WHERE id=?', [$f['id']]);
    $abs = dirname(__DIR__, 2) . '/' . $f['path'];
    if (str_starts_with($f['path'], 'uploads/') && is_file($abs)) unlink($abs);
    out(true);
});

/* ---------------- AMC contracts ---------------- */

route('amc_list', 'GET', OFFICE, function () {
    $p = [];
    $w = [like_where((string)in('q', ''), ['a.number', 'c.name', 'c.phone', 'a.title'], $p)];
    switch ((string)in('status', '')) {
        case 'active': $w[] = 'a.end_date >= CURDATE()'; break;
        case 'expiring': $w[] = 'a.end_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)'; break;
        case 'expired': $w[] = 'a.end_date < CURDATE() AND a.renewed_to IS NULL'; break;
    }
    out(rows("SELECT a.*, c.name AS customer_name, c.phone AS customer_phone,
        (SELECT COUNT(*) FROM jobs j WHERE j.amc_id=a.id AND j.status='completed') AS visits_done,
        (SELECT MIN(j.scheduled_at) FROM jobs j WHERE j.amc_id=a.id AND j.status NOT IN ('completed','cancelled')) AS next_visit,
        DATEDIFF(a.end_date, CURDATE()) AS days_left
        FROM amc a JOIN customers c ON c.id=a.customer_id WHERE " . implode(' AND ', $w) . ' ORDER BY a.end_date LIMIT 1000', $p));
});

route('amc_get', 'GET', OFFICE, function () {
    $id = need_id();
    $a = row('SELECT a.*, c.name AS customer_name, c.phone AS customer_phone, c.address AS customer_address, DATEDIFF(a.end_date, CURDATE()) AS days_left
              FROM amc a JOIN customers c ON c.id=a.customer_id WHERE a.id=?', [$id]) ?? fail('AMC not found', 404);
    $a['jobs'] = rows('SELECT j.id, j.number, j.type, j.title, j.status, j.scheduled_at, j.completed_at, u.name AS assigned_name FROM jobs j LEFT JOIN users u ON u.id=j.assigned_to WHERE j.amc_id=? ORDER BY j.scheduled_at', [$id]);
    $a['activities'] = activities('amc', $id);
    out($a);
});

route('amc_save', 'POST', STAFF, function () {
    $id = in_int('id');
    $d = pick(['customer_id' => 'i', 'title' => 's', 'start_date' => 'd', 'end_date' => 'd', 'visits' => 'i0', 'amount' => 'f0', 'cameras' => 'i', 'covers' => 't', 'notes' => 't']);
    if (!$id) {
        require_fields($d, ['customer_id' => 'Customer', 'start_date' => 'Start date']);
        $d['end_date'] ??= date('Y-m-d', strtotime($d['start_date'] . ' +1 year -1 day'));
        $d['number'] = next_no('amc');
        $d['created_by'] = uid();
        $id = insert('amc', $d);
        log_activity('amc', $id, 'system', 'AMC created · ₹' . number_format((float)($d['amount'] ?? 0)));
        log_activity('customer', (int)$d['customer_id'], 'system', 'AMC ' . $d['number'] . ' till ' . date('d M Y', strtotime($d['end_date'])));
        if (in('schedule')) amc_schedule($id);
    } else update('amc', $id, $d);
    out(['id' => $id]);
});

/** Spread the contract's preventive-maintenance visits evenly over the period as AMC-visit jobs */
function amc_schedule(int $id): int {
    $a = row('SELECT a.*, c.address, c.phone FROM amc a JOIN customers c ON c.id=a.customer_id WHERE a.id=?', [$id]) ?? fail('AMC not found', 404);
    $have = (int)val("SELECT COUNT(*) FROM jobs WHERE amc_id=? AND status<>'cancelled'", [$id]);
    $n = max(0, (int)$a['visits'] - $have);
    $start = strtotime($a['start_date']); $end = strtotime($a['end_date']);
    $step = ($end - $start) / max(1, (int)$a['visits']);
    for ($i = $have; $i < $have + $n; $i++) {
        $when = date('Y-m-d 10:00:00', (int)($start + $step * $i + $step / 2));
        insert('jobs', ['number' => next_no('job'), 'type' => 'amc_visit', 'title' => 'AMC visit ' . ($i + 1) . ' of ' . $a['visits'], 'customer_id' => $a['customer_id'],
            'address' => $a['address'], 'contact_phone' => $a['phone'], 'description' => "Preventive maintenance:\n• Clean cameras & check focus\n• Check DVR/NVR recording & HDD health\n• Check power supply & cabling\n• Update date/time & passwords",
            'status' => 'new', 'scheduled_at' => $when, 'amc_id' => $id, 'created_by' => uid()]);
    }
    if ($n) log_activity('amc', $id, 'system', $n . ' visit(s) scheduled');
    return $n;
}
route('amc_schedule', 'POST', STAFF, fn() => out(['created' => amc_schedule(need_id())]));

route('amc_renew', 'POST', STAFF, function () {
    $id = need_id();
    $a = row('SELECT * FROM amc WHERE id=?', [$id]) ?? fail('Not found', 404);
    if ($a['renewed_to']) fail('Already renewed');
    $start = date('Y-m-d', strtotime($a['end_date'] . ' +1 day'));
    $nid = insert('amc', ['number' => next_no('amc'), 'customer_id' => $a['customer_id'], 'title' => $a['title'], 'start_date' => $start,
        'end_date' => date('Y-m-d', strtotime($start . ' +1 year -1 day')), 'visits' => $a['visits'], 'amount' => in('amount') !== null && in('amount') !== '' ? round((float)in('amount'), 2) : $a['amount'],
        'cameras' => $a['cameras'], 'covers' => $a['covers'], 'notes' => $a['notes'], 'created_by' => uid()]);
    q('UPDATE amc SET renewed_to=? WHERE id=?', [$nid, $id]);
    log_activity('amc', $id, 'system', 'Renewed');
    log_activity('amc', $nid, 'system', 'Renewal of ' . $a['number']);
    amc_schedule($nid);
    out(['id' => $nid]);
});

route('amc_delete', 'POST', STAFF, function () {
    $id = need_id();
    q("DELETE FROM jobs WHERE amc_id=? AND status IN ('new','scheduled')", [$id]);
    q('UPDATE jobs SET amc_id=NULL WHERE amc_id=?', [$id]);
    q('DELETE FROM amc WHERE id=?', [$id]);
    out(true);
});
