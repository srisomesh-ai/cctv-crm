// App shell: boot, login, sidebar + top bar, hash router, global search (Ctrl+K), quick add.
import { S, api, run, esc, ic, $, $$, on, toast, modal, avatar, debounce, popMenu, can, staff, office } from './core.js';

const ROUTES = [
  // [pattern, module, export, roles (empty = everyone)]
  [/^$/, 'dashboard', 'default', []],
  [/^leads$/, 'leads', 'list', ['admin', 'manager', 'sales']],
  [/^leads\/(\d+)$/, 'leads', 'list', ['admin', 'manager', 'sales']],
  [/^customers$/, 'customers', 'list', ['admin', 'manager', 'sales']],
  [/^customers\/(\d+)$/, 'customers', 'detail', ['admin', 'manager', 'sales']],
  [/^jobs$/, 'jobs', 'list', []],
  [/^tickets$/, 'jobs', 'tickets', []],
  [/^calendar$/, 'jobs', 'calendar', []],
  [/^jobs\/(\d+)$/, 'jobs', 'detail', []],
  [/^(quotes|invoices)$/, 'docs', 'list', ['admin', 'manager', 'sales']],
  [/^(quotes|invoices)\/new$/, 'docs', 'editor', ['admin', 'manager', 'sales']],
  [/^(quotes|invoices)\/(\d+)\/edit$/, 'docs', 'editor', ['admin', 'manager', 'sales']],
  [/^(quotes|invoices)\/(\d+)$/, 'docs', 'view', ['admin', 'manager', 'sales']],
  [/^print\/(\d+)$/, 'docs', 'print', ['admin', 'manager', 'sales']],
  [/^payments$/, 'docs', 'payments', ['admin', 'manager']],
  [/^amc$/, 'amc', 'list', ['admin', 'manager', 'sales']],
  [/^amc\/(\d+)$/, 'amc', 'detail', ['admin', 'manager', 'sales']],
  [/^inventory$/, 'inventory', 'default', []],
  [/^reports$/, 'reports', 'default', ['admin', 'manager']],
  [/^team$/, 'admin', 'team', ['admin', 'manager']],
  [/^settings$/, 'admin', 'settings', []],
];

/* ---------------- Boot ---------------- */
async function boot() {
  try { Object.assign(S, await api('me')); }
  catch (e) {
    document.body.innerHTML = `<div class="empty" style="padding-top:20vh">${ic('alert')}<b>${esc(e.message)}</b>${e.message.includes('install') ? '<p style="margin-top:12px"><a class="btn p" href="install.php">Open setup</a></p>' : ''}</div>`;
    return;
  }
  document.title = (S.settings.company_name || 'CRM') + ' · CRM';
  if (!S.user) return login();
  shell();
  window.addEventListener('hashchange', () => route());
  route();
  counters(); setInterval(counters, 120000);
}

/* ---------------- Login ---------------- */
function login() {
  const demo = S.demo && S.demo_logins?.length;
  const RD = { admin: 'Full access, settings, reports', manager: 'Office: jobs, invoices, team', sales: 'Leads, customers, quotations', technician: 'Mobile view: my jobs today' };
  document.body.innerHTML = `<div class="login">
    <div class="art"><div class="lens"></div>
      <div class="row" style="gap:12px;position:relative"><span style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#4f46e5,#06b6d4);display:grid;place-items:center;color:#fff;flex-shrink:0">${ic('cam', 'width:24px;height:24px')}</span>
        <div><b style="color:#fff;font-size:17px">${esc(S.settings.company_name)}</b><div style="color:#8b9ab3;font-size:13px">${esc(S.settings.company_tagline || 'CRM')}</div></div></div>
      <div style="position:relative"><h1>Every enquiry, installation and service call — in one place.</h1>
        <p>Track leads, send GST quotations, schedule technicians, manage AMC renewals and collect payments faster.</p>
        <div class="feat"><div><b>Leads pipeline</b>Follow-ups never missed</div><div><b>Jobs & complaints</b>Assign, track, close with photos</div><div><b>Quotes & invoices</b>GST-ready, share on WhatsApp</div><div><b>AMC & stock</b>Renewals and low-stock alerts</div></div></div>
      <small style="color:#56627a;position:relative">CRM v${esc(S.version)}</small></div>
    <div class="form"><form id="lf">
      <h2>Welcome back</h2><p class="mut" style="margin:4px 0 22px">Log in to your account</p>
      <label class="l">Email or mobile</label><input class="in" name="email" autocomplete="username" required>
      <label class="l" style="margin-top:14px">Password</label><input class="in" name="password" type="password" autocomplete="current-password" required>
      <button class="btn p" style="width:100%;height:44px;margin-top:20px">Log in</button>
      ${demo ? `<div class="demo"><b>Live demo</b> <span class="mut sm">— tap a role to explore</span><div class="g">${S.demo_logins.map(u => `<button type="button" data-role="${esc(u.role)}"><b>${esc(S.roles[u.role])} · ${esc(u.name)}</b><span>${esc(RD[u.role] || '')}</span></button>`).join('')}</div></div>` : ''}
    </form></div></div>`;
  const f = $('#lf');
  const done = d => { Object.assign(S, d); location.hash = '#/'; location.reload(); };
  f.onsubmit = async e => { e.preventDefault(); const r = await run('login', { email: f.email.value, password: f.password.value }); if (r) done(r); };
  on(f, 'click', '[data-role]', async (e, b) => { const r = await run('login', { demo: b.dataset.role }); if (r) done(r); });
}

/* ---------------- Shell ---------------- */
function nav() {
  const t = can('technician');
  const L = (h, i, l, badge = '') => `<a href="#/${h}" data-h="${h}">${ic(i)}<span>${l}</span>${badge}</a>`;
  const sec = s => `<div class="sec">${s}</div>`;
  if (t) return L('', 'home', 'My jobs') + L('calendar', 'cal', 'Calendar') + L('jobs', 'tool', 'All my jobs') + L('inventory', 'box', 'Stock') + L('settings', 'user', 'My profile');
  return L('', 'grid', 'Dashboard')
    + sec('Sales') + L('leads', 'funnel', 'Leads', '<span class="n hide" data-c="leads"></span>') + L('customers', 'users', 'Customers') + L('quotes', 'file', 'Quotations')
    + sec('Operations') + L('jobs', 'tool', 'Jobs') + L('tickets', 'alert', 'Complaints', '<span class="n hide" data-c="tickets"></span>') + L('calendar', 'cal', 'Schedule') + L('amc', 'shield', 'AMC contracts', '<span class="n g hide" data-c="amc"></span>')
    + (staff() ? sec('Finance') + L('invoices', 'receipt', 'Invoices') + L('payments', 'rupee', 'Payments') : '')
    + sec('Stock') + L('inventory', 'box', 'Inventory', '<span class="n g hide" data-c="stock"></span>')
    + (staff() ? sec('Insights') + L('reports', 'chart', 'Reports') + sec('Admin') + L('team', 'users', 'Team') : '')
    + L('settings', 'settings', can('admin') ? 'Settings' : 'My profile');
}
function shell() {
  const u = S.user;
  document.body.innerHTML = `<div class="shell">
    <aside class="side" id="side"><div class="brand"><span class="logo">${ic('cam')}</span><div class="grow"><b class="ell">${esc(S.settings.company_name)}</b><small>CRM</small></div></div>
      <nav id="nav">${nav()}</nav>
      <div class="me">${avatar(u.name, u.color)}<div class="grow"><b class="ell">${esc(u.name)}</b><small>${esc(S.roles[u.role])}</small></div><button class="btn ghost ic sm" id="logout" title="Log out" style="color:#94a3b8">${ic('logout')}</button></div></aside>
    <div class="scrim" id="scrim"></div>
    <div class="main"><header class="top">
        <button class="btn ghost ic burger" id="burger" aria-label="Menu">${ic('menu')}</button>
        <div class="search" id="sbtn">${ic('search')}<span>Search customers, leads, jobs…</span><kbd>Ctrl K</kbd></div>
        <div class="grow"></div>
        ${S.demo ? `<span class="bd t-warn hide-m" style="background:#fef3c7;color:#b45309" title="Demo data — resets any time">DEMO</span>` : ''}
        ${!can('technician') ? `<button class="btn p" id="qadd">${ic('plus')}<span>New</span></button>` : ''}
      </header>
      <main class="content" id="view"></main></div>
    <nav class="bnav ${can('technician') ? 'on' : ''}" id="bnav"><a href="#/" data-h="">${ic('home')}Today</a><a href="#/calendar" data-h="calendar">${ic('cal')}Calendar</a><a href="#/jobs" data-h="jobs">${ic('tool')}Jobs</a><a href="#/settings" data-h="settings">${ic('user')}Profile</a></nav>
  </div>`;
  const side = $('#side'), scrim = $('#scrim');
  const closeSide = () => { side.classList.remove('open'); scrim.classList.remove('on'); };
  $('#burger').onclick = () => { side.classList.add('open'); scrim.classList.add('on'); };
  scrim.onclick = closeSide; on(side, 'click', 'a', closeSide);
  $('#logout').onclick = async () => { await run('logout', {}); location.hash = ''; location.reload(); };
  $('#sbtn').onclick = palette;
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); palette(); } });
  $('#qadd')?.addEventListener('click', e => quickAdd(e.currentTarget));
}

async function quickAdd(anchor) {
  const go = (m, fn) => async () => { const mod = await import('./views/' + m + '.js'); mod[fn](); };
  const items = [
    { label: 'Lead / enquiry', icon: 'funnel', fn: go('leads', 'newLead') },
    { label: 'Customer', icon: 'user', fn: go('customers', 'newCustomer') },
    { label: 'Complaint / service call', icon: 'alert', fn: go('jobs', 'newComplaint') },
    { label: 'Job (installation, survey…)', icon: 'tool', fn: go('jobs', 'newJob') },
    '-',
    { label: 'Quotation', icon: 'file', fn: () => { location.hash = '#/quotes/new'; } },
  ];
  if (staff()) items.push({ label: 'Invoice', icon: 'receipt', fn: () => { location.hash = '#/invoices/new'; } }, { label: 'AMC contract', icon: 'shield', fn: go('amc', 'newAmc') });
  popMenu(anchor, items);
}

async function counters() {
  if (can('technician')) return;
  try {
    const d = await api('dashboard');
    const set = (k, n) => { const el = $(`[data-c="${k}"]`); if (el) { el.textContent = n; el.classList.toggle('hide', !n); } };
    set('leads', d.kpi.followups_due); set('tickets', d.kpi.tickets_open); set('amc', d.kpi.amc_expiring); set('stock', d.kpi.low_stock);
  } catch (e) { /* ignore */ }
}

/* ---------------- Router ---------------- */
let seq = 0;
async function route(refresh = false) {
  const h = location.hash.replace(/^#\/?/, '').split('?')[0];
  const qs = new URLSearchParams(location.hash.split('?')[1] || '');
  // A fresh container for every page, so click handlers from the previous page never pile up
  const old = $('#view'), view = old.cloneNode(false);
  if (refresh) view.style.minHeight = old.offsetHeight + 'px';   // keep the scroll position while redrawing
  old.replaceWith(view);
  $$('.ov, .dw, .menu.pop').forEach(x => x.remove());   // close panels / dialogs left open by the previous page
  const hit = ROUTES.find(r => r[0].test(h));
  $$('#nav a, #bnav a').forEach(a => { const k = a.dataset.h; a.classList.toggle('on', k === '' ? h === '' : h === k || h.startsWith(k + '/')); });
  if (!hit) { view.innerHTML = '<div class="empty"><b>Page not found</b><a class="btn" href="#/">Go to dashboard</a></div>'; return; }
  const [re, mod, fn, roles] = hit;
  if (roles.length && !roles.includes(S.user.role)) { view.innerHTML = `<div class="empty">${ic('key')}<b>No access</b>This page is not available for your role.</div>`; return; }
  const my = ++seq;
  if (!refresh) { view.innerHTML = '<div class="spin"></div>'; window.scrollTo(0, 0); }
  try {
    const m = await import('./views/' + (mod === 'dashboard' && can('technician') ? 'tech' : mod) + '.js');
    if (my !== seq) return;
    await m[fn](view, h.match(re).slice(1), qs);
    view.style.minHeight = '';
  } catch (e) {
    if (my !== seq) return;
    console.error(e);
    view.innerHTML = `<div class="empty">${ic('alert')}<b>${esc(e.message || 'Could not load this page')}</b><button class="btn" onclick="location.reload()">Reload</button></div>`;
  }
}
S.reload = () => route(true);   // views call S.reload() to redraw the current page after a change

/* ---------------- Search palette ---------------- */
function palette() {
  const ICONS = { customer: ['user', 't-pri', '#/customers/'], lead: ['funnel', 't-warn', '#/leads/'], quote: ['file', 't-info', '#/quotes/'], invoice: ['receipt', 't-ok', '#/invoices/'], job: ['tool', 't-mut', '#/jobs/'] };
  const pages = [['Dashboard', '#/'], ['Leads', '#/leads'], ['Customers', '#/customers'], ['Jobs', '#/jobs'], ['Complaints', '#/tickets'], ['Schedule', '#/calendar'], ['Quotations', '#/quotes'], ['Invoices', '#/invoices'], ['AMC', '#/amc'], ['Inventory', '#/inventory'], ['Reports', '#/reports']];
  const m = modal({ title: 'Search', size: 'pal', body: `<div class="pal"><div class="pi">${ic('search')}<input placeholder="Type a name, phone, invoice or job number…" autocomplete="off"></div><div class="res"></div></div>` });
  m.el.style.maxWidth = '600px'; m.el.querySelector('.mh').remove(); m.el.querySelector('.mb').style.padding = '0';
  const inp = $('input', m.el), res = $('.res', m.el);
  let idx = 0, list = [];
  const draw = () => { res.innerHTML = list.map((r, i) => `<a href="${r.href}" class="${i === idx ? 'on' : ''}"><span class="ib ${r.cls}">${ic(r.icon)}</span><span class="grow"><b>${esc(r.title)}</b><br><span class="xs mut">${esc(r.sub)}</span></span></a>`).join('') || '<p class="mut sm" style="padding:16px">Nothing found</p>'; };
  const base = () => { list = pages.map(([t, h]) => ({ title: t, sub: 'Go to page', href: h, icon: 'arrow', cls: 't-mut' })); idx = 0; draw(); };
  const search = debounce(async () => {
    const q = inp.value.trim(); if (q.length < 2) return base();
    const r = await api('search', { q }).catch(() => []);
    list = r.map(x => { const [i, c, h] = ICONS[x.type]; return { title: x.title, sub: x.sub, href: h + x.id, icon: i, cls: c }; });
    list.push(...pages.filter(([t]) => t.toLowerCase().includes(q.toLowerCase())).map(([t, h]) => ({ title: t, sub: 'Go to page', href: h, icon: 'arrow', cls: 't-mut' })));
    idx = 0; draw();
  }, 200);
  inp.oninput = search;
  inp.onkeydown = e => {
    if (e.key === 'ArrowDown') { idx = Math.min(idx + 1, list.length - 1); draw(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { idx = Math.max(idx - 1, 0); draw(); e.preventDefault(); }
    if (e.key === 'Enter' && list[idx]) { location.hash = list[idx].href; m.close(); }
  };
  res.onclick = e => { if (e.target.closest('a')) m.close(); };
  base();
}

boot();
