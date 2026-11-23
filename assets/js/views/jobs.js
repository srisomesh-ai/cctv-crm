// Jobs: installations, complaints/service tickets, AMC visits, surveys. List, week schedule, job page (status, materials, photos, payment).
import { S, api, run, esc, ic, $, $$, on, money, fdate, fdt, ftime, ago, badge, who, empty, formModal, modal, confirmBox, noteBox, timeline, pageHead,
  JOB_TYPES, JOB_STATUS, PRIORITY, PAY_MODES, telLink, waLink, mapLink, debounce, toast, today, can, staff, office, formValues, field, wireFields } from '../core.js';

const jobFields = (complaint = false) => [
  { name: 'customer_id', label: 'Customer', type: 'customer', required: true, full: true },
  { name: 'type', label: 'Type', type: 'select', options: Object.fromEntries(Object.entries(JOB_TYPES).map(([k, v]) => [k, v[0]])), blank: false, value: complaint ? 'complaint' : 'installation' },
  { name: 'priority', label: 'Priority', type: 'select', options: Object.fromEntries(Object.entries(PRIORITY).map(([k, v]) => [k, v[0]])), blank: false, value: complaint ? 'high' : 'normal' },
  { name: 'title', label: complaint ? 'Problem' : 'Title', required: true, full: true, placeholder: complaint ? 'e.g. Camera 3 no video, DVR beeping' : 'e.g. Install 8 cameras + NVR' },
  { name: 'description', label: complaint ? 'Details from the customer' : 'Work details', type: 'textarea' },
  { name: 'assigned_to', label: 'Technician', type: 'user', roles: ['technician', 'manager', 'admin'] },
  { name: 'scheduled_at', label: 'Visit date & time', type: 'datetime' },
  { name: 'contact_phone', label: 'Site contact phone', type: 'tel', help: 'Leave empty to use the customer phone' },
  { name: 'charge', label: 'Visit charge (₹)', type: 'number', help: 'Amount the technician should collect (0 = free / AMC)' },
  { name: 'address', label: 'Site address', type: 'textarea', rows: 2, help: 'Leave empty to use the customer address' },
];
export function newJob(data = {}, complaint = false) {
  formModal({ title: complaint ? 'New complaint / service call' : 'New job', size: 'lg', fields: jobFields(complaint), data,
    submit: async v => { const r = await run('job_save', v, complaint ? 'Complaint registered' : 'Job created'); if (r) { location.hash = '#/jobs/' + r.id; return true; } } });
}
export const newComplaint = (data = {}) => newJob(data, true);

/* ---------------- List ---------------- */
const st = { q: '', status: 'open', type: '', assigned_to: '' };
export const tickets = (el, p, qs) => list(el, p, qs, true);
export async function list(el, _p, qs, ticketsOnly = false) {
  const tech = can('technician');
  const type = ticketsOnly ? 'tickets' : st.type;
  if (qs?.get('status')) st.status = qs.get('status');
  const STATUSES = [['open', 'Open'], ['today', 'Today'], ['overdue', 'Overdue'], ...(tech ? [] : [['unassigned', 'Unassigned']]), ['completed', 'Completed'], ['', 'All']];
  el.innerHTML = pageHead(ticketsOnly ? 'Complaints & service' : (tech ? 'My jobs' : 'Jobs'),
    ticketsOnly ? `Service tickets with age — SLA ${esc(S.settings.sla_hours || 24)} hours.` : 'Installations, complaints, AMC visits and site surveys.',
    office() ? `<button class="btn ${ticketsOnly ? 'p' : ''}" data-nc>${ic('alert')}Complaint</button>${ticketsOnly ? '' : `<button class="btn p" data-nj>${ic('plus')}New job</button>`}` : '')
    + `<div class="filters"><input class="in q" placeholder="Search job no., customer, phone…" value="${esc(st.q)}">
      ${ticketsOnly ? '' : `<select class="in" data-f="type"><option value="">All types</option>${Object.entries(JOB_TYPES).map(([k, v]) => `<option value="${k}" ${st.type === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select>`}
      ${tech ? '' : `<select class="in" data-f="assigned_to"><option value="">All technicians</option>${S.users.filter(u => u.role === 'technician').map(u => `<option value="${u.id}" ${+st.assigned_to === +u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select>`}
      ${STATUSES.map(([k, l]) => `<button class="chip ${st.status === k ? 'on' : ''}" data-s="${k}">${l}</button>`).join('')}</div><div id="jl"></div>`;
  const load = async () => {
    const rows = await api('jobs_list', { q: st.q, status: st.status, type, assigned_to: st.assigned_to });
    const sla = +S.settings.sla_hours || 24;
    $('#jl', el).innerHTML = rows.length ? `<div class="card tw"><table class="t cards"><thead><tr><th>Job</th><th>Type</th><th>Status</th><th>Visit</th><th>Technician</th>${ticketsOnly ? '<th class="num">Age</th>' : '<th>Priority</th>'}</tr></thead><tbody>
      ${rows.map(j => `<tr class="click" data-href="#/jobs/${j.id}"><td><div class="name">${esc(j.title)}</div><div class="sub">${esc(j.number)} · ${esc(j.customer_name || '')}</div></td>
        <td data-l="Type">${badge(JOB_TYPES, j.type)}</td><td data-l="Status">${badge(JOB_STATUS, j.status)}</td>
        <td data-l="Visit" class="nowrap ${j.scheduled_at && new Date(j.scheduled_at.replace(' ', 'T')) < new Date(today() + 'T00:00') && !['completed', 'cancelled'].includes(j.status) ? 'red b' : ''}">${j.scheduled_at ? esc(fdt(j.scheduled_at)) : '<span class="mut">Not scheduled</span>'}</td>
        <td data-l="Tech">${who(j.assigned_name, j.assigned_color)}</td>
        ${ticketsOnly ? `<td class="num ${j.age_hours > sla && !['completed', 'cancelled'].includes(j.status) ? 'red b' : 'mut'}" data-l="Age">${j.age_hours < 48 ? j.age_hours + ' h' : Math.round(j.age_hours / 24) + ' days'}</td>` : `<td data-l="Priority">${badge(PRIORITY, j.priority)}</td>`}</tr>`).join('')}</tbody></table></div>`
      : `<div class="card">${empty(ticketsOnly ? 'check' : 'tool', ticketsOnly ? 'No complaints here' : 'No jobs found')}</div>`;
  };
  $('.q', el).oninput = debounce(e => { st.q = e.target.value; load(); });
  on(el, 'change', '[data-f]', (e, s) => { st[s.dataset.f] = s.value; load(); });
  on(el, 'click', '[data-s]', (e, b) => { st.status = b.dataset.s; $$('[data-s]', el).forEach(x => x.classList.toggle('on', x === b)); load(); });
  on(el, 'click', 'tr[data-href]', (e, r) => { location.hash = r.dataset.href; });
  $('[data-nj]', el)?.addEventListener('click', () => newJob());
  $('[data-nc]', el)?.addEventListener('click', () => newComplaint());
  await load();
}

/* ---------------- Week schedule ---------------- */
let weekStart = null;
export async function calendar(el) {
  if (!weekStart) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); weekStart = d; }
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const days = [...Array(7)].map((_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d; });
  const tech = can('technician');
  const st2 = { tech: '' };
  el.innerHTML = pageHead('Schedule', `${days[0].toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${days[6].toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`,
    `<button class="btn ic" data-w="-1" title="Previous week">${ic('back')}</button><button class="btn" data-w="0">This week</button><button class="btn ic" data-w="1" title="Next week">${ic('arrow')}</button>
     ${tech ? '' : `<select class="in" style="width:auto" data-tech><option value="">All technicians</option>${S.users.filter(u => u.role === 'technician').map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select>`}`)
    + `<div id="cal"></div><p class="xs mut" style="margin-top:10px">Tip: open a job to change its date or technician. Unscheduled jobs are under Jobs → Open.</p>`;
  const rows = await api('jobs_calendar', { from: iso(days[0]), to: iso(days[6]) });
  const draw = () => {
    const list = rows.filter(j => !st2.tech || +j.assigned_to === +st2.tech);
    $('#cal', el).innerHTML = `<div class="cal">${days.map(d => { const k = iso(d); const evs = list.filter(j => j.scheduled_at.startsWith(k));
      return `<div class="cd ${k === today() ? 'today' : ''}"><div class="cdh"><span class="mut sm">${d.toLocaleDateString('en-IN', { weekday: 'short' })}</span><b>${d.getDate()}</b></div>
        ${evs.map(j => `<div class="ev" data-href="#/jobs/${j.id}" style="border-color:${j.assigned_color || '#94a3b8'};${j.status === 'completed' ? 'opacity:.55' : ''}"><span class="xs mut">${esc(ftime(j.scheduled_at))} · ${esc(JOB_TYPES[j.type][0])}</span><b>${esc(j.title)}</b><span class="xs">${esc(j.customer_name || '')}</span><div class="xs" style="color:${j.assigned_color || '#94a3b8'};font-weight:600;margin-top:2px">${esc(j.assigned_name || 'Unassigned')}${j.status === 'completed' ? ' · ✓ done' : ''}</div></div>`).join('') || '<div class="xs mut center" style="padding:16px 6px">Free</div>'}<div style="height:8px"></div></div>`; }).join('')}</div>`;
  };
  on(el, 'click', '[data-w]', (e, b) => { const n = +b.dataset.w; if (n === 0) weekStart = null; else weekStart.setDate(weekStart.getDate() + 7 * n); calendar(el); });
  on(el, 'click', '[data-href]', (e, x) => { location.hash = x.dataset.href; });
  $('[data-tech]', el)?.addEventListener('change', e => { st2.tech = e.target.value; draw(); });
  draw();
}

/* ---------------- Job page ---------------- */
export async function detail(el, [id]) {
  id = +id;
  const j = await api('job_get', { id });
  const tech = can('technician');
  const [tl, col] = JOB_TYPES[j.type];
  const open = !['completed', 'cancelled'].includes(j.status);
  const phone = j.contact_phone || j.customer_phone;
  const addr = j.address || j.customer_address;
  const [nb, wireNote] = noteBox('job', id, () => S.reload());
  const products = open || staff() ? await api('products_list') : [];
  const due = Math.max(0, +j.charge - +j.collected);
  const flow = {
    new: [['scheduled', 'Schedule', 'cal'], ['in_progress', 'Start job', 'play']], scheduled: [['in_progress', 'Start job', 'play']],
    in_progress: [['completed', 'Complete', 'check'], ['on_hold', 'Hold', 'pause']], on_hold: [['in_progress', 'Resume', 'play'], ['completed', 'Complete', 'check']],
    completed: tech ? [] : [['in_progress', 'Reopen', 'refresh']], cancelled: tech ? [] : [['new', 'Reopen', 'refresh']],
  }[j.status] || [];
  el.innerHTML = pageHead(`<span class="row" style="gap:10px"><span style="width:38px;height:38px;border-radius:11px;display:grid;place-items:center;background:${col}17;color:${col}">${ic(JOB_TYPES[j.type][2])}</span>${esc(j.title)}</span>`,
    `${esc(j.number)} · ${tl} · created ${esc(ago(j.created_at))}${j.created_name ? ' by ' + esc(j.created_name) : ''}`,
    `${flow.map(([s, l, i], n) => `<button class="btn ${n ? '' : (s === 'completed' ? 'g' : 'p')}" data-st="${s}">${ic(i)}${l}</button>`).join('')}
     ${office() ? `<button class="btn ic" data-more title="More">${ic('more')}</button>` : ''}`,
    `<a href="#/${tech ? '' : 'jobs'}">${tech ? 'My jobs' : 'Jobs'}</a> / ${esc(j.number)}`)
    + `<div class="row wrap" style="margin:-6px 0 16px">${badge(JOB_STATUS, j.status)} ${badge(PRIORITY, j.priority)} ${j.amc_number ? `<a class="bd t-ok" href="#/amc/${j.amc_id}">AMC ${esc(j.amc_number)}</a>` : ''} ${j.doc_number && office() ? `<a class="bd t-info" href="#/quotes/${j.doc_id}">Quote ${esc(j.doc_number)}</a>` : ''}</div>
    <div class="grid g21">
      <div class="col">
        <div class="card cb"><div class="row wrap" style="justify-content:space-between;align-items:flex-start">
            <div><div class="xs mut">Customer</div><div style="font-size:16px;font-weight:700">${office() ? `<a href="#/customers/${j.customer_id}">${esc(j.customer_name || '—')}</a>` : esc(j.customer_name || '—')}</div>
              <div class="sm mut" style="white-space:pre-wrap;margin-top:2px">${esc(addr || '')}</div></div>
            <div class="row wrap">${phone ? `<a class="btn sm" href="${telLink(phone)}">${ic('phone')}${esc(phone)}</a><a class="btn sm wa" target="_blank" rel="noopener" href="${waLink(phone, `Hi ${j.customer_name}, this is ${S.user.name} from ${S.settings.company_name} regarding ${j.number}. `)}">${ic('wa')}</a>` : ''}
              ${addr ? `<a class="btn sm" target="_blank" rel="noopener" href="${mapLink(addr)}">${ic('pin')}Navigate</a>` : ''}</div></div>
          ${j.description ? `<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--line2)"><div class="xs mut" style="margin-bottom:4px">Details</div><div style="white-space:pre-wrap">${esc(j.description)}</div></div>` : ''}
          ${j.resolution ? `<div class="banner" style="background:var(--ok-s);color:#166534;margin:14px 0 0;align-items:flex-start">${ic('check')}<div><b>Work done</b><div style="white-space:pre-wrap">${esc(j.resolution)}</div>${j.rating ? `<div class="stars">${'★'.repeat(j.rating)}${'☆'.repeat(5 - j.rating)}</div>` : ''}</div></div>` : ''}
        </div>
        <div class="card"><div class="ch"><h3>Materials used</h3>${open || staff() ? `<button class="btn sm" data-mat>${ic('plus')}Add</button>` : ''}</div>
          ${j.items.length ? j.items.map(it => `<div class="li"><div class="m"><b>${esc(it.name)}</b><small>${esc(ago(it.created_at))}</small></div><b>× ${it.qty}</b>${open || staff() ? `<button class="btn ghost ic sm" data-rmi="${it.id}" title="Remove">${ic('x')}</button>` : ''}</div>`).join('') : '<p class="mut sm" style="padding:14px 18px">No materials added. Stock is reduced automatically when you add items.</p>'}</div>
        <div class="card"><div class="ch"><h3>Photos & documents</h3><span class="xs mut">Before / after photos, signed job card</span></div><div class="cb"><div class="photos">
          ${j.files.map(f => `<a href="${esc(f.path)}" target="_blank" rel="noopener" title="${esc(f.name)}">${f.mime === 'application/pdf' ? ic('file', 'width:30px;height:30px;color:#64748b') : `<img src="${esc(f.path)}" alt="" loading="lazy">`}${staff() || +f.user_id === +S.user.id ? `<button class="x" data-rmf="${f.id}" title="Delete">✕</button>` : ''}</a>`).join('')}
          <label>${ic('camera')}<br>Add photo<input type="file" accept="image/*,application/pdf" capture="environment" hidden data-up multiple></label></div></div></div>
        <div class="card cb"><h3 style="margin-bottom:10px">Notes & timeline</h3>${nb}<div style="margin-top:10px">${timeline(j.activities)}</div></div>
      </div>
      <div class="col">
        <div class="card cb"><dl class="kv" style="grid-template-columns:100px 1fr">
          <dt>Technician</dt><dd>${who(j.assigned_name, '#64748b')}</dd>
          <dt>Visit</dt><dd>${j.scheduled_at ? esc(fdt(j.scheduled_at)) : '<span class="mut">Not scheduled</span>'}</dd>
          ${j.started_at ? `<dt>Started</dt><dd>${esc(fdt(j.started_at))}</dd>` : ''}${j.completed_at ? `<dt>Completed</dt><dd>${esc(fdt(j.completed_at))}</dd>` : ''}
          <dt>Charge</dt><dd>${money(j.charge)}</dd><dt>Collected</dt><dd class="${+j.collected ? 'green b' : ''}">${money(j.collected)}</dd></dl>
          ${office() ? `<button class="btn sm" data-edit style="margin-top:14px;width:100%">${ic('edit')}Edit · assign · reschedule</button>` : ''}
          ${due > 0 || (+j.charge === 0 && open) ? `<button class="btn sm g" data-pay style="margin-top:8px;width:100%">${ic('rupee')}Record payment${due ? ' · ' + money(due) + ' due' : ''}</button>` : ''}</div>
        ${j.payments.length ? `<div class="card"><div class="ch"><h3>Payments</h3></div>${j.payments.map(p => `<div class="li"><div class="m"><b>${money(p.amount, 2)}</b><small>${esc(PAY_MODES[p.mode] || p.mode)} · ${esc(fdate(p.paid_on))} · ${esc(p.received_name || '')}</small></div></div>`).join('')}</div>` : ''}
        ${j.history?.length ? `<div class="card"><div class="ch"><h3>Customer history</h3></div>${j.history.map(h => `<a class="li" href="#/jobs/${h.id}"><div class="m"><b>${esc(h.title)}</b><small>${esc(h.number)} · ${esc(fdate(h.completed_at))}</small></div>${badge(JOB_STATUS, h.status)}</a>`).join('')}</div>` : ''}
      </div></div>`;
  wireNote(el);

  on(el, 'click', '[data-st]', async (e, b) => {
    const s = b.dataset.st;
    if (s === 'completed') return completeJob(j);
    if (s === 'scheduled' || (s === 'in_progress' && office() && !j.assigned_to)) return editJob(j);
    if (await run('job_status', { id, status: s }, JOB_STATUS[s][0])) S.reload();
  });
  $('[data-edit]', el)?.addEventListener('click', () => editJob(j));
  $('[data-pay]', el)?.addEventListener('click', () => formModal({ title: 'Payment collected', size: 'sm', data: { amount: due || '' },
    fields: [{ name: 'amount', label: 'Amount (₹)', type: 'number', required: true }, { name: 'mode', label: 'Mode', type: 'select', options: PAY_MODES, blank: false }, { name: 'ref', label: 'UPI / cheque ref.' }],
    submit: async v => { if (await run('payment_add', { ...v, job_id: id }, 'Payment recorded')) { S.reload(); return true; } } }));
  $('[data-mat]', el)?.addEventListener('click', () => {
    const m = modal({ title: 'Add material used', size: 'sm', body: `<div class="col"><div><label class="l">Product</label><select class="in" name="p">${products.filter(p => p.category !== 'service').map(p => `<option value="${p.id}">${esc(p.name)} (${p.stock} in stock)</option>`).join('')}</select></div><div><label class="l">Quantity</label><input class="in" type="number" name="q" value="1" min="1"></div></div>`,
      foot: `<button class="btn p" data-ok>Add</button>` });
    $('[data-ok]', m.el).onclick = async () => {
      const body = { job_id: id, product_id: +$('[name=p]', m.el).value, qty: +$('[name=q]', m.el).value || 1 };
      try { await api('job_item_add', body); toast('Added — stock updated'); m.close(); S.reload(); }
      catch (e) { if (e.status === 409 && confirm(e.message + '. Add anyway?')) { if (await run('job_item_add', { ...body, force: 1 })) { m.close(); S.reload(); } } else toast(e.message, true); }
    };
  });
  on(el, 'click', '[data-rmi]', async (e, b) => { if (await confirmBox('Remove this item? It goes back to stock.', 'Remove') && await run('job_item_remove', { id: +b.dataset.rmi }, 'Removed')) S.reload(); });
  on(el, 'click', '[data-rmf]', async (e, b) => { e.preventDefault(); if (await confirmBox('Delete this file?') && await run('file_delete', { id: +b.dataset.rmf }, 'Deleted')) S.reload(); });
  $('[data-up]', el).addEventListener('change', async e => {
    const files = [...e.target.files]; if (!files.length) return;
    toast('Uploading ' + files.length + ' file(s)…');
    for (const f of files) { const fd = new FormData(); fd.append('entity', 'job'); fd.append('entity_id', id); fd.append('file', f); if (!await run('file_upload', fd)) break; }
    S.reload();
  });
  $('[data-more]', el)?.addEventListener('click', async e => {
    const { popMenu } = await import('../core.js');
    popMenu(e.currentTarget, [
      ...(open ? [{ label: 'Cancel job', icon: 'x', fn: async () => { const note = prompt('Reason for cancelling?'); if (note !== null && await run('job_status', { id, status: 'cancelled', note }, 'Cancelled')) S.reload(); } }] : []),
      ...(staff() ? [{ label: 'Create invoice', icon: 'receipt', fn: () => { location.hash = '#/invoices/new?job=' + id + '&customer=' + j.customer_id; } }] : []),
      { label: 'Share job card on WhatsApp', icon: 'wa', fn: () => window.open(waLink(j.assigned_phone || '', `Job ${j.number}: ${j.title}\nCustomer: ${j.customer_name} ${phone || ''}\nAddress: ${addr || ''}\nVisit: ${j.scheduled_at ? fdt(j.scheduled_at) : 'not scheduled'}\n${location.href}`), '_blank') },
      ...(staff() ? ['-', { label: 'Delete job', icon: 'trash', danger: true, fn: async () => { if (await confirmBox('Delete job ' + j.number + '?') && await run('job_delete', { id }, 'Deleted')) location.hash = '#/jobs'; } }] : []),
    ]);
  });
}

function editJob(j) {
  formModal({ title: 'Edit ' + j.number, size: 'lg', fields: jobFields(), data: j, submit: async v => { if (await run('job_save', { ...v, id: j.id }, 'Saved')) { S.reload(); return true; } } });
}

function completeJob(j) {
  const due = Math.max(0, +j.charge - +j.collected);
  const m = modal({ title: 'Complete ' + j.number, body: `<form class="fg">
      ${field({ name: 'resolution', label: 'What was done?', type: 'textarea', required: true, placeholder: j.type === 'complaint' ? 'e.g. Replaced BNC connector on camera 3, video restored' : 'e.g. Installed 8 cameras, NVR configured, app set up on owner phone' })}
      ${field({ name: 'collected', label: 'Payment collected now (₹)', type: 'number', value: due || '' })}
      ${field({ name: 'mode', label: 'Payment mode', type: 'select', options: PAY_MODES, blank: false })}
      <div class="full"><label class="l">Customer rating</label><div class="row" data-rate>${[1, 2, 3, 4, 5].map(n => `<button type="button" class="btn ic" data-r="${n}" style="font-size:18px">☆</button>`).join('')}</div><input type="hidden" name="rating" value=""></div></form>`,
    foot: `<button class="btn" data-c>Cancel</button><button class="btn g" data-ok>${ic('check')}Mark completed</button>` });
  const form = $('form', m.el);
  on(m.el, 'click', '[data-r]', (e, b) => { const r = +b.dataset.r; form.rating.value = r; $$('[data-r]', m.el).forEach(x => { x.textContent = +x.dataset.r <= r ? '★' : '☆'; x.style.color = +x.dataset.r <= r ? '#f59e0b' : ''; }); });
  $('[data-c]', m.el).onclick = m.close;
  $('[data-ok]', m.el).onclick = async () => {
    const v = formValues(form);
    if (!v.resolution) return toast('Write what was done', true);
    if (await run('job_status', { id: j.id, status: 'completed', ...v }, 'Job completed ✓')) { m.close(); S.reload(); }
  };
}
