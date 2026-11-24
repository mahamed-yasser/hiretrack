'use strict';
const P = require('./pipeline');
module.exports = function seed(db, now) {
  const ago = (d, h = 10) => new Date(now.getTime() - d * 864e5 + (h - 12) * 36e5).toISOString();
  const job = (t, team, loc, d) => Number(db.prepare('INSERT INTO jobs(title,team,location,opened_at) VALUES(?,?,?,?)').run(t, team, loc, ago(d)).lastInsertRowid);
  const J = [job('Senior Backend Engineer', 'Platform', 'Remote (EU)', 40), job('Product Designer', 'Design', 'Berlin', 25), job('Customer Success Manager', 'Support', 'London', 15)];
  const cand = (j, name, src, stage, d, path, reason) => {
    const email = name.toLowerCase().replace(/[^a-z]+/g, '.') + '@mail.example';
    const id = Number(db.prepare('INSERT INTO candidates(job_id,name,email,source,stage,reject_reason,created_at,stage_changed_at) VALUES(?,?,?,?,?,?,?,?)').run(J[j], name, email, src, stage, reason || null, ago(d), ago(Math.max(0, d - path.length * 2))).lastInsertRowid);
    let prev = null; ['applied', ...path].forEach((s, i) => { db.prepare('INSERT INTO stage_log(candidate_id,from_stage,to_stage,at,note) VALUES(?,?,?,?,?)').run(id, prev, s, ago(Math.max(0, d - i * 2)), s === 'rejected' ? reason || '' : ''); prev = s; });
    return id;
  };
  const card = (id, who, s, c, t, rec, comment, d) => { const w = P.weighted({ skills: s, communication: c, culture: t }); db.prepare('INSERT INTO scorecards(candidate_id,interviewer,skills,communication,culture,weighted,recommendation,comment,at) VALUES(?,?,?,?,?,?,?,?,?)').run(id, who, s, c, t, w, rec, comment, ago(d)); };
  const a = cand(0, 'Lena Hoffmann', 'Referral', 'offer', 30, ['screen', 'interview', 'offer']); card(a, 'Marco Rossi', 5, 4, 4, 'strong_yes', 'Excellent systems design.', 22); card(a, 'Tess Liu', 4, 5, 4, 'yes', 'Clear communicator.', 21);
  const b = cand(0, 'Rahul Verma', 'LinkedIn', 'interview', 20, ['screen', 'interview']); card(b, 'Marco Rossi', 4, 3, 4, 'yes', 'Solid, a bit light on distributed systems.', 12);
  cand(0, 'Sofia Castillo', 'Job board', 'screen', 12, ['screen']); cand(0, 'James O\'Neill', 'LinkedIn', 'applied', 9, []);
  cand(0, 'Wei Zhang', 'Job board', 'rejected', 28, ['screen', 'rejected'], 'Salary expectations far above range');
  const c = cand(0, 'Ibrahim Kaya', 'Referral', 'hired', 55, ['screen', 'interview', 'offer', 'hired']); card(c, 'Marco Rossi', 5, 5, 4, 'strong_yes', '', 45); card(c, 'Tess Liu', 5, 4, 5, 'strong_yes', '', 44);
  const d = cand(1, 'Clara Nguyen', 'Direct', 'interview', 14, ['screen', 'interview']); card(d, 'Anja Weiss', 5, 4, 5, 'strong_yes', 'Portfolio is outstanding.', 6);
  cand(1, 'Tobias Brandt', 'Job board', 'screen', 10, ['screen']); cand(1, 'Mina Park', 'Direct', 'applied', 3, []); cand(1, 'Oscar Lindgren', 'LinkedIn', 'applied', 2, []);
  cand(2, 'Hannah Clarke', 'LinkedIn', 'screen', 6, ['screen']); cand(2, 'Yusuf Demir', 'Referral', 'applied', 4, []); cand(2, 'Grace Mensah', 'Job board', 'applied', 1, []);
  const t = (id, who, inDays, kind) => db.prepare('INSERT INTO interviews(candidate_id,interviewer,starts_at,kind) VALUES(?,?,?,?)').run(id, who, new Date(now.getTime() + inDays * 864e5).toISOString(), kind);
  t(b, 'Tess Liu', 1.2, 'Technical'); t(d, 'Dana Okoye', 2.1, 'Culture');
};
