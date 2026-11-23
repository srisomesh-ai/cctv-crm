// Inventory: products & services catalogue, stock levels, purchase / adjust, stock movement history.
import { S, api, run, esc, ic, $, $$, on, money, fdt, empty, formModal, modal, pageHead, PCATS, debounce, staff, can } from '../core.js';

const st = { q: '', category: '', low: 0 };
const pFields = [
  { name: 'name', label: 'Product / service name', required: true, full: true },
  { name: 'category', label: 'Category', type: 'select', options: PCATS, blank: false, value: 'camera' }, { name: 'brand', label: 'Brand' },
  { name: 'sku', label: 'SKU / code' }, { name: 'unit', label: 'Unit', placeholder: 'pcs, roll, job', value: 'pcs' },
  { name: 'price', label: 'Selling price (₹, before GST)', type: 'number', required: true }, { name: 'cost', label: 'Purchase cost (₹)', type: 'number' },
  { name: 'gst', label: 'GST %', type: 'number', value: 18 }, { name: 'hsn', label: 'HSN / SAC code' },
  { name: 'min_stock', label: 'Alert when stock is below', type: 'number', value: 5 }, { name: 'warranty_months', label: 'Warranty (months)', type: 'number' },
  { name: 'track_stock', label: 'Track stock for this item', type: 'checkbox', value: 1 }, { name: 'active', label: 'Active (shown in quotations)', type: 'checkbox', value: 1 },
];

export default async function (el, _p, qs) {
  if (qs.get('low')) st.low = 1;
  const edit = staff();
  el.innerHTML = pageHead('Inventory', 'Cameras, DVR/NVR, HDDs, cables and services — stock reduces automatically when technicians use items on jobs.',
    edit ? `<button class="btn" data-moves>${ic('list')}Stock history</button><button class="btn p" data-new>${ic('plus')}New product</button>` : '')
    + `<div class="filters"><input class="in q" placeholder="Search product, brand, SKU…" value="${esc(st.q)}"><button class="chip ${!st.category ? 'on' : ''}" data-c="">All</button>
      ${Object.entries(PCATS).map(([k, v]) => `<button class="chip ${st.category === k ? 'on' : ''}" data-c="${k}">${esc(v)}</button>`).join('')}<button class="chip ${st.low ? 'on' : ''}" data-low style="${st.low ? '' : 'color:var(--warn)'}">${ic('alert', 'width:14px;height:14px')}Low stock</button></div><div id="il"></div>`;
  const load = async () => {
    const rows = await api('products_list', { q: st.q, category: st.category, low: st.low || '', all: edit ? 1 : '' });
    const val = rows.reduce((s, p) => s + (p.track_stock ? p.stock * (+p.cost || 0) : 0), 0);
    $('#il', el).innerHTML = (edit ? `<div class="grid g4" style="margin-bottom:16px"><div class="card kpi"><div class="t">Products</div><div class="v">${rows.length}</div></div><div class="card kpi"><div class="t">Stock value (cost)</div><div class="v">${money(val)}</div></div>
        <div class="card kpi"><div class="t">Low stock</div><div class="v amber">${rows.filter(p => p.track_stock && p.stock <= p.min_stock).length}</div></div><div class="card kpi"><div class="t">Out of stock</div><div class="v red">${rows.filter(p => p.track_stock && p.stock <= 0).length}</div></div></div>` : '')
      + (rows.length ? `<div class="card tw"><table class="t cards"><thead><tr><th>Product</th><th>Category</th><th class="num">Price</th>${edit ? '<th class="num">Cost</th>' : ''}<th class="num">GST</th><th class="num">In stock</th>${edit ? '<th></th>' : ''}</tr></thead><tbody>
      ${rows.map(p => { const low = p.track_stock && +p.stock <= +p.min_stock; return `<tr${+p.active ? '' : ' style="opacity:.5"'}><td><div class="name">${esc(p.name)}</div><div class="sub">${esc([p.brand, p.sku, p.warranty_months ? p.warranty_months + ' mo warranty' : ''].filter(Boolean).join(' · '))}</div></td>
        <td data-l="Category">${esc(PCATS[p.category] || p.category)}</td><td class="num" data-l="Price">${money(p.price)}</td>${edit ? `<td class="num mut" data-l="Cost">${money(p.cost)}</td>` : ''}<td class="num" data-l="GST">${+p.gst}%</td>
        <td class="num" data-l="Stock">${+p.track_stock ? `<span class="bd ${+p.stock <= 0 ? 't-bad' : low ? 't-warn' : 't-ok'}">${p.stock} ${esc(p.unit)}</span>` : '<span class="mut">—</span>'}</td>
        ${edit ? `<td class="num" data-l=""><span class="row" style="justify-content:flex-end;gap:6px">${+p.track_stock ? `<button class="btn sm" data-stock="${p.id}">${ic('plus')}Stock</button>` : ''}<button class="btn sm ic" data-edit="${p.id}" title="Edit">${ic('edit')}</button></span></td>` : ''}</tr>`; }).join('')}</tbody></table></div>`
        : `<div class="card">${empty('box', 'No products found')}</div>`);
    el._rows = rows;
  };
  $('.q', el).oninput = debounce(e => { st.q = e.target.value; load(); });
  on(el, 'click', '[data-c]', (e, b) => { st.category = b.dataset.c; $$('[data-c]', el).forEach(x => x.classList.toggle('on', x === b)); load(); });
  $('[data-low]', el).onclick = e => { st.low = st.low ? 0 : 1; e.currentTarget.classList.toggle('on', !!st.low); load(); };
  $('[data-new]', el)?.addEventListener('click', () => formModal({ title: 'New product', size: 'lg', fields: [...pFields, { name: 'stock', label: 'Opening stock', type: 'number' }], submit: async v => { if (await run('product_save', v, 'Product added')) { load(); return true; } } }));
  on(el, 'click', '[data-edit]', (e, b) => { const p = el._rows.find(x => +x.id === +b.dataset.edit); formModal({ title: 'Edit product', size: 'lg', fields: pFields, data: p, submit: async v => { if (await run('product_save', { ...v, id: p.id }, 'Saved')) { load(); return true; } } }); });
  on(el, 'click', '[data-stock]', (e, b) => { const p = el._rows.find(x => +x.id === +b.dataset.stock);
    formModal({ title: 'Stock · ' + p.name, size: 'sm', data: { kind: 'purchase' }, okLabel: 'Update stock', fields: [
      { name: 'kind', label: 'Type', type: 'select', blank: false, options: { purchase: 'Purchase (stock in)', adjust: 'Adjustment (+ or −)', return: 'Customer return (stock in)' } },
      { name: 'qty', label: 'Quantity (use − to reduce on adjustment)', type: 'number', required: true }, { name: 'ref', label: 'Supplier bill / reference' }, { name: 'note', label: 'Note' }],
      submit: async v => { const r = await run('stock_move', { ...v, product_id: p.id }); if (r) { (await import('../core.js')).toast('Stock now ' + r.stock + ' ' + p.unit); load(); return true; } } }); });
  $('[data-moves]', el)?.addEventListener('click', async () => {
    const rows = await api('stock_moves');
    modal({ title: 'Stock history', size: 'lg', body: `<div class="tw"><table class="t"><thead><tr><th>When</th><th>Product</th><th>Type</th><th class="num">Qty</th><th>Ref</th><th>By</th></tr></thead><tbody>
      ${rows.map(m => `<tr><td class="nowrap">${esc(fdt(m.created_at))}</td><td>${esc(m.product)}</td><td>${esc(m.kind)}</td><td class="num b ${m.qty < 0 ? 'red' : 'green'}">${m.qty > 0 ? '+' : ''}${m.qty}</td><td>${esc(m.ref || m.note || '')}</td><td>${esc(m.user_name || '')}</td></tr>`).join('')}</tbody></table></div>` });
  });
  await load();
}
