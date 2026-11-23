// Office dashboard: KPIs, revenue chart, pipeline funnel, today's schedule, follow-ups, complaints, team load, AMC renewals.
import { S, api, esc, ic, money, short, fdt, ftime, ago, badge, who, bars, donut, empty, avatar, LEAD_STAGES, JOB_STATUS, JOB_TYPES, PRIORITY, telLink, waLink, staff, timeline } from '../core.js';

export default async function (el) {
  const d = await api('dashboard');
  const k = d.kpi;
  const hr = new Date().getHours();
  const hello = (hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening') + ', ' + S.user.name.split(' ')[0];
  const kpi = (href, icon, tone, label, value, sub) => `<a class="card kpi" href="${href}"><div class="t">${esc(label)}<span class="ib ${tone}">${ic(icon)}</span></div><div class="v">${value}</div><div class="s">${sub}</div></a>`;
  const stageOrder = ['new', 'contacted', 'site_visit', 'quoted', 'negotiation', 'won'];
  const pipe = Object.fromEntries(d.pipeline.map(p => [p.stage, p]));
  const pmax = Math.max(1, ...d.pipeline.map(p => +p.n));

  el.innerHTML = `
  <div class="ph"><div><h1>${esc(hello)} 👋</h1><p>${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · here is what needs attention today</p></div>
    <div class="acts"><a class="btn" href="#/calendar">${ic('cal')}Schedule</a><a class="btn" href="#/leads">${ic('funnel')}Pipeline</a></div></div>

  <div class="grid g4" style="margin-bottom:16px">
    ${kpi('#/leads', 'funnel', 't-pri', 'Open leads', k.leads_open, `<b class="${k.followups_due ? 'red' : ''}">${k.followups_due} follow-ups due</b> · ${short(k.pipeline_value)} pipeline`)}
    ${kpi('#/calendar', 'tool', 't-info', 'Jobs today', k.jobs_today, `<b class="green">${k.jobs_done_today} done</b> · ${k.unassigned} unassigned`)}
    ${kpi('#/tickets', 'alert', k.tickets_sla ? 't-bad' : 't-warn', 'Open complaints', k.tickets_open, k.tickets_sla ? `<b class="red">${k.tickets_sla} past ${esc(S.settings.sla_hours || 24)}h SLA</b>` : 'All within SLA')}
    ${staff() ? kpi('#/invoices?status=due', 'rupee', 't-ok', 'Collected this month', short(k.collected_month), `Billed ${short(k.revenue_month)} · <b class="${k.overdue ? 'red' : ''}">${short(k.outstanding)} due</b>`)
              : kpi('#/quotes', 'file', 't-ok', 'Open quotations', k.quotes_open, short(k.quotes_value) + ' in quotes')}
  </div>

  <div class="grid g21" style="margin-bottom:16px">
    <div class="card"><div class="ch"><h3>Today's schedule</h3><a class="btn sm ghost" href="#/calendar">Week view ${ic('arrow')}</a></div>
      ${d.today.length ? d.today.map(j => `<a class="li" href="#/jobs/${j.id}"><div class="tm">${esc(ftime(j.scheduled_at))}</div>
        <span class="ib" style="width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:${JOB_TYPES[j.type][1]}17;color:${JOB_TYPES[j.type][1]}">${ic(JOB_TYPES[j.type][2])}</span>
        <div class="m"><b>${esc(j.title)}</b><small>${esc(j.customer_name || '')} · ${esc(j.number)}</small></div>
        <div class="hide-s">${who(j.assigned_name, j.assigned_color)}</div>${badge(JOB_STATUS, j.status)}</a>`).join('') : empty('cal', 'Nothing scheduled today', 'Plan jobs from the Jobs page.')}
    </div>
    <div class="card"><div class="ch"><h3>Follow-ups due</h3><a class="btn sm ghost" href="#/leads?followup=today">All</a></div>
      ${d.followups.length ? d.followups.map(l => { const late = new Date(l.next_followup.replace(' ', 'T')) < new Date(); return `<div class="li"><div class="m"><a href="#/leads/${l.id}"><b>${esc(l.name)}</b></a><small class="${late ? 'red' : ''}">${late ? 'Overdue · ' : ''}${esc(fdt(l.next_followup))} · ${esc(LEAD_STAGES[l.stage][0])}</small></div>
        ${l.phone ? `<a class="btn sm ic" href="${telLink(l.phone)}" title="Call">${ic('phone')}</a><a class="btn sm ic wa" href="${waLink(l.phone, 'Hi ' + l.name + ', this is ' + S.user.name + ' from ' + S.settings.company_name + '. ')}" target="_blank" rel="noopener" title="WhatsApp">${ic('wa')}</a>` : ''}</div>`; }).join('') : empty('check', 'All caught up', 'No follow-ups due.')}
    </div>
  </div>

  <div class="grid ${staff() ? 'g3' : 'g2'}" style="margin-bottom:16px">
    ${staff() ? `<div class="card"><div class="ch"><h3>Billing vs collection</h3><span class="mut sm">6 months</span></div><div class="cb">${bars(d.months, [['invoiced', '#c7d2fe', 'Invoiced'], ['collected', '#4f46e5', 'Collected']])}</div></div>` : ''}
    <div class="card"><div class="ch"><h3>Sales pipeline</h3><a class="btn sm ghost" href="#/leads?view=board">Board ${ic('arrow')}</a></div><div class="cb funnel">
      ${stageOrder.map(s => { const p = pipe[s] || { n: 0, v: 0 }; return `<div class="fr"><span>${LEAD_STAGES[s][0]}${s === 'won' ? ' <small class="mut">(month)</small>' : ''}</span><div class="bar"><i style="width:${Math.max(8, p.n / pmax * 100)}%;background:${LEAD_STAGES[s][1]}">${p.n}</i></div><b>${short(p.v)}</b></div>`; }).join('')}
    </div></div>
    <div class="card"><div class="ch"><h3>Jobs by status</h3><span class="mut sm">open + this month</span></div><div class="cb">
      ${donut(['new', 'scheduled', 'in_progress', 'on_hold', 'completed'].map(s => ({ l: JOB_STATUS[s][0], c: JOB_STATUS[s][1], v: +((d.job_status.find(x => x.status === s) || {}).n || 0) })))}
    </div></div>
  </div>

  <div class="grid g3">
    <div class="card"><div class="ch"><h3>Open complaints</h3><a class="btn sm ghost" href="#/tickets">All</a></div>
      ${d.tickets.length ? d.tickets.map(t => `<a class="li" href="#/jobs/${t.id}"><span class="pr" style="background:${PRIORITY[t.priority][1]}"></span><div class="m"><b>${esc(t.title)}</b><small>${esc(t.customer_name || '')} · ${esc(t.assigned_name || 'unassigned')}</small></div>
        <span class="sm ${t.age_hours > (+S.settings.sla_hours || 24) ? 'red b' : 'mut'} nowrap">${t.age_hours < 24 ? t.age_hours + 'h' : Math.round(t.age_hours / 24) + 'd'}</span></a>`).join('') : empty('check', 'No open complaints')}
    </div>
    <div class="card"><div class="ch"><h3>Technicians today</h3><a class="btn sm ghost" href="#/team">Team</a></div>
      ${d.team.map(t => `<div class="li">${avatar(t.name, t.color)}<div class="m"><b>${esc(t.name)}</b><small>${t.open} open · ${t.done_month} done this month</small></div><span class="bd t-info">${t.today} today</span></div>`).join('') || empty('users', 'No technicians yet')}
      ${d.amc_due.length ? `<div class="ch" style="border-top:1px solid var(--line2)"><h3>AMC renewals</h3><a class="btn sm ghost" href="#/amc?status=expiring">All</a></div>` + d.amc_due.map(a => `<a class="li" href="#/amc/${a.id}"><div class="m"><b>${esc(a.customer_name)}</b><small>${esc(a.number)} · ${money(a.amount)}</small></div><span class="bd ${a.days_left < 0 ? 't-bad' : 't-warn'}">${a.days_left < 0 ? 'Expired ' + (-a.days_left) + 'd' : a.days_left + ' days left'}</span></a>`).join('') : ''}
    </div>
    <div class="card"><div class="ch"><h3>Recent activity</h3></div><div class="cb" style="padding-top:4px">${timeline(d.activity)}</div></div>
  </div>
  ${k.low_stock ? `<a class="banner" href="#/inventory?low=1" style="background:var(--warn-s);color:#92400e;margin-top:16px">${ic('box')}<b>${k.low_stock} products are low on stock.</b> Reorder soon →</a>` : ''}`;
}
