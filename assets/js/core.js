// Shared frontend core: API client, state, formatting, icons, UI components (modal, form, drawer, toast, menu), charts, timeline.

export const S = { user: null, csrf: '', settings: {}, users: [], roles: {}, demo: false };

/* ---------------- API ---------------- */
export async function api(action, body = null, opts = {}) {
  const isForm = body instanceof FormData;
  const get = body === null || opts.get;
  const url = 'api/?a=' + action + (get && body ? '&' + new URLSearchParams(clean(body)) : '');
  let res;
  try {
    res = await fetch(url, get ? { credentials: 'same-origin' } : {
      method: 'POST', credentials: 'same-origin',
      headers: isForm ? { 'X-CSRF': S.csrf } : { 'Content-Type': 'application/json', 'X-CSRF': S.csrf },
      body: isForm ? body : JSON.stringify(body),
    });
  } catch (e) { throw new Error('No internet connection'); }
  let j;
  try { j = await res.json(); } catch (e) { throw new Error('Server error (' + res.status + ')'); }
  if (!j.ok) {
    if (res.status === 401 && action !== 'login') { location.hash = '#/login'; location.reload(); }
    const err = new Error(j.error || 'Error'); err.status = res.status; throw err;
  }
  return j.data;
}
const clean = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v !== null && v !== undefined));
/** Run an API call with a toast on error; returns undefined on failure */
export async function run(action, body, okMsg) {
  try { const r = await api(action, body); if (okMsg) toast(okMsg); return r ?? true; }
  catch (e) { toast(e.message, true); }
}

/* ---------------- Formatting ---------------- */
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = (n, dec = 0) => (S.settings.currency || '₹') + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
export const short = n => { n = Number(n || 0); const c = S.settings.currency || '₹'; return n >= 1e7 ? c + (n / 1e7).toFixed(2) + ' Cr' : n >= 1e5 ? c + (n / 1e5).toFixed(2) + ' L' : n >= 1e3 ? c + (n / 1e3).toFixed(1) + 'k' : c + Math.round(n); };
const D = s => s ? new Date(String(s).replace(' ', 'T')) : null;
export const fdate = s => { const d = D(s); return d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'; };
export const fday = s => { const d = D(s); return d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'; };
export const ftime = s => { const d = D(s); return d ? d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : ''; };
export const fdt = s => { const d = D(s); if (!d) return '—'; return relDay(d) + ', ' + ftime(s); };
export function relDay(d) {
  d = d instanceof Date ? d : D(d);
  const t = new Date(); t.setHours(0, 0, 0, 0); const x = new Date(d); x.setHours(0, 0, 0, 0);
  const n = Math.round((x - t) / 864e5);
  return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n === -1 ? 'Yesterday' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}
export function ago(s) {
  const d = D(s); if (!d) return '';
  const m = Math.round((Date.now() - d) / 6e4);
  if (m < 1) return 'just now'; if (m < 60) return m + 'm ago'; const h = Math.round(m / 60); if (h < 24) return h + 'h ago';
  const dd = Math.round(h / 24); return dd < 30 ? dd + 'd ago' : fdate(s);
}
export const today = (o = 0) => { const d = new Date(Date.now() + o * 864e5); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
export const dtLocal = s => s ? String(s).replace(' ', 'T').slice(0, 16) : '';
export const cap = s => String(s || '').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
export const initials = n => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
export const telLink = p => p ? 'tel:' + String(p).replace(/[^\d+]/g, '') : '';
export function waLink(p, text = '') {
  let d = String(p || '').replace(/\D/g, ''); if (d.length === 10) d = '91' + d;
  return 'https://wa.me/' + d + (text ? '?text=' + encodeURIComponent(text) : '');
}
export const mapLink = a => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(a || '');
export const userName = id => (S.users.find(u => +u.id === +id) || {}).name || '';
export const can = (...roles) => roles.includes(S.user?.role);
export const staff = () => can('admin', 'manager');
export const office = () => can('admin', 'manager', 'sales');

/* ---------------- Labels & colours ---------------- */
export const LEAD_STAGES = { new: ['New', '#64748b'], contacted: ['Contacted', '#0284c7'], site_visit: ['Site visit', '#7c3aed'], quoted: ['Quoted', '#d97706'], negotiation: ['Negotiation', '#db2777'], won: ['Won', '#16a34a'], lost: ['Lost', '#dc2626'] };
export const SOURCES = { 'walk-in': 'Walk-in', phone: 'Phone call', whatsapp: 'WhatsApp', website: 'Website', referral: 'Referral', justdial: 'JustDial', indiamart: 'IndiaMART', other: 'Other' };
export const PROPS = { home: 'Home / Villa', shop: 'Shop / Showroom', office: 'Office', school: 'School / College', hospital: 'Hospital / Clinic', apartment: 'Apartment / Hostel', factory: 'Factory / Warehouse', other: 'Other' };
export const JOB_TYPES = { installation: ['Installation', '#4f46e5', 'cam'], complaint: ['Complaint', '#dc2626', 'alert'], service: ['Service', '#0891b2', 'tool'], amc_visit: ['AMC visit', '#16a34a', 'shield'], survey: ['Site survey', '#7c3aed', 'pin'] };
export const JOB_STATUS = { new: ['New', '#64748b'], scheduled: ['Scheduled', '#0284c7'], in_progress: ['In progress', '#d97706'], on_hold: ['On hold', '#a855f7'], completed: ['Completed', '#16a34a'], cancelled: ['Cancelled', '#94a3b8'] };
export const PRIORITY = { low: ['Low', '#94a3b8'], normal: ['Normal', '#0284c7'], high: ['High', '#d97706'], urgent: ['Urgent', '#dc2626'] };
export const DOC_STATUS = { draft: ['Draft', '#64748b'], sent: ['Sent', '#0284c7'], accepted: ['Accepted', '#16a34a'], rejected: ['Rejected', '#dc2626'], unpaid: ['Unpaid', '#dc2626'], partial: ['Part paid', '#d97706'], paid: ['Paid', '#16a34a'], cancelled: ['Cancelled', '#94a3b8'] };
export const PCATS = { camera: 'Cameras', dvr: 'DVR', nvr: 'NVR', hdd: 'Hard disks', cable: 'Cables', power: 'Power / UPS', network: 'Network / PoE', accessory: 'Accessories', service: 'Services' };
export const PAY_MODES = { cash: 'Cash', upi: 'UPI', bank: 'Bank transfer', card: 'Card', cheque: 'Cheque' };
export function badge(map, key, extra = '') {
  const [label, color] = map[key] || [cap(key), '#64748b'];
  return `<span class="bd" style="background:${color}1a;color:${color}" ${extra}><i></i>${esc(label)}</span>`;
}
export const avatar = (name, color = '#64748b', cls = '') => `<span class="av ${cls}" style="background:${esc(color)}" title="${esc(name)}">${esc(initials(name))}</span>`;
export const who = (name, color) => name ? `<span class="row" style="gap:7px">${avatar(name, color, 'sm')}<span class="ell">${esc(name)}</span></span>` : '<span class="mut">Unassigned</span>';

/* ---------------- Icons ---------------- */
const P = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/>', grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  funnel: '<path d="M3 4h18l-7 9v6l-4 2v-8z"/>', users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>', tool: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h6"/>', receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>', box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', plus: '<path d="M12 5v14M5 12h14"/>', x: '<path d="M18 6 6 18M6 6l12 12"/>', menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  wa: '<path d="M20.5 11.6a8.5 8.5 0 0 1-12.4 7.5L3.5 20.5l1.4-4.4A8.5 8.5 0 1 1 20.5 11.6z"/><path d="M9 9.5c0 2.8 2.2 5 5 5l1-1.2-1.6-.8-.8.8a3.5 3.5 0 0 1-2-2l.8-.8-.8-1.6z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>', pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="m5 12 5 5 9-10"/>', alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>', cam: '<path d="M3 7h11l2 3h5v7H3z"/><circle cx="9" cy="12" r="2.5"/><path d="M5 17v3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m14 6 4 4"/>', trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  print: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>', rupee: '<path d="M7 4h10M7 8h10M14 20 7 12h3a4 4 0 0 0 0-8"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>', back: '<path d="M19 12H5M11 6l-6 6 6 6"/>', play: '<path d="M7 4v16l13-8z"/>', pause: '<path d="M7 4h3v16H7zM14 4h3v16h-3z"/>',
  board: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="7" rx="1.5"/>', list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  note: '<path d="M4 4h16v12l-4 4H4z"/><path d="M8 9h8M8 13h5"/>', visit: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/>', refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>', star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  camera: '<path d="M3 8h4l2-3h6l2 3h4v12H3z"/><circle cx="12" cy="13" r="4"/>', copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>', key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3"/>', inbox: '<path d="M3 13h5l2 3h4l2-3h5"/><path d="M5 5h14l2 8v6H3v-6z"/>',
};
export const ic = (n, s = '') => `<svg class="i" viewBox="0 0 24 24" ${s ? `style="${s}"` : ''} aria-hidden="true">${P[n] || P.grid}</svg>`;

/* ---------------- DOM helpers ---------------- */
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export function on(root, ev, sel, fn) { root.addEventListener(ev, e => { const t = e.target.closest(sel); if (t && root.contains(t)) fn(e, t); }); }
export const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const loading = el => { el.innerHTML = '<div class="spin"></div>'; };
export function empty(icon, title, text = '', action = '') { return `<div class="empty">${ic(icon)}<b>${esc(title)}</b>${esc(text)}${action ? `<div style="margin-top:14px">${action}</div>` : ''}</div>`; }

/* ---------------- Toast ---------------- */
export function toast(msg, err = false) {
  let box = $('.toasts'); if (!box) { box = document.createElement('div'); box.className = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.innerHTML = ic(err ? 'alert' : 'check') + esc(msg);
  box.appendChild(t); setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, err ? 4200 : 2600);
}

/* ---------------- Modal ---------------- */
export function modal({ title, body, foot = '', size = '', onOpen }) {
  const ov = document.createElement('div'); ov.className = 'ov';
  ov.innerHTML = `<div class="md ${size}" role="dialog" aria-modal="true"><div class="mh"><h3>${esc(title)}</h3><button class="btn ghost ic sm" data-x aria-label="Close">${ic('x')}</button></div><div class="mb">${body}</div>${foot ? `<div class="mf">${foot}</div>` : ''}</div>`;
  const close = () => { ov.remove(); document.removeEventListener('keydown', esc_); };
  const esc_ = e => { if (e.key === 'Escape') close(); };
  ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
  ov.querySelector('[data-x]').onclick = close;
  document.addEventListener('keydown', esc_);
  document.body.appendChild(ov);
  const m = { el: ov.querySelector('.md'), close };
  onOpen?.(m);
  setTimeout(() => ov.querySelector('input:not([type=hidden]),select,textarea')?.focus(), 30);
  return m;
}
export function confirmBox(text, okLabel = 'Delete', danger = true) {
  return new Promise(res => {
    const m = modal({ title: 'Are you sure?', size: 'sm', body: `<p>${esc(text)}</p>`, foot: `<button class="btn" data-n>Cancel</button><button class="btn ${danger ? 'd' : 'p'}" data-y>${esc(okLabel)}</button>` });
    m.el.querySelector('[data-n]').onclick = () => { m.close(); res(false); };
    m.el.querySelector('[data-y]').onclick = () => { m.close(); res(true); };
  });
}

/**
 * Form in a modal.
 * fields: [{ name, label, type: text|tel|email|number|date|datetime|textarea|select|customer|user|checkbox, options, required, full, placeholder, help }]
 * submit(values) → return truthy to close
 */
export function formModal({ title, fields, data = {}, submit, okLabel = 'Save', size = '' }) {
  const body = `<form class="fg" novalidate>${fields.map(f => field(f, data[f.name])).join('')}</form>`;
  const m = modal({ title, size, body, foot: `<button class="btn" data-c>Cancel</button><button class="btn p" data-s>${esc(okLabel)}</button>` });
  const form = m.el.querySelector('form');
  wireFields(form, data);
  const go = async () => {
    const v = formValues(form);
    for (const f of fields) if (f.required && (v[f.name] === '' || v[f.name] === null || v[f.name] === undefined)) { toast((f.label || f.name) + ' is required', true); form.elements[f.name]?.focus(); return; }
    const btn = m.el.querySelector('[data-s]'); btn.disabled = true;
    try { if (await submit(v)) m.close(); } finally { btn.disabled = false; }
  };
  m.el.querySelector('[data-c]').onclick = m.close;
  m.el.querySelector('[data-s]').onclick = go;
  form.addEventListener('submit', e => { e.preventDefault(); go(); });
  form.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') { e.preventDefault(); go(); } });
  return m;
}
export function field(f, val) {
  const v = val ?? f.value ?? '';
  const id = 'f_' + f.name + '_' + Math.random().toString(36).slice(2, 7);
  const lab = f.label ? `<label class="l" for="${id}">${esc(f.label)}${f.required ? ' <span class="red">*</span>' : ''}</label>` : '';
  const ph = f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : '';
  let input;
  switch (f.type) {
    case 'textarea': input = `<textarea class="in" id="${id}" name="${f.name}"${ph} rows="${f.rows || 3}">${esc(v)}</textarea>`; break;
    case 'select': input = `<select class="in" id="${id}" name="${f.name}">${f.blank !== false ? `<option value="">${esc(f.blank || '— Select —')}</option>` : ''}${Object.entries(f.options || {}).map(([k, l]) => `<option value="${esc(k)}" ${String(k) === String(v) ? 'selected' : ''}>${esc(Array.isArray(l) ? l[0] : l)}</option>`).join('')}</select>`; break;
    case 'user': input = `<select class="in" id="${id}" name="${f.name}"><option value="">${esc(f.blank || 'Unassigned')}</option>${S.users.filter(u => !f.roles || f.roles.includes(u.role)).map(u => `<option value="${u.id}" ${+u.id === +v ? 'selected' : ''}>${esc(u.name)} · ${esc(S.roles[u.role] || u.role)}</option>`).join('')}</select>`; break;
    case 'customer': input = `<div class="cpick" data-name="${f.name}"><input class="in" id="${id}" autocomplete="off" placeholder="Search customer by name or phone…" value="${esc(f.label_value || '')}"><input type="hidden" name="${f.name}" value="${esc(v)}"><div class="menu hide" style="position:absolute;max-height:260px;overflow:auto;width:min(420px,80vw)"></div></div>`; break;
    case 'checkbox': return `<label class="row ${f.full ? 'full' : ''}" style="gap:8px;font-weight:500"><input type="checkbox" name="${f.name}" ${v && v !== '0' ? 'checked' : ''}> ${esc(f.label)}</label>`;
    case 'datetime': input = `<input class="in" type="datetime-local" id="${id}" name="${f.name}" value="${esc(dtLocal(v))}">`; break;
    default: input = `<input class="in" type="${f.type || 'text'}" id="${id}" name="${f.name}" value="${esc(v)}"${ph}${f.type === 'number' ? ' step="any"' : ''}${f.type === 'tel' ? ' inputmode="tel"' : ''}>`;
  }
  return `<div class="${f.full || f.type === 'textarea' ? 'full' : ''}">${lab}${input}${f.help ? `<div class="xs mut" style="margin-top:5px">${esc(f.help)}</div>` : ''}</div>`;
}
export function formValues(form) {
  const v = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    v[el.name] = el.type === 'checkbox' ? (el.checked ? 1 : 0) : el.value.trim();
  }
  return v;
}
/** Customer search boxes inside a form */
export function wireFields(form, data = {}) {
  $$('.cpick', form).forEach(box => {
    const inp = box.querySelector('input:not([type=hidden])'), hid = box.querySelector('input[type=hidden]'), menu = box.querySelector('.menu');
    box.style.position = 'relative';
    if (hid.value && !inp.value && data.customer_name) inp.value = data.customer_name;
    const search = debounce(async () => {
      const q = inp.value.trim(); hid.value = '';
      if (q.length < 1) { menu.classList.add('hide'); return; }
      const list = await api('customers_list', { q }).catch(() => []);
      menu.innerHTML = list.slice(0, 8).map(c => `<button type="button" data-id="${c.id}" data-n="${esc(c.name)}"><span class="grow"><b>${esc(c.name)}</b><br><span class="xs mut">${esc(c.phone || '')} ${esc(c.city || '')}</span></span></button>`).join('')
        + `<button type="button" data-new>${ic('plus')}<b>Add “${esc(q)}” as new customer</b></button>`;
      menu.classList.remove('hide');
    }, 250);
    inp.addEventListener('input', search);
    inp.addEventListener('focus', () => { if (inp.value && !hid.value) search(); });
    menu.addEventListener('click', async e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.new !== undefined) {
        const phone = prompt('Phone number for ' + inp.value.trim() + ' (optional)') ?? '';
        const r = await run('customer_save', { name: inp.value.trim(), phone, force: 1 });
        if (!r) return; hid.value = r.id; toast('Customer added');
      } else { hid.value = b.dataset.id; inp.value = b.dataset.n; }
      menu.classList.add('hide'); hid.dispatchEvent(new Event('change', { bubbles: true }));
    });
    document.addEventListener('click', e => { if (!box.contains(e.target)) menu.classList.add('hide'); });
  });
}

/* ---------------- Drawer & popup menu ---------------- */
export function drawer(html, onClose) {
  const sc = document.createElement('div'); sc.className = 'ov'; sc.style.padding = '0';
  const dw = document.createElement('div'); dw.className = 'dw'; dw.innerHTML = html;
  const close = () => { sc.remove(); dw.remove(); document.removeEventListener('keydown', k); onClose?.(); };
  const k = e => { if (e.key === 'Escape' && !$('.md')) close(); };
  sc.onclick = close; document.addEventListener('keydown', k);
  document.body.append(sc, dw);
  return { el: dw, close };
}
export function popMenu(anchor, items) {
  $$('.menu.pop').forEach(m => m.remove());
  const m = document.createElement('div'); m.className = 'menu pop';
  m.innerHTML = items.map((it, i) => it === '-' ? '<div style="height:1px;background:var(--line2);margin:4px 0"></div>' : `<button data-i="${i}" ${it.danger ? 'style="color:var(--bad)"' : ''}>${ic(it.icon || 'arrow')}${esc(it.label)}</button>`).join('');
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect();
  m.style.top = (r.bottom + window.scrollY + 6) + 'px';
  m.style.left = Math.max(8, Math.min(r.right - m.offsetWidth, window.innerWidth - m.offsetWidth - 8)) + 'px';
  m.onclick = e => { const b = e.target.closest('button'); if (!b) return; m.remove(); items[+b.dataset.i].fn(); };
  setTimeout(() => document.addEventListener('click', function h(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('click', h); } }), 0);
}

/* ---------------- Charts ---------------- */
export function bars(data, keys) {
  const max = Math.max(1, ...data.flatMap(d => keys.map(k => +d[k[0]] || 0)));
  return `<div class="bars">${data.map(d => `<div class="bc"><div class="bb">${keys.map(([k, c, l]) => `<i style="height:${(+d[k] || 0) / max * 100}%;background:${c}" title="${esc(l)}: ${money(d[k])}"></i>`).join('')}</div><small>${esc(d.label)}</small></div>`).join('')}</div>
    <div class="legend" style="margin-top:10px">${keys.map(([, c, l]) => `<span><i style="background:${c}"></i>${esc(l)}</span>`).join('')}</div>`;
}
export function donut(parts) {
  const tot = parts.reduce((s, p) => s + p.v, 0) || 1; let a = 0;
  const arcs = parts.filter(p => p.v > 0).map(p => {
    const f = p.v / tot, a0 = a, a1 = a + f * Math.PI * 2; a = a1;
    if (f >= .9999) return `<circle cx="60" cy="60" r="46" fill="none" stroke="${p.c}" stroke-width="18"/>`;
    const x0 = 60 + 46 * Math.sin(a0), y0 = 60 - 46 * Math.cos(a0), x1 = 60 + 46 * Math.sin(a1), y1 = 60 - 46 * Math.cos(a1);
    return `<path d="M${x0} ${y0} A46 46 0 ${f > .5 ? 1 : 0} 1 ${x1} ${y1}" fill="none" stroke="${p.c}" stroke-width="18"/>`;
  }).join('');
  return `<div class="donut"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="46" fill="none" stroke="#eef1f6" stroke-width="18"/>${arcs}<text x="60" y="58" text-anchor="middle" font-size="22" font-weight="700" fill="#0f172a">${parts.reduce((s, p) => s + p.v, 0)}</text><text x="60" y="75" text-anchor="middle" font-size="10" fill="#64748b">total</text></svg>
    <ul>${parts.map(p => `<li><i style="background:${p.c}"></i>${esc(p.l)}<b>${p.v}</b></li>`).join('')}</ul></div>`;
}

/* ---------------- Timeline + note box ---------------- */
const KIND = { note: ['note', '#64748b'], call: ['phone', '#0284c7'], whatsapp: ['wa', '#16a34a'], visit: ['visit', '#7c3aed'], email: ['mail', '#db2777'], status: ['arrow', '#d97706'], system: ['zap', '#4f46e5'] };
export function timeline(list) {
  if (!list?.length) return '<p class="mut sm" style="padding:8px 0">No activity yet.</p>';
  return `<div class="tl">${list.map(a => { const [i, c] = KIND[a.kind] || KIND.note; return `<div class="e"><span class="dot" style="background:${c}17;color:${c}">${ic(i)}</span><div class="x"><p>${esc(a.body)}</p><small>${esc(a.user_name || 'System')} · ${esc(ago(a.created_at))}${a.kind !== 'system' && a.kind !== 'status' ? ' · ' + cap(a.kind) : ''}</small></div></div>`; }).join('')}</div>`;
}
/** Note composer: kinds + text (+ next follow-up for leads). onSaved reloads the page. */
export function noteBox(entity, id, onSaved, followup = false) {
  const html = `<div class="note-box" data-note><div class="seg" style="margin-bottom:6px">${[['note', 'Note'], ['call', 'Call'], ['whatsapp', 'WhatsApp'], ['visit', 'Visit']].map(([k, l], i) => `<button type="button" data-k="${k}" class="${i ? '' : 'on'}">${ic(KIND[k][0])}${l}</button>`).join('')}</div>
    <textarea placeholder="Write a note, call summary or next step…"></textarea>
    <div class="row wrap" style="justify-content:space-between;margin-top:6px">${followup ? `<label class="row sm mut" style="gap:6px">Next follow-up <input class="in" type="datetime-local" data-fu style="height:32px;width:auto"></label>` : '<span></span>'}<button class="btn p sm" type="button" data-save>Add</button></div></div>`;
  const wire = root => {
    const box = $('[data-note]', root); if (!box) return;
    let kind = 'note';
    on(box, 'click', '[data-k]', (e, b) => { kind = b.dataset.k; $$('[data-k]', box).forEach(x => x.classList.toggle('on', x === b)); });
    $('[data-save]', box).onclick = async () => {
      const body = $('textarea', box).value.trim(); if (!body) return toast('Write something first', true);
      const p = { entity, entity_id: id, kind, body }; const fu = $('[data-fu]', box); if (fu && fu.value) p.next_followup = fu.value;
      if (await run('activity_add', p, 'Added')) onSaved();
    };
  };
  return [html, wire];
}

/* ---------------- Contact buttons ---------------- */
export function contactBtns(phone, waText = '', address = '') {
  return `${phone ? `<a class="btn sm" href="${telLink(phone)}">${ic('phone')}Call</a><a class="btn sm wa" href="${waLink(phone, waText)}" target="_blank" rel="noopener">${ic('wa')}WhatsApp</a>` : ''}${address ? `<a class="btn sm" href="${mapLink(address)}" target="_blank" rel="noopener">${ic('pin')}Map</a>` : ''}`;
}
export function pageHead(title, sub = '', actions = '', crumb = '') {
  return `<div class="ph"><div>${crumb ? `<div class="crumb">${crumb}</div>` : ''}<h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div><div class="acts">${actions}</div></div>`;
}
