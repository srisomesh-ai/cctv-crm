// Team (users & roles) and Settings (company details for quotations/invoices, numbering, terms, demo reset). Everyone: my profile + password.
import { S, api, run, esc, ic, $, on, fdt, avatar, formModal, confirmBox, pageHead, can, toast, formValues, field } from '../core.js';

const COLORS = ['#4f46e5', '#0891b2', '#db2777', '#ea580c', '#16a34a', '#9333ea', '#ca8a04', '#0f766e', '#dc2626', '#475569'];
const ROLE_HELP = { admin: 'Everything incl. settings & team', manager: 'All office work, invoices, reports', sales: 'Leads, customers, quotations', technician: 'Mobile view of own jobs only' };
const uFields = (isNew) => [
  { name: 'name', label: 'Name', required: true }, { name: 'phone', label: 'Mobile', type: 'tel' },
  { name: 'email', label: 'Email (login)', type: 'email', required: true },
  { name: 'role', label: 'Role', type: 'select', blank: false, options: Object.fromEntries(Object.entries(S.roles).map(([k, v]) => [k, v + ' — ' + ROLE_HELP[k]])) },
  { name: 'color', label: 'Colour', type: 'select', blank: false, options: Object.fromEntries(COLORS.map(c => [c, c])) },
  { name: 'password', label: isNew ? 'Password' : 'New password (leave empty to keep)', type: 'password', required: isNew },
  ...(isNew ? [] : [{ name: 'active', label: 'Active (can log in)', type: 'checkbox' }]),
];

export async function team(el) {
  const rows = await api('users_list');
  const admin = can('admin');
  el.innerHTML = pageHead('Team', 'Who can log in and what they can do.', admin ? `<button class="btn p" data-new>${ic('plus')}Add member</button>` : '')
    + `<div class="grid g3">${rows.map(u => `<div class="card cb" style="${+u.active ? '' : 'opacity:.55'}"><div class="row">${avatar(u.name, u.color, 'lg')}<div class="grow"><b style="font-size:15px">${esc(u.name)}</b><div class="sm mut">${esc(S.roles[u.role])}${+u.active ? '' : ' · inactive'}</div></div>${admin ? `<button class="btn sm ic" data-edit="${u.id}">${ic('edit')}</button>` : ''}</div>
        <div class="sm" style="margin-top:12px">${esc(u.email)}<br>${esc(u.phone || '')}</div>
        <div class="row wrap" style="margin-top:12px">${u.role === 'technician' ? `<span class="bd t-info">${u.open_jobs} open jobs</span><span class="bd t-ok">${u.done_month} done this month</span>` : u.role === 'sales' ? `<span class="bd t-pri">${u.open_leads} open leads</span>` : ''}</div>
        <div class="xs mut" style="margin-top:10px">Last login: ${u.last_login ? esc(fdt(u.last_login)) : 'never'}</div></div>`).join('')}</div>`;
  $('[data-new]', el)?.addEventListener('click', () => formModal({ title: 'Add team member', fields: uFields(true), data: { role: 'technician', color: COLORS[rows.length % COLORS.length] },
    submit: async v => { if (await run('user_save', v, 'Added — share the login with them')) { S.users = (await api('me')).users; S.reload(); return true; } } }));
  on(el, 'click', '[data-edit]', (e, b) => { const u = rows.find(x => +x.id === +b.dataset.edit);
    formModal({ title: 'Edit ' + u.name, fields: uFields(false), data: u, submit: async v => { if (await run('user_save', { ...v, id: u.id }, 'Saved')) { S.reload(); return true; } } }); });
}

export async function settings(el) {
  const s = S.settings, admin = can('admin');
  const F = (name, label, type = 'text', extra = {}) => field({ name, label, type, ...extra }, s[name]);
  el.innerHTML = pageHead(admin ? 'Settings' : 'My profile', admin ? 'Company details printed on quotations and invoices.' : '')
    + `<div class="grid g21"><div class="col">${admin ? `
      <div class="card"><div class="ch"><h3>Company</h3></div><div class="cb"><form class="fg" id="sf">
        ${F('company_name', 'Company name')}${F('company_tagline', 'Tagline')}${F('company_phone', 'Phone')}${F('company_email', 'Email')}
        ${F('company_address', 'Address', 'textarea', { rows: 2 })}${F('company_gstin', 'GSTIN')}${F('company_state', 'State')}
        ${F('bank_details', 'Bank details (printed on invoices)', 'textarea', { rows: 2 })}${F('upi_id', 'UPI ID')}${F('default_gst', 'Default GST %', 'number')}
        ${F('quote_prefix', 'Quotation number prefix')}${F('invoice_prefix', 'Invoice number prefix')}${F('job_prefix', 'Job number prefix')}${F('sla_hours', 'Complaint SLA (hours)', 'number')}
        ${F('quote_terms', 'Quotation terms', 'textarea', { rows: 4 })}${F('invoice_terms', 'Invoice terms', 'textarea', { rows: 4 })}
      </form><button class="btn p" data-save style="margin-top:16px">${ic('check')}Save settings</button></div></div>` : ''}
      <div class="card"><div class="ch"><h3>Change password</h3></div><div class="cb"><form class="fg" id="pf">${field({ name: 'current', label: 'Current password', type: 'password' })}${field({ name: 'password', label: 'New password', type: 'password' })}</form>
        <button class="btn" data-pw style="margin-top:14px">Update password</button></div></div></div>
      <div class="col"><div class="card cb"><div class="row">${avatar(S.user.name, S.user.color, 'lg')}<div><b style="font-size:16px">${esc(S.user.name)}</b><div class="mut sm">${esc(S.roles[S.user.role])} · ${esc(S.user.email)}</div></div></div></div>
        ${S.demo && admin ? `<div class="card cb" style="border-color:#fcd34d"><h3>Demo data</h3><p class="sm mut" style="margin:6px 0 12px">Put all sample customers, leads, jobs and invoices back to a fresh state (dates move to today).</p><button class="btn d" data-reset>${ic('refresh')}Reset demo data</button></div>` : ''}
        <div class="card cb"><h3>Shortcuts</h3><p class="sm mut" style="margin-top:6px"><b>Ctrl + K</b> — search anything<br><b>New</b> button — add a lead, complaint, job, quotation…</p></div></div></div>`;
  $('[data-save]', el)?.addEventListener('click', async () => { const v = formValues($('#sf', el)); if (await run('settings_save', v, 'Settings saved')) Object.assign(S.settings, v); });
  $('[data-pw]', el).onclick = async () => { const v = formValues($('#pf', el)); if (await run('change_password', v, 'Password updated')) $('#pf', el).reset(); };
  $('[data-reset]', el)?.addEventListener('click', async () => { if (await confirmBox('Reset all demo data?', 'Reset')) { toast('Resetting…'); if (await run('demo_reset', {}, 'Demo data reset')) location.hash = '#/'; } });
}
