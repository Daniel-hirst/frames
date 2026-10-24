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

  const rangeOf = (sessions, opts) => (opts && opts.last ? lastSessions(sessions, opts.last) : sortSessions(sessions));

  // Everything on the Stats screen. Pass { last: 10 } for the "Last 10 sessions" range.
  function summary(sessions, playerIds, opts) {
    const range = rangeOf(sessions, opts);
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

  // Frame winner is the player with the higher score; null if level (a re-spotted black settles it).
  function winnerFromScore(score, playerIds) {
    const [a, b] = playerIds;
    if (score[a] === score[b]) return null;
    return score[a] > score[b] ? a : b;
  }

  // Every frame in play order, with the session it belongs to and its number in that session.
  function framesWithSession(range) {
    return range.flatMap((s) => s.frames.map((f, i) => ({ f, session: s, n: i + 1 })));
  }
  const at = (x) => ({ sessionId: x.session.id, date: x.session.date });

  // Frame points. Frames logged before scores were recorded have no `score` and are left out.
  // closest: the frame with the smallest winning margin (earliest on a tie).
  function points(sessions, playerIds, opts) {
    const scored = framesWithSession(rangeOf(sessions, opts)).filter((x) => x.f.score);
    const [a, b] = playerIds;
    const players = {};
    for (const id of playerIds) {
      const total = scored.reduce((t, x) => t + x.f.score[id], 0);
      players[id] = { total, avgPerFrame: scored.length ? round1(total / scored.length) : 0 };
    }
    let closest = null;
    for (const x of scored) {
      const margin = Math.abs(x.f.score[a] - x.f.score[b]);
      if (!closest || margin < closest.margin) closest = Object.assign(at(x), { frame: x.n, score: x.f.score, winner: x.f.winner, margin });
    }
    return { frames: scored.length, players, closest };
  }

  // Each player's records, with where they were set. A record stands until beaten, so ties keep the earlier one.
  // null when a player has no such record yet (no break, no frame won, no night won).
  function records(sessions, playerIds, opts) {
    const range = rangeOf(sessions, opts);
    const frames = framesWithSession(range);
    const out = {};
    for (const id of playerIds) {
      const opp = playerIds.find((p) => p !== id);
      const r = { highestBreak: null, highestScore: null, biggestWin: null, bestNight: null, longestStreak: null };
      for (const x of frames) {
        const brk = x.f.breaks[id] || 0;
        if (brk > 0 && (!r.highestBreak || brk > r.highestBreak.value)) r.highestBreak = Object.assign(at(x), { value: brk });
        if (!x.f.score) continue;
        const pts = x.f.score[id];
        if (pts > 0 && (!r.highestScore || pts > r.highestScore.value)) r.highestScore = Object.assign(at(x), { value: pts });
        const margin = pts - x.f.score[opp];
        if (x.f.winner === id && (!r.biggestWin || margin > r.biggestWin.value)) {
          r.biggestWin = Object.assign(at(x), { value: margin, score: x.f.score });
        }
      }
      // Best night: biggest frame margin in a session this player won; more frames won breaks a tie.
      for (const s of range) {
        const won = sessionScore(s, id), lost = sessionScore(s, opp);
        const best = r.bestNight;
        if (won > lost && (!best || won - lost > best.won - best.lost || (won - lost === best.won - best.lost && won > best.won))) {
          r.bestNight = { sessionId: s.id, date: s.date, won, lost };
        }
      }
      // Longest run of frames won, across sessions, with the sessions it started and ended in.
      let run = 0, start = null;
      for (const x of frames) {
        if (x.f.winner !== id) { run = 0; continue; }
        if (run === 0) start = x;
        run++;
        if (!r.longestStreak || run > r.longestStreak.value) r.longestStreak = { value: run, from: at(start), to: at(x) };
      }
      out[id] = r;
    }
    return out;
  }

  // Put a deleted session back. Keeps its id unless that id has been reused since, then it gets a fresh one.
  function restoreSession(data, session) {
    if (!data.sessions.some((s) => s.id === session.id)) {
      return Object.assign({}, data, { sessions: sortSessions(data.sessions.concat([session])) });
    }
    return upsertSession(data, session).data;
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
    points, records,
    winnerFromScore, nextSessionId, upsertSession, removeSession, restoreSession
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Stats;
  else root.Stats = Stats;
})(this);
