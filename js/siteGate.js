/* ==========================================================================
   The site gate: Squares is public, everything else is behind a password.

   WHY THIS EXISTS. The Squares board gets shared with the St. Jude Men's Club
   — a hundred people who have no reason to see a survivor grid, a leverage
   ranking, or the strategy docs. Every panel used to be one click apart, and
   the Squares footer nav handed every visitor a guided tour of the rest.

   WHAT IT IS AND IS NOT, and the distinction matters more here than usual:

     IT DOES   keep the other tabs out of the nav, off the deep links, and
               un-booted — a locked visitor's browser never even FETCHES
               data/survivor-*.json, data/popularity/*, or the odds snapshot,
               so those requests are absent from the network tab rather than
               merely unrendered.

     IT DOES   NOT protect a file. This repo is public and GitHub Pages serves
               it from the repo root, so /STRATEGY.md and
               /data/raw/entries-*.json stay directly fetchable by anyone who
               types the path. A UI gate cannot change that; only moving the
               site off a public root can. Until then, treat this as a
               doorknob lock — the same framing The Other League's commissioner
               gate uses — and never put behind it something that would matter
               if it leaked.

   Storing only a SHA-256 digest keeps the password itself out of public
   source, which is worth doing if it is reused anywhere. It does not stop
   anyone with devtools, and it does not stop an offline brute force: a short
   or purely numeric password falls in seconds against a public hash, so the
   password must be a passphrase, not a PIN or a phone number.

   To change it, run this in any browser console and paste the hex below:
     crypto.subtle.digest('SHA-256', new TextEncoder().encode('your phrase'))
       .then(b => console.log([...new Uint8Array(b)]
         .map(x => x.toString(16).padStart(2, '0')).join('')));

   NEVER add a ?v= to this file — see js/data.js on module identity.
   ========================================================================== */

const SITE_HASH = '8995d94b123ba4b54f5678998d7dc6f911b3fe872dff462ef6509630d0927610';

/** sessionStorage, not localStorage: the unlock lasts for the tab and no
 *  longer. A shared laptop at the club should not stay open indefinitely. */
const KEY = 'bp_site_unlocked';

/** The one group that is always public. */
export const PUBLIC_GROUP = 'squares';

export function isUnlocked() {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    // Private browsing with storage blocked: stay locked. Failing closed is
    // the only safe direction for a gate.
    return false;
  }
}

/** Whether a nav group may be reached in the current state. */
export function isAllowed(groupId) {
  return groupId === PUBLIC_GROUP || isUnlocked();
}

/**
 * Check a password and, if it matches, unlock for this tab.
 *
 * Returns a reason string on failure rather than throwing, because every
 * failure here is a thing to show the person typing: a wrong password, an
 * empty box, or a browser that cannot hash at all.
 */
export async function unlock(password) {
  const pw = String(password || '').trim();
  if (!pw) return { ok: false, reason: 'Enter the password.' };

  let hex;
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw));
    hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    // crypto.subtle needs a secure context — https or localhost. A file://
    // open of this page cannot hash, and saying so beats "wrong password".
    return { ok: false, reason: 'This browser cannot check it here (needs https).' };
  }

  if (hex !== SITE_HASH) return { ok: false, reason: 'Not it.' };

  try { sessionStorage.setItem(KEY, '1'); } catch { /* gate holds for this view only */ }
  announce();
  return { ok: true };
}

export function lock() {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
  announce();
}

/** Tell the shell and the tabs that the gate moved, so both re-render. */
function announce() {
  document.dispatchEvent(new CustomEvent('gatechange', {
    detail: { unlocked: isUnlocked() },
  }));
}
