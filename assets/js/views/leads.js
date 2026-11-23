// Leads: table and drag-and-drop pipeline board, detail panel with stage steps, timeline, quotes, convert to customer.
import { S, api, run, esc, ic, $, $$, on, money, short, fdt, fdate, ago, badge, who, empty, formModal, drawer, confirmBox, noteBox, timeline,
  LEAD_STAGES, SOURCES, PROPS, DOC_STATUS, telLink, waLink, mapLink, debounce, toast, pageHead, staff } from '../core.js';

const STAGES = Object.keys(LEAD_STAGES);
const st = { view: localStorage.getItem('leadsView') || 'board', q: '', stage: '', source: '', assigned_to: '', followup: '' };

export function leadFields(l = {}) {
  return [
    { name: 'name', label: 'Name', required: true, placeholder: 'Person or business name' },
    { name: 'company', label: 'Company / shop name' },
    { name: 'phone', label: 'Phone', type: 'tel', placeholder: '10-digit mobile' },
    { name: 'email', label: 'Email', type: 'email' },
    { name: 'source', label: 'Source', type: 'select', options: SOURCES },
    { name: 'property_type', label: 'Property type', type: 'select', options: PROPS },
    { name: 'cameras', label: 'Cameras needed', type: 'number' },
    { name: 'value', label: 'Expected value (₹)', type: 'number' },
    { name: 'requirement', label: 'Requirement', type: 'textarea', placeholder: 'e.g. 8 cameras for shop + godown, mobile viewing, 1 month backup' },
    { name: 'address', label: 'Address / area', type: 'textarea', rows: 2 },
    { name: 'city', label: 'City' },
    { name: 'priority', label: 'Priority', type: 'select', options: { low: 'Low', normal: 'Normal', high: 'High' }, blank: false, value: 'normal' },
    { name: 'assigned_to', label: 'Assigned to', type: 'user', roles: ['admin', 'manager', 'sales'], value: l.id ? undefined : S.user.id },
    { name: 'next_followup', label: 'Next follow-up', type: 'datetime' },
  ];
}
export function newLead(after) {
  formModal({ title: 'New lead', size: 'lg', fields: leadFields(), data: { next_followup: new Date(Date.now() + 864e5).toISOString().slice(0, 11) + '11:00' },
    submit: async v => {
      try { const r = await api('lead_save', v); toast('Lead added'); after ? after(r.id) : (location.hash = '#/leads/' + r.id); return true; }
      catch (e) { if (e.status === 409 && confirm(e.message + '\n\nAdd anyway?')) { const r = await run('lead_save', { ...v, force: 1 }, 'Lead added'); if (r) { location.hash = '#/leads/' + r.id; return true; } } else toast(e.message, true); }
    } });
}

export async function list(el, [openId], qs) {
  if (qs.get('followup')) st.followup = qs.get('followup');
  if (qs.get('view')) st.view = qs.get('view');
  el.innerHTML = pageHead('Leads', 'Every enquiry from call, WhatsApp, JustDial or walk-in — follow up until it is won.',
    `<div class="seg"><button data-v="board" class="${st.view === 'board' ? 'on' : ''}">${ic('board')}Board</button><button data-v="table" class="${st.view === 'table' ? 'on' : ''}">${ic('list')}List</button></div><button class="btn p" data-new>${ic('plus')}New lead</button>`)
    + `<div class="filters"><input class="in q" placeholder="Search name, phone, requirement…" value="${esc(st.q)}">
      <select class="in" data-f="source"><option value="">All sources</option>${Object.entries(SOURCES).map(([k, v]) => `<option value="${k}" ${st.source === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <select class="in" data-f="assigned_to"><option value="">Everyone</option>${S.users.filter(u => u.role !== 'technician').map(u => `<option value="${u.id}" ${+st.assigned_to === +u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select>
      ${[['', 'All open'], ['today', 'Follow-up today'], ['overdue', 'Overdue']].map(([k, l]) => `<button class="chip ${st.followup === k ? 'on' : ''}" data-fu="${k}">${l}</button>`).join('')}</div>
    <div id="lb"></div>`;
  const body = $('#lb', el);
  const load = async () => {
    const p = { q: st.q, source: st.source, assigned_to: st.assigned_to, followup: st.followup };
    if (st.view === 'table' && st.stage) p.stage = st.stage;
    const rows = await api('leads_list', p);
    st.view === 'board' ? board(body, rows, load) : table(body, rows);
  };
  on(el, 'click', '[data-v]', (e, b) => { st.view = b.dataset.v; localStorage.setItem('leadsView', st.view); $$('[data-v]', el).forEach(x => x.classList.toggle('on', x === b)); load(); });
  on(el, 'click', '[data-fu]', (e, b) => { st.followup = b.dataset.fu; $$('[data-fu]', el).forEach(x => x.classList.toggle('on', x === b)); load(); });
  on(el, 'change', '[data-f]', (e, s) => { st[s.dataset.f] = s.value; load(); });
  $('.q', el).oninput = debounce(e => { st.q = e.target.value; load(); });
  $('[data-new]', el).onclick = () => newLead(id => { load(); openLead(id, load); });
  on(body, 'click', '[data-lead]', (e, t) => { if (e.target.closest('a[href^="tel"],a[href^="http"]')) return; openLead(+t.dataset.lead, load); });
  await load();
  if (openId) openLead(+openId, load);
}

function card(l) {
  const late = l.next_followup && new Date(l.next_followup.replace(' ', 'T')) < new Date();
  return `<div class="kcard" draggable="true" data-lead="${l.id}" data-id="${l.id}">
    <div class="row" style="justify-content:space-between;align-items:flex-start"><b>${esc(l.name)}</b>${l.priority === 'high' ? '<span class="bd t-bad">High</span>' : ''}</div>
    <div class="sm mut ell" style="margin-top:2px">${esc(l.requirement || l.company || '')}</div>
    <div class="r"><span class="b" style="color:var(--ink)">${l.value ? short(l.value) : '—'}</span><span>${l.cameras ? l.cameras + ' cams · ' : ''}${esc(SOURCES[l.source] || '')}</span></div>
    <div class="r">${l.next_followup && !['won', 'lost'].includes(l.stage) ? `<span class="${late ? 'red b' : ''}">${ic('clock', 'width:13px;height:13px')} ${esc(fdt(l.next_followup))}</span>` : `<span>${esc(ago(l.updated_at))}</span>`}
      ${l.assigned_name ? `<span class="av sm" style="background:${esc(l.assigned_color)}" title="${esc(l.assigned_name)}">${esc(l.assigned_name.split(' ').map(w => w[0]).join(''))}</span>` : ''}</div></div>`;
}
function board(body, rows, reload) {
  body.innerHTML = `<div class="kb">${STAGES.map(s => { const items = rows.filter(r => r.stage === s); const sum = items.reduce((a, r) => a + (+r.value || 0), 0);
    return `<div class="kc" data-stage="${s}"><div class="kh"><span class="pr" style="background:${LEAD_STAGES[s][1]};border-radius:50%"></span>${LEAD_STAGES[s][0]} <span class="bd t-mut">${items.length}</span><small>${short(sum)}</small></div>
      ${items.map(card).join('') || '<div class="xs mut center" style="padding:14px 4px">Drop leads here</div>'}</div>`; }).join('')}</div>`;
  let dragId = null;
  on(body, 'dragstart', '.kcard', (e, c) => { dragId = c.dataset.id; c.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; });
  on(body, 'dragend', '.kcard', (e, c) => c.classList.remove('drag'));
  $$('.kc', body).forEach(col => {
    col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('over'); });
    col.addEventListener('dragleave', () => col.classList.remove('over'));
    col.addEventListener('drop', async e => {
      e.preventDefault(); col.classList.remove('over');
      if (!dragId) return;
      const stage = col.dataset.stage; let reason = '';
      if (stage === 'lost') { reason = prompt('Why was this lead lost? (optional)') ?? null; if (reason === null) return; }
      if (await run('lead_stage', { id: +dragId, stage, reason }, 'Moved to ' + LEAD_STAGES[stage][0])) reload();
      dragId = null;
    });
  });
}
function table(body, rows) {
  if (!rows.length) { body.innerHTML = `<div class="card">${empty('funnel', 'No leads found', 'Add your first enquiry with “New lead”.')}</div>`; return; }
  body.innerHTML = `<div class="card tw"><table class="t cards"><thead><tr><th>Lead</th><th>Stage</th><th>Requirement</th><th class="num">Value</th><th>Follow-up</th><th>Owner</th><th>Source</th></tr></thead><tbody>
    ${rows.map(l => { const late = l.next_followup && new Date(l.next_followup.replace(' ', 'T')) < new Date() && !['won', 'lost'].includes(l.stage);
      return `<tr class="click" data-lead="${l.id}"><td><div class="name">${esc(l.name)}</div><div class="sub">${esc(l.phone || '')} ${l.city ? '· ' + esc(l.city) : ''}</div></td>
      <td data-l="Stage">${badge(LEAD_STAGES, l.stage)}</td><td data-l="Need" class="ell" style="max-width:260px">${esc(l.requirement || '')}</td><td class="num" data-l="Value">${l.value ? money(l.value) : '—'}</td>
      <td data-l="Follow-up" class="${late ? 'red b' : ''} nowrap">${l.next_followup && !['won', 'lost'].includes(l.stage) ? esc(fdt(l.next_followup)) : '—'}</td><td data-l="Owner">${who(l.assigned_name, l.assigned_color)}</td><td data-l="Source">${esc(SOURCES[l.source] || '—')}</td></tr>`; }).join('')}
    </tbody></table></div>`;
}

/* ---------------- Lead detail panel ---------------- */
export async function openLead(id, reload) {
  let l;
  try { l = await api('lead_get', { id }); } catch (e) { return toast(e.message, true); }
  if (location.hash !== '#/leads/' + id) history.replaceState(null, '', '#/leads/' + id);
  const idx = STAGES.indexOf(l.stage);
  const [nb, wireNote] = noteBox('lead', id, () => { d.close(); openLead(id, reload); reload?.(); }, true);
  const msg = `Hi ${l.name}, this is ${S.user.name} from ${S.settings.company_name}. `;
  const d = drawer(`<div class="dwh"><div class="grow"><div class="xs mut">Lead #${l.id} · added ${esc(ago(l.created_at))}</div><h3 style="font-size:18px">${esc(l.name)}</h3></div>
      <button class="btn sm" data-edit>${ic('edit')}Edit</button><button class="btn ghost ic sm" data-x>${ic('x')}</button></div>
    <div class="dwb">
      <div class="steps" style="margin-bottom:16px">${STAGES.filter(s => s !== 'lost').map((s, i) => `<button data-stage="${s}" class="${s === l.stage ? (s === 'won' ? 'won' : 'on') : i < idx && l.stage !== 'lost' ? 'done' : ''}">${LEAD_STAGES[s][0]}</button>`).join('')}</div>
      ${l.stage === 'lost' ? `<div class="banner" style="background:var(--bad-s);color:#991b1b">${ic('x')}Lost${l.lost_reason ? ': ' + esc(l.lost_reason) : ''}</div>` : ''}
      <div class="row wrap" style="margin-bottom:16px">${l.phone ? `<a class="btn sm" href="${telLink(l.phone)}">${ic('phone')}Call</a><a class="btn sm wa" target="_blank" rel="noopener" href="${waLink(l.phone, msg)}">${ic('wa')}WhatsApp</a>` : ''}
        ${l.address ? `<a class="btn sm" target="_blank" rel="noopener" href="${mapLink(l.address)}">${ic('pin')}Map</a>` : ''}
        <a class="btn sm" href="#/quotes/new?lead=${l.id}">${ic('file')}Quotation</a>
        ${l.customer_id ? `<a class="btn sm" href="#/customers/${l.customer_id}">${ic('user')}Customer</a>` : `<button class="btn sm g" data-convert>${ic('check')}Won → customer</button>`}
        ${l.stage !== 'lost' && l.stage !== 'won' ? `<button class="btn sm d" data-lost>Lost</button>` : ''}</div>
      <dl class="kv" style="margin-bottom:18px">
        <dt>Phone</dt><dd>${esc(l.phone || '—')}</dd>${l.email ? `<dt>Email</dt><dd>${esc(l.email)}</dd>` : ''}${l.company ? `<dt>Company</dt><dd>${esc(l.company)}</dd>` : ''}
        <dt>Requirement</dt><dd style="white-space:pre-wrap">${esc(l.requirement || '—')}</dd>
        <dt>Cameras</dt><dd>${l.cameras || '—'} ${l.property_type ? '· ' + esc(PROPS[l.property_type] || l.property_type) : ''}</dd>
        <dt>Value</dt><dd>${l.value ? money(l.value) : '—'}</dd><dt>Source</dt><dd>${esc(SOURCES[l.source] || '—')}</dd>
        <dt>Address</dt><dd style="white-space:pre-wrap">${esc([l.address, l.city].filter(Boolean).join(', ') || '—')}</dd>
        <dt>Owner</dt><dd>${esc(l.assigned_name || 'Unassigned')}</dd>
        <dt>Follow-up</dt><dd class="${l.next_followup && new Date(l.next_followup.replace(' ', 'T')) < new Date() ? 'red' : ''}">${l.next_followup ? esc(fdt(l.next_followup)) : '—'}</dd>
      </dl>
      ${l.quotes.length ? `<h3 style="font-size:14px;margin-bottom:8px">Quotations</h3><div class="card" style="margin-bottom:18px">${l.quotes.map(q => `<a class="li" href="#/quotes/${q.id}"><div class="m"><b>${esc(q.number)}</b><small>${esc(fdate(q.date))}</small></div><b>${money(q.total)}</b>${badge(DOC_STATUS, q.status)}</a>`).join('')}</div>` : ''}
      <h3 style="font-size:14px;margin-bottom:8px">Activity</h3>${nb}<div style="margin-top:10px">${timeline(l.activities)}</div>
      ${staff() ? `<button class="btn sm d" data-del style="margin-top:18px">${ic('trash')}Delete lead</button>` : ''}
    </div>`, () => { if (location.hash.startsWith('#/leads/')) history.replaceState(null, '', '#/leads'); });
  const de = d.el;
  wireNote(de);
  $('[data-x]', de).onclick = d.close;
  on(de, 'click', '[data-stage]', async (e, b) => { if (await run('lead_stage', { id, stage: b.dataset.stage }, 'Stage updated')) { d.close(); openLead(id, reload); reload?.(); } });
  $('[data-lost]', de)?.addEventListener('click', async () => { const reason = prompt('Why was this lead lost?'); if (reason === null) return; if (await run('lead_stage', { id, stage: 'lost', reason }, 'Marked lost')) { d.close(); reload?.(); } });
  $('[data-convert]', de)?.addEventListener('click', async () => { const r = await run('lead_convert', { id }, 'Converted to customer 🎉'); if (r) { d.close(); location.hash = '#/customers/' + r.customer_id; } });
  $('[data-edit]', de).onclick = () => formModal({ title: 'Edit lead', size: 'lg', fields: leadFields(l), data: l, submit: async v => { if (await run('lead_save', { ...v, id }, 'Saved')) { d.close(); openLead(id, reload); reload?.(); return true; } } });
  $('[data-del]', de)?.addEventListener('click', async () => { if (await confirmBox('Delete lead ' + l.name + '?') && await run('lead_delete', { id }, 'Deleted')) { d.close(); reload?.(); } });
}
