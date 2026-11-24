'use strict';
const path = require('node:path'); const { createApp, csv } = require('./core'); const P = require('./pipeline');
const SCHEMA = `
CREATE TABLE IF NOT EXISTS jobs(id INTEGER PRIMARY KEY, title TEXT NOT NULL, team TEXT NOT NULL, location TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')), opened_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS candidates(id INTEGER PRIMARY KEY, job_id INTEGER NOT NULL REFERENCES jobs(id), name TEXT NOT NULL, email TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'Direct',
  stage TEXT NOT NULL DEFAULT 'applied', reject_reason TEXT, notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, stage_changed_at TEXT NOT NULL, UNIQUE(job_id,email));
CREATE TABLE IF NOT EXISTS stage_log(id INTEGER PRIMARY KEY, candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE, from_stage TEXT, to_stage TEXT NOT NULL, at TEXT NOT NULL, note TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS interviews(id INTEGER PRIMARY KEY, candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE, interviewer TEXT NOT NULL, starts_at TEXT NOT NULL, kind TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS scorecards(id INTEGER PRIMARY KEY, candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE, interviewer TEXT NOT NULL, skills INTEGER NOT NULL, communication INTEGER NOT NULL, culture INTEGER NOT NULL,
  weighted REAL NOT NULL, recommendation TEXT NOT NULL, comment TEXT NOT NULL DEFAULT '', at TEXT NOT NULL, UNIQUE(candidate_id,interviewer));`;

function build({ dbFile, clock = () => new Date(), publicDir = path.join(__dirname, '..', 'public') } = {}) {
  return createApp({ dbFile, publicDir, schema: SCHEMA, appName: 'HireTrack', seed: (db) => require('./seed')(db, clock()),
    routes(add, { db, tx, v, bad, HttpError }) {
      const now = () => clock().toISOString();
      const cand = (id) => { const c = db.prepare('SELECT c.*, j.title AS job_title FROM candidates c JOIN jobs j ON j.id=c.job_id WHERE c.id=?').get(id); if (!c) throw new HttpError(404, 'Candidate not found'); return c; };
      const cards = (id) => db.prepare('SELECT * FROM scorecards WHERE candidate_id=? ORDER BY at').all(id);
      const days = (iso) => Math.max(0, Math.floor((clock() - new Date(iso)) / 864e5));
      const view = (c) => ({ ...c, days_in_stage: days(c.stage_changed_at), summary: P.summarize(cards(c.id)) });

      add('GET', '/api/jobs', () => ({ jobs: db.prepare('SELECT * FROM jobs ORDER BY status, opened_at DESC').all().map((j) => {
        const cs = db.prepare('SELECT stage FROM candidates WHERE job_id=?').all(j.id); const by = Object.fromEntries([...P.STAGES, 'rejected'].map((s) => [s, cs.filter((c) => c.stage === s).length]));
        return { ...j, counts: by, total: cs.length }; }) }));
      add('POST', '/api/jobs', ({ body }) => ({ id: Number(db.prepare('INSERT INTO jobs(title,team,location,opened_at) VALUES(?,?,?,?)').run(v.str(body.title, 'Title'), v.str(body.team, 'Team'), v.str(body.location, 'Location'), now()).lastInsertRowid) }));
      add('PATCH', '/api/jobs/:id', ({ params, body }) => { db.prepare('UPDATE jobs SET status=? WHERE id=?').run(v.oneOf(body.status, ['open', 'closed'], 'status'), Number(params.id)); return { ok: true }; });
      add('GET', '/api/candidates', ({ query }) => {
        const w = [], p = []; if (query.job_id) { w.push('c.job_id=?'); p.push(Number(query.job_id)); } if (query.stage) { w.push('c.stage=?'); p.push(query.stage); }
        if (query.q) { w.push('(c.name LIKE ? OR c.email LIKE ?)'); const q = '%' + query.q.replace(/[%_]/g, '') + '%'; p.push(q, q); }
        return { candidates: db.prepare('SELECT c.*, j.title AS job_title FROM candidates c JOIN jobs j ON j.id=c.job_id' + (w.length ? ' WHERE ' + w.join(' AND ') : '') + ' ORDER BY c.stage_changed_at DESC').all(...p).map(view) };
      });
      add('POST', '/api/candidates', ({ body }) => {
        const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(v.int(body.job_id, 'Job', { min: 1 })); if (!job) throw bad('Unknown job'); if (job.status !== 'open') throw bad('This job is closed');
        const email = v.str(body.email, 'Email').toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw bad('Email looks invalid');
        return tx(() => { const t = now(); const id = Number(db.prepare('INSERT INTO candidates(job_id,name,email,source,created_at,stage_changed_at) VALUES(?,?,?,?,?,?)').run(job.id, v.str(body.name, 'Name'), email, v.str(body.source, 'Source', { required: false, max: 40 }) || 'Direct', t, t).lastInsertRowid);
          db.prepare("INSERT INTO stage_log(candidate_id,from_stage,to_stage,at) VALUES(?,NULL,'applied',?)").run(id, t); return { id }; });
      });
      add('GET', '/api/candidates/:id', ({ params }) => { const c = cand(Number(params.id)); return { candidate: view(c), log: db.prepare('SELECT * FROM stage_log WHERE candidate_id=? ORDER BY id').all(c.id), interviews: db.prepare('SELECT * FROM interviews WHERE candidate_id=? ORDER BY starts_at').all(c.id), scorecards: cards(c.id), criteria: P.CRITERIA }; });
      add('POST', '/api/candidates/:id/move', ({ params, body }) => tx(() => {
        const c = cand(Number(params.id)); const to = v.oneOf(body.to, [...P.STAGES, 'rejected'], 'stage');
        if (!P.canMove(c.stage, to)) throw bad(`Cannot move from ${c.stage} to ${to}`);
        let reason = null; if (to === 'rejected') reason = v.str(body.reason, 'Reason for rejecting', { max: 200 });
        const g = P.gate(to, P.summarize(cards(c.id))); if (g) throw bad(g);
        db.prepare('UPDATE candidates SET stage=?, reject_reason=?, stage_changed_at=? WHERE id=?').run(to, reason, now(), c.id);
        db.prepare('INSERT INTO stage_log(candidate_id,from_stage,to_stage,at,note) VALUES(?,?,?,?,?)').run(c.id, c.stage, to, now(), reason || '');
        if (to === 'hired') db.prepare("UPDATE candidates SET notes=notes WHERE id=?").run(c.id);
        return { candidate: view(cand(c.id)) };
      }));
      add('POST', '/api/candidates/:id/interviews', ({ params, body }) => {
        const c = cand(Number(params.id)); if (c.stage === 'rejected' || c.stage === 'hired') throw bad('No interviews for a closed candidate');
        const at = v.str(body.starts_at, 'Date and time'); if (isNaN(Date.parse(at))) throw bad('Date and time is invalid'); const who = v.str(body.interviewer, 'Interviewer', { max: 60 });
        if (db.prepare('SELECT starts_at FROM interviews WHERE interviewer=? AND done=0').all(who).some((i) => P.overlaps(i.starts_at, at))) throw bad(`${who} already has an interview within an hour of that time`);
        return { id: Number(db.prepare('INSERT INTO interviews(candidate_id,interviewer,starts_at,kind) VALUES(?,?,?,?)').run(c.id, who, at, v.oneOf(body.kind || 'Technical', ['Phone screen', 'Technical', 'Culture', 'Final'], 'kind')).lastInsertRowid) };
      });
      add('POST', '/api/candidates/:id/scorecards', ({ params, body }) => {
        const c = cand(Number(params.id)); if (c.stage === 'applied') throw bad('Score a candidate only after the screen stage'); let wgt;
        try { wgt = P.weighted(body); } catch (e) { throw bad(e.message); }
        db.prepare('INSERT INTO scorecards(candidate_id,interviewer,skills,communication,culture,weighted,recommendation,comment,at) VALUES(?,?,?,?,?,?,?,?,?)').run(c.id, v.str(body.interviewer, 'Interviewer', { max: 60 }), body.skills, body.communication, body.culture, wgt, v.oneOf(body.recommendation, P.RECS, 'Recommendation'), v.str(body.comment, 'Comment', { required: false, max: 1000 }), now());
        db.prepare('UPDATE interviews SET done=1 WHERE candidate_id=? AND interviewer=?').run(c.id, body.interviewer);
        return { weighted: wgt, summary: P.summarize(cards(c.id)) };
      });
      add('PATCH', '/api/candidates/:id', ({ params, body }) => { cand(Number(params.id)); db.prepare('UPDATE candidates SET notes=? WHERE id=?').run(v.str(body.notes, 'Notes', { required: false, max: 2000 }), Number(params.id)); return { ok: true }; });
      add('GET', '/api/dashboard', () => {
        const cs = db.prepare('SELECT * FROM candidates').all(); const open = cs.filter((c) => !['rejected', 'hired'].includes(c.stage));
        const funnel = P.STAGES.map((s) => ({ stage: s, count: db.prepare('SELECT COUNT(DISTINCT candidate_id) AS n FROM stage_log WHERE to_stage=?').get(s).n }));
        const hired = cs.filter((c) => c.stage === 'hired'); const ttf = hired.map((c) => Math.floor((new Date(c.stage_changed_at) - new Date(c.created_at)) / 864e5));
        const bySource = db.prepare("SELECT source, COUNT(*) AS n, SUM(stage='hired') AS hires FROM candidates GROUP BY source ORDER BY n DESC").all();
        const upcoming = db.prepare('SELECT i.*, c.name AS candidate FROM interviews i JOIN candidates c ON c.id=i.candidate_id WHERE i.done=0 AND i.starts_at>=? ORDER BY i.starts_at LIMIT 6').all(now());
        return { open_jobs: db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status='open'").get().n, active: open.length, hired: hired.length, rejected: cs.filter((c) => c.stage === 'rejected').length,
          avg_days_to_hire: ttf.length ? Math.round(ttf.reduce((a, b) => a + b, 0) / ttf.length) : null, funnel, bySource, upcoming,
          stale: open.filter((c) => days(c.stage_changed_at) >= 7).map((c) => ({ id: c.id, name: c.name, stage: c.stage, days: days(c.stage_changed_at) })) };
      });
      add('GET', '/api/candidates.csv', () => csv([['Name', 'Email', 'Job', 'Stage', 'Source', 'Applied', 'Reject reason'], ...db.prepare('SELECT c.*, j.title FROM candidates c JOIN jobs j ON j.id=c.job_id ORDER BY c.created_at').all().map((c) => [c.name, c.email, c.title, c.stage, c.source, c.created_at.slice(0, 10), c.reject_reason || ''])]));
    } });
}
module.exports = { build };
