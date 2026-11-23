<?php
// Demo data for a CCTV business: team, products, customers, leads, quotations, invoices, payments, jobs, AMC.
// Dates are relative to today so the demo always looks current. seed_demo(true) wipes business data first.
declare(strict_types=1);

function seed_demo(bool $wipe): void {
    mt_srand(42);
    $pdo = db();
    if ($wipe) {
        foreach (DATA_TABLES as $t) $pdo->exec("DELETE FROM `$t`");
        $pdo->exec("DELETE FROM settings WHERE k LIKE 'seq\\_%'");
        $pdo->exec("DELETE FROM users WHERE email LIKE '%@demo.crm'");
    }
    $now = time();
    $at = fn(int $days, int $hour = 10, int $min = 0) => date('Y-m-d H:i:s', strtotime(date('Y-m-d', $now + $days * 86400) . sprintf(' %02d:%02d:00', $hour, $min)));
    $day = fn(int $days) => date('Y-m-d', $now + $days * 86400);
    $pick = fn(array $a) => $a[mt_rand(0, count($a) - 1)];

    foreach (['company_name' => 'Secure Eye CCTV Solutions', 'company_tagline' => 'CCTV · Access Control · Surveillance', 'company_phone' => '+91 98765 43210',
              'company_email' => 'info@secureeye.in', 'company_address' => "Shop 12, MVP Double Road\nVisakhapatnam, Andhra Pradesh 530017", 'company_gstin' => '37ABCDE1234F1Z5',
              'company_state' => 'Andhra Pradesh', 'bank_details' => "HDFC Bank · A/c 50200012345678 · IFSC HDFC0001234", 'upi_id' => 'secureeye@hdfcbank'] as $k => $v) set_setting($k, $v);

    /* Team (password for all demo users: demo123) */
    $pw = password_hash('demo123', PASSWORD_DEFAULT);
    $team = [];
    foreach ([['Ravi Kumar', 'admin', '#4f46e5'], ['Priya Sharma', 'manager', '#0891b2'], ['Anil Varma', 'sales', '#db2777'], ['Sneha Reddy', 'sales', '#ea580c'],
              ['Suresh Babu', 'technician', '#16a34a'], ['Kiran Teja', 'technician', '#9333ea'], ['Mahesh Naidu', 'technician', '#ca8a04']] as $i => [$n, $r, $c]) {
        $email = strtolower(explode(' ', $n)[0]) . '@demo.crm';
        $id = (int)val('SELECT id FROM users WHERE email=?', [$email]);
        if (!$id) $id = insert('users', ['name' => $n, 'email' => $email, 'phone' => '9' . str_pad((string)(870000001 + $i * 1111), 9, '0'), 'role' => $r, 'password_hash' => $pw, 'color' => $c]);
        $team[$r][] = $id;
    }
    $admin = $team['admin'][0]; $sales = $team['sales']; $techs = $team['technician']; $office = array_merge($team['admin'], $team['manager'], $sales);

    /* Products */
    $P = [];
    foreach ([
        ['CAM-HD2D', 'CP Plus 2.4MP HD Dome Camera (Night vision 20m)', 'camera', 'CP Plus', 1450, 980, 18, '8525', 46, 15, 12],
        ['CAM-HD2B', 'CP Plus 2.4MP HD Bullet Camera (IR 30m)', 'camera', 'CP Plus', 1650, 1120, 18, '8525', 38, 15, 12],
        ['CAM-HK5D', 'Hikvision 5MP HD Dome Camera', 'camera', 'Hikvision', 2350, 1680, 18, '8525', 22, 10, 24],
        ['CAM-IP4B', 'Hikvision 4MP IP Bullet Camera (PoE, Colour night)', 'camera', 'Hikvision', 4900, 3550, 18, '8525', 14, 8, 24],
        ['CAM-IP4D', 'Dahua 4MP IP Dome Camera (PoE, Audio)', 'camera', 'Dahua', 4600, 3300, 18, '8525', 6, 8, 24],
        ['CAM-PTZ', 'Hikvision 4MP PTZ Camera 25x Zoom', 'camera', 'Hikvision', 28500, 22100, 18, '8525', 2, 1, 24],
        ['CAM-WIFI', 'Imou 3MP Wi-Fi Camera (Pan/Tilt, 2-way audio)', 'camera', 'Imou', 2650, 1900, 18, '8525', 19, 6, 12],
        ['DVR-4', 'CP Plus 4 Channel HD DVR (5MP Lite)', 'dvr', 'CP Plus', 3800, 2700, 18, '8521', 12, 5, 24],
        ['DVR-8', 'CP Plus 8 Channel HD DVR (5MP Lite)', 'dvr', 'CP Plus', 5400, 3900, 18, '8521', 9, 4, 24],
        ['DVR-16', 'Hikvision 16 Channel HD DVR', 'dvr', 'Hikvision', 9800, 7300, 18, '8521', 3, 2, 24],
        ['NVR-8', 'Hikvision 8 Channel NVR (8 PoE ports)', 'nvr', 'Hikvision', 11500, 8600, 18, '8521', 4, 2, 24],
        ['NVR-16', 'Dahua 16 Channel NVR (4K)', 'nvr', 'Dahua', 16800, 12900, 18, '8521', 1, 2, 24],
        ['HDD-1T', 'Seagate SkyHawk 1TB Surveillance HDD', 'hdd', 'Seagate', 3950, 3250, 18, '8471', 15, 6, 36],
        ['HDD-2T', 'WD Purple 2TB Surveillance HDD', 'hdd', 'WD', 5800, 4800, 18, '8471', 11, 5, 36],
        ['HDD-4T', 'WD Purple 4TB Surveillance HDD', 'hdd', 'WD', 9200, 7700, 18, '8471', 3, 3, 36],
        ['CBL-3P1', '3+1 CCTV Copper Cable (90 m roll)', 'cable', 'Polycab', 2400, 1750, 18, '8544', 24, 8, null],
        ['CBL-CAT6', 'CAT6 LAN Cable (305 m box)', 'cable', 'D-Link', 7800, 6100, 18, '8544', 5, 2, null],
        ['PWR-4', '4 Channel CCTV Power Supply (SMPS 5A)', 'power', 'CP Plus', 850, 520, 18, '8504', 21, 8, 12],
        ['PWR-8', '8 Channel CCTV Power Supply (SMPS 10A)', 'power', 'CP Plus', 1350, 860, 18, '8504', 4, 6, 12],
        ['UPS-600', 'UPS 600VA for DVR/NVR', 'power', 'APC', 3200, 2550, 18, '8504', 7, 3, 24],
        ['POE-8', '8 Port PoE Switch (120W)', 'network', 'TP-Link', 5600, 4300, 18, '8517', 6, 3, 24],
        ['RACK-6U', '6U Wall Mount Rack', 'accessory', 'Generic', 2900, 2100, 18, '8538', 5, 2, null],
        ['ACC-BNC', 'BNC + DC Connector Set (per camera)', 'accessory', 'Generic', 60, 25, 18, '8536', 300, 100, null],
        ['ACC-MON', '22" LED Monitor with HDMI', 'accessory', 'LG', 7400, 6100, 18, '8528', 3, 2, 12],
        ['SRV-INST', 'Installation charges (per camera)', 'service', null, 500, 0, 18, '9987', 0, 0, null],
        ['SRV-VISIT', 'Service visit charges', 'service', null, 400, 0, 18, '9987', 0, 0, null],
        ['SRV-MOB', 'Mobile app & remote viewing setup', 'service', null, 300, 0, 18, '9987', 0, 0, null],
    ] as [$sku, $n, $cat, $brand, $price, $cost, $gst, $hsn, $stock, $min, $war]) {
        $P[$sku] = ['id' => insert('products', ['sku' => $sku, 'name' => $n, 'category' => $cat, 'brand' => $brand, 'unit' => in_array($cat, ['cable'], true) ? 'roll' : ($cat === 'service' ? 'job' : 'pcs'),
            'price' => $price, 'cost' => $cost, 'gst' => $gst, 'hsn' => $hsn, 'stock' => $stock, 'min_stock' => $min, 'warranty_months' => $war, 'track_stock' => $cat === 'service' ? 0 : 1]),
            'name' => $n, 'price' => $price, 'gst' => $gst, 'hsn' => $hsn, 'unit' => $cat === 'cable' ? 'roll' : ($cat === 'service' ? 'job' : 'pcs')];
        if ($cat !== 'service') insert('stock_moves', ['product_id' => $P[$sku]['id'], 'qty' => $stock, 'kind' => 'purchase', 'ref' => 'Opening', 'note' => 'Opening stock', 'user_id' => $admin, 'created_at' => $at(-120)]);
    }

    /* Customers */
    $areas = ['MVP Colony', 'Dwaraka Nagar', 'Gajuwaka', 'Madhurawada', 'Seethammadhara', 'Rushikonda', 'Pendurthi', 'Siripuram', 'Akkayyapalem', 'Kurmannapalem', 'Asilmetta', 'Yendada'];
    $C = [];
    foreach ([
        ['Srinivas Rao', null, 'home'], ['Lakshmi Textiles', 'Lakshmi Textiles', 'shop'], ['Dr. Anjali Mehta', 'Mehta Children\'s Clinic', 'hospital'],
        ['Venkat Apartments Welfare Assn.', 'Venkat Residency', 'apartment'], ['Sri Chaitanya School', 'Sri Chaitanya School – Gajuwaka branch', 'school'],
        ['Ramesh Gupta', 'Gupta Jewellers', 'shop'], ['Harika Foods Pvt Ltd', 'Harika Foods', 'factory'], ['Naveen Kumar', null, 'home'],
        ['Sai Krishna Medicals', 'Sai Krishna Medicals', 'shop'], ['Blue Ocean Restaurant', 'Blue Ocean Family Restaurant', 'shop'],
        ['Padmaja Hospital', 'Padmaja Multi-speciality Hospital', 'hospital'], ['Kalyan Motors', 'Kalyan Motors (Honda Showroom)', 'shop'],
        ['Vijaya Lakshmi', null, 'home'], ['Coastal Logistics', 'Coastal Logistics Warehouse', 'factory'], ['Green Valley Villas', 'Green Valley Villas Owners', 'apartment'],
        ['Prasad Electronics', 'Prasad Electronics', 'shop'], ['Bhaskar Reddy', null, 'home'], ['St. Mary\'s Church', null, 'other'],
        ['Fit Zone Gym', 'Fit Zone Fitness Studio', 'shop'], ['Andhra Steel Traders', 'Andhra Steel Traders', 'office'], ['Krishna Kumari', null, 'home'],
        ['Sunrise PG Hostel', 'Sunrise Ladies PG', 'apartment'],
    ] as $i => [$n, $co, $cat]) {
        $area = $areas[$i % count($areas)];
        $C[] = insert('customers', ['name' => $n, 'company' => $co, 'phone' => '9' . str_pad((string)(848000123 + $i * 70913), 9, '0'), 'email' => $i % 3 === 0 ? strtolower(preg_replace('/[^a-z]/i', '', explode(' ', $n)[0])) . '@example.com' : null,
            'address' => (10 + $i * 7) . '-' . (1 + $i % 9) . '-' . (20 + $i) . ', ' . $area, 'city' => 'Visakhapatnam', 'pincode' => '5300' . str_pad((string)(10 + $i % 40), 2, '0'),
            'gstin' => in_array($cat, ['shop', 'factory', 'office', 'hospital'], true) && $i % 2 ? '37AAB' . strtoupper(substr(md5($n), 0, 5)) . (1000 + $i) . 'F1Z' . ($i % 9) : null,
            'category' => $cat, 'source' => $pick(['referral', 'phone', 'whatsapp', 'justdial', 'website', 'walk-in']), 'created_by' => $pick($office), 'created_at' => $at(-200 + $i * 8)]);
    }
    $cust = fn(int $i) => row('SELECT * FROM customers WHERE id=?', [$C[$i]]);

    /* Documents helper */
    $mkdoc = function (string $type, int $cid, ?int $leadId, int $daysAgo, array $lines, float $disc, string $status, string $title) use ($day, $at, $pick, $office, $P) {
        $items = []; $n = 0;
        foreach ($lines as [$sku, $qty]) { $p = $P[$sku]; $items[] = ['product_id' => $p['id'], 'description' => $p['name'], 'hsn' => $p['hsn'], 'unit' => $p['unit'], 'qty' => $qty, 'rate' => $p['price'], 'gst' => $p['gst'], 'amount' => round($qty * $p['price'], 2), 'sort' => $n++]; }
        $t = doc_totals($items, $disc);
        $id = insert('docs', ['type' => $type, 'number' => next_no($type), 'customer_id' => $cid ?: null, 'lead_id' => $leadId, 'title' => $title, 'date' => $day(-$daysAgo),
            'due_date' => $day(-$daysAgo + ($type === 'quote' ? 15 : 7)), 'status' => $status, 'terms' => setting($type . '_terms'), 'created_by' => $pick($office), 'created_at' => $at(-$daysAgo, 11)] + $t);
        foreach ($items as $it) insert('doc_items', ['doc_id' => $id] + $it);
        q('INSERT INTO activities (entity, entity_id, user_id, kind, body, created_at) VALUES ("doc", ?, ?, "system", ?, ?)', [$id, $pick($office), ($type === 'quote' ? 'Quotation' : 'Invoice') . ' created · ₹' . number_format($t['total']), $at(-$daysAgo, 11)]);
        return [$id, $t['total']];
    };
    $pay = function (int $docId, int $cid, float $amt, int $daysAgo) use ($day, $pick, $office) {
        insert('payments', ['doc_id' => $docId, 'customer_id' => $cid, 'amount' => $amt, 'mode' => $pick(['upi', 'upi', 'cash', 'bank', 'cheque']), 'ref' => mt_rand(0, 1) ? 'UTR' . mt_rand(100000000, 999999999) : null,
            'paid_on' => $day(-$daysAgo), 'received_by' => $pick($office)]);
        invoice_status($docId);
    };
    $kits = [
        [['CAM-HD2D', 2], ['CAM-HD2B', 2], ['DVR-4', 1], ['HDD-1T', 1], ['CBL-3P1', 1], ['PWR-4', 1], ['ACC-BNC', 4], ['SRV-INST', 4], ['SRV-MOB', 1]],
        [['CAM-HD2D', 4], ['CAM-HD2B', 4], ['DVR-8', 1], ['HDD-2T', 1], ['CBL-3P1', 2], ['PWR-8', 1], ['ACC-BNC', 8], ['SRV-INST', 8], ['SRV-MOB', 1]],
        [['CAM-IP4B', 6], ['CAM-IP4D', 2], ['NVR-8', 1], ['POE-8', 1], ['HDD-4T', 1], ['CBL-CAT6', 1], ['RACK-6U', 1], ['UPS-600', 1], ['SRV-INST', 8]],
        [['CAM-HK5D', 10], ['CAM-HD2B', 6], ['DVR-16', 1], ['HDD-4T', 1], ['CBL-3P1', 4], ['PWR-8', 2], ['ACC-BNC', 16], ['ACC-MON', 1], ['SRV-INST', 16]],
        [['CAM-WIFI', 2], ['SRV-MOB', 1]],
    ];

    /* Past installations: invoice + payments + completed job with materials */
    $jobAt = function (array $d) { return insert('jobs', $d); };
    foreach ([[0, 0, 160], [1, 1, 140], [2, 2, 120], [3, 3, 100], [4, 3, 85], [5, 1, 70], [6, 2, 55], [8, 0, 45], [9, 1, 38], [10, 3, 30], [11, 1, 22], [12, 4, 16], [14, 2, 9], [15, 0, 5], [16, 4, 2]] as [$ci, $kit, $ago]) {
        $c = $cust($ci);
        $cams = array_sum(array_map(fn($l) => str_starts_with($l[0], 'CAM') ? $l[1] : 0, $kits[$kit]));
        [$qid, $qt] = $mkdoc('quote', $c['id'], null, $ago + 6, $kits[$kit], in_array($kit, [2, 3], true) ? 1500 : 0, 'accepted', $cams . ' camera CCTV system');
        [$iid, $tot] = $mkdoc('invoice', $c['id'], null, $ago, $kits[$kit], in_array($kit, [2, 3], true) ? 1500 : 0, 'unpaid', $cams . ' camera CCTV system');
        q('UPDATE docs SET from_doc_id=? WHERE id=?', [$qid, $iid]);
        $tech = $techs[$ci % 3];
        $jid = $jobAt(['number' => next_no('job'), 'type' => 'installation', 'title' => "Install $cams-camera CCTV system", 'customer_id' => $c['id'], 'address' => $c['address'], 'contact_phone' => $c['phone'],
            'description' => 'Installation as per quotation.', 'priority' => 'normal', 'status' => 'completed', 'scheduled_at' => $at(-$ago + 1, 10), 'assigned_to' => $tech, 'doc_id' => $qid,
            'started_at' => $at(-$ago + 1, 10, 20), 'completed_at' => $at(-$ago + 1, 17, 30), 'resolution' => "Installed $cams cameras, configured DVR/NVR, mobile app set up and demo given to customer.",
            'rating' => $pick([5, 5, 4, 5, 4]), 'created_by' => $pick($office), 'created_at' => $at(-$ago - 2)]);
        foreach ($kits[$kit] as [$sku, $qty]) if (!str_starts_with($sku, 'SRV')) insert('job_items', ['job_id' => $jid, 'product_id' => $P[$sku]['id'], 'qty' => $qty, 'created_at' => $at(-$ago + 1, 16)]);
        q('UPDATE docs SET job_id=? WHERE id IN (?,?)', [$jid, $qid, $iid]);
        if ($ago > 25) $pay($iid, $c['id'], $tot, $ago - 3);
        elseif ($ago > 8) { $pay($iid, $c['id'], round($tot * 0.5), $ago); if ($ci % 2) $pay($iid, $c['id'], $tot - round($tot * 0.5), $ago - 6); }
        elseif ($ago > 3) $pay($iid, $c['id'], round($tot * 0.5), $ago);
        foreach ([[-$ago - 2, 'Job created'], [-$ago + 1, 'Started'], [-$ago + 1, "Completed · Installed $cams cameras"]] as $n => [$d, $b])
            q('INSERT INTO activities (entity, entity_id, user_id, kind, body, created_at) VALUES ("job", ?, ?, ?, ?, ?)', [$jid, $n ? $tech : $admin, $n ? 'status' : 'system', $b, $at($d, 10 + $n * 3)]);
    }

    /* AMC contracts (some expiring soon) */
    $A = [];
    foreach ([[2, -300, 4, 6500, 8], [3, -330, 4, 12000, 16], [4, -200, 3, 9000, 14], [10, -350, 4, 15000, 24], [6, -100, 4, 7500, 8], [11, -20, 2, 4500, 6], [0, -395, 2, 2500, 4]] as [$ci, $startAgo, $visits, $amt, $cams]) {
        $c = $cust($ci);
        $start = $day($startAgo); $end = date('Y-m-d', strtotime($start . ' +1 year -1 day'));
        $aid = insert('amc', ['number' => next_no('amc'), 'customer_id' => $c['id'], 'title' => 'Comprehensive AMC – ' . $cams . ' cameras', 'start_date' => $start, 'end_date' => $end,
            'visits' => $visits, 'amount' => $amt, 'cameras' => $cams, 'covers' => "Quarterly preventive maintenance\nFree service calls (labour)\nDVR/NVR health check & firmware update\nSpare parts at 10% discount",
            'created_by' => $admin, 'created_at' => $at($startAgo)]);
        $A[] = $aid;
        $step = 365 / $visits;
        for ($v = 0; $v < $visits; $v++) {
            $when = (int)round($startAgo + $step * $v + $step / 2);
            $done = $when < 0;
            $tech = $techs[($ci + $v) % 3];
            insert('jobs', ['number' => next_no('job'), 'type' => 'amc_visit', 'title' => 'AMC visit ' . ($v + 1) . ' of ' . $visits, 'customer_id' => $c['id'], 'address' => $c['address'], 'contact_phone' => $c['phone'],
                'description' => "Preventive maintenance:\n• Clean cameras & check focus\n• Check recording & HDD health\n• Check power supply & cabling", 'status' => $done ? 'completed' : ($when <= 14 ? 'scheduled' : 'new'),
                'scheduled_at' => $at($when, 11), 'assigned_to' => $done || $when <= 14 ? $tech : null, 'amc_id' => $aid, 'completed_at' => $done ? $at($when, 13) : null,
                'resolution' => $done ? 'All cameras cleaned and checked. Recording OK, HDD healthy.' : null, 'rating' => $done ? 5 : null, 'created_by' => $admin, 'created_at' => $at($startAgo)]);
        }
        if ($startAgo > -40) { [$ai] = $mkdoc('invoice', $c['id'], null, -$startAgo, [['SRV-VISIT', 1]], 0, 'unpaid', 'AMC ' . $cams . ' cameras'); q('UPDATE doc_items SET description=?, rate=?, amount=? WHERE doc_id=?', ['Annual Maintenance Contract – ' . $cams . ' cameras', $amt, $amt, $ai]); $t = doc_totals([['amount' => $amt, 'gst' => 18]], 0); update('docs', $ai, $t); }
    }

    /* Complaints / service tickets */
    $issues = [
        ['Camera 3 showing no video', 'urgent'], ['DVR not recording since 2 days', 'urgent'], ['Mobile app not connecting remotely', 'normal'], ['Night vision blurry on gate camera', 'normal'],
        ['HDD error beep on DVR', 'high'], ['Need to shift 2 cameras to new location', 'low'], ['Power adapter burnt after rain', 'high'], ['Wrong date & time on recordings', 'low'],
        ['Camera cable cut during painting work', 'high'], ['Add 2 more cameras to existing setup', 'normal'],
    ];
    foreach ($issues as $n => [$t, $pr]) {
        $c = $cust([0, 1, 3, 5, 6, 8, 9, 10, 12, 14][$n]);
        $state = [['completed', -12], ['completed', -6], ['completed', -3], ['in_progress', 0], ['scheduled', 0], ['scheduled', 1], ['new', null], ['on_hold', -1], ['scheduled', 2], ['new', null]][$n];
        $tech = $state[1] === null && $n === 6 ? null : $techs[$n % 3];
        $created = $state[1] === null ? $at(0, 9 - $n % 3) : $at(min(0, $state[1]) - 1, 9 + $n % 6);
        $jid = insert('jobs', ['number' => next_no('job'), 'type' => $n === 9 || $n === 5 ? 'service' : 'complaint', 'title' => $t, 'customer_id' => $c['id'], 'address' => $c['address'], 'contact_phone' => $c['phone'],
            'description' => 'Customer called: ' . strtolower($t) . '.', 'priority' => $pr, 'status' => $state[0], 'scheduled_at' => $state[1] === null ? null : $at($state[1], 10 + $n % 7),
            'assigned_to' => $tech, 'started_at' => in_array($state[0], ['in_progress', 'completed', 'on_hold'], true) ? $at($state[1], 11) : null,
            'completed_at' => $state[0] === 'completed' ? $at($state[1], 14) : null, 'resolution' => $state[0] === 'completed' ? ['Replaced BNC connector, video restored.', 'Replaced faulty HDD (under warranty), recording working.', 'Port forwarding & P2P re-configured, app working on customer phone.'][$n] : null,
            'charge' => $n < 3 ? 400 : 0, 'collected' => $n === 0 || $n === 2 ? 400 : 0, 'rating' => $state[0] === 'completed' ? 5 - $n % 2 : null, 'created_by' => $pick($office), 'created_at' => $created]);
        if ($n === 0 || $n === 2) insert('payments', ['job_id' => $jid, 'customer_id' => $c['id'], 'amount' => 400, 'mode' => 'upi', 'paid_on' => $day($state[1]), 'received_by' => $tech]);
        if ($n === 1) { insert('job_items', ['job_id' => $jid, 'product_id' => $P['HDD-1T']['id'], 'qty' => 1]); insert('stock_moves', ['product_id' => $P['HDD-1T']['id'], 'qty' => -1, 'kind' => 'job', 'ref' => 'Warranty', 'user_id' => $tech, 'created_at' => $at(-6, 13)]); }
        q('INSERT INTO activities (entity, entity_id, user_id, kind, body, created_at) VALUES ("job", ?, ?, "system", "Complaint registered on call", ?)', [$jid, $pick($office), $created]);
    }

    /* Upcoming installations */
    foreach ([[17, 2, 0, 10], [18, 0, 1, 11], [19, 1, 2, 9]] as [$ci, $kit, $inDays, $h]) {
        $c = $cust($ci);
        [$qid] = $mkdoc('quote', $c['id'], null, 4 + $inDays, $kits[$kit], 0, 'accepted', 'CCTV installation');
        insert('jobs', ['number' => next_no('job'), 'type' => 'installation', 'title' => 'New CCTV installation', 'customer_id' => $c['id'], 'address' => $c['address'], 'contact_phone' => $c['phone'],
            'description' => 'As per quotation. Customer prefers morning slot.', 'priority' => 'high', 'status' => $inDays === 0 ? 'in_progress' : 'scheduled', 'scheduled_at' => $at($inDays, $h),
            'started_at' => $inDays === 0 ? $at(0, 10, 15) : null, 'assigned_to' => $techs[$ci % 3], 'doc_id' => $qid, 'created_by' => $pick($office), 'created_at' => $at(-3)]);
    }
    insert('jobs', ['number' => next_no('job'), 'type' => 'survey', 'title' => 'Site survey for 32-camera warehouse', 'customer_id' => $C[13], 'address' => $cust(13)['address'], 'contact_phone' => $cust(13)['phone'],
        'description' => 'Measure cable runs, check power points, suggest PTZ for loading bay.', 'priority' => 'high', 'status' => 'scheduled', 'scheduled_at' => $at(0, 15), 'assigned_to' => $techs[0], 'created_by' => $sales[0], 'created_at' => $at(-1)]);

    /* Leads pipeline */
    $reqs = ['4 cameras for house with mobile view', '8 cameras for shop & godown', '16 camera IP system for school', 'Wi-Fi camera for elderly parents', 'Apartment gate + parking 12 cameras',
             'Office 6 cameras + attendance', 'Factory 24 cameras with PTZ', 'Clinic 4 cameras with audio', 'Hostel 10 cameras corridors', 'Showroom 8 cameras colour night vision'];
    $names = ['Mohan Rao', 'Sravani Textiles', 'Vignan School', 'Ramya K', 'Sai Residency', 'Kumar & Co. Auditors', 'Vizag Plastics', 'Dr. Prakash', 'Ganga PG', 'Royal Furniture',
              'Teja Bakery', 'Anand Nagar Temple', 'Meena Boutique', 'Raju Hardware', 'Sowmya Diagnostics', 'Pavan Kumar', 'Lotus Spa', 'City Cars', 'Harsha Villas', 'Annapurna Mess',
              'Global Tutorials', 'Satya Agencies', 'Nikhil (Villa 22)', 'Om Sai Traders'];
    $stages = ['new', 'new', 'new', 'contacted', 'contacted', 'contacted', 'site_visit', 'site_visit', 'quoted', 'quoted', 'quoted', 'negotiation', 'negotiation', 'won', 'won', 'lost',
               'new', 'contacted', 'site_visit', 'quoted', 'new', 'contacted', 'quoted', 'lost'];
    foreach ($names as $n => $name) {
        $stage = $stages[$n];
        $cams = [4, 8, 16, 1, 12, 6, 24, 4, 10, 8][$n % 10];
        $value = $cams * mt_rand(2800, 4200);
        $created = -mt_rand(1, 40);
        $fu = in_array($stage, ['won', 'lost'], true) ? null : [-2, -1, 0, 0, 0, 1, 2, 3, 5, 7][$n % 10];
        $lid = insert('leads', ['name' => $name, 'company' => preg_match('/School|Textiles|Residency|Co\.|Plastics|PG|Furniture|Bakery|Temple|Boutique|Hardware|Diagnostics|Spa|Cars|Villas|Mess|Tutorials|Agencies|Traders/', $name) ? $name : null,
            'phone' => '9' . str_pad((string)(701230045 + $n * 33331), 9, '0'), 'city' => 'Visakhapatnam', 'address' => $areas[$n % count($areas)] . ', Visakhapatnam', 'requirement' => $reqs[$n % 10],
            'property_type' => ['home', 'shop', 'school', 'home', 'apartment', 'office', 'factory', 'hospital', 'apartment', 'shop'][$n % 10], 'cameras' => $cams, 'value' => $value,
            'source' => $pick(['justdial', 'whatsapp', 'referral', 'website', 'phone', 'indiamart', 'walk-in']), 'stage' => $stage, 'priority' => $pick(['normal', 'normal', 'high', 'low']),
            'assigned_to' => $sales[$n % 2], 'next_followup' => $fu === null ? null : $at($fu, 10 + $n % 8, $n % 2 ? 30 : 0), 'lost_reason' => $stage === 'lost' ? $pick(['Price too high', 'Went with local vendor', 'Postponed purchase']) : null,
            'won_at' => $stage === 'won' ? $at($created + 5) : null, 'created_by' => $sales[$n % 2], 'created_at' => $at($created, 9 + $n % 9)]);
        $notes = [['call', 'Called — interested, asked for price list on WhatsApp.'], ['whatsapp', 'Sent brochure and sample photos of night vision.'],
                  ['visit', 'Site visit done. Needs ' . $cams . ' cameras, cable run approx ' . ($cams * 25) . ' m.'], ['call', 'Customer comparing with another vendor, follow up after 2 days.']];
        $steps = array_search($stage, ['new', 'contacted', 'site_visit', 'quoted', 'negotiation', 'won', 'lost'], true);
        q('INSERT INTO activities (entity, entity_id, user_id, kind, body, created_at) VALUES ("lead", ?, ?, "system", ?, ?)', [$lid, $sales[$n % 2], 'Lead created · source: enquiry', $at($created, 9)]);
        for ($s = 0; $s < min($steps, 4); $s++) q('INSERT INTO activities (entity, entity_id, user_id, kind, body, created_at) VALUES ("lead", ?, ?, ?, ?, ?)', [$lid, $sales[$n % 2], $notes[$s][0], $notes[$s][1], $at($created + $s + 1, 12)]);
        if (in_array($stage, ['quoted', 'negotiation'], true)) $mkdoc('quote', 0, $lid, -$created - 3, $kits[$n % 4], $stage === 'negotiation' ? 1000 : 0, $stage === 'quoted' ? 'sent' : 'sent', $cams . ' camera CCTV system');
        if ($stage === 'won') { $cid = insert('customers', ['name' => $name, 'phone' => '9' . str_pad((string)(701230045 + $n * 33331), 9, '0'), 'address' => $areas[$n % count($areas)] . ', Visakhapatnam', 'city' => 'Visakhapatnam', 'category' => 'shop', 'source' => 'lead', 'created_by' => $sales[$n % 2]]);
            q('UPDATE leads SET customer_id=? WHERE id=?', [$cid, $lid]); }
    }
    // Low stock on purpose for the demo
    q("UPDATE products SET stock=1 WHERE sku IN ('NVR-16','CAM-PTZ')");
    q("UPDATE products SET stock=2 WHERE sku='PWR-8'");
    // Overdue invoices: give recent unpaid invoices an older due date
    q("UPDATE docs SET due_date = DATE_SUB(CURDATE(), INTERVAL 12 DAY) WHERE type='invoice' AND status IN ('unpaid','partial') AND date < DATE_SUB(CURDATE(), INTERVAL 8 DAY)");
}
