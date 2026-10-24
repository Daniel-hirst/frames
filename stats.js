/* Frames: stats. Pure functions, no DOM. Works in the browser (window.Stats) and Node (require). */
(function (root) {
  'use strict';

  const round1 = (x) => Math.round(x * 10) / 10;
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  // Sessions by date; Array.prototype.sort is stable, so same-date sessions keep creation order.
  function sortSessions(sessions) {
    return sessions.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  function lastSessions(sessions, n) {
    return sortSessions(sessions).slice(-n);
  }

  function allFrames(sessions) {
    return sortSessions(sessions).flatMap((s) => s.frames);
  }

  function longestStreak(frames, id) {
    let best = 0, run = 0;
    for (const f of frames) {
      run = f.winner === id ? run + 1 : 0;
      if (run > best) best = run;
    }
    return best;
  }

  function currentStreak(frames, id) {
    let run = 0;
    for (let i = frames.length - 1; i >= 0 && frames[i].winner === id; i--) run++;
    return run;
  }

  function playerStats(frames, id) {
    const breaks = frames.map((f) => f.breaks[id] || 0);
    const won = frames.filter((f) => f.winner === id).length;
    return {
      won,
      winRate: frames.length ? won / frames.length : 0,
      currentStreak: currentStreak(frames, id),
      longestStreak: longestStreak(frames, id),
      highestBreak: breaks.length ? Math.max(...breaks) : 0,
      breaks30: breaks.filter((b) => b >= 30).length,
      breaks20: breaks.filter((b) => b >= 20).length,
      avgBreak: round1(mean(breaks))
    };
  }

  // Everything on the Stats screen. Pass { last: 10 } for the "Last 10 sessions" range.
  function summary(sessions, playerIds, opts) {
    const range = opts && opts.last ? lastSessions(sessions, opts.last) : sortSessions(sessions);
    const frames = allFrames(range);
    const players = {};
    for (const id of playerIds) players[id] = playerStats(frames, id);
    return {
      sessions: range.length,
      frames: frames.length,
      avgFramesPerSession: range.length ? round1(frames.length / range.length) : 0,
      players
    };
  }

  function sessionScore(session, id) {
    return session.frames.filter((f) => f.winner === id).length;
  }

  function sessionBestBreak(session, id) {
    return session.frames.reduce((m, f) => Math.max(m, f.breaks[id] || 0), 0);
  }

  // Chart 1: per session, mean of each player's per-session average best break over the last `window` sessions.
  function rollingAvgBreak(sessions, playerIds, window) {
    window = window || 5;
    const sorted = sortSessions(sessions);
    const perSession = sorted.map((s) => {
      const row = {};
      for (const id of playerIds) row[id] = mean(s.frames.map((f) => f.breaks[id] || 0));
      return row;
    });
    return sorted.map((s, i) => {
      const slice = perSession.slice(Math.max(0, i - window + 1), i + 1);
      const row = { id: s.id, date: s.date };
      for (const id of playerIds) row[id] = round1(mean(slice.map((r) => r[id])));
      return row;
    });
  }

  // Chart 2: running total of frames won after each session.
  function cumulativeWins(sessions, playerIds) {
    const totals = {};
    for (const id of playerIds) totals[id] = 0;
    return sortSessions(sessions).map((s) => {
      const row = { id: s.id, date: s.date };
      for (const id of playerIds) row[id] = totals[id] += sessionScore(s, id);
      return row;
    });
  }

  // Chart 3: best break per session over the last `n` sessions.
  function sessionBestBreaks(sessions, playerIds, n) {
    return lastSessions(sessions, n || 8).map((s) => {
      const row = { id: s.id, date: s.date };
      for (const id of playerIds) row[id] = sessionBestBreak(s, id);
      return row;
    });
  }

  // Session id is the date; a second session on the same date gets "-2", then "-3".
  function nextSessionId(sessions, date, ignoreId) {
    const taken = new Set(sessions.map((s) => s.id).filter((id) => id !== ignoreId));
    if (!taken.has(date)) return date;
    let n = 2;
    while (taken.has(date + '-' + n)) n++;
    return date + '-' + n;
  }

  // Add a session, or replace the one with id `replaceId`. Returns new data, sorted; input untouched.
  // A replaced session keeps its id (and place) unless its date changed.
  function upsertSession(data, session, replaceId) {
    let sessions = data.sessions.slice();
    const old = replaceId ? sessions.find((s) => s.id === replaceId) : null;
    let saved;
    if (old && old.date === session.date) {
      saved = Object.assign({}, session, { id: old.id });
      sessions[sessions.indexOf(old)] = saved;
    } else {
      if (old) sessions = sessions.filter((s) => s !== old);
      saved = Object.assign({}, session, { id: nextSessionId(sessions, session.date) });
      sessions.push(saved);
    }
    return { data: Object.assign({}, data, { sessions: sortSessions(sessions) }), session: saved };
  }

  function removeSession(data, id) {
    return Object.assign({}, data, { sessions: data.sessions.filter((s) => s.id !== id) });
  }

  const Stats = {
    sortSessions, lastSessions, allFrames, summary,
    sessionScore, sessionBestBreak,
    rollingAvgBreak, cumulativeWins, sessionBestBreaks,
    nextSessionId, upsertSession, removeSession
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Stats;
  else root.Stats = Stats;
})(this);
