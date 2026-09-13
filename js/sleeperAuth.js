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

   Imports nothing (sleeperApi.js imports this).
   NEVER add a ?v= to this file -- see data.js's note on module identity.
   ========================================================================== */

const KEY = 'sleeper:token';

export function getToken() {
  try { return localStorage.getItem(KEY) || null; } catch { return null; }
}

/** Decode the payload for display: `{ name, userId, exp: Date|null, expired }`, or null. */
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
  return { name, userId, exp, expired: Boolean(exp) && exp.getTime() <= Date.now() };
}

/** Store a pasted token. Throws with a readable message if it is not one. */
export function saveToken(raw) {
  const token = String(raw || '').trim().replace(/^bearer\s+/i, '');
  if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token) || !tokenInfo(token)) {
    throw new Error("That doesn't look like a Sleeper token — it should be one long string starting eyJ");
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

function boxHtml(message = '') {
  const info = tokenInfo();
  if (info) {
    const when = info.exp ? ` · ${info.expired ? 'expired' : 'expires'} ${fmtDate(info.exp)}` : '';
    return `
      <div class="slc slc-on${info.expired ? ' is-expired' : ''}">
        <span class="slc-state">Sleeper connected${info.name ? ` as <strong>${esc(info.name)}</strong>` : ''}${when}</span>
        <button type="button" class="btn btn-ghost slc-btn" data-slc="clear">Disconnect</button>
        ${info.expired ? '<p class="slc-help">Paste a fresh token to keep refreshing picks.</p>' : ''}
      </div>`;
  }
  return `
    <details class="slc slc-off"${message ? ' open' : ''}>
      <summary>Connect Sleeper <span class="slc-why">— needed to read picks</span></summary>
      <form class="slc-form" data-slc="form" autocomplete="off">
        <input type="password" class="slc-input" name="token" placeholder="Paste your Sleeper token"
               autocomplete="off" spellcheck="false" aria-label="Sleeper token">
        <button type="submit" class="btn slc-btn">Save</button>
      </form>
      ${message ? `<p class="slc-msg" role="alert">${esc(message)}</p>` : ''}
      <p class="slc-help">
        On a computer: sleeper.com → F12 → Network → filter <code>graphql</code> → reload →
        click a row → Request Headers → copy <strong>authorization</strong>.
        Stays in this browser only. It works like your password — don't paste it anywhere else.
      </p>
    </details>`;
}

export function mountConnectBoxes(root = document) {
  for (const el of root.querySelectorAll('[data-sl-connect]')) {
    el.innerHTML = boxHtml();
    if (el.dataset.slcWired) continue;
    el.dataset.slcWired = '1';
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-slc="clear"]')) clearToken();
    });
    el.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = el.querySelector('.slc-input');
      try {
        saveToken(input?.value);
      } catch (err) {
        el.innerHTML = boxHtml(err.message);
      }
    });
  }
}

window.addEventListener('sleeperauth', () => mountConnectBoxes());
