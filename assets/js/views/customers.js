// Customers: list and the customer page (jobs, quotes/invoices, AMC, payments, installed equipment, activity).
import { S, api, run, esc, ic, $, $$, on, money, fdate, fdt, ago, badge, empty, formModal, confirmBox, noteBox, timeline, pageHead, contactBtns,
  PROPS, SOURCES, JOB_STATUS, JOB_TYPES, DOC_STATUS, PAY_MODES, PCATS, debounce, toast, staff } from '../core.js';

export const customerFields = [
  { name: 'name', label: 'Name', required: true }, { name: 'company', label: 'Company / shop' },
  { name: 'phone', label: 'Phone', type: 'tel' }, { name: 'alt_phone', label: 'Alternate phone', type: 'tel' },
  { name: 'email', label: 'Email', type: 'email' }, { name: 'category', label: 'Type', type: 'select', options: PROPS },
  { name: 'address', label: 'Address', type: 'textarea', rows: 2 }, { name: 'city', label: 'City' }, { name: 'pincode', label: 'PIN code' },
  { name: 'gstin', label: 'GSTIN (for B2B invoices)' }, { name: 'source', label: 'Source', type: 'select', options: SOURCES },
  { name: 'notes', label: 'Notes', type: 'textarea', rows: 2, placeholder: 'e.g. DVR password kept with owner, gate opens at 9 AM' },
];
export function newCustomer() {
  formModal({ title: 'New customer', size: 'lg', fields: customerFields, submit: async v => {
    try { const r = await api('customer_save', v); toast('Customer added'); location.hash = '#/customers/' + r.id; return true; }
    catch (e) { if (e.status === 409 && confirm(e.message + '\n\nAdd anyway?')) { const r = await run('customer_save', { ...v, force: 1 }, 'Customer added'); if (r) { location.hash = '#/customers/' + r.id; return true; } } else toast(e.message, true); }
  } });
}

const st = { q: '', category: '' };
export async function list(el) {
  el.innerHTML = pageHead('Customers', 'Everyone you have installed for or serviced.', `<button class="btn p" data-new>${ic('plus')}New customer</button>`)
    + `<div class="filters"><input class="in q" placeholder="Search name, phone, city…" value="${esc(st.q)}">
       <button class="chip ${!st.category ? 'on' : ''}" data-c="">All</button>${Object.entries(PROPS).map(([k, v]) => `<button class="chip ${st.category === k ? 'on' : ''}" data-c="${k}">${esc(v.split(' /')[0])}</button>`).join('')}</div><div id="cl"></div>`;
  const load = async () => {
    const rows = await api('customers_list', st);
    $('#cl', el).innerHTML = rows.length ? `<div class="card tw"><table class="t cards"><thead><tr><th>Customer</th><th>Phone</th><th>Type</th><th class="num">Jobs</th><th class="num">Billed</th><th class="num">Due</th><th>AMC</th></tr></thead><tbody>
      ${rows.map(c => `<tr class="click" data-href="#/customers/${c.id}"><td><div class="name">${esc(c.name)}</div><div class="sub">${esc(c.company && c.company !== c.name ? c.company : (c.city || ''))}</div></td>
        <td data-l="Phone" class="nowrap">${esc(c.phone || '—')}</td><td data-l="Type">${esc((PROPS[c.category] || '—').split(' /')[0])}</td><td class="num" data-l="Jobs">${c.jobs}</td>
        <td class="num" data-l="Billed">${+c.billed ? money(c.billed) : '—'}</td><td class="num ${+c.due ? 'red b' : ''}" data-l="Due">${+c.due ? money(c.due) : '—'}</td>
        <td data-l="AMC">${c.amc_end ? (new Date(c.amc_end) >= new Date(new Date().toDateString()) ? '<span class="bd t-ok">Till ' + esc(fdate(c.amc_end)) + '</span>' : '<span class="bd t-mut">Expired</span>') : '—'}</td></tr>`).join('')}</tbody></table></div>`
      : `<div class="card">${empty('users', 'No customers found')}</div>`;
  };
  $('[data-new]', el).onclick = newCustomer;
  $('.q', el).oninput = debounce(e => { st.q = e.target.value; load(); });
  on(el, 'click', '[data-c]', (e, b) => { st.category = b.dataset.c; $$('[data-c]', el).forEach(x => x.classList.toggle('on', x === b)); load(); });
  on(el, 'click', 'tr[data-href]', (e, r) => { location.hash = r.dataset.href; });
  await load();
}

export async function detail(el, [id], qs) {
  id = +id;
  const c = await api('customer_get', { id });
  let tab = qs.get('tab') || 'overview';
  const tabs = [['overview', 'Overview'], ['jobs', 'Jobs', c.jobs.length], ['docs', 'Quotes & invoices', c.docs.length], ['amc', 'AMC', c.amc.length], ['payments', 'Payments', c.payments.length], ['activity', 'Activity', c.activities.length]];
  const [nb, wireNote] = noteBox('customer', id, () => S.reload());
  const amcNow = c.amc.find(a => new Date(a.end_date) >= new Date(new Date().toDateString()));
  el.innerHTML = pageHead(esc(c.name), esc([c.company && c.company !== c.name ? c.company : '', PROPS[c.category], c.city].filter(Boolean).join(' · ')),
    `${contactBtns(c.phone, `Hi ${c.name}, this is ${S.user.name} from ${S.settings.company_name}. `, c.address)}<button class="btn sm" data-edit>${ic('edit')}Edit</button><button class="btn sm p" data-new>${ic('plus')}New</button>`,
    `<a href="#/customers">Customers</a> / #${c.id}`)
    + `<div class="grid g4" style="margin-bottom:16px">
      <div class="card kpi"><div class="t">Billed</div><div class="v">${money(c.stats.billed)}</div></div>
      <div class="card kpi"><div class="t">Received</div><div class="v green">${money(c.stats.paid)}</div></div>
      <div class="card kpi"><div class="t">Balance due</div><div class="v ${c.stats.due ? 'red' : ''}">${money(c.stats.due)}</div></div>
      <div class="card kpi"><div class="t">AMC</div><div class="v" style="font-size:18px">${amcNow ? 'Active till ' + esc(fdate(amcNow.end_date)) : 'No active AMC'}</div><div class="s">${c.stats.open_jobs} open job(s)</div></div></div>
    <div class="tabs">${tabs.map(([k, l, n]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${l}${n !== undefined ? `<span class="c">${n}</span>` : ''}</button>`).join('')}</div><div id="tb"></div>`;
  const jobsTable = list => list.length ? `<div class="card tw"><table class="t cards"><thead><tr><th>Job</th><th>Type</th><th>Status</th><th>Date</th><th>Technician</th></tr></thead><tbody>${list.map(j => `<tr class="click" data-href="#/jobs/${j.id}"><td><div class="name">${esc(j.title)}</div><div class="sub">${esc(j.number)}</div></td><td data-l="Type">${badge(JOB_TYPES, j.type)}</td><td data-l="Status">${badge(JOB_STATUS, j.status)}</td><td data-l="Date" class="nowrap">${esc(fdate(j.completed_at || j.scheduled_at))}</td><td data-l="Tech">${esc(j.assigned_name || '—')}</td></tr>`).join('')}</tbody></table></div>` : `<div class="card">${empty('tool', 'No jobs yet')}</div>`;
  const docsTable = list => list.length ? `<div class="card tw"><table class="t cards"><thead><tr><th>Number</th><th>Date</th><th>Status</th><th class="num">Total</th><th class="num">Paid</th></tr></thead><tbody>${list.map(d => `<tr class="click" data-href="#/${d.type === 'quote' ? 'quotes' : 'invoices'}/${d.id}"><td><div class="name">${esc(d.number)}</div><div class="sub">${d.type === 'quote' ? 'Quotation' : 'Invoice'}</div></td><td data-l="Date">${esc(fdate(d.date))}</td><td data-l="Status">${badge(DOC_STATUS, d.status)}</td><td class="num" data-l="Total">${money(d.total)}</td><td class="num" data-l="Paid">${d.type === 'invoice' ? money(d.paid) : ''}</td></tr>`).join('')}</tbody></table></div>` : `<div class="card">${empty('file', 'No quotations or invoices yet')}</div>`;
  const render = () => {
    const tb = $('#tb', el);
    if (tab === 'overview') tb.innerHTML = `<div class="grid g12"><div class="col">
        <div class="card cb"><h3 style="margin-bottom:12px">Details</h3><dl class="kv"><dt>Phone</dt><dd>${esc(c.phone || '—')}${c.alt_phone ? ' / ' + esc(c.alt_phone) : ''}</dd><dt>Email</dt><dd>${esc(c.email || '—')}</dd>
          <dt>Address</dt><dd style="white-space:pre-wrap">${esc([c.address, c.city, c.pincode].filter(Boolean).join(', ') || '—')}</dd><dt>GSTIN</dt><dd>${esc(c.gstin || '—')}</dd><dt>Source</dt><dd>${esc(SOURCES[c.source] || c.source || '—')}</dd>
          <dt>Customer since</dt><dd>${esc(fdate(c.created_at))}</dd>${c.notes ? `<dt>Notes</dt><dd style="white-space:pre-wrap">${esc(c.notes)}</dd>` : ''}</dl></div>
        <div class="card"><div class="ch"><h3>Installed equipment</h3></div>${c.equipment.length ? c.equipment.map(e => `<div class="li"><span class="bd t-pri">${esc(PCATS[e.category] || e.category)}</span><div class="m"><b>${esc(e.name)}</b></div><b>× ${+e.qty}</b></div>`).join('') : empty('camera', 'Nothing recorded yet', 'Materials used on completed jobs show here.')}</div></div>
      <div class="col"><div class="card"><div class="ch"><h3>Recent jobs</h3><button class="btn sm" data-job>${ic('plus')}Job</button></div>${c.jobs.slice(0, 5).map(j => `<a class="li" href="#/jobs/${j.id}"><div class="m"><b>${esc(j.title)}</b><small>${esc(j.number)} · ${esc(fdate(j.completed_at || j.scheduled_at))} · ${esc(j.assigned_name || 'unassigned')}</small></div>${badge(JOB_STATUS, j.status)}</a>`).join('') || empty('tool', 'No jobs yet')}</div>
        <div class="card cb"><h3 style="margin-bottom:10px">Add note</h3>${nb}<div style="margin-top:10px">${timeline(c.activities.slice(0, 6))}</div></div></div></div>`;
    if (tab === 'jobs') tb.innerHTML = jobsTable(c.jobs);
    if (tab === 'docs') tb.innerHTML = docsTable(c.docs);
    if (tab === 'amc') tb.innerHTML = c.amc.length ? `<div class="card">${c.amc.map(a => `<a class="li" href="#/amc/${a.id}"><div class="m"><b>${esc(a.number)} · ${esc(a.title || 'AMC')}</b><small>${esc(fdate(a.start_date))} → ${esc(fdate(a.end_date))} · ${a.visits} visits</small></div><b>${money(a.amount)}</b></a>`).join('')}</div>` : `<div class="card">${empty('shield', 'No AMC', 'Offer an annual maintenance contract to keep the system healthy.', staff() ? '<button class="btn p" data-amc>Create AMC</button>' : '')}</div>`;
    if (tab === 'payments') tb.innerHTML = c.payments.length ? `<div class="card tw"><table class="t cards"><thead><tr><th>Date</th><th>Against</th><th>Mode</th><th class="num">Amount</th></tr></thead><tbody>${c.payments.map(p => `<tr><td>${esc(fdate(p.paid_on))}</td><td data-l="For">${esc(p.doc_number || 'Service visit')}</td><td data-l="Mode">${esc(PAY_MODES[p.mode] || p.mode)}${p.ref ? ' · ' + esc(p.ref) : ''}</td><td class="num green b" data-l="Amount">${money(p.amount, 2)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="card">${empty('rupee', 'No payments yet')}</div>`;
    if (tab === 'activity') tb.innerHTML = `<div class="card cb">${nb}<div style="margin-top:12px">${timeline(c.activities)}</div></div>`;
    wireNote(tb);
  };
  on(el, 'click', '[data-t]', (e, b) => { tab = b.dataset.t; $$('[data-t]', el).forEach(x => x.classList.toggle('on', x === b)); render(); });
  on(el, 'click', 'tr[data-href]', (e, r) => { location.hash = r.dataset.href; });
  on(el, 'click', '[data-job]', async () => (await import('./jobs.js')).newJob({ customer_id: id, customer_name: c.name }));
  on(el, 'click', '[data-amc]', async () => (await import('./amc.js')).newAmc({ customer_id: id, customer_name: c.name }));
  $('[data-edit]', el).onclick = () => formModal({ title: 'Edit customer', size: 'lg', fields: customerFields, data: c, submit: async v => { if (await run('customer_save', { ...v, id }, 'Saved')) { S.reload(); return true; } } });
  $('[data-new]', el).onclick = async e => {
    const { popMenu } = await import('../core.js');
    const J = await import('./jobs.js');
    popMenu(e.currentTarget, [
      { label: 'Complaint / service call', icon: 'alert', fn: () => J.newComplaint({ customer_id: id, customer_name: c.name }) },
      { label: 'Job', icon: 'tool', fn: () => J.newJob({ customer_id: id, customer_name: c.name }) },
      { label: 'Quotation', icon: 'file', fn: () => { location.hash = '#/quotes/new?customer=' + id; } },
      ...(staff() ? [{ label: 'Invoice', icon: 'receipt', fn: () => { location.hash = '#/invoices/new?customer=' + id; } }, { label: 'AMC contract', icon: 'shield', fn: async () => (await import('./amc.js')).newAmc({ customer_id: id, customer_name: c.name }) }] : []),
      ...(staff() ? ['-', { label: 'Delete customer', icon: 'trash', danger: true, fn: async () => { if (await confirmBox('Delete ' + c.name + '? Jobs and quotations stay, invoices block deletion.') && await run('customer_delete', { id }, 'Deleted')) location.hash = '#/customers'; } }] : []),
    ]);
  };
  render();
}
