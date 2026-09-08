/* ==========================================================================
   Squares — the club's chrome. Shared by the Board and Season tabs.

   WHY THIS IS A MODULE AND NOT TWO COPIES OF SOME MARKUP: the banner is the
   one thing on the page that is not ours. It carries St. Jude Indy's logo,
   their crimson, and the attribution line that says why we are entitled to
   render either. Two hand-written copies would drift, and the half that
   drifted would be the half nobody re-read — which here is a wording that
   makes a claim about somebody else's marks.

   IT IS ALSO THE SEAM. The Squares tabs are built to lift out of this site
   whole and go back to the club as their own thing, so everything that makes
   them look like the club rather than like Bova's Picks lives either here or
   under `.sq-theme` in css/styles.css. Nothing else in js/ knows the parish
   exists.

   THE LOGO IS SERVED FROM assets/stjude/, NOT HOTLINKED from the parish CDN.
   A hotlink breaks the moment they redeploy, and it reports every page view
   of a private pool tool to their host, which is neither our business to send
   nor theirs to receive.

   NEVER add a ?v= to this file — see js/data.js on module identity.
   ========================================================================== */

const LOGO = 'assets/stjude/saint-jude-parish.png';

/**
 * The masthead: white logo plate, gold rule, crimson bar.
 *
 * That stacking mirrors stjudeindy.org and is also the only arrangement that
 * works — the logo art is crimson-and-gold with a transparent ground, so
 * reversing it onto the crimson bar erases the wordmark. The obvious-looking
 * layout is the wrong one here.
 *
 * `subtitle` names the view (Board, Season), so the two tabs share a banner
 * without pretending to be the same page.
 *
 * The title is an `h1`. On these panels the site's masthead is hidden (see
 * `chromeOff` in js/app.js), which takes the page's only other h1 with it --
 * so this is not a second one competing with the brand, it is the document's
 * heading for as long as the club's pages are on screen.
 */
export function clubBanner({ pool, subtitle, season }) {
  return `
    <header class="sq-banner">
      <div class="sq-banner-plate">
        <img class="sq-banner-logo" src="${LOGO}"
             alt="Saint Jude Catholic Church &amp; School" />
        <p class="sq-banner-org">
          Indianapolis, Indiana<br />Men&rsquo;s Club
        </p>
      </div>

      <div class="sq-banner-bar">
        <h1 class="sq-banner-title">${escape(pool)} &middot; Football Squares</h1>
        <span class="sq-banner-sub">${escape(season)} &middot; ${escape(subtitle)}</span>
      </div>

      <p class="sq-banner-note">
        An unofficial tracker for the ${escape(pool)} squares board. Parish and
        NFL marks are used to identify the pool and its games; neither is
        licensed here.
      </p>
    </header>`;
}

/**
 * Put a panel into the club's theme.
 *
 * One class rather than a stylesheet swap, because both Squares panels are
 * booted at load and merely shown or hidden like every other panel on this
 * site — there is no navigation event to hang a theme switch on, and adding
 * one would make the tabs re-render on every visit.
 */
export function applyClubTheme(root) {
  root.classList.add('sq-theme');
}

/* ── The footer nav ───────────────────────────────────────────────────────
   With the masthead and the underline row hidden, these panels would have no
   way out. The nav comes back at the bottom, in the club's colors, split into
   the two questions it answers -- which view of this pool, and how do I get
   back to the rest of the site -- because those are not peers and a single
   row of five would imply they were.
   ------------------------------------------------------------------------ */

/** Row 1 of the host site, minus Squares itself. Kept in step by hand with
 *  GROUPS in js/app.js; a mismatch costs a dead link, not a broken page. */
const HOST_GROUPS = [
  { id: 'schedule', label: 'Schedule' },
  { id: 'season', label: 'Season Long' },
  { id: 'survivor', label: 'Survivor' },
];

const VIEWS = [
  { panel: 'squares-board', label: 'The board' },
  { panel: 'squares-season', label: 'The season' },
];

/**
 * The club-styled navigation that replaces both hidden rows.
 *
 * `panel` is the caller's own panel id, so the active view is marked without
 * this module having to ask anything about application state.
 */
export function clubNav(panel) {
  const views = VIEWS.map((v) => `
    <button class="sq-nav-btn${v.panel === panel ? ' is-active' : ''}"
            type="button" data-nav-group="squares" data-nav-panel="${v.panel}"
            ${v.panel === panel ? 'aria-current="page"' : ''}>${v.label}</button>`).join('');

  const host = HOST_GROUPS.map((g) => `
    <button class="sq-nav-btn is-host" type="button"
            data-nav-group="${g.id}">${g.label}</button>`).join('');

  return `
    <nav class="sq-nav" aria-label="Squares navigation">
      <div class="sq-nav-block">
        <p class="sq-nav-label">This pool</p>
        <div class="sq-nav-row">${views}</div>
      </div>
      <div class="sq-nav-block">
        <p class="sq-nav-label">Back to Bova&rsquo;s Picks</p>
        <div class="sq-nav-row">${host}</div>
      </div>
    </nav>`;
}

/**
 * Wire the footer nav once, on the panel root.
 *
 * Delegated from the root rather than bound per button, because both tabs
 * rewrite their innerHTML on every render and per-button listeners would
 * survive exactly one repaint — the same trap the two nav rows in js/app.js
 * document.
 */
export function wireClubNav(root) {
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-nav-group]');
    if (!btn) return;

    document.dispatchEvent(new CustomEvent('navigate', {
      detail: { group: btn.dataset.navGroup, panel: btn.dataset.navPanel || null },
    }));
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
