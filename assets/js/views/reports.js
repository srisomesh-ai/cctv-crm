// Reports: sales, GST, collections, lead sources & conversion, technician performance, outstanding ageing, top items. CSV export.
import { api, esc, ic, $, on, money, short, pageHead, today, avatar, bars, SOURCES, PAY_MODES } from '../core.js';

const rng = { from: '', to: '' };
export default async function (el) {
  if (!rng.from) { const d = new Date(); d.setMonth(d.getMonth() - 5, 1); rng.from = d.toISOString().slice(0, 10); rng.to = today(); }
  el.innerHTML = pageHead('Reports', 'How the business is doing.', `<label class="row sm">From <input class="in" type="date" data-f="from" value="${rng.from}" style="width:auto"></label>
    <label class="row sm">To <input class="in" type="date" data-f="to" value="${rng.to}" style="width:auto"></label><button class="btn" data-csv>${ic('file')}Export CSV</button>`) + '<div id="rp"></div>';
  let data;
  const load = async () => {
    data = await api('report', rng);
    const s = data.summary;
    const conv = s.leads ? Math.round(s.won / s.leads * 100) : 0;
    const maxSrc = Math.max(1, ...data.sources.map(x => +x.leads));
    $('#rp', el).innerHTML = `<div class="grid g4" style="margin-bottom:16px">
        <div class="card kpi"><div class="t">Invoiced</div><div class="v">${money(s.invoiced)}</div><div class="s">GST ${money(s.tax)}</div></div>
        <div class="card kpi"><div class="t">Collected</div><div class="v green">${money(s.collected)}</div><div class="s">${s.invoiced ? Math.round(s.collected / s.invoiced * 100) : 0}% of invoiced</div></div>
        <div class="card kpi"><div class="t">Leads → won</div><div class="v">${s.leads} → ${s.won}</div><div class="s">${conv}% conversion</div></div>
        <div class="card kpi"><div class="t">Jobs completed</div><div class="v">${s.jobs_done}</div><div class="s">Complaints closed in ${s.avg_close_hours || '—'} h avg</div></div></div>
      <div class="grid g2" style="margin-bottom:16px">
        <div class="card"><div class="ch"><h3>Monthly sales</h3></div><div class="cb">${data.monthly.length ? bars(data.monthly.map(m => ({ label: new Date(m.m + '-01').toLocaleDateString('en-IN', { month: 'short' }), invoiced: +m.invoiced, tax: +m.tax })), [['invoiced', '#4f46e5', 'Invoiced'], ['tax', '#a5b4fc', 'GST']]) : '<p class="mut">No invoices in this period.</p>'}</div></div>
        <div class="card"><div class="ch"><h3>Lead sources</h3><span class="mut sm">leads · won · value</span></div><div class="cb funnel">${data.sources.map(x => `<div class="fr"><span>${esc(SOURCES[x.source] || x.source)}</span><div class="bar"><i style="width:${Math.max(10, x.leads / maxSrc * 100)}%;background:#4f46e5">${x.leads}</i></div><b>${x.won} · ${short(x.won_value)}</b></div>`).join('') || '<p class="mut">No leads.</p>'}</div></div></div>
      <div class="grid g2" style="margin-bottom:16px">
        <div class="card tw"><div class="ch"><h3>Technician performance</h3></div><table class="t"><thead><tr><th>Technician</th><th class="num">Done</th><th class="num">Installs</th><th class="num">Complaints</th><th class="num">AMC</th><th class="num">Avg close</th><th class="num">Rating</th></tr></thead><tbody>
          ${data.technicians.map(t => `<tr><td><span class="row">${avatar(t.name, t.color, 'sm')}${esc(t.name)}</span></td><td class="num b">${t.done}</td><td class="num">${t.installs || 0}</td><td class="num">${t.tickets || 0}</td><td class="num">${t.amc || 0}</td><td class="num">${t.avg_hours ? t.avg_hours + ' h' : '—'}</td><td class="num">${t.rating ? '★ ' + t.rating : '—'}</td></tr>`).join('')}</tbody></table></div>
        <div class="card tw"><div class="ch"><h3>Outstanding (ageing)</h3><a class="btn sm ghost" href="#/invoices?status=due">Invoices</a></div><table class="t"><thead><tr><th>Age</th><th class="num">Invoices</th><th class="num">Amount</th></tr></thead><tbody>
          ${data.aging.map(a => `<tr><td>${esc(a.bucket)}</td><td class="num">${a.n}</td><td class="num b ${a.bucket.includes('60') ? 'red' : ''}">${money(a.amount)}</td></tr>`).join('') || '<tr><td colspan="3" class="mut">Nothing outstanding 🎉</td></tr>'}</tbody></table>
          <div class="ch" style="border-top:1px solid var(--line2)"><h3>Collections by mode</h3></div><table class="t"><tbody>${data.modes.map(m => `<tr><td>${esc(PAY_MODES[m.mode] || m.mode)}</td><td class="num">${m.n}</td><td class="num b">${money(m.amount)}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="card tw"><div class="ch"><h3>Top items billed</h3></div><table class="t"><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Amount</th></tr></thead><tbody>${data.products.map(p => `<tr><td>${esc(p.name)}</td><td class="num">${+p.qty}</td><td class="num b">${money(p.amount)}</td></tr>`).join('')}</tbody></table></div>`;
  };
  on(el, 'change', '[data-f]', (e, i) => { rng[i.dataset.f] = i.value; load(); });
  $('[data-csv]', el).onclick = () => {
    const lines = [['Report', rng.from + ' to ' + rng.to], [], ['Month', 'Invoiced', 'GST', 'Invoices'], ...data.monthly.map(m => [m.m, m.invoiced, m.tax, m.n]), [],
      ['Source', 'Leads', 'Won', 'Won value'], ...data.sources.map(x => [x.source, x.leads, x.won, x.won_value]), [],
      ['Technician', 'Done', 'Installs', 'Complaints', 'AMC', 'Avg hours', 'Rating'], ...data.technicians.map(t => [t.name, t.done, t.installs, t.tickets, t.amc, t.avg_hours, t.rating])];
    const csv = lines.map(r => r.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'crm-report-' + rng.from + '-to-' + rng.to + '.csv'; a.click();
  };
  await load();
}
