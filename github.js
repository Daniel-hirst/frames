/* Frames: load and save data.json through the GitHub Contents API. Browser (window.GitHub) and Node (require). */
(function (root) {
  'use strict';

  const TIMEOUT_MS = 15000;

  class SaveError extends Error {
    // kind: offline | auth | forbidden | notfound | conflict | other
    constructor(kind, message, status) {
      super(message);
      this.kind = kind;
      this.status = status;
    }
  }

  function decode(b64) {
    const bin = atob(b64.replace(/\s/g, ''));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  }

  function encode(text) {
    let bin = '';
    for (const byte of new TextEncoder().encode(text)) bin += String.fromCharCode(byte);
    return btoa(bin);
  }

  function errorFor(status) {
    if (status === 401) return new SaveError('auth', 'GitHub rejected the access token. Check it in Settings.', status);
    if (status === 403) return new SaveError('forbidden', 'The token isn’t allowed to write to this repository. It needs “Contents: read and write”.', status);
    if (status === 404) return new SaveError('notfound', 'Repository or data.json not found. Check the repository name in Settings.', status);
    if (status === 409 || status === 422) return new SaveError('conflict', 'data.json changed on GitHub while saving.', status);
    return new SaveError('other', 'GitHub returned an error (' + status + ').', status);
  }

  async function request(url, token, options) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new SaveError('offline', 'No internet connection.');
    }
    let res;
    try {
      res = await fetch(url, Object.assign({
        cache: 'no-store',
        signal: AbortSignal.timeout(TIMEOUT_MS)
      }, options, {
        headers: Object.assign({
          Accept: 'application/vnd.github+json',
          Authorization: 'Bearer ' + token
        }, options && options.headers)
      }));
    } catch (e) {
      throw new SaveError('offline', e.name === 'TimeoutError' ? 'GitHub didn’t respond.' : 'No internet connection.');
    }
    if (!res.ok) throw errorFor(res.status);
    return res.json();
  }

  const fileUrl = (repo) => 'https://api.github.com/repos/' + repo + '/contents/data.json';

  // Latest data.json and its sha.
  async function load(repo, token) {
    const file = await request(fileUrl(repo), token);
    return { data: JSON.parse(decode(file.content)), sha: file.sha };
  }

  // Read-modify-write. `change(data)` returns { data, message }, or null when nothing needs committing.
  // On a conflict (409/422) it reloads and re-applies the change once, then gives up.
  async function save(repo, token, change) {
    for (let attempt = 1; ; attempt++) {
      const current = await load(repo, token);
      const next = change(current.data);
      if (!next) return current.data;
      try {
        await request(fileUrl(repo), token, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: next.message,
            content: encode(JSON.stringify(next.data, null, 2) + '\n'),
            sha: current.sha
          })
        });
        return next.data;
      } catch (e) {
        if (e.kind !== 'conflict' || attempt === 2) throw e;
      }
    }
  }

  const GitHub = { load, save, encode, decode, SaveError };

  if (typeof module !== 'undefined' && module.exports) module.exports = GitHub;
  else root.GitHub = GitHub;
})(this);
