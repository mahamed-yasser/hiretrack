'use strict';
// Hiring pipeline rules (pure).
const STAGES = ['applied', 'screen', 'interview', 'offer', 'hired'];
const CRITERIA = [['skills', 'Role skills', 3], ['communication', 'Communication', 2], ['culture', 'Team fit', 1]]; // key, label, weight
// Allowed moves: one step forward, one step back, or reject from any open stage. Rejected can be reopened to "applied".
function canMove(from, to) {
  if (from === to) return false;
  if (to === 'rejected') return from !== 'hired' && from !== 'rejected';
  if (from === 'rejected') return to === 'applied';
  if (from === 'hired') return false;
  return Math.abs(STAGES.indexOf(from) - STAGES.indexOf(to)) === 1;
}
// scores: {skills:1-5, communication:1-5, culture:1-5}; weighted average rounded to 0.1
function weighted(scores) {
  let tot = 0, w = 0; for (const [k, , wt] of CRITERIA) { const s = Number(scores[k]); if (!Number.isInteger(s) || s < 1 || s > 5) throw new Error('Scores must be whole numbers from 1 to 5'); tot += s * wt; w += wt; }
  return Math.round((tot / w) * 10) / 10;
}
const RECS = ['strong_no', 'no', 'yes', 'strong_yes'];
// Summary across scorecards: average of weighted scores, and a consensus that any strong_no blocks.
function summarize(cards) {
  if (!cards.length) return { count: 0, avg: null, consensus: 'no_feedback' };
  const avg = Math.round((cards.reduce((t, c) => t + c.weighted, 0) / cards.length) * 10) / 10;
  const consensus = cards.some((c) => c.recommendation === 'strong_no') ? 'blocked' : cards.every((c) => c.recommendation.endsWith('yes')) ? 'positive' : 'mixed';
  return { count: cards.length, avg, consensus };
}
// Gate rules for advancing.
function gate(to, summary) {
  if (to === 'offer') { if (summary.count < 2) return 'Collect at least 2 scorecards before making an offer'; if (summary.consensus === 'blocked') return 'A strong no from an interviewer blocks the offer'; }
  return null;
}
const overlaps = (aStart, bStart, minutes = 60) => Math.abs(Date.parse(aStart) - Date.parse(bStart)) < minutes * 60000;
module.exports = { STAGES, CRITERIA, RECS, canMove, weighted, summarize, gate, overlaps };
