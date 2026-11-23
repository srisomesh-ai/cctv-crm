<?php
// Leads (enquiries) pipeline, customers, activity timeline, global search.
declare(strict_types=1);

const LEAD_STAGES = ['new', 'contacted', 'site_visit', 'quoted', 'negotiation', 'won', 'lost'];
const LEAD_FIELDS = [
    'name' => 's', 'company' => 's', 'phone' => 's', 'email' => 's', 'address' => 't', 'city' => 's', 'requirement' => 't',
    'property_type' => 's', 'cameras' => 'i', 'value' => 'f', 'source' => 's', 'priority' => 'e:low|normal|high',
    'assigned_to' => 'i', 'next_followup' => 'dt', 'lost_reason' => 's',
];
const CUSTOMER_FIELDS = [
    'name' => 's', 'company' => 's', 'phone' => 's', 'alt_phone' => 's', 'email' => 's', 'address' => 't', 'city' => 's',
    'pincode' => 's', 'gstin' => 's', 'category' => 's', 'source' => 's', 'notes' => 't',
];

/* ---------------- Leads ---------------- */

route('leads_list', 'GET', OFFICE, function () {
    $p = [];
    $w = [like_where((string)in('q', ''), ['l.name', 'l.company', 'l.phone', 'l.city', 'l.requirement'], $p)];
    if (($st = (string)in('stage', '')) !== '') { $w[] = 'l.stage=?'; $p[] = $st; }
    if (($src = (string)in('source', '')) !== '') { $w[] = 'l.source=?'; $p[] = $src; }
    if ($as = in_int('assigned_to')) { $w[] = 'l.assigned_to=?'; $p[] = $as; }
    if (role() === 'sales' && in('mine')) { $w[] = 'l.assigned_to=?'; $p[] = uid(); }
    switch ((string)in('followup', '')) {
        case 'overdue': $w[] = "l.next_followup < NOW() AND l.stage NOT IN ('won','lost')"; break;
        case 'today':   $w[] = "DATE(l.next_followup) = CURDATE() AND l.stage NOT IN ('won','lost')"; break;
        case 'open':    $w[] = "l.stage NOT IN ('won','lost')"; break;
    }
    out(rows('SELECT l.*, u.name AS assigned_name, u.color AS assigned_color,
        (SELECT body FROM activities a WHERE a.entity="lead" AND a.entity_id=l.id ORDER BY a.id DESC LIMIT 1) AS last_note
        FROM leads l LEFT JOIN users u ON u.id=l.assigned_to WHERE ' . implode(' AND ', $w) . '
        ORDER BY FIELD(l.stage,"new","contacted","site_visit","quoted","negotiation","won","lost"), l.next_followup IS NULL, l.next_followup, l.id DESC LIMIT 1000', $p));
});

route('lead_get', 'GET', OFFICE, function () {
    $id = need_id();
    $l = row('SELECT l.*, u.name AS assigned_name FROM leads l LEFT JOIN users u ON u.id=l.assigned_to WHERE l.id=?', [$id]) ?? fail('Lead not found', 404);
    $l['activities'] = activities('lead', $id);
    $l['quotes'] = rows("SELECT id, number, date, total, status FROM docs WHERE type='quote' AND lead_id=? ORDER BY id DESC", [$id]);
    out($l);
});

route('lead_save', 'POST', OFFICE, function () {
    $id = in_int('id');
    $d = pick(LEAD_FIELDS);
    if (isset($d['phone'])) $d['phone'] = clean_phone($d['phone']);
    if (!$id) {
        require_fields($d, ['name' => 'Name']);
        if (empty($d['phone']) && empty($d['email'])) fail('Add a phone number or email');
        $d['stage'] = in_array(in('stage'), LEAD_STAGES, true) ? in('stage') : 'new';
        $d['assigned_to'] ??= uid();
        $d['created_by'] = uid();
        // Same phone already an open lead? Tell the user instead of making a duplicate
        if (!empty($d['phone']) && !in('force') && ($dup = row("SELECT id, name, stage FROM leads WHERE phone=? AND stage NOT IN ('won','lost')", [$d['phone']]))) {
            fail('An open lead with this phone already exists: ' . $dup['name'] . ' (#' . $dup['id'] . ')', 409);
        }
        $id = insert('leads', $d);
        log_activity('lead', $id, 'system', 'Lead created' . (!empty($d['source']) ? ' · source: ' . $d['source'] : ''));
    } else {
        row('SELECT id FROM leads WHERE id=?', [$id]) ?? fail('Lead not found', 404);
        update('leads', $id, $d);
    }
    out(['id' => $id]);
});

route('lead_stage', 'POST', OFFICE, function () {
    $id = need_id();
    $stage = (string)in('stage');
    if (!in_array($stage, LEAD_STAGES, true)) fail('Unknown stage');
    $l = row('SELECT * FROM leads WHERE id=?', [$id]) ?? fail('Lead not found', 404);
    if ($l['stage'] === $stage) out(true);
    $d = ['stage' => $stage];
    if ($stage === 'won') $d['won_at'] = date('Y-m-d H:i:s');
    if ($stage === 'lost') $d['lost_reason'] = mb_substr((string)in('reason', ''), 0, 255) ?: null;
    update('leads', $id, $d);
    log_activity('lead', $id, 'status', 'Stage: ' . str_replace('_', ' ', $l['stage']) . ' → ' . str_replace('_', ' ', $stage) . ($stage === 'lost' && in('reason') ? ' (' . in('reason') . ')' : ''));
    out(true);
});

route('lead_delete', 'POST', STAFF, function () {
    $id = need_id();
    q('DELETE FROM leads WHERE id=?', [$id]);
    q('DELETE FROM activities WHERE entity="lead" AND entity_id=?', [$id]);
    out(true);
});

/** Won lead → customer (reuses a customer with the same phone) */
function lead_to_customer(int $leadId): int {
    $l = row('SELECT * FROM leads WHERE id=?', [$leadId]) ?? fail('Lead not found', 404);
    if ($l['customer_id'] && val('SELECT id FROM customers WHERE id=?', [$l['customer_id']])) return (int)$l['customer_id'];
    $cid = $l['phone'] ? (int)val('SELECT id FROM customers WHERE phone=? LIMIT 1', [$l['phone']]) : 0;
    if (!$cid) {
        $cid = insert('customers', ['name' => $l['name'], 'company' => $l['company'], 'phone' => $l['phone'], 'email' => $l['email'], 'address' => $l['address'],
            'city' => $l['city'], 'category' => $l['property_type'], 'source' => $l['source'], 'created_by' => uid()]);
        log_activity('customer', $cid, 'system', 'Customer created from lead #' . $leadId);
    }
    q('UPDATE leads SET customer_id=? WHERE id=?', [$cid, $leadId]);
    return $cid;
}

route('lead_convert', 'POST', OFFICE, function () {
    $id = need_id();
    $cid = lead_to_customer($id);
    $l = row('SELECT stage FROM leads WHERE id=?', [$id]);
    if ($l['stage'] !== 'won') { q("UPDATE leads SET stage='won', won_at=NOW() WHERE id=?", [$id]); log_activity('lead', $id, 'status', 'Marked as won · converted to customer'); }
    out(['customer_id' => $cid]);
});

/* ---------------- Activity timeline ---------------- */

route('activity_add', 'POST', [], function () {
    $entity = (string)in('entity');
    if (!in_array($entity, ['lead', 'customer', 'job', 'doc', 'amc'], true)) fail('Unknown record');
    $id = need_id('entity_id');
    if (role() === 'technician' && ($entity !== 'job' || !val('SELECT id FROM jobs WHERE id=? AND assigned_to=?', [$id, uid()]))) fail('You can add notes only to your jobs', 403);
    $kind = in_array(in('kind'), ['note', 'call', 'whatsapp', 'visit', 'email'], true) ? (string)in('kind') : 'note';
    $body = trim((string)in('body', ''));
    if ($body === '') fail('Write something first');
    log_activity($entity, $id, $kind, $body);
    if ($entity === 'lead') {
        $d = [];
        if (array_key_exists('next_followup', input())) $d += pick(['next_followup' => 'dt']);
        if ($d) update('leads', $id, $d);
        if (in('kind') !== 'note') q("UPDATE leads SET stage='contacted' WHERE id=? AND stage='new'", [$id]);
    }
    out(true);
});

/* ---------------- Customers ---------------- */

route('customers_list', 'GET', OFFICE, function () {
    $p = [];
    $w = [like_where((string)in('q', ''), ['c.name', 'c.company', 'c.phone', 'c.city', 'c.email'], $p)];
    if (($cat = (string)in('category', '')) !== '') { $w[] = 'c.category=?'; $p[] = $cat; }
    out(rows('SELECT c.*,
        (SELECT COUNT(*) FROM jobs j WHERE j.customer_id=c.id) AS jobs,
        (SELECT COALESCE(SUM(d.total - d.paid),0) FROM docs d WHERE d.customer_id=c.id AND d.type="invoice" AND d.status IN ("unpaid","partial")) AS due,
        (SELECT COALESCE(SUM(d.total),0) FROM docs d WHERE d.customer_id=c.id AND d.type="invoice" AND d.status<>"cancelled") AS billed,
        (SELECT MAX(a.end_date) FROM amc a WHERE a.customer_id=c.id) AS amc_end
        FROM customers c WHERE ' . implode(' AND ', $w) . ' ORDER BY c.id DESC LIMIT 1000', $p));
});

route('customer_get', 'GET', OFFICE, function () {
    $id = need_id();
    $c = row('SELECT * FROM customers WHERE id=?', [$id]) ?? fail('Customer not found', 404);
    $c['jobs'] = rows('SELECT j.id, j.number, j.type, j.title, j.status, j.priority, j.scheduled_at, j.completed_at, u.name AS assigned_name
        FROM jobs j LEFT JOIN users u ON u.id=j.assigned_to WHERE j.customer_id=? ORDER BY j.id DESC', [$id]);
    $c['docs'] = rows('SELECT id, type, number, date, total, paid, status FROM docs WHERE customer_id=? ORDER BY date DESC, id DESC', [$id]);
    $c['amc'] = rows('SELECT * FROM amc WHERE customer_id=? ORDER BY end_date DESC', [$id]);
    $c['payments'] = rows('SELECT p.*, d.number AS doc_number FROM payments p LEFT JOIN docs d ON d.id=p.doc_id WHERE p.customer_id=? ORDER BY p.paid_on DESC, p.id DESC', [$id]);
    $c['leads'] = rows('SELECT id, name, stage, created_at FROM leads WHERE customer_id=? ORDER BY id DESC', [$id]);
    // Equipment installed: products used in this customer's completed jobs + invoiced
    $c['equipment'] = rows("SELECT p.name, p.category, SUM(x.qty) AS qty FROM (
            SELECT ji.product_id, ji.qty FROM job_items ji JOIN jobs j ON j.id=ji.job_id WHERE j.customer_id=? AND j.status='completed'
        ) x JOIN products p ON p.id=x.product_id WHERE p.category<>'service' GROUP BY p.id ORDER BY qty DESC", [$id]);
    $c['activities'] = activities('customer', $id);
    $c['stats'] = [
        'billed' => (float)val("SELECT COALESCE(SUM(total),0) FROM docs WHERE customer_id=? AND type='invoice' AND status<>'cancelled'", [$id]),
        'paid' => (float)val('SELECT COALESCE(SUM(amount),0) FROM payments WHERE customer_id=?', [$id]),
        'due' => (float)val("SELECT COALESCE(SUM(total-paid),0) FROM docs WHERE customer_id=? AND type='invoice' AND status IN ('unpaid','partial')", [$id]),
        'open_jobs' => (int)val("SELECT COUNT(*) FROM jobs WHERE customer_id=? AND status NOT IN ('completed','cancelled')", [$id]),
    ];
    out($c);
});

route('customer_save', 'POST', OFFICE, function () {
    $id = in_int('id');
    $d = pick(CUSTOMER_FIELDS);
    foreach (['phone', 'alt_phone'] as $k) if (isset($d[$k])) $d[$k] = clean_phone($d[$k]);
    if (!empty($d['email']) && !filter_var($d['email'], FILTER_VALIDATE_EMAIL)) fail('Please enter a valid email');
    if (!$id) {
        require_fields($d, ['name' => 'Name']);
        if (!empty($d['phone']) && !in('force') && ($dup = row('SELECT id, name FROM customers WHERE phone=?', [$d['phone']]))) fail('A customer with this phone already exists: ' . $dup['name'], 409);
        $d['created_by'] = uid();
        $id = insert('customers', $d);
        log_activity('customer', $id, 'system', 'Customer added');
    } else {
        row('SELECT id FROM customers WHERE id=?', [$id]) ?? fail('Customer not found', 404);
        update('customers', $id, $d);
    }
    out(['id' => $id]);
});

route('customer_delete', 'POST', STAFF, function () {
    $id = need_id();
    if (val('SELECT COUNT(*) FROM docs WHERE customer_id=? AND type="invoice"', [$id])) fail('This customer has invoices — it cannot be deleted');
    q('DELETE FROM customers WHERE id=?', [$id]);
    q('DELETE FROM activities WHERE entity="customer" AND entity_id=?', [$id]);
    q('UPDATE leads SET customer_id=NULL WHERE customer_id=?', [$id]);
    out(true);
});

/* ---------------- Search (Ctrl+K) ---------------- */

route('search', 'GET', [], function () {
    $s = trim((string)in('q', ''));
    if (mb_strlen($s) < 2) out([]);
    $like = '%' . $s . '%';
    $res = [];
    if (is_role(...OFFICE)) {
        foreach (rows('SELECT id, name, phone, city FROM customers WHERE name LIKE ? OR phone LIKE ? OR company LIKE ? LIMIT 6', [$like, $like, $like]) as $r)
            $res[] = ['type' => 'customer', 'id' => (int)$r['id'], 'title' => $r['name'], 'sub' => trim(($r['phone'] ?? '') . ' · ' . ($r['city'] ?? ''), ' ·')];
        foreach (rows('SELECT id, name, phone, stage FROM leads WHERE name LIKE ? OR phone LIKE ? OR company LIKE ? LIMIT 6', [$like, $like, $like]) as $r)
            $res[] = ['type' => 'lead', 'id' => (int)$r['id'], 'title' => $r['name'], 'sub' => 'Lead · ' . str_replace('_', ' ', $r['stage']) . ($r['phone'] ? ' · ' . $r['phone'] : '')];
        foreach (rows('SELECT d.id, d.type, d.number, d.total, c.name FROM docs d LEFT JOIN customers c ON c.id=d.customer_id WHERE d.number LIKE ? OR c.name LIKE ? ORDER BY d.id DESC LIMIT 6', [$like, $like]) as $r)
            $res[] = ['type' => $r['type'], 'id' => (int)$r['id'], 'title' => $r['number'], 'sub' => ($r['type'] === 'quote' ? 'Quotation' : 'Invoice') . ' · ' . ($r['name'] ?? '') . ' · ₹' . number_format((float)$r['total'])];
    }
    $p = [$like, $like, $like];
    $mine = '';
    if (role() === 'technician') { $mine = ' AND j.assigned_to=?'; $p[] = uid(); }
    foreach (rows('SELECT j.id, j.number, j.title, j.status, c.name FROM jobs j LEFT JOIN customers c ON c.id=j.customer_id WHERE (j.number LIKE ? OR j.title LIKE ? OR c.name LIKE ?)' . $mine . ' ORDER BY j.id DESC LIMIT 6', $p) as $r)
        $res[] = ['type' => 'job', 'id' => (int)$r['id'], 'title' => $r['number'] . ' · ' . $r['title'], 'sub' => ($r['name'] ?? '') . ' · ' . str_replace('_', ' ', $r['status'])];
    out($res);
});
