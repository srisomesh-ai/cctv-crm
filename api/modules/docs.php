<?php
// Quotations & GST invoices (same table, "type"), payments, products & stock.
declare(strict_types=1);

const PRODUCT_CATS = ['camera', 'dvr', 'nvr', 'hdd', 'cable', 'power', 'network', 'accessory', 'service'];
const PAY_MODES = ['cash', 'upi', 'bank', 'card', 'cheque'];

/* ---------------- Products & stock ---------------- */

route('products_list', 'GET', [], function () {
    $p = [];
    $w = [like_where((string)in('q', ''), ['name', 'sku', 'brand'], $p)];
    if (($c = (string)in('category', '')) !== '') { $w[] = 'category=?'; $p[] = $c; }
    if (in('low')) $w[] = 'track_stock=1 AND stock <= min_stock';
    if (!in('all')) $w[] = 'active=1';
    $list = rows('SELECT * FROM products WHERE ' . implode(' AND ', $w) . ' ORDER BY FIELD(category,"camera","dvr","nvr","hdd","cable","power","network","accessory","service"), name', $p);
    if (role() === 'technician') foreach ($list as &$r) unset($r['cost']);
    out($list);
});

route('product_save', 'POST', STAFF, function () {
    $id = in_int('id');
    $d = pick(['sku' => 's', 'name' => 's', 'category' => 'e:' . implode('|', PRODUCT_CATS), 'brand' => 's', 'unit' => 's', 'price' => 'f0', 'cost' => 'f0',
               'gst' => 'f0', 'hsn' => 's', 'min_stock' => 'i0', 'warranty_months' => 'i', 'track_stock' => 'b', 'active' => 'b']);
    if (!$id) {
        require_fields($d, ['name' => 'Name', 'category' => 'Category']);
        $d['unit'] ??= 'pcs';
        $id = insert('products', $d);
        $open = in_int('stock');
        if ($open) { q('UPDATE products SET stock=? WHERE id=?', [$open, $id]); insert('stock_moves', ['product_id' => $id, 'qty' => $open, 'kind' => 'adjust', 'note' => 'Opening stock', 'user_id' => uid()]); }
    } else update('products', $id, $d);
    out(['id' => $id]);
});

route('stock_move', 'POST', STAFF, function () {
    $pid = need_id('product_id');
    $qty = in_int('qty');
    $kind = in_array(in('kind'), ['purchase', 'adjust', 'return'], true) ? (string)in('kind') : 'adjust';
    if ($qty === 0) fail('Enter a quantity');
    if ($kind === 'purchase' && $qty < 0) fail('Purchase quantity must be positive');
    stock_change($pid, $qty, $kind, (string)in('ref', ''), (string)in('note', ''));
    out(['stock' => (int)val('SELECT stock FROM products WHERE id=?', [$pid])]);
});

route('stock_moves', 'GET', STAFF, function () {
    $p = []; $w = ['1=1'];
    if ($pid = in_int('product_id')) { $w[] = 'm.product_id=?'; $p[] = $pid; }
    out(rows('SELECT m.*, p.name AS product, u.name AS user_name FROM stock_moves m JOIN products p ON p.id=m.product_id LEFT JOIN users u ON u.id=m.user_id
              WHERE ' . implode(' AND ', $w) . ' ORDER BY m.id DESC LIMIT 300', $p));
});

function stock_change(int $productId, int $qty, string $kind, string $ref = '', string $note = ''): void {
    $p = row('SELECT id, track_stock FROM products WHERE id=?', [$productId]) ?? fail('Product not found', 404);
    if (!$p['track_stock']) return;
    q('UPDATE products SET stock = stock + ? WHERE id=?', [$qty, $productId]);
    insert('stock_moves', ['product_id' => $productId, 'qty' => $qty, 'kind' => $kind, 'ref' => $ref ?: null, 'note' => $note ?: null, 'user_id' => uid() ?: null]);
}

/* ---------------- Quotations & invoices ---------------- */

/** Recalculate totals from lines: discount reduces the taxable value, GST per line */
function doc_totals(array $items, float $discount): array {
    $sub = 0.0;
    foreach ($items as $it) $sub += $it['amount'];
    $discount = max(0, min($discount, $sub));
    $f = $sub > 0 ? ($sub - $discount) / $sub : 1;
    $tax = 0.0;
    foreach ($items as $it) $tax += $it['amount'] * $it['gst'] / 100 * $f;
    $sub = round($sub, 2); $tax = round($tax, 2);
    return ['subtotal' => $sub, 'discount' => round($discount, 2), 'tax' => $tax, 'total' => round($sub - $discount + $tax)];   // total rounded to the rupee
}

function doc_load(int $id): array {
    $d = row('SELECT d.*, c.name AS customer_name, c.company AS customer_company, c.phone AS customer_phone, c.email AS customer_email,
                     c.address AS customer_address, c.city AS customer_city, c.gstin AS customer_gstin, l.name AS lead_name, l.phone AS lead_phone,
                     l.address AS lead_address, u.name AS created_name
              FROM docs d LEFT JOIN customers c ON c.id=d.customer_id LEFT JOIN leads l ON l.id=d.lead_id LEFT JOIN users u ON u.id=d.created_by WHERE d.id=?', [$id]) ?? fail('Document not found', 404);
    $d['items'] = rows('SELECT * FROM doc_items WHERE doc_id=? ORDER BY sort, id', [$id]);
    $d['payments'] = rows('SELECT p.*, u.name AS received_name FROM payments p LEFT JOIN users u ON u.id=p.received_by WHERE p.doc_id=? ORDER BY p.paid_on, p.id', [$id]);
    $d['activities'] = activities('doc', $id);
    if ($d['from_doc_id']) $d['from_number'] = val('SELECT number FROM docs WHERE id=?', [$d['from_doc_id']]);
    $d['invoices'] = $d['type'] === 'quote' ? rows("SELECT id, number, status FROM docs WHERE type='invoice' AND from_doc_id=?", [$id]) : [];
    return $d;
}

function invoice_status(int $id): void {
    $d = row('SELECT total, status FROM docs WHERE id=?', [$id]);
    if (!$d || $d['status'] === 'cancelled') return;
    $paid = (float)val('SELECT COALESCE(SUM(amount),0) FROM payments WHERE doc_id=?', [$id]);
    $st = $paid <= 0 ? 'unpaid' : ($paid + 0.5 >= (float)$d['total'] ? 'paid' : 'partial');
    q('UPDATE docs SET paid=?, status=? WHERE id=?', [$paid, $st, $id]);
}

route('docs_list', 'GET', OFFICE, function () {
    $type = in('type') === 'invoice' ? 'invoice' : 'quote';
    $p = [$type];
    $w = ['d.type=?', like_where((string)in('q', ''), ['d.number', 'c.name', 'l.name', 'd.title'], $p)];
    if (($st = (string)in('status', '')) !== '') {
        if ($st === 'due') $w[] = "d.status IN ('unpaid','partial')";
        elseif ($st === 'overdue') $w[] = "d.status IN ('unpaid','partial') AND d.due_date < CURDATE()";
        else { $w[] = 'd.status=?'; $p[] = $st; }
    }
    if ($cid = in_int('customer_id')) { $w[] = 'd.customer_id=?'; $p[] = $cid; }
    if ($from = (string)in('from', '')) { $w[] = 'd.date >= ?'; $p[] = $from; }
    if ($to = (string)in('to', '')) { $w[] = 'd.date <= ?'; $p[] = $to; }
    out(rows('SELECT d.id, d.type, d.number, d.title, d.date, d.due_date, d.status, d.total, d.paid, d.customer_id, d.lead_id,
                     COALESCE(c.name, l.name) AS party, COALESCE(c.phone, l.phone) AS party_phone
              FROM docs d LEFT JOIN customers c ON c.id=d.customer_id LEFT JOIN leads l ON l.id=d.lead_id
              WHERE ' . implode(' AND ', $w) . ' ORDER BY d.date DESC, d.id DESC LIMIT 1000', $p));
});

route('doc_get', 'GET', OFFICE, fn() => out(doc_load(need_id())));

route('doc_save', 'POST', OFFICE, function () {
    $id = in_int('id');
    $type = in('type') === 'invoice' ? 'invoice' : 'quote';
    if ($type === 'invoice') require_role(...STAFF);
    $d = pick(['customer_id' => 'i', 'lead_id' => 'i', 'job_id' => 'i', 'title' => 's', 'date' => 'd', 'due_date' => 'd', 'notes' => 't', 'terms' => 't']);
    if (empty($d['customer_id']) && empty($d['lead_id'])) fail('Choose a customer');
    $lines = [];
    foreach ((array)in('items', []) as $n => $it) {
        $desc = trim((string)($it['description'] ?? ''));
        if ($desc === '') continue;
        $qty = round((float)($it['qty'] ?? 1), 2);
        $rate = round((float)($it['rate'] ?? 0), 2);
        $lines[] = ['product_id' => ($it['product_id'] ?? null) ? (int)$it['product_id'] : null, 'description' => mb_substr($desc, 0, 255),
            'hsn' => mb_substr(trim((string)($it['hsn'] ?? '')), 0, 20) ?: null, 'unit' => mb_substr(trim((string)($it['unit'] ?? '')), 0, 20) ?: null,
            'qty' => $qty, 'rate' => $rate, 'gst' => max(0, min(28, round((float)($it['gst'] ?? 0), 2))), 'amount' => round($qty * $rate, 2), 'sort' => $n];
    }
    if (!$lines) fail('Add at least one item');
    $d += doc_totals($lines, (float)in('discount', 0));
    $d['date'] ??= date('Y-m-d');
    db()->beginTransaction();
    if (!$id) {
        $d['type'] = $type;
        $d['number'] = next_no($type);
        $d['status'] = $type === 'quote' ? (in('status') === 'sent' ? 'sent' : 'draft') : 'unpaid';
        $d['created_by'] = uid();
        $d['from_doc_id'] = in_int('from_doc_id') ?: null;
        $d['terms'] ??= setting($type . '_terms');
        $id = insert('docs', $d);
        log_activity('doc', $id, 'system', ($type === 'quote' ? 'Quotation' : 'Invoice') . ' created · ₹' . number_format($d['total']));
        if (!empty($d['lead_id']) && $type === 'quote') {
            q("UPDATE leads SET stage='quoted' WHERE id=? AND stage IN ('new','contacted','site_visit')", [$d['lead_id']]);
            log_activity('lead', (int)$d['lead_id'], 'system', 'Quotation ' . $d['number'] . ' · ₹' . number_format($d['total']));
        }
        if (!empty($d['customer_id'])) log_activity('customer', (int)$d['customer_id'], 'system', ($type === 'quote' ? 'Quotation ' : 'Invoice ') . $d['number'] . ' · ₹' . number_format($d['total']));
    } else {
        $old = row('SELECT * FROM docs WHERE id=?', [$id]) ?? fail('Not found', 404);
        if ($old['type'] === 'invoice' && $old['status'] === 'cancelled') fail('This invoice is cancelled');
        update('docs', $id, $d);
        q('DELETE FROM doc_items WHERE doc_id=?', [$id]);
        log_activity('doc', $id, 'system', 'Edited · total ₹' . number_format($d['total']));
    }
    foreach ($lines as $ln) insert('doc_items', ['doc_id' => $id] + $ln);
    if ($type === 'invoice') invoice_status($id);
    db()->commit();
    out(['id' => $id]);
});

route('doc_status', 'POST', OFFICE, function () {
    $id = need_id();
    $d = row('SELECT * FROM docs WHERE id=?', [$id]) ?? fail('Not found', 404);
    $st = (string)in('status');
    $ok = $d['type'] === 'quote' ? ['draft', 'sent', 'accepted', 'rejected'] : ['cancelled', 'unpaid'];
    if (!in_array($st, $ok, true)) fail('Unknown status');
    if ($d['type'] === 'invoice') require_role(...STAFF);
    if ($d['type'] === 'invoice' && $st === 'cancelled' && (float)$d['paid'] > 0) fail('Delete the payments first');
    q('UPDATE docs SET status=? WHERE id=?', [$st, $id]);
    if ($d['type'] === 'invoice' && $st === 'unpaid') invoice_status($id);
    log_activity('doc', $id, 'status', 'Status → ' . $st);
    if ($d['type'] === 'quote' && $d['lead_id'] && in_array($st, ['accepted', 'rejected'], true)) {
        if ($st === 'accepted') { lead_to_customer((int)$d['lead_id']); q("UPDATE leads SET stage='won', won_at=NOW() WHERE id=?", [$d['lead_id']]); }
        else q("UPDATE leads SET stage='negotiation' WHERE id=? AND stage='quoted'", [$d['lead_id']]);
        $cid = (int)val('SELECT customer_id FROM leads WHERE id=?', [$d['lead_id']]);
        if ($cid && !$d['customer_id']) q('UPDATE docs SET customer_id=? WHERE id=?', [$cid, $id]);
        log_activity('lead', (int)$d['lead_id'], 'status', 'Quotation ' . $d['number'] . ' ' . $st);
    }
    out(true);
});

/** Accepted quote → invoice (same lines) and/or installation job */
route('doc_convert', 'POST', STAFF, function () {
    $id = need_id();
    $d = doc_load($id);
    if ($d['type'] !== 'quote') fail('Only quotations can be converted');
    $cid = (int)$d['customer_id'] ?: ($d['lead_id'] ? lead_to_customer((int)$d['lead_id']) : 0);
    if (!$cid) fail('Choose a customer first');
    if (!$d['customer_id']) q('UPDATE docs SET customer_id=? WHERE id=?', [$cid, $id]);
    if ($d['status'] !== 'accepted') { q("UPDATE docs SET status='accepted' WHERE id=?", [$id]); if ($d['lead_id']) q("UPDATE leads SET stage='won', won_at=COALESCE(won_at, NOW()) WHERE id=?", [$d['lead_id']]); }
    $to = (string)in('to', 'invoice');
    if ($to === 'job') {
        $c = row('SELECT * FROM customers WHERE id=?', [$cid]);
        $jid = insert('jobs', ['number' => next_no('job'), 'type' => 'installation', 'title' => $d['title'] ?: 'Installation as per ' . $d['number'], 'customer_id' => $cid,
            'address' => $c['address'], 'contact_phone' => $c['phone'], 'description' => implode("\n", array_map(fn($i) => '• ' . rtrim(rtrim((string)$i['qty'], '0'), '.') . ' × ' . $i['description'], $d['items'])),
            'status' => 'new', 'doc_id' => $id, 'created_by' => uid()]);
        log_activity('job', $jid, 'system', 'Job created from quotation ' . $d['number']);
        log_activity('doc', $id, 'system', 'Installation job created');
        out(['job_id' => $jid]);
    }
    if ($inv = val("SELECT id FROM docs WHERE type='invoice' AND from_doc_id=? AND status<>'cancelled'", [$id])) out(['id' => (int)$inv]);
    db()->beginTransaction();
    $nid = insert('docs', ['type' => 'invoice', 'number' => next_no('invoice'), 'customer_id' => $cid, 'lead_id' => $d['lead_id'], 'job_id' => $d['job_id'], 'from_doc_id' => $id,
        'title' => $d['title'], 'date' => date('Y-m-d'), 'due_date' => date('Y-m-d', strtotime('+7 days')), 'status' => 'unpaid', 'subtotal' => $d['subtotal'], 'discount' => $d['discount'],
        'tax' => $d['tax'], 'total' => $d['total'], 'notes' => $d['notes'], 'terms' => setting('invoice_terms'), 'created_by' => uid()]);
    foreach ($d['items'] as $it) { unset($it['id']); $it['doc_id'] = $nid; insert('doc_items', $it); }
    log_activity('doc', $nid, 'system', 'Invoice made from quotation ' . $d['number']);
    log_activity('doc', $id, 'system', 'Converted to invoice');
    db()->commit();
    out(['id' => $nid]);
});

route('doc_delete', 'POST', STAFF, function () {
    $id = need_id();
    $d = row('SELECT * FROM docs WHERE id=?', [$id]) ?? fail('Not found', 404);
    if ($d['type'] === 'invoice' && val('SELECT COUNT(*) FROM payments WHERE doc_id=?', [$id])) fail('This invoice has payments — cancel it instead');
    q('DELETE FROM docs WHERE id=?', [$id]);
    q('DELETE FROM doc_items WHERE doc_id=?', [$id]);
    q('DELETE FROM activities WHERE entity="doc" AND entity_id=?', [$id]);
    out(true);
});

/* ---------------- Payments ---------------- */

route('payment_add', 'POST', [], function () {
    $docId = in_int('doc_id');
    $jobId = in_int('job_id');
    $d = pick(['amount' => 'f', 'mode' => 'e:' . implode('|', PAY_MODES), 'ref' => 's', 'paid_on' => 'd', 'note' => 's']);
    if (($d['amount'] ?? 0) <= 0) fail('Enter the amount received');
    $d['paid_on'] ??= date('Y-m-d');
    $d['mode'] ??= 'cash';
    $d['received_by'] = uid();
    if ($docId) {
        require_role(...STAFF);
        $doc = row("SELECT * FROM docs WHERE id=? AND type='invoice'", [$docId]) ?? fail('Invoice not found', 404);
        if ($doc['status'] === 'cancelled') fail('This invoice is cancelled');
        $d += ['doc_id' => $docId, 'customer_id' => $doc['customer_id']];
        $pid = insert('payments', $d);
        invoice_status($docId);
        log_activity('doc', $docId, 'system', 'Payment ₹' . number_format($d['amount'], 2) . ' · ' . strtoupper($d['mode']) . ($d['ref'] ? ' · ' . $d['ref'] : ''));
    } elseif ($jobId) {
        $job = row('SELECT * FROM jobs WHERE id=?', [$jobId]) ?? fail('Job not found', 404);
        if (role() === 'technician' && (int)$job['assigned_to'] !== uid()) fail('Not your job', 403);
        $d += ['job_id' => $jobId, 'customer_id' => $job['customer_id']];
        $pid = insert('payments', $d);
        q('UPDATE jobs SET collected = collected + ? WHERE id=?', [$d['amount'], $jobId]);
        log_activity('job', $jobId, 'system', 'Collected ₹' . number_format($d['amount'], 2) . ' · ' . strtoupper($d['mode']));
    } else fail('Choose an invoice');
    out(['id' => $pid]);
});

route('payment_delete', 'POST', STAFF, function () {
    $id = need_id();
    $p = row('SELECT * FROM payments WHERE id=?', [$id]) ?? fail('Not found', 404);
    q('DELETE FROM payments WHERE id=?', [$id]);
    if ($p['doc_id']) { invoice_status((int)$p['doc_id']); log_activity('doc', (int)$p['doc_id'], 'system', 'Payment ₹' . number_format((float)$p['amount'], 2) . ' deleted'); }
    if ($p['job_id']) q('UPDATE jobs SET collected = GREATEST(0, collected - ?) WHERE id=?', [$p['amount'], $p['job_id']]);
    out(true);
});

route('payments_list', 'GET', STAFF, function () {
    $p = []; $w = ['1=1'];
    if ($from = (string)in('from', '')) { $w[] = 'p.paid_on >= ?'; $p[] = $from; }
    if ($to = (string)in('to', '')) { $w[] = 'p.paid_on <= ?'; $p[] = $to; }
    if (($m = (string)in('mode', '')) !== '') { $w[] = 'p.mode=?'; $p[] = $m; }
    out(rows('SELECT p.*, c.name AS customer, d.number AS doc_number, j.number AS job_number, u.name AS received_name
              FROM payments p LEFT JOIN customers c ON c.id=p.customer_id LEFT JOIN docs d ON d.id=p.doc_id LEFT JOIN jobs j ON j.id=p.job_id LEFT JOIN users u ON u.id=p.received_by
              WHERE ' . implode(' AND ', $w) . ' ORDER BY p.paid_on DESC, p.id DESC LIMIT 1000', $p));
});
