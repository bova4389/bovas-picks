/* ==========================================================================
   Sleeper login token — kept on THIS DEVICE ONLY.

   On 2026-09-13 Sleeper's pick queries (get_pickem_picks_for_league and every
   sibling) began answering "Unauthorized" to unauthenticated requests.
   Leagues, users and rosters stayed public; picks did not. The endpoint still
   allows any origin and the Authorization header (preflight verified
   2026-09-13), so the browser can ask again with the owner's own token.

   RULES, all of them load-bearing:

     * The token lives in this browser's localStorage and nowhere else. It is
       never committed, never written to data/, never sent anywhere except
       api.sleeper.app. It is equivalent to the Sleeper password.
     * It is NEVER used from CI. A personal login on a server is a standing
       leak and it would expire anyway.
     * Each device connects separately. That is the cost of the first rule.

   The token is a JWT, so its payload says whose it is and when it expires.
   That is read for display only -- nothing here verifies it; Sleeper does.
   `user_id` is parsed out of the raw payload TEXT, not JSON.parse, because
   Sleeper writes it as a bare 18-digit number and JSON.parse rounds it past
   2^53 into a different user.

   HOW OFTEN THIS IS NEEDED, because nothing used to say: once per device.
   Again only when the token expires (the box shows the date, and turns amber
   inside RENEW_DAYS of it), after logging out of Sleeper, or after a password
   change. It is not a weekly chore.

   Imports only js/sleeperBookmarklet.js, which imports nothing (sleeperApi.js
   imports this, so nothing here may import it back).
   NEVER add a ?v= to this file -- see data.js's note on module identity.
   ========================================================================== */

import { bookmarkletHref } from './sleeperBookmarklet.js';

const KEY = 'sleeper:token';

/** Warn this many days before expiry -- early enough to reconnect on a quiet
 *  weekday rather than discover it on a Sunday. */
const RENEW_DAYS = 30;

export function getToken() {
  try { return localStorage.getItem(KEY) || null; } catch { return null; }
}

/** Decode the payload for display:
 *  `{ name, userId, exp: Date|null, expired, expiringSoon }`, or null. */
export function tokenInfo(token = getToken()) {
  const part = String(token || '').split('.')[1];
  if (!part) return null;
  let text;
  try {
    text = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='));
  } catch { return null; }
  const userId = text.match(/"user_id"\s*:\s*"?(\d+)/)?.[1] || null;
  const name = text.match(/"display_name"\s*:\s*"([^"]*)"/)?.[1] || null;
  const expSec = Number(text.match(/"exp"\s*:\s*(\d+)/)?.[1]);
  const exp = expSec ? new Date(expSec * 1000) : null;
  const left = exp ? exp.getTime() - Date.now() : Infinity;
  return {
    name, userId, exp,
    expired: left <= 0,
    expiringSoon: left > 0 && left <= RENEW_DAYS * 86_400_000,
  };
}

/** Store a pasted token. Throws with a readable message if it is not one. */
export function saveToken(raw) {
  const token = String(raw || '').trim().replace(/^bearer\s+/i, '');
  if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token) || !tokenInfo(token)) {
    throw new Error("That doesn't look like a Sleeper token — it should be one long string starting eyJ");
  }
  if (tokenInfo(token).expired) {
    throw new Error('That token has already expired. Log in to sleeper.com again and get a fresh one.');
  }
  try { localStorage.setItem(KEY, token); } catch {
    throw new Error("This browser won't store it (private browsing?)");
  }
  announce();
  return tokenInfo(token);
}

export function clearToken() {
  try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
  announce();
}

function announce() {
  window.dispatchEvent(new CustomEvent('sleeperauth'));
}

/* ── The Connect box ──────────────────────────────────────────────────────
   Any element carrying `data-sl-connect` becomes a box. Tabs drop the empty
   element into their markup and call mountConnectBoxes() after rendering;
   every box on the page repaints when the token changes, so connecting on
   the Grid shows as connected on Infinity War without a reload.
   ------------------------------------------------------------------------ */

const fmtDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const canReadClipboard = () => Boolean(navigator.clipboard?.readText);

/** The paste field, then how to get something to paste. Shared by the
 *  disconnected box and the reconnect panel of an expiring one. */
function connectHtml(message) {
  return `
    <form class="slc-form" data-slc="form" autocomplete="off">
      <input type="password" class="slc-input" name="token" placeholder="Paste your Sleeper token"
             autocomplete="off" spellcheck="false" aria-label="Sleeper token">
      <button type="submit" class="btn slc-btn">Save</button>
      ${canReadClipboard()
        ? '<button type="button" class="btn btn-ghost slc-btn" data-slc="paste">Paste &amp; save</button>'
        : ''}
    </form>
    ${message ? `<p class="slc-msg" role="alert">${esc(message)}</p>` : ''}

    <p class="slc-head">Get your token <span class="slc-why">— once per device</span></p>
    <ol class="slc-steps">
      <li>
        <button type="button" class="btn btn-ghost slc-btn" data-slc="copy-bm">Copy the bookmark</button>
        <span class="slc-bm-desk">or drag
          <a class="slc-bm" href="${esc(bookmarkletHref())}" data-slc="bm-link">Get Sleeper token</a>
          to your bookmarks bar</span>
        <textarea class="slc-bm-code" readonly hidden aria-label="Bookmark address">${esc(bookmarkletHref())}</textarea>
      </li>
      <li>
        Save it as a bookmark. <strong>On an iPad or iPhone:</strong> bookmark any page
        (Share &rarr; Add Bookmark), then edit that bookmark and replace its address with what you
        copied.
      </li>
      <li>Open <strong>sleeper.com</strong>, logged in, and tap the bookmark. It copies your token.</li>
      <li>Come back here and paste it above.</li>
    </ol>
    <p class="slc-help">
      You only redo this if the token expires (the date shows here once connected), you log out of
      Sleeper, or you change your Sleeper password.
    </p>
    <details class="slc-alt">
      <summary>If the bookmark doesn't work</summary>
      <p class="slc-help">
        On a computer: sleeper.com &rarr; F12 &rarr; Network &rarr; filter <code>graphql</code> &rarr;
        reload &rarr; click a row &rarr; Request Headers &rarr; copy <strong>authorization</strong>.
        If no rows show, open chat or another league.
      </p>
    </details>
    <p class="slc-help">
      Stays in this browser only. It works like your password &mdash; don't paste it anywhere else.
    </p>`;
}

function boxHtml(message = '') {
  const info = tokenInfo();
  if (info) {
    const when = info.exp ? ` · ${info.expired ? 'expired' : 'expires'} ${fmtDate(info.exp)}` : '';
    const state = info.expired ? ' is-expired' : info.expiringSoon ? ' is-soon' : '';
    const renew = info.expired || info.expiringSoon;
    return `
      <div class="slc slc-on${state}">
        <span class="slc-state">Sleeper connected${info.name ? ` as <strong>${esc(info.name)}</strong>` : ''}${when}</span>
        <button type="button" class="btn btn-ghost slc-btn" data-slc="clear">Disconnect</button>
      </div>
      ${renew ? `
        <details class="slc slc-off"${message ? ' open' : ''}>
          <summary>${info.expired
            ? 'Reconnect Sleeper <span class="slc-why">— the token has expired</span>'
            : 'Time to reconnect <span class="slc-why">— the token expires soon</span>'}</summary>
          ${connectHtml(message)}
        </details>` : ''}`;
  }
  return `
    <details class="slc slc-off"${message ? ' open' : ''}>
      <summary>Connect Sleeper <span class="slc-why">— needed to read picks</span></summary>
      ${connectHtml(message)}
    </details>`;
}

/** Repaint one box with a message, keeping it open so the message is seen. */
function say(el, message) {
  el.innerHTML = boxHtml(message);
}

async function copyBookmarklet(el, btn) {
  try {
    await navigator.clipboard.writeText(bookmarkletHref());
    btn.textContent = 'Copied — now save it as a bookmark';
  } catch {
    // No clipboard: show the address selected, for a manual copy.
    const code = el.querySelector('.slc-bm-code');
    if (code) {
      code.hidden = false;
      code.focus();
      code.select();
    }
    btn.textContent = 'Copy the text below';
  }
}

export function mountConnectBoxes(root = document) {
  for (const el of root.querySelectorAll('[data-sl-connect]')) {
    el.innerHTML = boxHtml();
    if (el.dataset.slcWired) continue;
    el.dataset.slcWired = '1';
    el.addEventListener('click', async (e) => {
      if (e.target.closest('[data-slc="clear"]')) {
        clearToken();
      } else if (e.target.closest('[data-slc="bm-link"]')) {
        // Clicking it here would run it on OUR page, where there is no token.
        e.preventDefault();
        say(el, 'Drag that link to your bookmarks bar rather than clicking it here, or use Copy the bookmark.');
      } else if (e.target.closest('[data-slc="copy-bm"]')) {
        copyBookmarklet(el, e.target.closest('[data-slc="copy-bm"]'));
      } else if (e.target.closest('[data-slc="paste"]')) {
        try {
          saveToken(await navigator.clipboard.readText());
        } catch (err) {
          say(el, err?.name === 'NotAllowedError'
            ? 'This browser blocked reading the clipboard. Paste into the box instead.'
            : err.message);
        }
      }
    });
    el.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = el.querySelector('.slc-input');
      try {
        saveToken(input?.value);
      } catch (err) {
        say(el, err.message);
      }
    });
  }
}

// Node imports this module transitively (scripts/log_week_card.mjs -> sleeperApi.js)
// and has no window, so a bare listener here crashes the CI log step on import.
if (typeof window !== 'undefined') {
  window.addEventListener('sleeperauth', () => mountConnectBoxes());
}
