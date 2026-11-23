// Technician home (mobile-first): today's route with Call / Navigate / Start, upcoming and recent jobs, own stats.
import { S, api, run, esc, ic, $, on, money, fdt, ftime, badge, empty, JOB_TYPES, JOB_STATUS, telLink, mapLink } from '../core.js';

export default async function (el) {
  const d = await api('dashboard');
  const card = j => { const [tl, c, i] = JOB_TYPES[j.type]; const phone = j.contact_phone || j.customer_phone;
    return `<div class="tjob ${j.priority === 'urgent' || j.priority === 'high' ? j.priority : ''}">
      <a href="#/jobs/${j.id}" style="display:block"><div class="tt"><div><span class="xs b" style="color:${c}">${ic(i, 'width:13px;height:13px;vertical-align:-2px')} ${esc(tl)} · ${esc(j.number)}</span><br><b>${esc(j.title)}</b></div>${badge(JOB_STATUS, j.status)}</div>
        <div class="sm" style="margin-top:6px"><b>${esc(j.customer_name || '')}</b></div><div class="sm mut ell">${esc((j.address || '').replace(/\n/g, ', '))}</div>
        <div class="sm" style="margin-top:6px">${ic('clock', 'width:14px;height:14px;vertical-align:-2px')} ${j.scheduled_at ? esc(fdt(j.scheduled_at)) : 'Not scheduled'}${+j.charge > +j.collected ? ` · <b class="amber">Collect ${money(j.charge - j.collected)}</b>` : ''}</div></a>
      ${!['completed', 'cancelled'].includes(j.status) ? `<div class="acts">${phone ? `<a class="btn sm" href="${telLink(phone)}">${ic('phone')}Call</a>` : ''}${j.address ? `<a class="btn sm" target="_blank" rel="noopener" href="${mapLink(j.address)}">${ic('pin')}Navigate</a>` : ''}
        ${j.status === 'in_progress' ? `<a class="btn sm g" href="#/jobs/${j.id}">${ic('check')}Finish</a>` : `<button class="btn sm p" data-start="${j.id}">${ic('play')}Start</button>`}</div>` : ''}</div>`; };
  const open = d.today.filter(j => j.status !== 'completed');
  el.innerHTML = `<div class="ph"><div><h1>Hi ${esc(S.user.name.split(' ')[0])} 👋</h1><p>${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} · ${open.length} job(s) to do today</p></div></div>
    <div class="grid g4" style="margin-bottom:16px;grid-template-columns:repeat(3,minmax(0,1fr))">
      <div class="card kpi"><div class="t">Done this month</div><div class="v">${d.stats.done_month}</div></div>
      <div class="card kpi"><div class="t">Collected</div><div class="v" style="font-size:20px">${money(d.stats.collected_month)}</div></div>
      <div class="card kpi"><div class="t">Rating</div><div class="v">${d.stats.rating ? '★ ' + d.stats.rating : '—'}</div></div></div>
    <h3 style="margin:4px 0 10px">Today</h3>${d.today.length ? d.today.map(card).join('') : `<div class="card">${empty('check', 'No jobs today', 'Enjoy the day — new jobs appear here as soon as the office assigns them.')}</div>`}
    ${d.unscheduled.length ? `<h3 style="margin:18px 0 10px">Assigned, date not fixed</h3>${d.unscheduled.map(card).join('')}` : ''}
    ${d.upcoming.length ? `<h3 style="margin:18px 0 10px">Upcoming</h3>${d.upcoming.map(card).join('')}` : ''}
    ${d.done.length ? `<h3 style="margin:18px 0 10px">Recently completed</h3><div class="card">${d.done.map(j => `<a class="li" href="#/jobs/${j.id}"><div class="m"><b>${esc(j.title)}</b><small>${esc(j.customer_name || '')} · ${esc(fdt(j.completed_at))}</small></div>${j.rating ? `<span class="stars sm">${'★'.repeat(j.rating)}</span>` : ''}</a>`).join('')}</div>` : ''}`;
  on(el, 'click', '[data-start]', async (e, b) => { if (await run('job_status', { id: +b.dataset.start, status: 'in_progress' }, 'Job started')) location.hash = '#/jobs/' + b.dataset.start; });
}
