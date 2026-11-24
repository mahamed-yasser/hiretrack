'use strict';
const test = require('node:test'), assert = require('node:assert/strict'); const P = require('../src/pipeline');
test('canMove allows one step, back one step, reject, reopen; not skipping or leaving hired', () => {
  assert.ok(P.canMove('applied', 'screen')); assert.ok(P.canMove('interview', 'screen')); assert.ok(P.canMove('offer', 'rejected')); assert.ok(P.canMove('rejected', 'applied'));
  assert.ok(!P.canMove('applied', 'interview')); assert.ok(!P.canMove('hired', 'rejected')); assert.ok(!P.canMove('hired', 'offer')); assert.ok(!P.canMove('screen', 'screen')); assert.ok(!P.canMove('rejected', 'offer'));
});
test('weighted score uses weights and validates input', () => {
  assert.equal(P.weighted({ skills: 5, communication: 4, culture: 4 }), 4.5); // (15+8+4)/6
  assert.equal(P.weighted({ skills: 1, communication: 5, culture: 5 }), 3); // (3+10+5)/6
  assert.throws(() => P.weighted({ skills: 6, communication: 1, culture: 1 })); assert.throws(() => P.weighted({ skills: 3, communication: 2.5, culture: 1 })); assert.throws(() => P.weighted({}));
});
test('summarize and gate', () => {
  assert.deepEqual(P.summarize([]), { count: 0, avg: null, consensus: 'no_feedback' });
  const yes = { weighted: 4, recommendation: 'yes' }, sn = { weighted: 2, recommendation: 'strong_no' }, no = { weighted: 2.5, recommendation: 'no' };
  assert.deepEqual(P.summarize([yes, yes]), { count: 2, avg: 4, consensus: 'positive' }); assert.equal(P.summarize([yes, no]).consensus, 'mixed'); assert.equal(P.summarize([yes, sn]).consensus, 'blocked');
  assert.match(P.gate('offer', P.summarize([yes])), /at least 2/); assert.match(P.gate('offer', P.summarize([yes, sn])), /blocks/); assert.equal(P.gate('offer', P.summarize([yes, yes])), null); assert.equal(P.gate('screen', P.summarize([])), null);
});
test('overlaps', () => { assert.ok(P.overlaps('2026-11-25T10:00:00Z', '2026-11-25T10:59:00Z')); assert.ok(!P.overlaps('2026-11-25T10:00:00Z', '2026-11-25T11:00:00Z')); });
