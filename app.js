/* Frames: UI and routing. */
(function () {
  'use strict';

  const DRAFT_KEY = 'frames.draft';
  const TOKEN_KEY = 'frames.token';
  const REPO_KEY = 'frames.repo';

  // Logger mode = a GitHub token is saved on this device. ?mode=readonly previews Damon's view.
  const token = () => localStorage.getItem(TOKEN_KEY) || '';
  const repo = () => localStorage.getItem(REPO_KEY) || guessRepo();
  const isLogger = !!token() && new URLSearchParams(location.search).get('mode') !== 'readonly';

  // On GitHub Pages the repo is in the URL: owner.github.io/repo/ -> owner/repo
  function guessRepo() {
    const owner = location.hostname.match(/^([^.]+)\.github\.io$/);
    const name = location.pathname.split('/')[1];
    return owner && name ? owner[1] + '/' + name : '';
  }
  const MAX_BREAK = 147;
  const MAX_SCORE = 147;   // foul points can push a frame higher in theory, never in practice here
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let data = { players: [{ id: 'dan', name: 'Dan' }, { id: 'damon', name: 'Damon' }], sessions: [] };
  let draft = null;
  let statsRange = 'all';
  const expanded = new Set();
  let charts = [];
  let current = null;

  const SCREENS = {
    session:  { eyebrow: () => 'Session', title: () => (draft.editingId ? 'Edit session' : 'New session') },
    stats:    { eyebrow: () => (statsRange === 'all' ? 'All time' : 'Last 10 sessions'), title: () => 'Stats' },
    charts:   { eyebrow: () => 'All time', title: () => 'Charts' },
    history:  { eyebrow: () => plural(data.sessions.length, 'session'), title: () => 'History' },
    settings: { eyebrow: () => (isLogger ? 'Only you see this' : 'Set up saving'), title: () => 'Settings' }
  };

  /* ---------- helpers ---------- */

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');
  const ids = () => data.players.map((p) => p.id);
  const nameOf = (i) => data.players[i].name;
  const indexOf = (id) => ids().indexOf(id);

  function parseDate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  // Built by hand: toLocaleDateString gives "Sat, 26 Sept" in some browsers.
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function shortDate(iso) {
    const d = parseDate(iso);
    return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3);
  }
  const longDate = (iso) => shortDate(iso) + ' ' + iso.slice(0, 4);
  const monthName = (iso) => MONTHS[parseDate(iso).getMonth()] + ' ' + iso.slice(0, 4);

  function today() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function readJSON(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }

  // Error toasts stay longer and can carry an action button (Retry).
  let toastTimer;
  function toast(msg, isError, action) {
    clearTimeout(toastTimer);
    $('#toast-text').text(msg);
    $('#toast-action').prop('hidden', !action).text(action ? action.label : '').off('click')
      .on('click', () => { $('#toast').removeClass('show'); action.fn(); });
    $('#toast').toggleClass('error', !!isError).addClass('show');
    toastTimer = setTimeout(() => $('#toast').removeClass('show'), isError ? 9000 : 2500);
  }

  // Bootstrap modal in place of window.confirm. Resolves true on OK.
  function confirmDialog(title, body, okLabel) {
    return new Promise((resolve) => {
      const el = document.getElementById('confirm-modal');
      const modal = bootstrap.Modal.getOrCreateInstance(el);
      let ok = false;
      $('#confirm-title').text(title);
      $('#confirm-body').text(body);
      $('#confirm-ok').text(okLabel).off('click').on('click', () => { ok = true; modal.hide(); });
      $(el).one('hidden.bs.modal', () => resolve(ok));
      modal.show();
    });
  }

  function emptyState() {
    return isLogger
      ? '<div class="card-f empty">No sessions yet. Log your first night on the <a href="#session">Session tab</a>.</div>'
      : '<div class="card-f empty">Nothing logged yet.</div>';
  }

  function frameRow(f, n, tag) {
    const w = indexOf(f.winner);
    const [a, b] = ids();
    const breaks = (f.breaks[a] || 0) + ' · ' + (f.breaks[b] || 0);
    // Frames logged before scores were recorded have no `score`; show their breaks instead.
    const right = f.score
      ? '<span class="frame-score">' + f.score[a] + ' – ' + f.score[b] + '</span><span class="frame-sub">breaks ' + breaks + '</span>'
      : '<span class="frame-sub">breaks ' + breaks + '</span>';
    return '<' + tag + ' class="frame-row" data-index="' + (n - 1) + '"' + (tag === 'button' ? ' type="button"' : '') + '>' +
      '<span class="frame-no">F' + n + '</span>' +
      '<span class="frame-who"><span class="dot p' + w + '"></span>' + esc(nameOf(w)) + ' won</span>' +
      '<span class="frame-right">' + right + '</span>' +
      '</' + tag + '>';
  }

  /* ---------- data ---------- */

  // Logger: read through the API so a fresh save shows at once; fall back to the published data.json.
  // Read-only: the published data.json (GitHub Pages can lag a minute or two). On failure keep what we had.
  async function loadData() {
    if (isLogger) {
      try {
        data = (await GitHub.load(repo(), token())).data;
        $('#load-error').prop('hidden', true);
        return;
      } catch (e) {
        toast('Couldn’t read from GitHub: ' + e.message + ' Showing the published copy.', true);
      }
    }
    try {
      const res = await fetch('data.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(res.status);
      data = await res.json();
      $('#load-error').prop('hidden', true);
    } catch (e) {
      $('#load-error').prop('hidden', false);
    }
  }

  function refreshAll() {
    $('[data-name]').each(function () { $(this).text(nameOf(Number(this.dataset.name))); });
    renderSession();
    renderData();
  }

  // "Session 2026-10-17: Dan 3-2 Damon", using the names in the data being committed.
  function commitMessage(prefix, s, d) {
    const [a, b] = d.players;
    return prefix + ' ' + s.date + ': ' + a.name + ' ' + Stats.sessionScore(s, a.id) + '-' + Stats.sessionScore(s, b.id) + ' ' + b.name;
  }

  /* ---------- draft ---------- */

  function newDraft() {
    return { editingId: null, date: today(), frames: [], form: blankForm() };
  }
  function blankForm() {
    return { scores: ['', ''], breaks: [0, 0], editIndex: null };
  }
  const hasDraft = () => draft.frames.length > 0 || !!draft.editingId;

  function loadDraft() {
    const d = readJSON(DRAFT_KEY);
    draft = d && (d.frames.length || d.editingId) ? d : newDraft();
    if (!draft.form.scores) draft.form = blankForm();   // draft saved before frame scores existed
  }

  function saveDraft() {
    if (hasDraft()) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else localStorage.removeItem(DRAFT_KEY);
  }

  function changed() {
    saveDraft();
    renderSession();
  }

  /* ---------- session screen ---------- */

  function renderSession() {
    const [a, b] = ids();
    const form = draft.form;
    const editing = form.editIndex !== null;

    $('#date-label').text(longDate(draft.date));
    $('#date-input').val(draft.date);
    $('#draft-label').prop('hidden', !hasDraft());

    $('#score-0').text(draft.frames.filter((f) => f.winner === a).length);
    $('#score-1').text(draft.frames.filter((f) => f.winner === b).length);

    $('#frames-wrap').prop('hidden', !draft.frames.length);
    $('#frame-list').html(draft.frames.map((f, i) => frameRow(f, i + 1, 'button')).join(''));
    if (editing) $('#frame-list .frame-row').eq(form.editIndex).addClass('selected');

    $('#form-title').text(editing ? 'Edit frame ' + (form.editIndex + 1) : 'Add frame ' + (draft.frames.length + 1));
    $('.score-input').each(function () {
      if (document.activeElement !== this) this.value = form.scores[this.dataset.p];
    });
    $('.break-input').each(function () {
      if (document.activeElement !== this) this.value = form.breaks[this.dataset.p];
    });
    $('#add-frame').text(editing ? 'Save frame' : 'Add frame');
    $('#edit-actions').prop('hidden', !editing);
    updateFormState();

    const n = draft.frames.length;
    $('#confirm').text(saving ? 'Saving to GitHub…' : (draft.editingId ? 'Save session (' : 'Confirm session (') + plural(n, 'frame') + ')').prop('disabled', !n || saving);
    $('#screen-session').prop('inert', saving);
    $('#discard').text(draft.editingId ? 'Discard changes' : 'Discard draft').prop('hidden', !hasDraft());
    if (current === 'session') $('#title').text(SCREENS.session.title());
  }

  // Can the frame in the form be added? Both scores entered, not level, and no break above its player's score.
  function formState() {
    const { scores, breaks } = draft.form;
    if (scores[0] === '' || scores[1] === '') return { ok: false, hint: '' };
    const [a, b] = ids();
    const winner = Stats.winnerFromScore({ [a]: scores[0], [b]: scores[1] }, ids());
    if (!winner) return { ok: false, hint: 'Scores can’t be level.' };
    for (const i of [0, 1]) {
      if (breaks[i] > scores[i]) return { ok: false, winner, hint: nameOf(i) + '’s best break is higher than ' + nameOf(i) + '’s score.' };
    }
    return { ok: true, winner, hint: nameOf(indexOf(winner)) + ' wins this frame.' };
  }

  function updateFormState() {
    const state = formState();
    $('#add-frame').prop('disabled', !state.ok);
    $('#form-hint').text(state.hint);
    $('.score-input').each(function () {
      $(this).toggleClass('leading', !!state.winner && ids()[this.dataset.p] === state.winner);
    });
  }

  function clampBreak(v) {
    const n = parseInt(String(v).replace(/\D/g, ''), 10);
    return isNaN(n) ? 0 : Math.min(MAX_BREAK, Math.max(0, n));
  }

  function bindSession() {
    $('#date-input').on('change', function () {
      if (!this.value) return;
      draft.date = this.value;
      changed();
    });

    $('.score-input')
      .on('focus', function () { this.select(); })
      .on('input', function () {
        let digits = this.value.replace(/\D/g, '');
        if (Number(digits) > MAX_SCORE) digits = String(MAX_SCORE);
        if (digits !== this.value) this.value = digits;
        draft.form.scores[this.dataset.p] = digits === '' ? '' : Number(digits);
        saveDraft();
        updateFormState();
      })
      .on('blur', function () { this.value = draft.form.scores[this.dataset.p]; })
      .on('keydown', function (e) { if (e.key === 'Enter') this.blur(); });

    $('.step-btn').on('click', function () {
      const p = this.dataset.p;
      draft.form.breaks[p] = clampBreak(draft.form.breaks[p] + Number(this.dataset.d));
      changed();
    });

    $('.break-input')
      .on('focus', function () { this.select(); })
      .on('input', function () {
        const digits = this.value.replace(/\D/g, '');
        if (digits !== this.value) this.value = digits;
        if (Number(digits) > MAX_BREAK) this.value = MAX_BREAK;
        draft.form.breaks[this.dataset.p] = clampBreak(this.value);
        saveDraft();
        updateFormState();
      })
      .on('blur', function () { this.value = draft.form.breaks[this.dataset.p]; })
      .on('keydown', function (e) { if (e.key === 'Enter') this.blur(); });

    $('#add-frame').on('click', function () {
      const form = draft.form;
      const state = formState();
      if (!state.ok) return;
      const [a, b] = ids();
      const frame = {
        winner: state.winner,
        score: { [a]: form.scores[0], [b]: form.scores[1] },
        breaks: { [a]: form.breaks[0], [b]: form.breaks[1] }
      };
      let index;
      if (form.editIndex !== null) {
        index = form.editIndex;
        draft.frames[index] = frame;
      } else {
        index = draft.frames.push(frame) - 1;
      }
      draft.form = blankForm();
      changed();
      const row = $('#frame-list .frame-row').get(index);
      if (row) row.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
    });

    $('#frame-list').on('click', '.frame-row', function () {
      const i = Number(this.dataset.index);
      const f = draft.frames[i];
      const [a, b] = ids();
      const scores = f.score ? [f.score[a], f.score[b]] : ['', ''];
      draft.form = { scores, breaks: [f.breaks[a] || 0, f.breaks[b] || 0], editIndex: i };
      changed();
      document.getElementById('frame-form').scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
    });

    $('#remove-frame').on('click', function () {
      draft.frames.splice(draft.form.editIndex, 1);
      draft.form = blankForm();
      changed();
    });

    $('#cancel-edit').on('click', function () {
      draft.form = blankForm();
      changed();
    });

    $('#confirm').on('click', confirmSession);

    $('#discard').on('click', async function () {
      const editing = !!draft.editingId;
      const ok = await confirmDialog(
        editing ? 'Discard changes?' : 'Discard draft?',
        editing ? 'The saved session stays as it was.' : 'The ' + plural(draft.frames.length, 'frame') + ' in this draft will be lost.',
        'Discard');
      if (!ok) return;
      draft = newDraft();
      changed();
    });
  }

  function scoreLine(s) {
    const [a, b] = ids();
    return nameOf(0) + ' ' + Stats.sessionScore(s, a) + '–' + Stats.sessionScore(s, b) + ' ' + nameOf(1);
  }

  // The draft is only cleared once GitHub has the commit. Any failure leaves it untouched.
  let saving = false;
  async function confirmSession() {
    if (!draft.frames.length || saving) return;
    const editing = !!draft.editingId;
    const session = { date: draft.date, frames: draft.frames };
    let saved;
    saving = true;
    renderSession();
    try {
      data = await GitHub.save(repo(), token(), (d) => {
        const r = Stats.upsertSession(d, session, draft.editingId);
        saved = r.session;
        return { data: r.data, message: commitMessage(editing ? 'Edit session' : 'Session', r.session, r.data) };
      });
    } catch (e) {
      toast(e.message + ' Your draft is kept.', true, { label: 'Retry', fn: confirmSession });
      return;
    } finally {
      saving = false;
      renderSession();
    }
    toast((editing ? 'Session updated: ' : 'Session saved: ') + scoreLine(saved));
    draft = newDraft();
    saveDraft();
    renderSession();
    expanded.clear();
    expanded.add(saved.id);
    renderData();
    location.hash = '#history';
  }

  /* ---------- history ---------- */

  function renderHistory() {
    if (!data.sessions.length) { $('#history-body').html(emptyState()); return; }
    const [a, b] = ids();
    let html = '';
    let month = null;
    for (const s of Stats.sortSessions(data.sessions).reverse()) {
      const m = s.date.slice(0, 7);
      if (m !== month) {
        month = m;
        html += '<h2 class="month-head">' + monthName(s.date) + '</h2>';
      }
      const sa = Stats.sessionScore(s, a), sb = Stats.sessionScore(s, b);
      const open = expanded.has(s.id);
      html += '<div class="card-f hist-card" data-id="' + esc(s.id) + '">' +
        '<button type="button" class="hist-row" aria-expanded="' + open + '">' +
          '<span class="hist-main"><span class="hist-date d-block">' + shortDate(s.date) + '</span>' +
          '<span class="hist-sub d-block">Best break: ' + esc(nameOf(0)) + ' ' + Stats.sessionBestBreak(s, a) + ' · ' + esc(nameOf(1)) + ' ' + Stats.sessionBestBreak(s, b) + '</span></span>' +
          '<span class="hist-score big-num" aria-label="' + esc(nameOf(0) + ' ' + sa + ', ' + nameOf(1) + ' ' + sb) + '">' +
            '<span class="p0">' + sa + '</span> – <span class="p1">' + sb + '</span></span>' +
          '<i class="bi bi-chevron-' + (open ? 'up' : 'down') + '" aria-hidden="true"></i>' +
        '</button>' +
        (open
          ? '<div class="hist-frames">' + s.frames.map((f, i) => frameRow(f, i + 1, 'div')).join('') +
            '<div class="two-col hist-actions logger-only">' +
              '<button type="button" class="btn-f btn-outline" data-action="edit">Edit session</button>' +
              '<button type="button" class="btn-f btn-outline muted" data-action="delete">Delete</button>' +
            '</div></div>'
          : '') +
        '</div>';
    }
    $('#history-body').html(html);
  }

  function bindHistory() {
    $('#history-body').on('click', '.hist-row', function () {
      const id = $(this).closest('.hist-card').data('id').toString();
      expanded.has(id) ? expanded.delete(id) : expanded.add(id);
      renderHistory();
    });

    $('#history-body').on('click', '[data-action="edit"]', async function () {
      const id = $(this).closest('.hist-card').data('id').toString();
      const s = data.sessions.find((x) => x.id === id);
      if (hasDraft() && draft.editingId !== id) {
        const what = draft.editingId ? 'unsaved changes to ' + shortDate(draft.date) : 'a draft with ' + plural(draft.frames.length, 'frame');
        const ok = await confirmDialog('Discard your draft?', 'You have ' + what + '. Discard it and edit this session instead?', 'Discard and edit');
        if (!ok) return;
      }
      if (draft.editingId !== id) {
        draft = { editingId: id, date: s.date, frames: JSON.parse(JSON.stringify(s.frames)), form: blankForm() };
        changed();
      }
      location.hash = '#session';
    });

    $('#history-body').on('click', '[data-action="delete"]', async function () {
      const id = $(this).closest('.hist-card').data('id').toString();
      const s = data.sessions.find((x) => x.id === id);
      const ok = await confirmDialog('Delete this session?', shortDate(s.date) + ', ' + scoreLine(s) + '.', 'Delete');
      if (!ok) return;
      const btn = $(this).prop('disabled', true).text('Deleting…');
      try {
        data = await GitHub.save(repo(), token(), (d) => {
          const gone = d.sessions.find((x) => x.id === id);
          return gone ? { data: Stats.removeSession(d, id), message: commitMessage('Delete session', gone, d) } : null;
        });
      } catch (e) {
        btn.prop('disabled', false).text('Delete');
        toast(e.message + ' Nothing was deleted.', true);
        return;
      }
      expanded.delete(id);
      if (draft.editingId === id) { draft = newDraft(); changed(); }
      renderData();
      toast('Session deleted');
    });
  }

  /* ---------- stats ---------- */

  function renderStats() {
    if (!data.sessions.length) { $('#stats-body').html(emptyState()); $('.segmented').prop('hidden', true); return; }
    $('.segmented').prop('hidden', false);
    $('.seg-btn').each(function () { $(this).attr('aria-pressed', String(this.dataset.range === statsRange)); });

    const r = Stats.summary(data.sessions, ids(), statsRange === 'last10' ? { last: 10 } : null);
    const [pa, pb] = ids().map((id) => r.players[id]);
    const pct = (p) => Math.round(p.winRate * 100) + '%';
    const n0 = esc(nameOf(0)), n1 = esc(nameOf(1));

    const streakCard = (p, i) =>
      '<div class="card-f mb-0"><div class="card-title p' + i + '">' + esc(nameOf(i)) + '</div>' +
      '<div class="streak-row">Current streak <span class="big-num">' + p.currentStreak + '</span></div>' +
      '<div class="streak-row">Longest streak <span class="big-num">' + p.longestStreak + '</span></div></div>';

    const row = (label, x, y) =>
      '<div class="tr"><span class="td-label">' + label + '</span><span class="big-num">' + x + '</span><span class="big-num">' + y + '</span></div>';

    $('#stats-body').html(
      '<div class="card-f">' +
        '<div class="card-head"><h2 class="card-title">Head to head</h2><span class="muted">' + plural(r.sessions, 'session') + ' · ' + plural(r.frames, 'frame') + '</span></div>' +
        '<div class="h2h-names"><span class="p0">' + n0 + '</span><span class="p1">' + n1 + '</span></div>' +
        '<div class="h2h-nums big-num"><span>' + pa.won + '</span><span>' + pb.won + '</span></div>' +
        '<div class="split-bar" aria-hidden="true"><div class="p0" style="flex:' + (pa.won || 0.0001) + '"></div><div class="p1" style="flex:' + (pb.won || 0.0001) + '"></div></div>' +
        '<div class="h2h-pct"><span>' + pct(pa) + ' win rate</span><span>' + pct(pb) + ' win rate</span></div>' +
      '</div>' +
      '<div class="two-col">' + streakCard(pa, 0) + streakCard(pb, 1) + '</div>' +
      '<div class="card-f stats-table">' +
        '<div class="tr"><span>Breaks</span><span class="p0">' + n0 + '</span><span class="p1">' + n1 + '</span></div>' +
        row('Highest break', pa.highestBreak, pb.highestBreak) +
        row('30+ breaks', pa.breaks30, pb.breaks30) +
        row('20+ breaks', pa.breaks20, pb.breaks20) +
        row('Avg best break per frame', pa.avgBreak.toFixed(1), pb.avgBreak.toFixed(1)) +
      '</div>' +
      '<div class="stat-line">Average frames per session <span class="big-num">' + r.avgFramesPerSession.toFixed(1) + '</span></div>'
    );
  }

  /* ---------- charts ---------- */

  function renderCharts() {
    charts.forEach((c) => c.destroy());
    charts = [];
    if (!data.sessions.length) { $('#charts-body').html(emptyState()); return; }

    const sorted = Stats.sortSessions(data.sessions);
    const number = Object.fromEntries(sorted.map((s, i) => [s.id, i + 1]));
    const rolling = Stats.rollingAvgBreak(sorted, ids(), 5);
    const cumulative = Stats.cumulativeWins(sorted, ids());
    const best = Stats.sessionBestBreaks(sorted, ids(), 8);
    const lastOf = (rows, id) => rows[rows.length - 1][id];
    const legend = (vals) => '<div class="legend">' + [0, 1].map((i) =>
      '<span><span class="dot p' + i + '"></span>' + esc(nameOf(i)) + (vals ? ' ' + vals[i] : '') + '</span>').join('') + '</div>';
    const card = (title, sub, vals, id) =>
      '<div class="card-f"><div class="card-head"><h2 class="card-title">' + title + '</h2><span class="muted">' + sub + '</span></div>' +
      legend(vals) + '<div class="chart-box"><canvas id="' + id + '" role="img" aria-label="' + title + '"></canvas></div></div>';

    $('#charts-body').html(
      card('Rolling average best break', 'last 5 sessions', ids().map((id) => lastOf(rolling, id).toFixed(1)), 'chart-rolling') +
      card('Cumulative frames won', 'all sessions', ids().map((id) => lastOf(cumulative, id)), 'chart-cumulative') +
      card('Best break per session', 'last 8 sessions', null, 'chart-best')
    );

    const css = getComputedStyle(document.documentElement);
    const colours = [css.getPropertyValue('--dan').trim(), css.getPropertyValue('--damon').trim()];
    const muted = css.getPropertyValue('--muted').trim();
    const line = css.getPropertyValue('--line').trim();
    const cardBg = css.getPropertyValue('--card').trim();
    Chart.defaults.font.family = 'Barlow, sans-serif';
    Chart.defaults.color = muted;

    const options = (labels) => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: reduceMotion ? false : { duration: 400 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: '#0A261D', borderColor: line, borderWidth: 1, padding: 10, boxPadding: 4, usePointStyle: true }
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: line },
          ticks: { autoSkip: false, maxRotation: 0, callback: (v, i) => (i === 0 || i === labels.length - 1 ? labels[i] : '') }
        },
        y: {
          beginAtZero: true,
          grid: { color: line, drawTicks: false },
          border: { display: false, dash: [4, 4] },
          ticks: { maxTicksLimit: 4, padding: 8, precision: 0 }
        }
      }
    });

    const lineChart = (id, rows) => {
      const labels = rows.map((r) => 'Session ' + number[r.id]);
      return new Chart(document.getElementById(id), {
        type: 'line',
        data: {
          labels,
          datasets: ids().map((pid, i) => ({
            label: nameOf(i),
            data: rows.map((r) => r[pid]),
            borderColor: colours[i],
            backgroundColor: colours[i],
            borderWidth: 2,
            cubicInterpolationMode: 'monotone',
            pointRadius: (ctx) => (ctx.dataIndex === rows.length - 1 ? 4 : 0),
            pointHoverRadius: 5,
            pointBorderColor: cardBg,
            pointBorderWidth: 2,
            pointHitRadius: 12
          }))
        },
        options: options(labels)
      });
    };

    charts.push(lineChart('chart-rolling', rolling));
    charts.push(lineChart('chart-cumulative', cumulative));

    const bestLabels = best.map((r) => 'Session ' + number[r.id]);
    charts.push(new Chart(document.getElementById('chart-best'), {
      type: 'bar',
      data: {
        labels: bestLabels,
        datasets: ids().map((pid, i) => ({
          label: nameOf(i),
          data: best.map((r) => r[pid]),
          backgroundColor: colours[i],
          borderRadius: 4,
          categoryPercentage: 0.7,
          barPercentage: 0.9
        }))
      },
      options: options(bestLabels)
    }));
  }

  /* ---------- settings ---------- */

  function setStatus(state, text) {
    $('#gh-status').attr('data-state', state);
    $('#gh-status-text').text(text);
  }

  const STATUS_TEXT = { auth: 'Bad token', forbidden: 'No write access', notfound: 'Repo not found', offline: 'Offline', conflict: 'Conflict', other: 'GitHub error' };

  async function checkConnection(r, t) {
    if (!t) { setStatus('none', 'Not connected'); return false; }
    setStatus('checking', 'Checking…');
    try {
      await GitHub.load(r, t);
      setStatus('ok', 'Connected');
      return true;
    } catch (e) {
      setStatus('error', STATUS_TEXT[e.kind] || 'Error');
      return e;
    }
  }

  function renderSettings() {
    $('#name-0').val(nameOf(0));
    $('#name-1').val(nameOf(1));
    $('#repo').val(repo());
    $('#token').val(token()).attr('type', 'password');
    $('#token-show').text('Show').attr('aria-pressed', 'false');
    checkConnection(repo(), token());
  }

  async function saveSettings() {
    const newRepo = $('#repo').val().trim();
    const newToken = $('#token').val().trim();
    const names = [$('#name-0').val().trim(), $('#name-1').val().trim()];
    const namesChanged = names.some((n, i) => n !== nameOf(i));
    if (names.some((n) => !n)) { toast('Both players need a name.', true); return; }
    if (newToken && !/^[\w.-]+\/[\w.-]+$/.test(newRepo)) { toast('Repository should look like owner/repo.', true); return; }
    if (namesChanged && !newToken) { toast('Names are saved to GitHub, so they need the access token.', true); return; }

    const btn = $('#save-settings').prop('disabled', true).text('Saving…');
    const done = () => btn.prop('disabled', false).text('Save settings');
    if (newToken) {
      const result = await checkConnection(newRepo, newToken);
      if (result !== true) { toast(result.message + ' Settings not saved.', true); done(); return; }
    }
    if (namesChanged) {
      try {
        data = await GitHub.save(newRepo, newToken, (d) => ({
          data: Object.assign({}, d, { players: d.players.map((p, i) => Object.assign({}, p, { name: names[i] })) }),
          message: 'Rename players: ' + names.join(' and ')
        }));
      } catch (e) {
        toast(e.message + ' Names not saved.', true); done(); return;
      }
    }

    newToken ? localStorage.setItem(TOKEN_KEY, newToken) : localStorage.removeItem(TOKEN_KEY);
    newRepo && newRepo !== guessRepo() ? localStorage.setItem(REPO_KEY, newRepo) : localStorage.removeItem(REPO_KEY);
    done();

    // Adding or removing the token switches mode: reload into it (the draft is in localStorage).
    if (!!newToken !== isLogger) {
      history.replaceState(null, '', location.pathname + (newToken ? '#session' : '#stats'));
      location.reload();
      return;
    }
    refreshAll();
    toast('Settings saved');
  }

  function bindSettings() {
    $('#token-show').on('click', function () {
      const show = $('#token').attr('type') === 'password';
      $('#token').attr('type', show ? 'text' : 'password');
      $(this).text(show ? 'Hide' : 'Show').attr('aria-pressed', String(show));
    });
    $('#save-settings').on('click', saveSettings);
    $('#copy-link').on('click', async function () {
      const url = location.origin + location.pathname;
      try {
        await navigator.clipboard.writeText(url);
        toast('Link copied: ' + url);
      } catch (e) {
        toast('Couldn’t copy. The link is ' + url, true);
      }
    });
    $('#download').on('click', function () {
      const blob = new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'data.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    $('#retry-load').on('click', () => loadData().then(refreshAll));
  }

  /* ---------- home-screen app ---------- */

  // An iOS home-screen app with a translucent status bar draws the page from the top of the screen but can size it
  // a status bar's height short, so a bottom:0 tab bar stops above the edge. Measure the shortfall and push the bar
  // down by it. In Safari, or when the page isn't drawn under the status bar, the gap is 0.
  let screenInfo = '';
  function fitStandalone() {
    const probe = $('<div style="position:fixed;top:0;height:env(safe-area-inset-top);visibility:hidden"></div>').appendTo('body');
    const insetTop = probe[0].offsetHeight;
    probe.remove();
    const gap = navigator.standalone && insetTop > 0 ? Math.max(0, screen.height - window.innerHeight) : 0;
    document.documentElement.style.setProperty('--ios-gap', gap + 'px');
    screenInfo = 'Screen ' + screen.height + ' · page ' + window.innerHeight + ' · top ' + insetTop + ' · gap ' + gap +
      (navigator.standalone ? ' · home screen' : '');
    $('#screen-info').text(screenInfo);
  }

  /* ---------- routing ---------- */

  function renderData() {
    renderHistory();
    renderStats();
    if (current === 'charts') renderCharts();
    if (current) $('#eyebrow').text(SCREENS[current].eyebrow());
  }

  let lastTab = isLogger ? 'session' : 'stats';

  function route() {
    let name = location.hash.slice(1);
    // Settings is reachable in both modes (the cog is always shown), so a token can be added on a new device or home-screen app.
    if (!SCREENS[name] || (name === 'session' && !isLogger)) {
      name = isLogger ? 'session' : 'stats';
      history.replaceState(null, '', '#' + name);
    }
    if (name !== 'settings') lastTab = name;
    current = name;

    $('.screen').attr('hidden', true);
    $('#screen-' + name).removeAttr('hidden');
    $('#eyebrow').text(SCREENS[name].eyebrow());
    $('#title').text(SCREENS[name].title());
    $('.tab').removeClass('active').removeAttr('aria-current');
    $('.tab[data-route="' + name + '"]').addClass('active').attr('aria-current', 'page');

    const onSettings = name === 'settings';
    $('#settings-btn').toggleClass('d-none', onSettings);
    $('#close-btn').toggleClass('d-none', !onSettings).attr('href', '#' + lastTab);
    if (name === 'charts') renderCharts();
    if (name === 'settings') renderSettings();
    window.scrollTo(0, 0);
  }

  $(function () {
    $('body').toggleClass('readonly', !isLogger);
    fitStandalone();
    localStorage.removeItem('frames.localData');   // practice copy from before GitHub saving existed
    loadDraft();
    $('[data-name]').each(function () { $(this).text(nameOf(Number(this.dataset.name))); });
    bindSession();
    bindHistory();
    bindSettings();
    $('.seg-btn').on('click', function () {
      statsRange = this.dataset.range;
      renderStats();
      $('#eyebrow').text(SCREENS.stats.eyebrow());
    });
    renderSession();
    $(window).on('hashchange', route);
    route();
    loadData().then(() => {
      refreshAll();
      if (current === 'settings') renderSettings();
    });
  });
})();
