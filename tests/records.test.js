// Run with: node --test tests/*.test.js
// Points and records. Expected values worked out by hand from the sessions below.
const test = require('node:test');
const assert = require('node:assert/strict');
const Stats = require('../stats.js');

const ids = ['dan', 'damon'];
const f = (winner, dan, damon, bd, bm) => ({ winner, score: { dan, damon }, breaks: { dan: bd, damon: bm } });
// Winners in play order: D M D | D D | M M M D | D  (the last frame has no score: logged before scores existed)
const S = [
  { id: '2026-10-10', date: '2026-10-10', frames: [f('damon', 20, 75, 0, 44), f('damon', 30, 62, 12, 20), f('damon', 47, 44, 10, 9), f('dan', 60, 58, 22, 30)] },
  { id: '2026-09-26', date: '2026-09-26', frames: [f('dan', 72, 35, 34, 12), f('damon', 40, 61, 0, 29), f('dan', 55, 50, 18, 0)] },
  { id: '2026-10-17', date: '2026-10-17', frames: [{ winner: 'dan', breaks: { dan: 50, damon: 0 } }] },
  { id: '2026-10-03', date: '2026-10-03', frames: [f('dan', 81, 10, 45, 0), f('dan', 64, 12, 30, 8)] }
];

test('points: totals and average per frame, unscored frames left out', () => {
  const p = Stats.points(S, ids);
  assert.equal(p.frames, 9);
  assert.deepEqual(p.players.dan, { total: 469, avgPerFrame: 52.1 });
  assert.deepEqual(p.players.damon, { total: 407, avgPerFrame: 45.2 });
});

test('records: Dan', () => {
  const r = Stats.records(S, ids).dan;
  assert.deepEqual(r.highestBreak, { sessionId: '2026-10-17', date: '2026-10-17', value: 50 });   // unscored frame still counts
  assert.deepEqual(r.highestScore, { sessionId: '2026-10-03', date: '2026-10-03', value: 81 });
  assert.deepEqual(r.biggestWin, { sessionId: '2026-10-03', date: '2026-10-03', value: 71, score: { dan: 81, damon: 10 } });
  assert.deepEqual(r.bestNight, { sessionId: '2026-10-03', date: '2026-10-03', won: 2, lost: 0 });
  assert.deepEqual(r.longestStreak, { value: 3,
    from: { sessionId: '2026-09-26', date: '2026-09-26' }, to: { sessionId: '2026-10-03', date: '2026-10-03' } });
});

test('records: Damon', () => {
  const r = Stats.records(S, ids).damon;
  assert.equal(r.highestBreak.value, 44);
  assert.equal(r.highestScore.value, 75);
  assert.deepEqual([r.biggestWin.value, r.biggestWin.score], [55, { dan: 20, damon: 75 }]);
  assert.deepEqual([r.bestNight.won, r.bestNight.lost, r.bestNight.date], [3, 1, '2026-10-10']);
  assert.deepEqual(r.longestStreak, { value: 3,
    from: { sessionId: '2026-10-10', date: '2026-10-10' }, to: { sessionId: '2026-10-10', date: '2026-10-10' } });
});

test('records: an equalled record stays with the first time it was set', () => {
  const s = [
    { id: '2026-01-01', date: '2026-01-01', frames: [f('dan', 50, 10, 30, 0)] },
    { id: '2026-01-08', date: '2026-01-08', frames: [f('dan', 50, 10, 30, 0)] }
  ];
  const r = Stats.records(s, ids).dan;
  assert.equal(r.highestBreak.date, '2026-01-01');
  assert.equal(r.highestScore.date, '2026-01-01');
  assert.equal(r.biggestWin.date, '2026-01-01');
  assert.equal(r.bestNight.date, '2026-01-01');
});

test('records: best night tie on margin goes to more frames won', () => {
  const s = [
    { id: '2026-01-01', date: '2026-01-01', frames: [f('dan', 50, 10, 0, 0), f('damon', 10, 50, 0, 0), f('dan', 50, 10, 0, 0)] },   // 2-1
    { id: '2026-01-08', date: '2026-01-08', frames: [f('dan', 50, 10, 0, 0), f('dan', 50, 10, 0, 0), f('damon', 10, 50, 0, 0),
      f('dan', 50, 10, 0, 0), f('damon', 10, 50, 0, 0)] }   // 3-2, same margin, more won
  ];
  assert.equal(Stats.records(s, ids).dan.bestNight.date, '2026-01-08');
});

test('last N: records and points use the range only; nothing set means null', () => {
  const r = Stats.records(S, ids, { last: 1 });   // only 2026-10-17: one unscored frame Dan won
  assert.equal(r.dan.highestBreak.value, 50);
  assert.equal(r.dan.highestScore, null);
  assert.equal(r.dan.biggestWin, null);
  assert.deepEqual([r.dan.bestNight.won, r.dan.bestNight.lost], [1, 0]);
  assert.equal(r.dan.longestStreak.value, 1);
  assert.deepEqual(r.damon, { highestBreak: null, highestScore: null, biggestWin: null, bestNight: null, longestStreak: null });
  assert.deepEqual(Stats.points(S, ids, { last: 1 }), { frames: 0, players: { dan: { total: 0, avgPerFrame: 0 }, damon: { total: 0, avgPerFrame: 0 } } });
});

test('no sessions: no records, no points', () => {
  assert.deepEqual(Stats.records([], ids).dan, { highestBreak: null, highestScore: null, biggestWin: null, bestNight: null, longestStreak: null });
  assert.equal(Stats.points([], ids).frames, 0);
});

const data = { players: [{ id: 'dan', name: 'Dan' }, { id: 'damon', name: 'Damon' }], sessions: S };

test('restoreSession: puts a deleted session back with its id, in date order', () => {
  const gone = S[3];   // 2026-10-03
  const after = Stats.removeSession(data, gone.id);
  const back = Stats.restoreSession(after, gone);
  assert.deepEqual(back.sessions.map((s) => s.id), ['2026-09-26', '2026-10-03', '2026-10-10', '2026-10-17']);
  assert.deepEqual(back.sessions[1], gone);
});

test('restoreSession: if the id was reused meanwhile, it comes back with a fresh one', () => {
  const gone = S[3];
  const after = Stats.removeSession(data, gone.id);
  const reused = Stats.upsertSession(after, { date: '2026-10-03', frames: [] }).data;   // a new 2026-10-03 session took the id
  const back = Stats.restoreSession(reused, gone);
  assert.deepEqual(back.sessions.filter((s) => s.date === '2026-10-03').map((s) => [s.id, s.frames.length]),
    [['2026-10-03', 0], ['2026-10-03-2', 2]]);
});
