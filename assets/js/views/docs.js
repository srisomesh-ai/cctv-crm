// Quotations & GST invoices: list, editor (line items, live totals), A4 view / print, WhatsApp share, convert, payments.
import { S, api, run, esc, ic, $, $$, on, money, fdate, badge, empty, formModal, confirmBox, timeline, pageHead, DOC_STATUS, PAY_MODES, PCATS,
  waLink, debounce, toast, today, staff, wireFields, field, formValues } from '../core.js';

const T = { quotes: ['quote', 'Quotations', 'Quotation'], invoices: ['invoice', 'Invoices', 'Invoice'] };
const st = { quote: { q: '', status: '' }, invoice: { q: '', status: '' } };

/* ---------------- List ---------------- */
export async function list(el, [kind], qs) {
  const [type, title, one] = T[kind];
  const f = st[type];
  if (qs.get('status')) f.status = qs.get('status');
  if (type === 'invoice' && !staff()) { el.innerHTML = empty('key', 'No access'); return; }
  const chips = type === 'quote' ? [['', 'All'], ['draft', 'Draft'], ['sent', 'Sent'], ['accepted', 'Accepted'], ['rejected', 'Rejected']]
    : [['', 'All'], ['due', 'Due'], ['overdue', 'Overdue'], ['paid', 'Paid'], ['cancelled', 'Cancelled']];
  el.innerHTML = pageHead(title, type === 'quote' ? 'Send professional GST quotations and convert them to invoices or installation jobs in one click.' : 'GST invoices, payments received and balance due.',
    `<a class="btn p" href="#/${kind}/new">${ic('plus')}New ${one.toLowerCase()}</a>`)
    + `<div class="filters"><input class="in q" placeholder="Search number or customer…" value="${esc(f.q)}">${chips.map(([k, l]) => `<button class="chip ${f.status === k ? 'on' : ''}" data-s="${k}">${l}</button>`).join('')}</div><div id="dl"></div>`;
  const load = async () => {
    const rows = await api('docs_list', { type, ...f });
    const tot = rows.reduce((a, d) => a + (d.status === 'cancelled' || d.status === 'rejected' ? 0 : +d.total), 0);
    const due = rows.reduce((a, d) => a + (['unpaid', 'partial'].includes(d.status) ? d.total - d.paid : 0), 0);
    $('#dl', el).innerHTML = rows.length ? `<div class="card tw"><table class="t cards"><thead><tr><th>Number</th><th>Customer</th><th>Date</th><th>Status</th><th class="num">Total</th>${type === 'invoice' ? '<th class="num">Balance</th>' : '<th>Valid till</th>'}</tr></thead><tbody>
      ${rows.map(d => { const bal = d.total - d.paid; const over = type === 'invoice' && bal > 0 && d.due_date && d.due_date < today() && d.status !== 'cancelled';
        return `<tr class="click" data-href="#/${kind}/${d.id}"><td><div class="name">${esc(d.number)}</div><div class="sub ell" style="max-width:220px">${esc(d.title || '')}</div></td>
        <td data-l="Customer"><div class="name">${esc(d.party || '—')}</div><div class="sub">${esc(d.party_phone || '')}</div></td><td data-l="Date" class="nowrap">${esc(fdate(d.date))}</td><td data-l="Status">${badge(DOC_STATUS, d.status)}</td>
        <td class="num b" data-l="Total">${money(d.total)}</td>${type === 'invoice' ? `<td class="num ${over ? 'red b' : ''}" data-l="Balance">${d.status === 'cancelled' ? '—' : bal > 0 ? money(bal) + (over ? '<div class="xs">overdue</div>' : '') : '<span class="green">Paid</span>'}</td>` : `<td data-l="Valid till" class="nowrap">${esc(fdate(d.due_date))}</td>`}</tr>`; }).join('')}
      </tbody><tfoot><tr><td colspan="4" class="right mut b" style="padding:12px 14px">${rows.length} ${title.toLowerCase()}</td><td class="num b" style="padding:12px 14px">${money(tot)}</td>${type === 'invoice' ? `<td class="num red b" style="padding:12px 14px">${money(due)}</td>` : '<td></td>'}</tr></tfoot></table></div>`
      : `<div class="card">${empty(type === 'quote' ? 'file' : 'receipt', 'Nothing here yet', '', `<a class="btn p" href="#/${kind}/new">New ${one.toLowerCase()}</a>`)}</div>`;
  };
  $('.q', el).oninput = debounce(e => { f.q = e.target.value; load(); });
  on(el, 'click', '[data-s]', (e, b) => { f.status = b.dataset.s; $$('[data-s]', el).forEach(x => x.classList.toggle('on', x === b)); load(); });
  on(el, 'click', 'tr[data-href]', (e, r) => { location.hash = r.dataset.href; });
  await load();
}

/* ---------------- Editor ---------------- */
export async function editor(el, [kind, id], qs) {
  const [type, , one] = T[kind];
  if (type === 'invoice' && !staff()) { el.innerHTML = empty('key', 'No access'); return; }
  const products = await api('products_list');
  let d = { items: [], discount: 0, date: today(), due_date: today(type === 'quote' ? 15 : 7), notes: '', terms: S.settings[type + '_terms'] || '' };
  if (id) d = await api('doc_get', { id: +id });
  else {
    if (qs.get('customer')) { const c = await api('customer_get', { id: +qs.get('customer') }); d.customer_id = c.id; d.customer_name = c.name; }
    if (qs.get('lead')) { const l = await api('lead_get', { id: +qs.get('lead') }); d.lead_id = l.id; d.lead_name = l.name; d.customer_id = l.customer_id || ''; d.title = (l.cameras ? l.cameras + ' camera ' : '') + 'CCTV system'; d.notes = l.requirement || ''; }
    if (qs.get('job')) { const j = await api('job_get', { id: +qs.get('job') }); d.job_id = j.id; d.customer_id = j.customer_id; d.customer_name = j.customer_name; d.title = j.title;
      d.items = j.items.map(i => { const p = products.find(x => +x.id === +i.product_id) || {}; return { product_id: i.product_id, description: i.name, hsn: p.hsn, unit: i.unit, qty: i.qty, rate: +i.price, gst: +(p.gst ?? 18) }; });
      if (+j.charge) d.items.push({ description: 'Service visit charges – ' + j.number, qty: 1, rate: +j.charge, gst: +S.settings.default_gst || 18 }); }
  }
  const dup = !id && sessionStorage.getItem('dupDoc');
  if (dup) { d.items = JSON.parse(dup); sessionStorage.removeItem('dupDoc'); }
  if (!d.items.length) d.items.push({ description: '', qty: 1, rate: '', gst: +S.settings.default_gst || 18 });
  const party = d.customer_name || d.lead_name || '';
  el.innerHTML = pageHead(id ? 'Edit ' + esc(d.number) : 'New ' + one.toLowerCase(), '', `<a class="btn" href="#/${kind}${id ? '/' + id : ''}">Cancel</a><button class="btn p" data-save>${ic('check')}Save ${one.toLowerCase()}</button>`,
    `<a href="#/${kind}">${T[kind][1]}</a> / ${id ? esc(d.number) : 'New'}`)
    + `<div class="card cb" style="margin-bottom:16px"><form class="fg" id="hd" style="grid-template-columns:2fr 1fr 1fr">
        ${d.lead_id && !d.customer_id ? `<div class="full"><label class="l">For lead</label><div class="in" style="display:flex;align-items:center">${esc(d.lead_name)} <span class="mut sm" style="margin-left:8px">(becomes a customer when accepted)</span></div><input type="hidden" name="lead_id" value="${d.lead_id}"></div>`
          : field({ name: 'customer_id', label: 'Customer', type: 'customer', required: true }, d.customer_id)}
        ${field({ name: 'date', label: 'Date', type: 'date' }, d.date)}
        ${field({ name: 'due_date', label: type === 'quote' ? 'Valid till' : 'Due date', type: 'date' }, d.due_date)}
        ${field({ name: 'title', label: 'Subject', placeholder: 'e.g. 8 camera CCTV system for shop', full: true }, d.title)}
        ${d.lead_id && d.customer_id ? `<input type="hidden" name="lead_id" value="${d.lead_id}">` : ''}${d.job_id ? `<input type="hidden" name="job_id" value="${d.job_id}">` : ''}
      </form></div>
    <div class="card cb" style="margin-bottom:16px"><div class="row" style="justify-content:space-between;margin-bottom:8px"><h3>Items</h3>
        <div class="row"><select class="in" id="pick" style="width:auto;max-width:330px;height:36px"><option value="">+ Add product…</option>${Object.entries(PCATS).map(([c, l]) => `<optgroup label="${esc(l)}">${products.filter(p => p.category === c).map(p => `<option value="${p.id}">${esc(p.name)} — ${money(p.price)}</option>`).join('')}</optgroup>`).join('')}</select>
        <button class="btn sm" data-line>${ic('plus')}Blank line</button></div></div>
      <table class="items"><thead><tr><th style="width:44%">Description</th><th>HSN</th><th style="width:80px">Qty</th><th style="width:120px">Rate ₹</th><th style="width:80px">GST %</th><th class="right">Amount</th><th></th></tr></thead><tbody id="lines"></tbody></table>
      <div class="row wrap" style="align-items:flex-start;margin-top:16px;gap:24px"><div class="grow" style="min-width:260px">
          <label class="l">Notes (shown on ${one.toLowerCase()})</label><textarea class="in" id="notes" rows="3">${esc(d.notes || '')}</textarea>
          <label class="l" style="margin-top:12px">Terms & conditions</label><textarea class="in" id="terms" rows="4">${esc(d.terms || '')}</textarea></div>
        <div class="totals" id="tot"></div></div></div>`;
  wireFields($('#hd', el), d);
  const lines = $('#lines', el);
  const row = (it = {}) => `<tr><td><input class="in" data-k="description" value="${esc(it.description || '')}" placeholder="Item or service"><input type="hidden" data-k="product_id" value="${esc(it.product_id || '')}"><input type="hidden" data-k="unit" value="${esc(it.unit || '')}"></td>
    <td><input class="in" data-k="hsn" value="${esc(it.hsn || '')}" style="width:80px"></td><td><input class="in" data-k="qty" type="number" step="any" value="${esc(it.qty ?? 1)}"></td>
    <td><input class="in" data-k="rate" type="number" step="any" value="${esc(it.rate ?? '')}"></td><td><input class="in" data-k="gst" type="number" step="any" value="${esc(it.gst ?? 18)}"></td>
    <td class="a">—</td><td><button class="btn ghost ic sm" data-rm title="Remove">${ic('x')}</button></td></tr>`;
  lines.innerHTML = d.items.map(row).join('');
  const read = () => $$('tr', lines).map(tr => Object.fromEntries($$('[data-k]', tr).map(i => [i.dataset.k, i.value])));
  // Totals box: the discount input is created once; only the numbers are redrawn while typing
  $('#tot', el).innerHTML = `<div><span>Subtotal</span><b data-t="sub"></b></div><div style="align-items:center"><span>Discount ₹</span><input class="in" id="disc" type="number" step="any" value="${esc(+d.discount || 0)}" style="width:120px;height:34px;text-align:right"></div>
    <div><span>CGST</span><span data-t="cg"></span></div><div><span>SGST</span><span data-t="sg"></span></div><div class="gt"><span>Total</span><span data-t="tot"></span></div>`;
  const calc = () => {
    const its = read(); let sub = 0;
    $$('tr', lines).forEach((tr, i) => { const a = (+its[i].qty || 0) * (+its[i].rate || 0); sub += a; $('.a', tr).textContent = money(a, 2); });
    const disc = Math.min(+$('#disc', el).value || 0, sub), fct = sub ? (sub - disc) / sub : 1;
    const tax = its.reduce((t, it) => t + (+it.qty || 0) * (+it.rate || 0) * (+it.gst || 0) / 100 * fct, 0);
    const set = (k, v) => { $(`[data-t="${k}"]`, el).textContent = v; };
    set('sub', money(sub, 2)); set('cg', money(tax / 2, 2)); set('sg', money(tax / 2, 2)); set('tot', money(Math.round(sub - disc + tax)));
  };
  $('#disc', el).addEventListener('input', calc);
  lines.addEventListener('input', debounce(calc, 120));
  on(lines, 'click', '[data-rm]', (e, b) => { b.closest('tr').remove(); if (!$('tr', lines)) lines.insertAdjacentHTML('beforeend', row()); calc(); });
  $('[data-line]', el).onclick = () => { lines.insertAdjacentHTML('beforeend', row({ gst: +S.settings.default_gst || 18 })); $('tr:last-child input', lines).focus(); };
  $('#pick', el).onchange = e => {
    const p = products.find(x => +x.id === +e.target.value); if (!p) return;
    const blank = $$('tr', lines).find(tr => !$('[data-k=description]', tr).value);
    const html = row({ product_id: p.id, description: p.name, hsn: p.hsn, unit: p.unit, qty: 1, rate: +p.price, gst: +p.gst });
    if (blank) blank.outerHTML = html; else lines.insertAdjacentHTML('beforeend', html);
    e.target.value = ''; calc();
  };
  $('[data-save]', el).onclick = async () => {
    const h = formValues($('#hd', el));
    if (!h.customer_id && !h.lead_id) return toast('Choose a customer', true);
    const body = { ...h, type, id: id ? +id : undefined, discount: +($('#disc', el).value || 0), notes: $('#notes', el).value, terms: $('#terms', el).value, items: read().filter(i => i.description.trim()) };
    if (!body.items.length) return toast('Add at least one item', true);
    const r = await run('doc_save', body, one + ' saved');
    if (r) location.hash = `#/${kind}/${r.id}`;
  };
  calc();
}

/* ---------------- Paper (A4) ---------------- */
function paper(d) {
  const s = S.settings, quote = d.type === 'quote';
  const party = { name: d.customer_name || d.lead_name, company: d.customer_company, phone: d.customer_phone || d.lead_phone, address: d.customer_address || d.lead_address, city: d.customer_city, gstin: d.customer_gstin };
  const words = n => { const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'], b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const w = x => x < 20 ? a[x] : x < 100 ? b[Math.floor(x / 10)] + (x % 10 ? ' ' + a[x % 10] : '') : a[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' + w(x % 100) : '');
    n = Math.round(n); if (!n) return 'Zero'; let o = ''; const cr = Math.floor(n / 1e7), l = Math.floor(n / 1e5) % 100, th = Math.floor(n / 1e3) % 100, r = n % 1000;
    if (cr) o += w(cr) + ' Crore '; if (l) o += w(l) + ' Lakh '; if (th) o += w(th) + ' Thousand '; if (r) o += w(r); return o.trim(); };
  return `<div class="paper">
    <div class="hd"><div><h1>${esc(s.company_name)}</h1><div style="color:#4b5563;white-space:pre-wrap;margin-top:4px">${esc(s.company_address || '')}</div>
        <div style="color:#4b5563">${esc([s.company_phone, s.company_email].filter(Boolean).join(' · '))}</div>${s.company_gstin ? `<div><b>GSTIN:</b> ${esc(s.company_gstin)}</div>` : ''}</div>
      <div><div class="dt">${quote ? 'QUOTATION' : 'TAX INVOICE'}</div><table style="margin-top:8px;width:auto;margin-left:auto"><tr><td style="padding:2px 8px;border:0;color:#6b7280">No.</td><td style="padding:2px 0;border:0" class="n"><b>${esc(d.number)}</b></td></tr>
        <tr><td style="padding:2px 8px;border:0;color:#6b7280">Date</td><td style="padding:2px 0;border:0" class="n">${esc(fdate(d.date))}</td></tr>
        ${d.due_date ? `<tr><td style="padding:2px 8px;border:0;color:#6b7280">${quote ? 'Valid till' : 'Due date'}</td><td style="padding:2px 0;border:0" class="n">${esc(fdate(d.due_date))}</td></tr>` : ''}</table></div></div>
    <div class="two"><div><div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em">${quote ? 'Quotation for' : 'Bill to'}</div><b style="font-size:15px">${esc(party.name || '')}</b>
        ${party.company && party.company !== party.name ? `<div>${esc(party.company)}</div>` : ''}<div style="white-space:pre-wrap">${esc([party.address, party.city].filter(Boolean).join(', '))}</div>${party.phone ? `<div>Ph: ${esc(party.phone)}</div>` : ''}${party.gstin ? `<div><b>GSTIN:</b> ${esc(party.gstin)}</div>` : ''}</div>
      <div>${d.title ? `<div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em">Subject</div><b>${esc(d.title)}</b>` : ''}</div></div>
    <table><thead><tr><th>#</th><th>Description</th><th>HSN/SAC</th><th class="n">Qty</th><th class="n">Rate</th><th class="n">GST</th><th class="n">Amount</th></tr></thead><tbody>
      ${d.items.map((it, i) => `<tr><td>${i + 1}</td><td>${esc(it.description)}</td><td>${esc(it.hsn || '')}</td><td class="n">${+it.qty} ${esc(it.unit || '')}</td><td class="n">${money(it.rate, 2)}</td><td class="n">${+it.gst}%</td><td class="n">${money(it.amount, 2)}</td></tr>`).join('')}</tbody></table>
    <div class="sum"><div><span>Subtotal</span><span>${money(d.subtotal, 2)}</span></div>${+d.discount ? `<div><span>Discount</span><span>− ${money(d.discount, 2)}</span></div>` : ''}
      <div><span>CGST</span><span>${money(d.tax / 2, 2)}</span></div><div><span>SGST</span><span>${money(d.tax / 2, 2)}</span></div>
      <div class="gt"><span>Total</span><span>${money(d.total)}</span></div>${!quote && +d.paid ? `<div><span>Paid</span><span>${money(d.paid, 2)}</span></div><div><b>Balance</b><b>${money(d.total - d.paid, 2)}</b></div>` : ''}</div>
    <div style="font-size:12px;margin-top:6px"><b>Amount in words:</b> Rupees ${words(d.total)} only</div>
    <div class="foot"><div>${d.notes ? `<b>Notes</b><pre>${esc(d.notes)}</pre><br>` : ''}${d.terms ? `<b>Terms & conditions</b><pre>${esc(d.terms)}</pre>` : ''}</div>
      <div>${s.bank_details || s.upi_id ? `<b>Payment details</b><pre>${esc(s.bank_details || '')}${s.upi_id ? '\nUPI: ' + esc(s.upi_id) : ''}</pre>` : ''}<div class="sign">For <b>${esc(s.company_name)}</b><br><br><br>Authorised signatory</div></div></div>
  </div>`;
}

export async function view(el, [kind, id]) {
  const d = await api('doc_get', { id: +id });
  const quote = d.type === 'quote';
  if (T[kind][0] !== d.type) { location.hash = `#/${quote ? 'quotes' : 'invoices'}/${id}`; return; }
  const bal = d.total - d.paid;
  const phone = d.customer_phone || d.lead_phone;
  const share = `Dear ${d.customer_name || d.lead_name},\n\nPlease find our ${quote ? 'quotation' : 'invoice'} ${d.number}${d.title ? ' for ' + d.title : ''}.\nTotal: ${money(d.total)}${!quote && bal > 0 ? `\nBalance due: ${money(bal)}${S.settings.upi_id ? `\nPay by UPI: ${S.settings.upi_id}` : ''}` : ''}\n\nThank you,\n${S.settings.company_name}\n${S.settings.company_phone || ''}`;
  const acts = [];
  if (quote) {
    if (['draft', 'sent'].includes(d.status)) acts.push(`<button class="btn g" data-status="accepted">${ic('check')}Accepted</button>`);
    if (staff() && d.status !== 'rejected') acts.push(d.invoices.length ? `<a class="btn" href="#/invoices/${d.invoices[0].id}">${ic('receipt')}Invoice ${esc(d.invoices[0].number)}</a>` : `<button class="btn p" data-conv="invoice">${ic('receipt')}Make invoice</button>`);
  } else if (!['paid', 'cancelled'].includes(d.status)) acts.push(`<button class="btn g" data-pay>${ic('rupee')}Record payment</button>`);
  el.innerHTML = pageHead(esc(d.number), `${quote ? 'Quotation' : 'Invoice'} · ${esc(d.customer_name || d.lead_name || '')} · ${money(d.total)}`,
    `${acts.join('')}<a class="btn" href="#/print/${d.id}" target="_blank">${ic('print')}Print / PDF</a>${phone ? `<a class="btn wa" target="_blank" rel="noopener" href="${waLink(phone, share)}">${ic('wa')}Share</a>` : ''}<button class="btn ic" data-more>${ic('more')}</button>`,
    `<a href="#/${kind}">${T[kind][1]}</a> / ${esc(d.number)}`)
    + `<div class="row wrap" style="margin:-6px 0 16px">${badge(DOC_STATUS, d.status)}${d.from_number ? `<a class="bd t-info" href="#/quotes/${d.from_doc_id}">From ${esc(d.from_number)}</a>` : ''}${!quote && bal > 0 && d.status !== 'cancelled' ? `<span class="bd t-bad">Balance ${money(bal, 2)}</span>` : ''}</div>
    <div class="grid" style="grid-template-columns:minmax(0,1fr) 320px;align-items:start" id="dv"><div style="overflow-x:auto">${paper(d)}</div>
      <div class="col">${!quote ? `<div class="card"><div class="ch"><h3>Payments</h3><span class="b">${money(d.paid, 2)}</span></div>${d.payments.map(p => `<div class="li"><div class="m"><b>${money(p.amount, 2)}</b><small>${esc(PAY_MODES[p.mode] || p.mode)}${p.ref ? ' · ' + esc(p.ref) : ''} · ${esc(fdate(p.paid_on))}</small></div>${staff() ? `<button class="btn ghost ic sm" data-delpay="${p.id}" title="Delete">${ic('trash')}</button>` : ''}</div>`).join('') || '<p class="mut sm" style="padding:14px 18px">No payments yet.</p>'}</div>` : ''}
        <div class="card cb"><h3 style="margin-bottom:8px">History</h3>${timeline(d.activities)}</div></div></div>`;
  if (window.innerWidth < 1100) $('#dv', el).style.gridTemplateColumns = 'minmax(0,1fr)';
  on(el, 'click', '[data-status]', async (e, b) => { if (await run('doc_status', { id: d.id, status: b.dataset.status }, 'Marked ' + b.dataset.status)) S.reload(); });
  on(el, 'click', '[data-conv]', async (e, b) => { const r = await run('doc_convert', { id: d.id, to: b.dataset.conv }, b.dataset.conv === 'job' ? 'Installation job created' : 'Invoice created'); if (r) location.hash = r.job_id ? '#/jobs/' + r.job_id : '#/invoices/' + r.id; });
  $('[data-pay]', el)?.addEventListener('click', () => payDialog(d));
  on(el, 'click', '[data-delpay]', async (e, b) => { if (await confirmBox('Delete this payment?') && await run('payment_delete', { id: +b.dataset.delpay }, 'Deleted')) S.reload(); });
  $('[data-more]', el).onclick = async e => {
    const { popMenu } = await import('../core.js');
    popMenu(e.currentTarget, [
      ...(d.status !== 'cancelled' ? [{ label: 'Edit', icon: 'edit', fn: () => { location.hash = `#/${kind}/${d.id}/edit`; } }] : []),
      ...(quote ? [{ label: 'Mark as sent', icon: 'arrow', fn: async () => { if (await run('doc_status', { id: d.id, status: 'sent' }, 'Marked sent')) S.reload(); } },
                   { label: 'Mark as rejected', icon: 'x', fn: async () => { if (await run('doc_status', { id: d.id, status: 'rejected' }, 'Marked rejected')) S.reload(); } },
                   ...(staff() ? [{ label: 'Create installation job', icon: 'tool', fn: async () => { const r = await run('doc_convert', { id: d.id, to: 'job' }, 'Job created'); if (r) location.hash = '#/jobs/' + r.job_id; } }] : []),
                   { label: 'Duplicate as new quotation', icon: 'copy', fn: () => { sessionStorage.setItem('dupDoc', JSON.stringify(d.items)); location.hash = '#/quotes/new' + (d.customer_id ? '?customer=' + d.customer_id : ''); } }]
        : [...(d.status !== 'cancelled' && staff() ? [{ label: 'Cancel invoice', icon: 'x', danger: true, fn: async () => { if (await confirmBox('Cancel invoice ' + d.number + '?', 'Cancel invoice') && await run('doc_status', { id: d.id, status: 'cancelled' }, 'Cancelled')) S.reload(); } }] : [])]),
      ...(d.customer_id ? [{ label: 'Open customer', icon: 'user', fn: () => { location.hash = '#/customers/' + d.customer_id; } }] : []),
      ...(staff() ? ['-', { label: 'Delete', icon: 'trash', danger: true, fn: async () => { if (await confirmBox('Delete ' + d.number + '?') && await run('doc_delete', { id: d.id }, 'Deleted')) location.hash = '#/' + kind; } }] : []),
    ]);
  };
}

function payDialog(d) {
  formModal({ title: 'Record payment · ' + d.number, size: 'sm', data: { amount: (d.total - d.paid).toFixed(2), paid_on: today(), mode: 'upi' },
    fields: [{ name: 'amount', label: 'Amount received (₹)', type: 'number', required: true }, { name: 'mode', label: 'Mode', type: 'select', options: PAY_MODES, blank: false },
      { name: 'paid_on', label: 'Date', type: 'date' }, { name: 'ref', label: 'Reference (UTR / cheque no.)' }, { name: 'note', label: 'Note', full: true }],
    submit: async v => { if (await run('payment_add', { ...v, doc_id: d.id }, 'Payment recorded')) { S.reload(); return true; } } });
}

export async function print(el, [id]) {
  const d = await api('doc_get', { id: +id });
  document.querySelector('.side')?.classList.add('noprint'); document.querySelector('.top')?.classList.add('noprint'); document.querySelector('.bnav')?.classList.add('noprint');
  el.innerHTML = `<div class="row noprint" style="justify-content:center;margin-bottom:16px"><button class="btn p" onclick="print()">${ic('print')}Print / Save as PDF</button><a class="btn" href="#/${d.type === 'quote' ? 'quotes' : 'invoices'}/${d.id}">Back</a></div>${paper(d)}`;
  document.title = d.number + ' · ' + S.settings.company_name;
  setTimeout(() => window.print(), 400);
}

/* ---------------- Payments ---------------- */
export async function payments(el) {
  const f = { from: today(-30), to: today(), mode: '' };
  el.innerHTML = pageHead('Payments', 'All money received — invoices and on-site collections by technicians.') + `<div class="filters">
    <label class="row sm">From <input class="in" type="date" data-f="from" value="${f.from}"></label><label class="row sm">To <input class="in" type="date" data-f="to" value="${f.to}"></label>
    <select class="in" data-f="mode"><option value="">All modes</option>${Object.entries(PAY_MODES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div><div id="pl"></div>`;
  const load = async () => {
    const rows = await api('payments_list', f);
    const tot = rows.reduce((a, p) => a + +p.amount, 0);
    const by = {}; rows.forEach(p => { by[p.mode] = (by[p.mode] || 0) + +p.amount; });
    $('#pl', el).innerHTML = `<div class="grid g4" style="margin-bottom:16px"><div class="card kpi"><div class="t">Total received</div><div class="v green">${money(tot)}</div><div class="s">${rows.length} payments</div></div>
      ${Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([m, v]) => `<div class="card kpi"><div class="t">${esc(PAY_MODES[m] || m)}</div><div class="v">${money(v)}</div><div class="s">${Math.round(v / tot * 100)}%</div></div>`).join('')}</div>`
      + (rows.length ? `<div class="card tw"><table class="t cards"><thead><tr><th>Date</th><th>Customer</th><th>Against</th><th>Mode</th><th>Received by</th><th class="num">Amount</th></tr></thead><tbody>
      ${rows.map(p => `<tr class="${p.doc_id || p.job_id ? 'click' : ''}" data-href="${p.doc_id ? '#/invoices/' + p.doc_id : p.job_id ? '#/jobs/' + p.job_id : ''}"><td class="nowrap">${esc(fdate(p.paid_on))}</td><td data-l="Customer">${esc(p.customer || '—')}</td>
        <td data-l="Against">${esc(p.doc_number || p.job_number || '—')}</td><td data-l="Mode">${esc(PAY_MODES[p.mode] || p.mode)}${p.ref ? '<div class="sub">' + esc(p.ref) + '</div>' : ''}</td><td data-l="By">${esc(p.received_name || '')}</td><td class="num green b" data-l="Amount">${money(p.amount, 2)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="card">${empty('rupee', 'No payments in this period')}</div>`);
  };
  on(el, 'change', '[data-f]', (e, i) => { f[i.dataset.f] = i.value; load(); });
  on(el, 'click', 'tr[data-href]', (e, r) => { if (r.dataset.href) location.hash = r.dataset.href; });
  await load();
}
