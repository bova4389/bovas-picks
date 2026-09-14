/* ==========================================================================
   Lock / Unlock — so a submitted card cannot be changed by a stray tap.

   Used by the Pick Sheet (season long) and the Picks tab (survivor). Per week,
   so locking Week 1 leaves Week 2 open. Added 2026-09-14 at the owner's
   request.

   RULES, each with a reason:

     * The DEFAULT is locked once the week's card is in data/picks-sent-<year>.json
       -- it has actually been emailed -- and unlocked before that. The default
       is right without anyone remembering to press anything.
     * A tap overrides the default and is remembered on this device
       (`picks:lock:<year>:w<N>`, `survivor:lock:<year>:w<N>`), so unlocking a
       sent week to fix a typo stays unlocked through a reload.
     * The lock guards EDITING ONLY. It must never stop a tab re-rendering,
       polling scores, copying the message, or recomputing a recommendation:
       a locked card still has to show what happened to it.
     * Unlocking is one tap with no confirm dialog. The failure being
       prevented is a thumb brushing a phone, not a determined edit.

   Imports nothing. NEVER add a ?v= to this file -- see data.js's note on
   module identity.
   ========================================================================== */

const KEY = {
  picks: (season, week) => `picks:lock:${season}:w${week}`,
  survivor: (season, week) => `survivor:lock:${season}:w${week}`,
};

/**
 * Whether a week is locked.
 * @param {'picks'|'survivor'} kind
 * @param {boolean} byDefault  locked when nothing has been tapped on this device
 */
export function isLocked(kind, season, week, byDefault) {
  try {
    const v = localStorage.getItem(KEY[kind](season, week));
    if (v === 'locked') return true;
    if (v === 'unlocked') return false;
  } catch { /* unreadable storage: fall back to the default */ }
  return Boolean(byDefault);
}

export function setLocked(kind, season, week, locked) {
  try {
    localStorage.setItem(KEY[kind](season, week), locked ? 'locked' : 'unlocked');
  } catch { /* private browsing: the lock still works until reload */ }
}

/** The toggle, plus a plain-words state beside it. `data-lock-toggle` is how
 *  both tabs find it. */
export function lockControl(locked) {
  return `
    <span class="lockctl${locked ? ' is-locked' : ''}">
      <button type="button" class="btn ${locked ? '' : 'btn-ghost '}lockctl-btn" data-lock-toggle
              aria-pressed="${locked}">${locked ? 'Unlock' : 'Lock'}</button>
      <span class="lockctl-note">${locked ? 'Locked — picks can’t be changed' : 'Editing'}</span>
    </span>`;
}
