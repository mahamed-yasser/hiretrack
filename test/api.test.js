'use strict';
const test = require('node:test'), assert = require('node:assert/strict'); const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { start } = require('./testkit'); const { build } = require('../src/app');
const clock = () => new Date('2026-11-24T10:00:00Z'); const mk = (o) => build({ ...o, clock });
const find = async (s, name) => (await s.call('GET', '/api/candidates')).data.candidates.find((c) => c.name === name);
const SC = { interviewer: 'Zoe', skills: 4, communication: 4, culture: 4, recommendation: 'yes' };

test('auth; dashboard and funnel are consistent with the data', async () => {
  const s = await start(mk); assert.equal((await s.anon('GET', '/api/jobs')).status, 401);
  const d = (await s.call('GET', '/api/dashboard')).data; assert.equal(d.open_jobs, 3); assert.equal(d.hired, 1); assert.equal(d.rejected, 1); assert.equal(d.avg_days_to_hire, 8);
  assert.equal(d.funnel[0].count, 13); assert.ok(d.funnel[0].count >= d.funnel[1].count && d.funnel[1].count >= d.funnel[4].count); assert.equal(d.upcoming.length, 2);
  assert.ok(d.stale.some((c) => c.name === 'James O\'Neill') === true && d.stale.every((c) => c.days >= 7)); await s.close();
});
test('stage moves follow the rules and are logged; reject needs a reason; reopen works', async () => {
  const s = await start(mk); const mina = await find(s, 'Mina Park');
  assert.match((await s.call('POST', `/api/candidates/${mina.id}/move`, { to: 'offer' })).data.error, /Cannot move/);
  assert.equal((await s.call('POST', `/api/candidates/${mina.id}/move`, { to: 'screen' })).status, 200);
  assert.match((await s.call('POST', `/api/candidates/${mina.id}/move`, { to: 'rejected' })).data.error, /Reason/);
  assert.equal((await s.call('POST', `/api/candidates/${mina.id}/move`, { to: 'rejected', reason: 'Role filled' })).data.candidate.stage, 'rejected');
  assert.equal((await s.call('POST', `/api/candidates/${mina.id}/move`, { to: 'applied' })).status, 200);
  const g = (await s.call('GET', '/api/candidates/' + mina.id)).data; assert.deepEqual(g.log.map((l) => l.to_stage), ['applied', 'screen', 'rejected', 'applied']); assert.equal(g.candidate.reject_reason, null);
  const hired = await find(s, 'Ibrahim Kaya'); assert.equal((await s.call('POST', `/api/candidates/${hired.id}/move`, { to: 'rejected', reason: 'x' })).status, 400); await s.close();
});
test('offer gate: needs two scorecards and no strong no; scoring validation; one card per interviewer', async () => {
  const s = await start(mk); const rahul = await find(s, 'Rahul Verma'); const url = `/api/candidates/${rahul.id}`;
  assert.match((await s.call('POST', url + '/move', { to: 'offer' })).data.error, /at least 2/);
  assert.equal((await s.call('POST', url + '/scorecards', { ...SC, skills: 9 })).status, 400); assert.equal((await s.call('POST', url + '/scorecards', { ...SC, recommendation: 'maybe' })).status, 400);
  const r = await s.call('POST', url + '/scorecards', { ...SC, interviewer: 'Zoe', recommendation: 'strong_no' }); assert.equal(r.status, 200); assert.equal(r.data.weighted, 4);
  assert.equal((await s.call('POST', url + '/scorecards', SC)).status, 409);
  assert.match((await s.call('POST', url + '/move', { to: 'offer' })).data.error, /blocks/);
  const applied = await find(s, 'Grace Mensah'); assert.match((await s.call('POST', `/api/candidates/${applied.id}/scorecards`, SC)).data.error, /after the screen/);
  const lena = await find(s, 'Lena Hoffmann'); assert.equal((await s.call('POST', `/api/candidates/${lena.id}/move`, { to: 'hired' })).status, 200); await s.close();
});
test('interviews: clash for same interviewer refused; creating candidates validates and de-dupes', async () => {
  const s = await start(mk); const clara = await find(s, 'Clara Nguyen'); const t = '2026-11-30T09:00:00Z';
  assert.equal((await s.call('POST', `/api/candidates/${clara.id}/interviews`, { interviewer: 'Dana Okoye', starts_at: t, kind: 'Final' })).status, 200);
  assert.match((await s.call('POST', `/api/candidates/${clara.id}/interviews`, { interviewer: 'Dana Okoye', starts_at: '2026-11-30T09:30:00Z', kind: 'Final' })).data.error, /within an hour/);
  assert.equal((await s.call('POST', `/api/candidates/${clara.id}/interviews`, { interviewer: 'Dana Okoye', starts_at: 'soon', kind: 'Final' })).status, 400);
  const jobs = (await s.call('GET', '/api/jobs')).data.jobs; const body = { job_id: jobs[0].id, name: 'New Person', email: 'New@Person.example', source: 'Referral' };
  assert.equal((await s.call('POST', '/api/candidates', body)).status, 200); assert.equal((await s.call('POST', '/api/candidates', body)).status, 409);
  assert.equal((await s.call('POST', '/api/candidates', { ...body, email: 'bad' })).status, 400);
  await s.call('PATCH', '/api/jobs/' + jobs[0].id, { status: 'closed' }); assert.match((await s.call('POST', '/api/candidates', { ...body, email: 'x@y.example' })).data.error, /closed/); await s.close();
});
test('search, csv, persistence', async () => {
  const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ht-')), 'x.db'); let s = await start((o) => mk({ ...o, dbFile }));
  assert.equal((await s.call('GET', '/api/candidates?q=' + encodeURIComponent('hoff'))).data.candidates.length, 1); assert.equal((await s.call('GET', '/api/candidates?q=' + encodeURIComponent("' OR 1=1 --"))).data.candidates.length, 0);
  assert.match((await s.call('GET', '/api/candidates.csv', null, true)).text, /^Name,Email/); const c = await find(s, 'Mina Park'); await s.call('PATCH', '/api/candidates/' + c.id, { notes: 'Great portfolio' }); await s.close();
  s = await start((o) => mk({ ...o, dbFile })); assert.equal((await s.call('GET', '/api/candidates/' + c.id)).data.candidate.notes, 'Great portfolio'); await s.close();
});
