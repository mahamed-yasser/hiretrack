'use strict';
const { h, api, toast, fmtDate, badge, formModal, confirmBox, table, kpi, toolbar, btn, download, mountApp } = UI;
const STAGES = ['applied', 'screen', 'interview', 'offer', 'hired'];
const CONS = { positive: ['Positive', 'ok'], mixed: ['Mixed', 'warn'], blocked: ['Blocked', 'bad'], no_feedback: ['No feedback', ''] };
const dt = (iso) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
let jobFilter = '';

async function dashboard(el) {
  const d = await api('GET', '/api/dashboard'); const max = Math.max(...d.funnel.map((f) => f.count), 1);
  el.append(h('div', { class: 'grid g4' }, kpi('Open roles', d.open_jobs), kpi('Active candidates', d.active), kpi('Hired', d.hired, d.rejected + ' rejected'), kpi('Avg days to hire', d.avg_days_to_hire ?? 'n/a')),
    h('div', { class: 'grid g2', style: 'margin-top:14px' },
      h('div', { class: 'card' }, h('h2', {}, 'Hiring funnel'), h('p', { class: 'muted small' }, 'Candidates who reached each stage'), h('div', { class: 'funnel' }, d.funnel.map((f) => h('div', { class: 'row' }, h('span', { style: 'width:80px;text-transform:capitalize' }, f.stage), h('div', { class: 'bar' }, h('i', { style: 'width:' + Math.round((f.count / max) * 100) + '%' })), h('b', {}, f.count)))),
        h('h2', { style: 'margin-top:16px' }, 'By source'), h('ul', { class: 'list' }, d.bySource.map((s) => h('li', {}, s.source, h('span', {}, s.n + ' applied · ' + (s.hires || 0) + ' hired'))))),
      h('div', { class: 'card' }, h('h2', {}, 'Upcoming interviews'), d.upcoming.length ? h('ul', { class: 'list' }, d.upcoming.map((i) => h('li', {}, h('a', { href: '#/pipeline/' + i.candidate_id }, i.candidate + ' · ' + i.kind), h('span', { class: 'muted' }, i.interviewer + ' · ' + dt(i.starts_at))))) : h('p', { class: 'muted' }, 'None scheduled.'),
        h('h2', { style: 'margin-top:16px' }, 'Waiting 7+ days in a stage'), d.stale.length ? h('ul', { class: 'list' }, d.stale.map((c) => h('li', {}, h('a', { href: '#/pipeline/' + c.id }, c.name), badge(c.stage + ' · ' + c.days + ' days', 'warn')))) : h('p', { class: 'muted' }, 'Nobody is stuck.'))));
}
async function pipeline(el, args) {
  if (args[0]) return detail(el, args[0]);
  const { jobs } = await api('GET', '/api/jobs'); const draw = async () => {
    const qs = jobFilter ? '?job_id=' + jobFilter : ''; const { candidates } = await api('GET', '/api/candidates' + qs);
    board.replaceChildren(...STAGES.map((s) => { const cs = candidates.filter((c) => c.stage === s); return h('div', { class: 'col' }, h('h3', {}, s, h('span', { class: 'muted' }, cs.length)),
      cs.map((c) => h('button', { class: 'cc', onclick: () => { location.hash = '#/pipeline/' + c.id; } }, h('div', { class: 'n' }, c.name), h('div', { class: 'muted small' }, c.job_title),
        h('div', { class: 'm' }, h('span', {}, c.days_in_stage + 'd in stage'), c.summary.avg ? h('span', { class: 'stars' }, '★ ' + c.summary.avg) : h('span', {}, c.source))))); }));
  };
  const board = h('div', { class: 'board' });
  el.append(toolbar(h('select', { 'aria-label': 'Job', onchange: (e) => { jobFilter = e.target.value; draw(); } }, h('option', { value: '' }, 'All roles'), jobs.map((j) => h('option', { value: j.id, selected: String(j.id) === jobFilter }, j.title))), h('span', { class: 'grow' }),
    btn('Export CSV', async () => download('candidates.csv', await (await fetch('/api/candidates.csv')).text())),
    btn('Add candidate', async () => { if (await formModal({ title: 'Add candidate', fields: [{ name: 'job_id', label: 'Role', type: 'select', options: jobs.filter((j) => j.status === 'open').map((j) => [j.id, j.title]) }, { name: 'name', label: 'Name', required: true }, { name: 'email', label: 'Email', type: 'email', required: true }, { name: 'source', label: 'Source', placeholder: 'Referral, LinkedIn…' }], onSubmit: (v) => api('POST', '/api/candidates', { ...v, job_id: Number(v.job_id) }) })) { toast('Candidate added to Applied'); draw(); } }, 'primary')), board);
  await draw();
}
async function detail(el, id) {
  const g = await api('GET', '/api/candidates/' + id); const c = g.candidate; const refresh = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
  const move = async (to) => {
    let reason; if (to === 'rejected') { const r = await formModal({ title: 'Reject ' + c.name, fields: [{ name: 'reason', label: 'Reason (kept in the record)', required: true, wide: true }], submit: 'Reject' }); if (!r) return; reason = r.reason; }
    try { await api('POST', `/api/candidates/${id}/move`, { to, reason }); refresh(); } catch (e) { toast(e.message, 'bad'); }
  };
  const i = STAGES.indexOf(c.stage); const open = i >= 0 && c.stage !== 'hired';
  const cons = CONS[c.summary.consensus];
  el.append(h('p', {}, h('a', { href: '#/pipeline' }, '← Pipeline')),
    h('div', { class: 'card' }, h('div', { class: 'row spread' }, h('div', {}, h('h2', {}, c.name), h('div', { class: 'muted' }, c.email + ' · ' + c.job_title + ' · via ' + c.source)), h('div', { class: 'row' }, badge(c.stage, c.stage === 'hired' ? 'ok' : c.stage === 'rejected' ? 'bad' : 'info'), badge(cons[0], cons[1]), c.summary.avg ? h('b', {}, '★ ' + c.summary.avg + ' (' + c.summary.count + ')') : null)),
      c.stage === 'rejected' ? h('p', { class: 'err' }, 'Rejected: ' + c.reject_reason) : null,
      h('div', { class: 'toolbar', style: 'margin-top:10px' }, open && i > 0 ? btn('← ' + STAGES[i - 1], () => move(STAGES[i - 1])) : null, open && i < 4 ? btn('Move to ' + STAGES[i + 1] + ' →', () => move(STAGES[i + 1]), 'primary') : null,
        open ? btn('Reject', () => move('rejected'), 'danger') : null, c.stage === 'rejected' ? btn('Reopen', () => move('applied')) : null)),
    h('div', { class: 'grid g2' },
      h('div', { class: 'card' }, h('div', { class: 'row spread' }, h('h2', {}, 'Interviews'), c.stage !== 'hired' && c.stage !== 'rejected' ? btn('Schedule', async () => {
        const r = await formModal({ title: 'Schedule interview', fields: [{ name: 'interviewer', label: 'Interviewer', required: true }, { name: 'kind', label: 'Type', type: 'select', options: ['Phone screen', 'Technical', 'Culture', 'Final'].map((x) => [x, x]) }, { name: 'starts_at', label: 'Date and time (UTC)', type: 'datetime-local', required: true, wide: true }],
          onSubmit: (v) => api('POST', `/api/candidates/${id}/interviews`, { ...v, starts_at: v.starts_at + ':00Z' }) }); if (r) refresh(); }, 'sm') : null),
        g.interviews.length ? h('ul', { class: 'list' }, g.interviews.map((x) => h('li', {}, x.kind + ' with ' + x.interviewer, h('span', { class: 'muted' }, dt(x.starts_at) + (x.done ? ' · done' : ''))))) : h('p', { class: 'muted' }, 'No interviews yet.'),
        h('h2', { style: 'margin-top:14px' }, 'History'), h('ul', { class: 'list' }, g.log.map((l) => h('li', {}, l.from_stage ? l.from_stage + ' → ' + l.to_stage : 'Applied', h('span', { class: 'muted' }, fmtDate(l.at.slice(0, 10)) + (l.note ? ' · ' + l.note : '')))))),
      h('div', { class: 'card' }, h('div', { class: 'row spread' }, h('h2', {}, 'Scorecards'), c.stage !== 'applied' && c.stage !== 'rejected' ? btn('Add scorecard', async () => {
        const r = await formModal({ title: 'Scorecard for ' + c.name, note: 'Scores 1 (weak) to 5 (excellent). Weights: skills 3, communication 2, team fit 1.', fields: [{ name: 'interviewer', label: 'Interviewer', required: true }, { name: 'recommendation', label: 'Recommendation', type: 'select', options: [['strong_yes', 'Strong yes'], ['yes', 'Yes'], ['no', 'No'], ['strong_no', 'Strong no']] },
          ...g.criteria.map(([k, l]) => ({ name: k, label: l, type: 'number', min: 1, max: 5, required: true })), { name: 'comment', label: 'Comment', type: 'textarea', wide: true }], values: { skills: 4, communication: 4, culture: 4 }, onSubmit: (v) => api('POST', `/api/candidates/${id}/scorecards`, v) }); if (r) refresh(); }, 'sm') : null),
        g.scorecards.length ? g.scorecards.map((s) => h('div', { style: 'padding:8px 0;border-bottom:1px solid var(--line)' }, h('div', { class: 'row spread' }, h('b', {}, s.interviewer), h('span', {}, '★ ' + s.weighted + ' · ' + s.recommendation.replace('_', ' '))), h('div', { class: 'muted small' }, `Skills ${s.skills} · Communication ${s.communication} · Fit ${s.culture}`), s.comment ? h('p', { style: 'margin:4px 0 0' }, s.comment) : null)) : h('p', { class: 'muted' }, 'No scorecards yet. An offer needs at least two.'))));
}
async function jobs(el) {
  const draw = async () => { const { jobs: rows } = await api('GET', '/api/jobs');
    el.replaceChildren(toolbar(h('span', { class: 'grow' }), btn('Open a role', async () => { if (await formModal({ title: 'Open a role', fields: [{ name: 'title', label: 'Title', required: true, wide: true }, { name: 'team', label: 'Team', required: true }, { name: 'location', label: 'Location', required: true }], onSubmit: (v) => api('POST', '/api/jobs', v) })) draw(); }, 'primary')),
      table([{ label: 'Role', render: (j) => h('div', {}, h('b', {}, j.title), h('div', { class: 'muted small' }, j.team + ' · ' + j.location)) }, { label: 'Status', render: (j) => badge(j.status, j.status === 'open' ? 'ok' : '') }, { label: 'Candidates', class: 'r', key: 'total' },
        { label: 'Pipeline', render: (j) => STAGES.map((s) => j.counts[s] + ' ' + s.slice(0, 3)).join(' · ') }, { label: '', render: (j) => btn(j.status === 'open' ? 'Close' : 'Reopen', async () => { await api('PATCH', '/api/jobs/' + j.id, { status: j.status === 'open' ? 'closed' : 'open' }); draw(); }, 'sm') }], rows)); };
  await draw();
}
mountApp({ title: 'HireTrack', tagline: 'Hiring pipeline, interviews and scorecards', accent: '#db2777', views: [{ id: 'dashboard', label: 'Overview', render: dashboard }, { id: 'pipeline', label: 'Pipeline', render: pipeline }, { id: 'jobs', label: 'Roles', render: jobs }] });
