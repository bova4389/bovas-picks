/* ==========================================================================
   Season guard — the rendering half.

   js/season.js decides whether the feeds agree; this turns that verdict into
   the banner a tab shows instead of numbers. Same split as
   oddsMatch.js / oddsBadge.js: pure data on one side, HTML on the other, so
   the rule can be unit-reasoned without a DOM and reused by any tab.

   TONE MATTERS HERE. This banner appears in place of a working tab, so it has
   to say what is wrong, why the numbers are being withheld, and what makes it
   go away. "Season mismatch" alone would just read as a bug.

   NEVER add a ?v= to this file — see data.js's note on module identity.
   ========================================================================== */

/**
 * Banner HTML for an audit, or '' when everything agrees.
 *
 * Callers treat '' as "render nothing", exactly like oddsBadge's favoriteLine.
 * Errors and warnings render together — a tab blocked by a mismatch usually
 * also has a missing feed worth mentioning in the same breath.
 */
export function seasonBanner(audit, { context = '' } = {}) {
  if (!audit || audit.ok) return '';

  const errors = audit.problems.filter((p) => p.level === 'error');
  const warns = audit.problems.filter((p) => p.level === 'warn');

  const kind = errors.length ? 'notice notice-bad' : 'notice';
  const heading = errors.length
    ? `Not showing ${context || 'this'} — the data doesn't line up.`
    : `Waiting on ${audit.season} data.`;

  return `
    <div class="${kind}">
      <strong>${escape(heading)}</strong>
      <ul class="issues">
        ${[...errors, ...warns].map((p) => `<li>${escape(p.message)}</li>`).join('')}
      </ul>
      ${errors.length ? fixHint(audit) : ''}
    </div>`;
}

/** True when a tab must not render computed numbers. Thin wrapper, but it
 *  keeps `audit.blocking` from being spelled three different ways. */
export function isBlocked(audit) {
  return Boolean(audit?.blocking);
}

function fixHint(audit) {
  return `
    <p class="notice-hint">
      The Schedule and Odds tabs read a single feed each, so they are unaffected
      and still accurate. This view combines feeds, which is why it stops.
      It comes back on its own once the ${escape(audit.season)} files are in
      <code>data/</code>.
    </p>`;
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
