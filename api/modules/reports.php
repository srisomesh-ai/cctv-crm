<?php
// Dashboard numbers, technician home, reports.
declare(strict_types=1);

route('dashboard', 'GET', [], function () {
    if (role() === 'technician') out(tech_home());
    $m0 = date('Y-m-01');
    $k = [
        'leads_open'     => (int)val("SELECT COUNT(*) FROM leads WHERE stage NOT IN ('won','lost')"),
        'pipeline_value' => (float)val("SELECT COALESCE(SUM(value),0) FROM leads WHERE stage NOT IN ('won','lost')"),
        'followups_due'  => (int)val("SELECT COUNT(*) FROM leads WHERE next_followup < DATE_ADD(CURDATE(), INTERVAL 1 DAY) AND stage NOT IN ('won','lost')"),
        'jobs_today'     => (int)val("SELECT COUNT(*) FROM jobs WHERE DATE(scheduled_at)=CURDATE() AND status<>'cancelled'"),
        'jobs_done_today'=> (int)val("SELECT COUNT(*) FROM jobs WHERE DATE(completed_at)=CURDATE()"),
        'tickets_open'   => (int)val("SELECT COUNT(*) FROM jobs WHERE type IN ('complaint','service') AND status NOT IN ('completed','cancelled')"),
        'tickets_sla'    => (int)val("SELECT COUNT(*) FROM jobs WHERE type IN ('complaint','service') AND status NOT IN ('completed','cancelled') AND created_at < DATE_SUB(NOW(), INTERVAL ? HOUR)", [(int)setting('sla_hours') ?: 24]),
        'unassigned'     => (int)val("SELECT COUNT(*) FROM jobs WHERE assigned_to IS NULL AND status NOT IN ('completed','cancelled') AND (scheduled_at IS NULL OR scheduled_at < DATE_ADD(CURDATE(), INTERVAL 8 DAY))"),
        'revenue_month'  => (float)val("SELECT COALESCE(SUM(total),0) FROM docs WHERE type='invoice' AND status<>'cancelled' AND date >= ?", [$m0]),
        'collected_month'=> (float)val('SELECT COALESCE(SUM(amount),0) FROM payments WHERE paid_on >= ?', [$m0]),
        'outstanding'    => (float)val("SELECT COALESCE(SUM(total-paid),0) FROM docs WHERE type='invoice' AND status IN ('unpaid','partial')"),
        'overdue'        => (float)val("SELECT COALESCE(SUM(total-paid),0) FROM docs WHERE type='invoice' AND status IN ('unpaid','partial') AND due_date < CURDATE()"),
        'amc_active'     => (int)val('SELECT COUNT(*) FROM amc WHERE end_date >= CURDATE()'),
        'amc_expiring'   => (int)val('SELECT COUNT(*) FROM amc WHERE end_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY) AND renewed_to IS NULL'),
        'low_stock'      => (int)val('SELECT COUNT(*) FROM products WHERE active=1 AND track_stock=1 AND stock <= min_stock'),
        'quotes_open'    => (int)val("SELECT COUNT(*) FROM docs WHERE type='quote' AND status IN ('draft','sent')"),
        'quotes_value'   => (float)val("SELECT COALESCE(SUM(total),0) FROM docs WHERE type='quote' AND status IN ('draft','sent')"),
    ];
    // Last 6 months: invoiced vs collected
    $months = [];
    for ($i = 5; $i >= 0; $i--) {
        $s = date('Y-m-01', strtotime("first day of -$i month")); $e = date('Y-m-t', strtotime($s));
        $months[] = ['label' => date('M', strtotime($s)),
            'invoiced' => (float)val("SELECT COALESCE(SUM(total),0) FROM docs WHERE type='invoice' AND status<>'cancelled' AND date BETWEEN ? AND ?", [$s, $e]),
            'collected' => (float)val('SELECT COALESCE(SUM(amount),0) FROM payments WHERE paid_on BETWEEN ? AND ?', [$s, $e])];
    }
    out([
        'kpi' => $k,
        'months' => $months,
        'pipeline' => rows("SELECT stage, COUNT(*) n, COALESCE(SUM(value),0) v FROM leads WHERE stage NOT IN ('lost') AND (stage<>'won' OR won_at >= ?) GROUP BY stage", [$m0]),
        'job_status' => rows("SELECT status, COUNT(*) n FROM jobs WHERE status NOT IN ('completed','cancelled') OR completed_at >= ? GROUP BY status", [$m0]),
        'today' => rows("SELECT j.id, j.number, j.type, j.title, j.status, j.priority, j.scheduled_at, c.name AS customer_name, u.name AS assigned_name, u.color AS assigned_color
            FROM jobs j LEFT JOIN customers c ON c.id=j.customer_id LEFT JOIN users u ON u.id=j.assigned_to
            WHERE DATE(j.scheduled_at)=CURDATE() AND j.status<>'cancelled' ORDER BY j.scheduled_at LIMIT 20"),
        'followups' => rows("SELECT l.id, l.name, l.phone, l.stage, l.next_followup, l.value, u.name AS assigned_name FROM leads l LEFT JOIN users u ON u.id=l.assigned_to
            WHERE l.next_followup < DATE_ADD(CURDATE(), INTERVAL 1 DAY) AND l.stage NOT IN ('won','lost') ORDER BY l.next_followup LIMIT 12"),
        'tickets' => rows("SELECT j.id, j.number, j.title, j.priority, j.status, j.created_at, c.name AS customer_name, u.name AS assigned_name,
            TIMESTAMPDIFF(HOUR, j.created_at, NOW()) AS age_hours FROM jobs j LEFT JOIN customers c ON c.id=j.customer_id LEFT JOIN users u ON u.id=j.assigned_to
            WHERE j.type IN ('complaint','service') AND j.status NOT IN ('completed','cancelled') ORDER BY FIELD(j.priority,'urgent','high','normal','low'), j.created_at LIMIT 8"),
        'team' => rows("SELECT u.id, u.name, u.color,
            (SELECT COUNT(*) FROM jobs j WHERE j.assigned_to=u.id AND DATE(j.scheduled_at)=CURDATE() AND j.status<>'cancelled') AS today,
            (SELECT COUNT(*) FROM jobs j WHERE j.assigned_to=u.id AND j.status NOT IN ('completed','cancelled')) AS open,
            (SELECT COUNT(*) FROM jobs j WHERE j.assigned_to=u.id AND j.status='completed' AND j.completed_at >= ?) AS done_month
            FROM users u WHERE u.active=1 AND u.role='technician' ORDER BY u.name", [$m0]),
        'amc_due' => rows("SELECT a.id, a.number, a.end_date, a.amount, c.name AS customer_name, DATEDIFF(a.end_date, CURDATE()) AS days_left FROM amc a JOIN customers c ON c.id=a.customer_id
            WHERE a.end_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) AND a.renewed_to IS NULL AND a.end_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) ORDER BY a.end_date LIMIT 6"),
        'activity' => rows("SELECT a.*, u.name AS user_name, u.color AS user_color FROM activities a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 12"),
    ]);
});

/** Technician home: today's route, upcoming, recently done, collected this month */
function tech_home(): array {
    $u = uid();
    $sel = "SELECT j.*, c.name AS customer_name, c.phone AS customer_phone FROM jobs j LEFT JOIN customers c ON c.id=j.customer_id WHERE j.assigned_to=? AND ";
    return ['tech' => true,
        'today' => rows($sel . "(DATE(j.scheduled_at)=CURDATE() OR (j.status IN ('in_progress') ) OR (j.scheduled_at < CURDATE() AND j.status NOT IN ('completed','cancelled'))) AND j.status<>'cancelled' ORDER BY j.status='completed', j.scheduled_at", [$u]),
        'upcoming' => rows($sel . "DATE(j.scheduled_at) > CURDATE() AND j.status NOT IN ('completed','cancelled') ORDER BY j.scheduled_at LIMIT 20", [$u]),
        'unscheduled' => rows($sel . "j.scheduled_at IS NULL AND j.status NOT IN ('completed','cancelled') ORDER BY j.id DESC", [$u]),
        'done' => rows($sel . "j.status='completed' ORDER BY j.completed_at DESC LIMIT 10", [$u]),
        'stats' => [
            'done_month' => (int)val("SELECT COUNT(*) FROM jobs WHERE assigned_to=? AND status='completed' AND completed_at >= ?", [$u, date('Y-m-01')]),
            'collected_month' => (float)val('SELECT COALESCE(SUM(amount),0) FROM payments WHERE received_by=? AND paid_on >= ?', [$u, date('Y-m-01')]),
            'rating' => (float)val("SELECT ROUND(AVG(rating),1) FROM jobs WHERE assigned_to=? AND rating IS NOT NULL", [$u]),
        ],
    ];
}

route('jobs_calendar', 'GET', [], function () {
    $from = (string)in('from', date('Y-m-d')); $to = (string)in('to', date('Y-m-d', strtotime('+6 days')));
    $p = [$from . ' 00:00:00', $to . ' 23:59:59'];
    $mine = '';
    if (role() === 'technician') { $mine = ' AND j.assigned_to=?'; $p[] = uid(); }
    out(rows("SELECT j.id, j.number, j.type, j.title, j.status, j.priority, j.scheduled_at, j.assigned_to, c.name AS customer_name, u.name AS assigned_name, u.color AS assigned_color
        FROM jobs j LEFT JOIN customers c ON c.id=j.customer_id LEFT JOIN users u ON u.id=j.assigned_to
        WHERE j.scheduled_at BETWEEN ? AND ? AND j.status<>'cancelled'$mine ORDER BY j.scheduled_at", $p));
});

route('report', 'GET', STAFF, function () {
    $from = (string)in('from', date('Y-m-01', strtotime('-5 months'))); $to = (string)in('to', date('Y-m-d'));
    $r = [$from, $to];
    out([
        'from' => $from, 'to' => $to,
        'summary' => [
            'invoiced' => (float)val("SELECT COALESCE(SUM(total),0) FROM docs WHERE type='invoice' AND status<>'cancelled' AND date BETWEEN ? AND ?", $r),
            'tax' => (float)val("SELECT COALESCE(SUM(tax),0) FROM docs WHERE type='invoice' AND status<>'cancelled' AND date BETWEEN ? AND ?", $r),
            'collected' => (float)val('SELECT COALESCE(SUM(amount),0) FROM payments WHERE paid_on BETWEEN ? AND ?', $r),
            'leads' => (int)val('SELECT COUNT(*) FROM leads WHERE DATE(created_at) BETWEEN ? AND ?', $r),
            'won' => (int)val("SELECT COUNT(*) FROM leads WHERE stage='won' AND DATE(won_at) BETWEEN ? AND ?", $r),
            'jobs_done' => (int)val("SELECT COUNT(*) FROM jobs WHERE status='completed' AND DATE(completed_at) BETWEEN ? AND ?", $r),
            'avg_close_hours' => (float)val("SELECT ROUND(AVG(TIMESTAMPDIFF(HOUR, created_at, completed_at)),1) FROM jobs WHERE type IN ('complaint','service') AND status='completed' AND DATE(completed_at) BETWEEN ? AND ?", $r),
        ],
        'monthly' => rows("SELECT DATE_FORMAT(date,'%Y-%m') m, SUM(total) invoiced, SUM(tax) tax, COUNT(*) n FROM docs WHERE type='invoice' AND status<>'cancelled' AND date BETWEEN ? AND ? GROUP BY m ORDER BY m", $r),
        'sources' => rows("SELECT COALESCE(source,'other') source, COUNT(*) leads, SUM(stage='won') won, COALESCE(SUM(CASE WHEN stage='won' THEN value END),0) won_value
            FROM leads WHERE DATE(created_at) BETWEEN ? AND ? GROUP BY source ORDER BY leads DESC", $r),
        'technicians' => rows("SELECT u.name, u.color, COUNT(j.id) done, SUM(j.type='installation') installs, SUM(j.type IN ('complaint','service')) tickets, SUM(j.type='amc_visit') amc,
            ROUND(AVG(j.rating),1) rating, ROUND(AVG(CASE WHEN j.type IN ('complaint','service') THEN TIMESTAMPDIFF(HOUR, j.created_at, j.completed_at) END),1) avg_hours
            FROM users u LEFT JOIN jobs j ON j.assigned_to=u.id AND j.status='completed' AND DATE(j.completed_at) BETWEEN ? AND ?
            WHERE u.role='technician' AND u.active=1 GROUP BY u.id ORDER BY done DESC", $r),
        'products' => rows("SELECT i.description name, SUM(i.qty) qty, SUM(i.amount) amount FROM doc_items i JOIN docs d ON d.id=i.doc_id
            WHERE d.type='invoice' AND d.status<>'cancelled' AND d.date BETWEEN ? AND ? GROUP BY i.description ORDER BY amount DESC LIMIT 10", $r),
        'aging' => rows("SELECT CASE WHEN due_date >= CURDATE() OR due_date IS NULL THEN 'Not due' WHEN DATEDIFF(CURDATE(), due_date) <= 30 THEN '1–30 days'
                WHEN DATEDIFF(CURDATE(), due_date) <= 60 THEN '31–60 days' ELSE '60+ days' END bucket, COUNT(*) n, SUM(total-paid) amount
            FROM docs WHERE type='invoice' AND status IN ('unpaid','partial') GROUP BY bucket ORDER BY FIELD(bucket,'Not due','1–30 days','31–60 days','60+ days')"),
        'modes' => rows('SELECT mode, SUM(amount) amount, COUNT(*) n FROM payments WHERE paid_on BETWEEN ? AND ? GROUP BY mode ORDER BY amount DESC', $r),
    ]);
});
