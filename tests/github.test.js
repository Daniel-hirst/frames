// Run with: node --test tests/*.test.js
// github.js against a fake fetch: no network.
const test = require('node:test');
const assert = require('node:assert/strict');
const GitHub = require('../github.js');

const REPO = 'owner/frames';
const START = { players: [{ id: 'dan', name: 'Dan' }, { id: 'damon', name: 'Damon' }], sessions: [] };

// A fake GitHub holding one data.json. `script` can override the response to the nth request.
function fakeGitHub(script = {}) {
  const state = { data: START, sha: 'sha1', calls: [] };
  global.fetch = async (url, opts = {}) => {
    const method = opts.method || 'GET';
    const n = state.calls.push({ method, url, opts, body: opts.body && JSON.parse(opts.body) });
    if (script[n]) return script[n](state);
    if (method === 'GET') {
      return json(200, { sha: state.sha, content: GitHub.encode(JSON.stringify(state.data)) });
    }
    const body = JSON.parse(opts.body);
    if (body.sha !== state.sha) return json(409, { message: 'sha mismatch' });
    state.data = JSON.parse(GitHub.decode(body.content));
    state.sha = 'sha' + (Number(state.sha.slice(3)) + 1);
    return json(200, { content: { sha: state.sha } });
  };
  return state;
}
const json = (status, body) => ({ ok: status < 300, status, json: async () => body });

const addSession = (d) => ({
  data: { ...d, sessions: [...d.sessions, { id: '2026-10-17', date: '2026-10-17', frames: [] }] },
  message: 'Session 2026-10-17: Dan 0-0 Damon'
});

test('encode/decode round-trips UTF-8', () => {
  const s = '{"name":"Dámon – 147 ✓"}';
  assert.equal(GitHub.decode(GitHub.encode(s)), s);
  assert.equal(GitHub.decode(GitHub.encode(s).replace(/(.{10})/g, '$1\n')), s);   // GitHub wraps base64 lines
});

test('load sends the token and returns data and sha', async () => {
  const gh = fakeGitHub();
  const r = await GitHub.load(REPO, 'tok');
  assert.deepEqual(r, { data: START, sha: 'sha1' });
  assert.equal(gh.calls[0].url, 'https://api.github.com/repos/owner/frames/contents/data.json');
  assert.equal(gh.calls[0].opts.headers.Authorization, 'Bearer tok');
  assert.equal(gh.calls[0].opts.cache, 'no-store');
});

test('save: GET then PUT with message, sha and pretty JSON', async () => {
  const gh = fakeGitHub();
  const data = await GitHub.save(REPO, 'tok', addSession);
  assert.equal(data.sessions.length, 1);
  assert.deepEqual(gh.calls.map((c) => c.method), ['GET', 'PUT']);
  const put = gh.calls[1].body;
  assert.equal(put.message, 'Session 2026-10-17: Dan 0-0 Damon');
  assert.equal(put.sha, 'sha1');
  assert.equal(GitHub.decode(put.content), JSON.stringify(data, null, 2) + '\n');
});

test('save: 409 reloads, re-applies the change to the newer file, and succeeds', async () => {
  const gh = fakeGitHub({
    // Someone else commits between our GET and PUT.
    2: (s) => {
      s.data = { ...s.data, sessions: [{ id: '2026-10-10', date: '2026-10-10', frames: [] }] };
      s.sha = 'sha2';
      return json(409, { message: 'conflict' });
    }
  });
  const data = await GitHub.save(REPO, 'tok', addSession);
  assert.deepEqual(gh.calls.map((c) => c.method), ['GET', 'PUT', 'GET', 'PUT']);
  assert.equal(gh.calls[3].body.sha, 'sha2');
  assert.deepEqual(data.sessions.map((s) => s.id), ['2026-10-10', '2026-10-17']);   // their change kept
});

test('save: a second conflict gives up with kind "conflict"', async () => {
  const gh = fakeGitHub({ 2: () => json(409, {}), 4: () => json(422, {}) });
  await assert.rejects(GitHub.save(REPO, 'tok', addSession), { kind: 'conflict' });
  assert.equal(gh.calls.length, 4);
  assert.equal(gh.data.sessions.length, 0);
});

test('save: change returning null commits nothing', async () => {
  const gh = fakeGitHub();
  const data = await GitHub.save(REPO, 'tok', () => null);
  assert.deepEqual(data, START);
  assert.deepEqual(gh.calls.map((c) => c.method), ['GET']);
});

for (const [status, kind] of [[401, 'auth'], [403, 'forbidden'], [404, 'notfound'], [500, 'other']]) {
  test('HTTP ' + status + ' is kind "' + kind + '" and is not retried', async () => {
    const gh = fakeGitHub({ 1: () => json(status, {}) });
    await assert.rejects(GitHub.save(REPO, 'tok', addSession), (e) => e.kind === kind && e.status === status && e.message.length > 0);
    assert.equal(gh.calls.length, 1);
  });
}

test('network failure is kind "offline"', async () => {
  global.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(GitHub.save(REPO, 'tok', addSession), { kind: 'offline', message: 'No internet connection.' });
});

test('timeout is kind "offline" with its own message', async () => {
  global.fetch = async () => { const e = new Error('timed out'); e.name = 'TimeoutError'; throw e; };
  await assert.rejects(GitHub.load(REPO, 'tok'), { kind: 'offline', message: 'GitHub didn’t respond.' });
});
