// Run with: node --test tests/*.test.js
// Fixture sessions are deliberately out of order in the file, with two on 2026-10-03.
// Sorted, the frame winners run: D M D | D D | M M M | D D  (Dan 6, Damon 4).
const test = require('node:test');
const assert = require('node:assert/strict');
const Stats = require('../stats.js');
const data = require('./fixture.json');

const ids = data.players.map((p) => p.id);
const S = data.sessions;

test('sorts by date, keeping creation order on the same date', () => {
  assert.deepEqual(Stats.sortSessions(S).map((s) => s.id),
    ['2026-09-26', '2026-10-03', '2026-10-03-2', '2026-10-10']);
});

test('does not mutate the input', () => {
  const before = S.map((s) => s.id);
  Stats.summary(S, ids);
  assert.deepEqual(S.map((s) => s.id), before);
});

test('all time: frames won, win rate, counts', () => {
  const r = Stats.summary(S, ids);
  assert.equal(r.sessions, 4);
  assert.equal(r.frames, 10);
  assert.equal(r.players.dan.won, 6);
  assert.equal(r.players.damon.won, 4);
  assert.equal(r.players.dan.winRate, 0.6);
  assert.equal(r.players.damon.winRate, 0.4);
  assert.equal(r.avgFramesPerSession, 2.5);
});

test('all time: streaks run across session boundaries', () => {
  const { dan, damon } = Stats.summary(S, ids).players;
  assert.equal(dan.currentStreak, 2);
  assert.equal(damon.currentStreak, 0);
  assert.equal(dan.longestStreak, 3);   // last frame of 09-26 + both of 10-03
  assert.equal(damon.longestStreak, 3);
});

test('all time: breaks', () => {
  const { dan, damon } = Stats.summary(S, ids).players;
  assert.deepEqual(
    [dan.highestBreak, dan.breaks30, dan.breaks20, dan.avgBreak],
    [34, 2, 4, 14.4]);
  assert.deepEqual(
    [damon.highestBreak, damon.breaks30, damon.breaks20, damon.avgBreak],
    [44, 2, 4, 16]);
});

test('20+ includes exactly 20, 30+ includes exactly 30', () => {
  const s = [{ id: 'x', date: '2026-01-01', frames: [
    { winner: 'dan', breaks: { dan: 30, damon: 20 } },
    { winner: 'dan', breaks: { dan: 29, damon: 19 } }
  ] }];
  const { dan, damon } = Stats.summary(s, ids).players;
  assert.deepEqual([dan.breaks30, dan.breaks20], [1, 2]);
  assert.deepEqual([damon.breaks30, damon.breaks20], [0, 1]);
});

test('last N sessions: every rule runs on the filtered range only', () => {
  const r = Stats.summary(S, ids, { last: 2 });   // 10-03-2 and 10-10: M M M D D
  assert.equal(r.sessions, 2);
  assert.equal(r.frames, 5);
  assert.equal(r.avgFramesPerSession, 2.5);
  const { dan, damon } = r.players;
  assert.deepEqual([dan.won, dan.currentStreak, dan.longestStreak], [2, 2, 2]);
  assert.deepEqual([damon.won, damon.currentStreak, damon.longestStreak], [3, 0, 3]);
  assert.deepEqual([dan.highestBreak, dan.breaks30, dan.breaks20, dan.avgBreak], [30, 1, 2, 12.4]);
  assert.deepEqual([damon.highestBreak, damon.breaks30, damon.breaks20, damon.avgBreak], [44, 1, 2, 16.6]);
});

test('last 10 with fewer than 10 sessions is the same as all time', () => {
  assert.deepEqual(Stats.summary(S, ids, { last: 10 }), Stats.summary(S, ids));
});

test('session score and best break', () => {
  const s = Stats.sortSessions(S)[0];
  assert.equal(Stats.sessionScore(s, 'dan'), 2);
  assert.equal(Stats.sessionScore(s, 'damon'), 1);
  assert.equal(Stats.sessionBestBreak(s, 'dan'), 34);
  assert.equal(Stats.sessionBestBreak(s, 'damon'), 29);
});

test('chart 1: rolling average best break, window 5', () => {
  assert.deepEqual(Stats.rollingAvgBreak(S, ids).map((r) => [r.dan, r.damon]), [
    [17.3, 13.7],   // 52/3, 41/3
    [16.2, 15.8],   // mean(17.33, 15), mean(13.67, 18)
    [15.4, 17.7],
    [14.1, 15.6]
  ]);
});

test('chart 1: rolling window drops older sessions', () => {
  const last = Stats.rollingAvgBreak(S, ids, 2).at(-1);
  assert.deepEqual([last.dan, last.damon], [12, 15.4]);   // mean(14, 10), mean(21.33, 9.5)
});

test('chart 2: cumulative frames won', () => {
  assert.deepEqual(Stats.cumulativeWins(S, ids).map((r) => [r.id, r.dan, r.damon]), [
    ['2026-09-26', 2, 1],
    ['2026-10-03', 4, 1],
    ['2026-10-03-2', 4, 4],
    ['2026-10-10', 6, 4]
  ]);
});

test('chart 3: best break per session, last N', () => {
  assert.deepEqual(Stats.sessionBestBreaks(S, ids).map((r) => [r.dan, r.damon]),
    [[34, 29], [22, 31], [30, 44], [20, 19]]);
  assert.deepEqual(Stats.sessionBestBreaks(S, ids, 2).map((r) => r.id),
    ['2026-10-03-2', '2026-10-10']);
});

test('no sessions: zeros, no NaN or -Infinity', () => {
  const r = Stats.summary([], ids);
  assert.equal(r.sessions, 0);
  assert.equal(r.frames, 0);
  assert.equal(r.avgFramesPerSession, 0);
  assert.deepEqual(r.players.dan, {
    won: 0, winRate: 0, currentStreak: 0, longestStreak: 0,
    highestBreak: 0, breaks30: 0, breaks20: 0, avgBreak: 0
  });
  assert.deepEqual(Stats.rollingAvgBreak([], ids), []);
  assert.deepEqual(Stats.cumulativeWins([], ids), []);
  assert.deepEqual(Stats.sessionBestBreaks([], ids), []);
});

test('one session: values valid and charts have one point', () => {
  const one = [Stats.sortSessions(S)[0]];
  const r = Stats.summary(one, ids);
  assert.equal(r.avgFramesPerSession, 3);
  assert.equal(r.players.dan.currentStreak, 1);
  assert.equal(r.players.dan.longestStreak, 1);
  assert.equal(Stats.rollingAvgBreak(one, ids).length, 1);
  assert.equal(Stats.cumulativeWins(one, ids).length, 1);
  assert.equal(Stats.sessionBestBreaks(one, ids).length, 1);
});

test('nextSessionId: date, then -2, -3', () => {
  assert.equal(Stats.nextSessionId(S, '2026-10-17'), '2026-10-17');
  assert.equal(Stats.nextSessionId(S, '2026-10-10'), '2026-10-10-2');
  assert.equal(Stats.nextSessionId(S, '2026-10-03'), '2026-10-03-3');
  assert.equal(Stats.nextSessionId(S, '2026-10-10', '2026-10-10'), '2026-10-10');
});

const frame = { winner: 'dan', breaks: { dan: 5, damon: 0 } };

test('upsertSession: adds a new session in date order', () => {
  const { data: d, session } = Stats.upsertSession(data, { date: '2026-10-01', frames: [frame] });
  assert.equal(session.id, '2026-10-01');
  assert.deepEqual(d.sessions.map((s) => s.id),
    ['2026-09-26', '2026-10-01', '2026-10-03', '2026-10-03-2', '2026-10-10']);
  assert.equal(data.sessions.length, 4);   // input untouched
});

test('upsertSession: second session on a date goes after the first', () => {
  const { data: d, session } = Stats.upsertSession(data, { date: '2026-10-10', frames: [frame] });
  assert.equal(session.id, '2026-10-10-2');
  assert.deepEqual(d.sessions.slice(-2).map((s) => s.id), ['2026-10-10', '2026-10-10-2']);
});

test('upsertSession: replace by id keeps id and same-date order', () => {
  const { data: d, session } = Stats.upsertSession(data, { date: '2026-10-03', frames: [frame] }, '2026-10-03');
  assert.equal(session.id, '2026-10-03');
  assert.deepEqual(d.sessions.map((s) => s.id),
    ['2026-09-26', '2026-10-03', '2026-10-03-2', '2026-10-10']);
  assert.deepEqual(d.sessions[1].frames, [frame]);
});

test('upsertSession: replace with a new date moves it and re-ids it', () => {
  const { data: d, session } = Stats.upsertSession(data, { date: '2026-10-10', frames: [frame] }, '2026-09-26');
  assert.equal(session.id, '2026-10-10-2');
  assert.deepEqual(d.sessions.map((s) => s.id),
    ['2026-10-03', '2026-10-03-2', '2026-10-10', '2026-10-10-2']);
});

test('removeSession', () => {
  const d = Stats.removeSession(data, '2026-10-03');
  assert.deepEqual(Stats.sortSessions(d.sessions).map((s) => s.id), ['2026-09-26', '2026-10-03-2', '2026-10-10']);
  assert.equal(data.sessions.length, 4);
});
