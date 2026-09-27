/* ==========================================================================
   Sent picks, saved for every device -- data/picks-sent-<year>.json, written
   straight to GitHub from the browser.

   WHY: every pick made on this site lives in ONE browser's localStorage. A
   card locked on the iPad was a blank sheet on the phone (2026-09-27), and
   the only shared record, data/picks-sent-<year>.json, was hand-updated by
   pasting the email to Claude. Now tapping Lock writes that file itself,
   through GitHub's contents API, and every device reads it back.

   RULES, all of them load-bearing:

     * The key is a fine-grained GitHub token scoped to bova4389/bovas-picks
       with Contents read/write and nothing else. It lives in this browser's
       localStorage (`github:token`) and is sent only to api.github.com. Never
       commit it, never give it to CI.
     * READING needs no key. The public repo's contents API answers anyone,
       and it is fresh -- GitHub Pages can serve the same file up to ~10
       minutes stale, which is exactly the window in which a phone opened
       after an iPad lock would show the old card. A key only raises the rate
       limit. If the API fails (offline, rate-limited), the Pages copy is
       used, so a GitHub hiccup costs freshness, never the picks.
     * EVERY WRITE IS READ-MODIFY-WRITE AGAINST THE FILE'S CURRENT SHA. The
       patch is applied to the copy just fetched, never to the copy loaded at
       boot, so a save from the phone cannot erase a pick saved from the iPad.
       A sha conflict (someone saved in between) re-reads and retries. The
       odds bot commits to main all day, but to other files, and the contents
       API only checks this file's sha, so the bot never causes a conflict.
     * An unchanged card writes nothing. Re-locking a week that is already
       saved must not produce a commit.
     * The file keeps its hand-written shape (arrays on one line) so a saved
       week diffs as the lines that changed, not as a reformatted file.

   A NEW FILE on purpose: every export here is new, and a fresh caller that
   imports a new name from a CACHED copy of an existing shared module blanks
   the site (see CLAUDE.md, cache busting). A file nobody has cached cannot be
   stale. Imports nothing, and touches `window` only inside functions, so it
   is safe to import anywhere.
   NEVER add a ?v= to this file -- it holds state; see data.js's note on
   module identity.
   ========================================================================== */

const OWNER = 'bova4389';
const REPO = 'bovas-picks';
const BRANCH = 'main';
const API = `https://api.github.com/repos/${OWNER}/${REPO}`;
const KEY = 'github:token';

/** How long a read waits for GitHub before settling for the Pages copy. The
 *  Pick Sheet will not render until the sent file resolves, so this is the
 *  worst case added to its first paint. */
const READ_TIMEOUT_MS = 4000;

export const sentPath = (season) => `data/picks-sent-${season}.json`;

/* The fetch used for every call. Swappable only so test/githubsync.test.html
   can play GitHub without a network or a key. */
let net = (...args) => fetch(...args);
export function _setFetch(f) { net = f || ((...args) => fetch(...args)); }

/* ── The key ──────────────────────────────────────────────────────────────*/

export function getGhToken() {
  try { return localStorage.getItem(KEY) || null; } catch { return null; }
}

export const hasGhToken = () => Boolean(getGhToken());

/**
 * Check a pasted key against GitHub, then store it. Throws with a readable
 * message. Reading the repo proves the key is live and can see this repo; it
 * cannot prove write access without writing, so a read-only key is caught on
 * the first save instead (see saveSent's 403 message).
 */
export async function saveGhToken(raw) {
  const token = String(raw || '').trim().replace(/^(bearer|token)\s+/i, '');
  if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(token)) {
    throw new Error("That doesn't look like a GitHub key — it should start github_pat_");
  }
  let res;
  try {
    res = await net(API, { headers: authHeaders(token), cache: 'no-store' });
  } catch {
    throw new Error("Couldn't reach GitHub to check the key. Try again when you're online.");
  }
  if (res.status === 401) throw new Error('GitHub rejected that key. It may be mistyped, expired or deleted.');
  if (!res.ok) {
    throw new Error(`That key can't see ${OWNER}/${REPO}. When you make it, pick "Only select repositories" and choose ${REPO}.`);
  }
  try { localStorage.setItem(KEY, token); } catch {
    throw new Error("This browser won't store it (private browsing?)");
  }
  announce('ghauth');
}

export function clearGhToken() {
  try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
  announce('ghauth');
}

function authHeaders(token = getGhToken()) {
  const h = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function announce(name, detail) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(name, { detail }));
}

/* ── Reading ──────────────────────────────────────────────────────────────*/

const current = new Map();   // season -> the file as last read or written
const loads = new Map();     // season -> Promise, so every tab shares one read

/** The sent file as last read or saved, or null. Synchronous, for renders. */
export function currentSent(season) {
  return current.get(Number(season)) || null;
}

/**
 * Load the sent file once per page view: GitHub's API first (fresh), the
 * Pages copy if that fails. Resolves null when neither exists -- before the
 * first week is sent, a missing file is the normal state.
 */
export function loadSent(season) {
  const s = Number(season);
  if (!loads.has(s)) {
    loads.set(s, readFresh(s)
      .catch(() => readPages(s))
      .catch(() => null)
      .then((file) => {
        // A save that finished while this read was in flight is newer.
        if (!current.has(s)) current.set(s, file);
        return current.get(s);
      }));
  }
  return loads.get(s);
}

async function readFresh(season) {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), READ_TIMEOUT_MS) : null;
  try {
    const { file } = await getFile(season, ctl?.signal);
    return file;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function readPages(season) {
  const res = await net(sentPath(season));
  if (!res.ok) throw new Error(`${sentPath(season)} → HTTP ${res.status}`);
  return res.json();
}

/** The file and its sha from the contents API. `file` is null on a 404. */
async function getFile(season, signal) {
  const res = await net(`${API}/contents/${sentPath(season)}?ref=${BRANCH}`, {
    headers: authHeaders(), cache: 'no-store', signal,
  });
  if (res.status === 404) return { file: null, sha: null };
  if (!res.ok) throw httpError(res.status);
  const body = await res.json();
  return { file: JSON.parse(fromBase64(body.content || '')), sha: body.sha };
}

/* ── Writing ──────────────────────────────────────────────────────────────*/

/**
 * Apply `patch` to the sent file on GitHub and commit it.
 *
 * `patch(file)` receives a fresh, mutable copy of the file as it is on GitHub
 * right now (a new skeleton if it does not exist yet) and edits it in place.
 * Returns `{ changed }`; `changed: false` means the file already said this and
 * nothing was committed. Throws with a message fit to show the owner.
 */
export async function saveSent(season, patch, message) {
  if (!getGhToken()) throw new Error('Connect GitHub on this device to save picks for every device.');
  const s = Number(season);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    let got;
    try {
      got = await getFile(s);
    } catch (err) {
      throw friendly(err);
    }
    const before = got.file ? serialize(got.file) : '';
    const file = got.file ? JSON.parse(before) : skeleton(s);
    file.weeks = file.weeks || {};
    patch(file);
    const after = serialize(file);

    if (after === before) {
      current.set(s, file);
      return { changed: false };
    }

    let res;
    try {
      res = await net(`${API}/contents/${sentPath(s)}`, {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message, branch: BRANCH, content: toBase64(after), ...(got.sha ? { sha: got.sha } : {}),
        }),
      });
    } catch {
      throw new Error("Couldn't reach GitHub. Your picks are still saved on this device — try again when you're online.");
    }
    // 409: the file moved between our read and our write. 422 is how GitHub
    // reports a stale sha on some paths. Either way: re-read and re-apply.
    if (res.status === 409 || res.status === 422) continue;
    if (!res.ok) throw friendly(httpError(res.status));

    current.set(s, file);
    announce('sentchange', { season: s });
    return { changed: true };
  }
  throw new Error('Another device kept saving at the same moment. Try again.');
}

/** Patch one week: `edit(card)` gets that week's card (created if missing)
 *  and either edits it in place or returns a replacement. */
export function saveSentWeek(season, week, edit, message) {
  return saveSent(season, (file) => {
    const w = String(week);
    file.weeks[w] = file.weeks[w] || {};
    const next = edit(file.weeks[w]);
    if (next) file.weeks[w] = next;
    file.weeks = sortWeeks(file.weeks);
  }, message);
}

function skeleton(season) {
  return {
    season,
    note: 'My picks exactly as submitted. numbers = season-long pick numbers; points = Monday night total; survivor = pool id -> team abbreviation. infinity = list of Infinity War team abbreviations picked. Read by js/myPicks.js and scripts/log_week_card.mjs.',
    weeks: {},
  };
}

function sortWeeks(weeks) {
  return Object.fromEntries(Object.entries(weeks).sort(([a], [b]) => Number(a) - Number(b)));
}

function httpError(status) {
  const err = new Error(`GitHub ${status}`);
  err.status = status;
  return err;
}

function friendly(err) {
  switch (err?.status) {
    case 401: return new Error('GitHub no longer accepts this key — it has expired or been deleted. Make a new one and reconnect.');
    case 403: return new Error(`This key can't save. It needs "Contents: Read and write" on ${REPO}. Make a new one with that permission.`);
    case 404: return new Error(`This key can't see ${REPO}. Make a new one with ${REPO} selected.`);
    default: return err?.status
      ? new Error(`GitHub answered ${err.status}. Your picks are still saved on this device — try again shortly.`)
      : new Error("Couldn't reach GitHub. Your picks are still saved on this device — try again when you're online.");
  }
}

/* ── The file's shape ─────────────────────────────────────────────────────
   Objects one key per line, arrays and scalars on one line -- the shape the
   file has always had by hand, so a save diffs as the lines that changed. */

export function serialize(value, depth = 0) {
  if (Array.isArray(value)) return `[${value.map((v) => serialize(v, depth + 1)).join(', ')}]`;
  if (value && typeof value === 'object') {
    const pad = '  '.repeat(depth);
    const rows = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${pad}  ${JSON.stringify(k)}: ${serialize(v, depth + 1)}`);
    return rows.length ? `{\n${rows.join(',\n')}\n${pad}}` : '{}';
  }
  return JSON.stringify(value);
}

// The contents API speaks base64, and the file carries an em dash, so the
// bytes go through UTF-8 explicitly -- a bare atob/btoa would mangle it.
// The trailing newline matches the file as it has always been committed.
function toBase64(text) {
  const bytes = new TextEncoder().encode(`${text}\n`);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/* ── The Connect box ──────────────────────────────────────────────────────
   Tabs drop connectBox() into their markup, or an empty `data-gh-connect`
   element for mountGhConnect() to fill. Tabs re-render freely, so the
   listeners are delegated from `document`, wired ONCE AT IMPORT -- not by a
   mount call. They were first wired by mountGhConnect() alone, the Pick Sheet
   renders connectBox() without calling it, and the form submitted natively:
   the key landed in the address bar as ?token=. The form also carries
   method="dialog" so that, whatever breaks, submitting it can never put the
   key in a URL. Styled with the Sleeper box's `.slc` classes so the two
   connect boxes look like the same kind of thing.
   ------------------------------------------------------------------------ */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

/** GitHub's new-key page, pre-filled as far as its URL parameters allow. The
 *  repository still has to be chosen by hand -- there is no parameter for it. */
export function newKeyUrl() {
  const q = new URLSearchParams({
    name: "Bova's Picks — save picks",
    description: "Lets bova4389.github.io/bovas-picks save sent picks to data/picks-sent-*.json. One per device.",
    target_name: OWNER,
    expires_in: '366',
    contents: 'write',
  });
  return `https://github.com/settings/personal-access-tokens/new?${q}`;
}

export function connectBox(message = '') {
  if (hasGhToken()) {
    return `
      <div class="slc slc-on">
        <span class="slc-state">GitHub connected — Lock saves for every device</span>
        <button type="button" class="btn btn-ghost slc-btn" data-ghc="clear">Disconnect</button>
      </div>`;
  }
  return `
    <details class="slc slc-off"${message ? ' open' : ''}>
      <summary>Connect GitHub <span class="slc-why">— so Lock saves for every device</span></summary>
      <form class="slc-form" data-ghc="form" method="dialog" autocomplete="off">
        <input type="password" class="slc-input" name="token" placeholder="Paste your GitHub key"
               autocomplete="off" spellcheck="false" aria-label="GitHub key">
        <button type="submit" class="btn slc-btn">Save</button>
      </form>
      ${message ? `<p class="slc-msg" role="alert">${esc(message)}</p>` : ''}
      <p class="slc-head">Make a key <span class="slc-why">— once per device, lasts a year</span></p>
      <ol class="slc-steps">
        <li>Open <a href="${esc(newKeyUrl())}" target="_blank" rel="noopener">GitHub's new-key page</a>
          (signed in as ${OWNER}). The name, a one-year expiry and the permission are filled in.</li>
        <li>Under <strong>Repository access</strong>, choose <strong>Only select repositories</strong>
          and pick <strong>${REPO}</strong>.</li>
        <li>Check <strong>Permissions &rarr; Contents</strong> says <strong>Read and write</strong>.
          Nothing else is needed.</li>
        <li>Tap <strong>Generate token</strong>, copy it, and paste it above.</li>
      </ol>
      <p class="slc-help">
        Stays in this browser only and can only edit the ${REPO} repo. Your phone does not need
        one to <em>see</em> saved picks &mdash; only to save them.
      </p>
    </details>`;
}

function wireOnce() {
  if (typeof document === 'undefined' || wireOnce.done) return;
  wireOnce.done = true;
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-gh-connect] [data-ghc="clear"]')) clearGhToken();
  });
  document.addEventListener('submit', async (e) => {
    const form = e.target.closest('[data-gh-connect] [data-ghc="form"]');
    if (!form) return;
    e.preventDefault();
    const box = form.closest('[data-gh-connect]');
    const btn = form.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Checking…'; }
    try {
      await saveGhToken(form.querySelector('.slc-input')?.value);
    } catch (err) {
      box.innerHTML = connectBox(err.message);
    }
  });
  window.addEventListener('ghauth', () => {
    for (const el of document.querySelectorAll('[data-gh-connect]')) el.innerHTML = connectBox();
  });
}

/** Fill every `[data-gh-connect]` under `root`. Optional: a box rendered
 *  with connectBox() works without it. */
export function mountGhConnect(root = document) {
  for (const el of root.querySelectorAll('[data-gh-connect]')) el.innerHTML = connectBox();
}

wireOnce();
