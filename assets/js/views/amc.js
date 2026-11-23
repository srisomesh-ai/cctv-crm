// AMC (annual maintenance contracts): list with expiry, contract page with visit schedule, renew.
import { S, api, run, esc, ic, $, $$, on, money, fdate, fdt, badge, empty, formModal, confirmBox, timeline, pageHead, JOB_STATUS, contactBtns, debounce, today, staff, noteBox } from '../core.js';

const fields = [
  { name: 'customer_id', label: 'Customer', type: 'customer', required: true, full: true },
  { name: 'title', label: 'Contract name', placeholder: 'e.g. Comprehensive AMC – 16 cameras', full: true },
  { name: 'start_date', label: 'Start date', type: 'date', required: true }, { name: 'end_date', label: 'End date', type: 'date', help: 'Empty = 1 year' },
  { name: 'amount', label: 'Contract value (₹)', type: 'number' }, { name: 'visits', label: 'Preventive visits per year', type: 'number', value: 4 },
  { name: 'cameras', label: 'Cameras covered', type: 'number' },
  { name: 'covers', label: 'What is covered', type: 'textarea', placeholder: 'Quarterly cleaning & health check\nFree service calls (labour)\nSpares at discount' },
  { name: 'notes', label: 'Notes', type: 'textarea', rows: 2 },
];
export function newAmc(data = {}) {
  formModal({ title: 'New AMC contract', size: 'lg', fields: [...fields, { name: 'schedule', label: 'Create the preventive visits in the schedule now', type: 'checkbox', value: 1, full: true }],
    data: { start_date: today(), ...data }, submit: async v => { const r = await run('amc_save', v, 'AMC created'); if (r) { location.hash = '#/amc/' + r.id; return true; } } });
}
const status = a => a.renewed_to ? ['Renewed', '#64748b'] : a.days_left < 0 ? ['Expired', '#dc2626'] : a.days_left <= 30 ? ['Expiring · ' + a.days_left + 'd', '#d97706'] : ['Active', '#16a34a'];
const st = { q: '', status: '' };

export async function list(el, _p, qs) {
  if (qs.get('status')) st.status = qs.get('status');
  el.innerHTML = pageHead('AMC contracts', 'Annual maintenance contracts — recurring income and scheduled preventive visits.', staff() ? `<button class="btn p" data-new>${ic('plus')}New AMC</button>` : '')
    + `<div class="filters"><input class="in q" placeholder="Search customer or AMC no." value="${esc(st.q)}">${[['', 'All'], ['active', 'Active'], ['expiring', 'Expiring in 30 days'], ['expired', 'Expired']].map(([k, l]) => `<button class="chip ${st.status === k ? 'on' : ''}" data-s="${k}">${l}</button>`).join('')}</div><div id="al"></div>`;
  const load = async () => {
    const rows = await api('amc_list', st);
    const active = rows.filter(a => a.days_left >= 0);
    $('#al', el).innerHTML = `<div class="grid g4" style="margin-bottom:16px"><div class="card kpi"><div class="t">Contracts shown</div><div class="v">${rows.length}</div></div><div class="card kpi"><div class="t">Active value / year</div><div class="v">${money(active.reduce((s, a) => s + +a.amount, 0))}</div></div>
      <div class="card kpi"><div class="t">Expiring in 30 days</div><div class="v amber">${rows.filter(a => a.days_left >= 0 && a.days_left <= 30 && !a.renewed_to).length}</div></div><div class="card kpi"><div class="t">Cameras covered</div><div class="v">${active.reduce((s, a) => s + (+a.cameras || 0), 0)}</div></div></div>`
      + (rows.length ? `<div class="card tw"><table class="t cards"><thead><tr><th>Customer</th><th>Contract</th><th>Period</th><th>Visits</th><th>Next visit</th><th class="num">Value</th><th>Status</th></tr></thead><tbody>
      ${rows.map(a => { const [l, c] = status(a); return `<tr class="click" data-href="#/amc/${a.id}"><td><div class="name">${esc(a.customer_name)}</div><div class="sub">${esc(a.customer_phone || '')}</div></td><td data-l="Contract"><div>${esc(a.number)}</div><div class="sub">${esc(a.title || '')}</div></td>
        <td data-l="Period" class="nowrap">${esc(fdate(a.start_date))} → ${esc(fdate(a.end_date))}</td><td data-l="Visits"><div class="prog" style="width:80px"><i style="width:${Math.min(100, a.visits_done / Math.max(1, a.visits) * 100)}%"></i></div><span class="xs mut">${a.visits_done}/${a.visits} done</span></td>
        <td data-l="Next" class="nowrap">${a.next_visit ? esc(fdate(a.next_visit)) : '—'}</td><td class="num" data-l="Value">${money(a.amount)}</td><td data-l="Status"><span class="bd" style="background:${c}1a;color:${c}"><i></i>${esc(l)}</span></td></tr>`; }).join('')}</tbody></table></div>` : `<div class="card">${empty('shield', 'No AMC contracts')}</div>`);
  };
  $('.q', el).oninput = debounce(e => { st.q = e.target.value; load(); });
  on(el, 'click', '[data-s]', (e, b) => { st.status = b.dataset.s; $$('[data-s]', el).forEach(x => x.classList.toggle('on', x === b)); load(); });
  on(el, 'click', 'tr[data-href]', (e, r) => { location.hash = r.dataset.href; });
  $('[data-new]', el)?.addEventListener('click', () => newAmc());
  await load();
}

export async function detail(el, [id]) {
  id = +id;
  const a = await api('amc_get', { id });
  const [l, c] = status(a);
  const done = a.jobs.filter(j => j.status === 'completed').length;
  const [nb, wireNote] = noteBox('amc', id, () => S.reload());
  el.innerHTML = pageHead(esc(a.title || 'AMC ' + a.number), `${esc(a.number)} · <a href="#/customers/${a.customer_id}">${esc(a.customer_name)}</a>`,
    `${contactBtns(a.customer_phone, `Hi ${a.customer_name}, regarding your CCTV maintenance contract ${a.number} with ${S.settings.company_name}: `)}
     ${staff() && !a.renewed_to ? `<button class="btn p" data-renew>${ic('refresh')}Renew</button>` : ''}${staff() ? `<button class="btn ic" data-edit title="Edit">${ic('edit')}</button><button class="btn ic d" data-del title="Delete">${ic('trash')}</button>` : ''}`,
    `<a href="#/amc">AMC</a> / ${esc(a.number)}`)
    + `<div class="grid g4" style="margin-bottom:16px"><div class="card kpi"><div class="t">Status</div><div class="v" style="font-size:19px;color:${c}">${esc(l)}</div><div class="s">${a.days_left >= 0 ? a.days_left + ' days left' : 'Ended ' + esc(fdate(a.end_date))}</div></div>
      <div class="card kpi"><div class="t">Period</div><div class="v" style="font-size:17px">${esc(fdate(a.start_date))}</div><div class="s">to ${esc(fdate(a.end_date))}</div></div>
      <div class="card kpi"><div class="t">Visits done</div><div class="v">${done} / ${a.visits}</div><div class="prog"><i style="width:${done / Math.max(1, a.visits) * 100}%"></i></div></div>
      <div class="card kpi"><div class="t">Contract value</div><div class="v">${money(a.amount)}</div><div class="s">${a.cameras || '—'} cameras</div></div></div>
    <div class="grid g21"><div class="card"><div class="ch"><h3>Visit schedule</h3>${staff() ? `<button class="btn sm" data-sched>${ic('cal')}Fill missing visits</button>` : ''}</div>
        ${a.jobs.length ? a.jobs.map(j => `<a class="li" href="#/jobs/${j.id}"><div class="tm">${esc(fdate(j.scheduled_at).split(' ').slice(0, 2).join(' '))}<small>${esc(new Date(j.scheduled_at?.replace(' ', 'T')).getFullYear() || '')}</small></div><div class="m"><b>${esc(j.title)}</b><small>${esc(j.number)} · ${esc(j.assigned_name || 'unassigned')}${j.completed_at ? ' · done ' + esc(fdate(j.completed_at)) : ''}</small></div>${badge(JOB_STATUS, j.status)}</a>`).join('') : empty('cal', 'No visits scheduled')}</div>
      <div class="col"><div class="card cb"><h3 style="margin-bottom:8px">Coverage</h3><div style="white-space:pre-wrap" class="sm">${esc(a.covers || '—')}</div>${a.notes ? `<h3 style="margin:14px 0 6px">Notes</h3><div style="white-space:pre-wrap" class="sm">${esc(a.notes)}</div>` : ''}</div>
        ${a.renewed_to ? `<a class="banner" href="#/amc/${a.renewed_to}" style="background:var(--ok-s);color:#166534">${ic('check')}Renewed — open the new contract →</a>` : ''}
        <div class="card cb"><h3 style="margin-bottom:8px">Notes & history</h3>${nb}<div style="margin-top:8px">${timeline(a.activities)}</div></div></div></div>`;
  wireNote(el);
  $('[data-edit]', el)?.addEventListener('click', () => formModal({ title: 'Edit AMC', size: 'lg', fields, data: a, submit: async v => { if (await run('amc_save', { ...v, id }, 'Saved')) { S.reload(); return true; } } }));
  $('[data-sched]', el)?.addEventListener('click', async () => { const r = await run('amc_schedule', { id }); if (r) { toast_(r.created ? r.created + ' visit(s) added' : 'All visits are already scheduled'); S.reload(); } });
  $('[data-renew]', el)?.addEventListener('click', () => formModal({ title: 'Renew ' + a.number, size: 'sm', data: { amount: a.amount }, okLabel: 'Renew for 1 year',
    fields: [{ name: 'amount', label: 'New contract value (₹)', type: 'number', help: 'Starts the day after ' + fdate(a.end_date) + ', visits are scheduled automatically.' }],
    submit: async v => { const r = await run('amc_renew', { id, ...v }, 'Renewed ✓'); if (r) { location.hash = '#/amc/' + r.id; return true; } } }));
  $('[data-del]', el)?.addEventListener('click', async () => { if (await confirmBox('Delete AMC ' + a.number + '? Upcoming unstarted visits are removed too.') && await run('amc_delete', { id }, 'Deleted')) location.hash = '#/amc'; });
}
const toast_ = async m => (await import('../core.js')).toast(m);
