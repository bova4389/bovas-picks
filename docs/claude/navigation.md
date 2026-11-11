# Navigation — Bova's Picks reference

Moved verbatim out of `CLAUDE.md` on 2026-11-11 so it loads only when needed. "Below" and "above" in this file can point to a section that now lives in another `docs/claude/` file; grep the folder for the heading.

## Navigation — Two Levels, One Model

The site covers **two different games**, so the nav says so. `js/app.js` holds a `GROUPS` /
`PANELS` model and writes **both** rows from it; `index.html` holds only the panels.

| Row 1 (the pool) | Row 2 (views inside it) |
|---|---|
| **Schedule** | *(none — it belongs to neither pool and is read from both)* |
| **Season Long** | Pick Sheet · Standings · Odds · Recommend · Infinity War · Lookback |
| **Survivor** | Grid · Odds · Planning · Picks · Standings |
| **Squares** | Board · Season |

Rules that keep this from rotting:

- **Squares hides both rows** — the only group that does. Its `chromeOff: true` flag makes
  `show()` put `chrome-off` on `<body>`, and the stylesheet hides the masthead, the subnav bar and
  the site footer. Those panels carry St. Jude's own banner and a club-styled footer nav instead.
  See the Squares section for why. A panel with no nav row on screen needs a way back, which is
  the `navigate` **event** `js/squaresChrome.js` dispatches and `app.js` listens for — an event
  rather than an exported `show()`, because app.js imports every tab and a tab importing it back
  would be a cycle. It is the mirror of the `panelchange` event app.js already dispatches
  downward: one direction each way.
- **Squares carries no Odds tab, and that is not a violation of "odds are not siloed."** That rule
  is about never rebuilding the join. Here there is nothing to join: a moneyline prices who wins,
  and a squares payout turns on the last digit of a score, which no market on this site quotes.
  Showing a favorite beside a board would imply a connection that does not exist.

- **Standings is two panels, not one reached twice** (split 2026-09-14). `standings` is Season
  Long's (Mike's pick'em) and `survivor-standings` is Survivor's (Mike's suicide pool); both are
  drawn by `js/standings.js` in a different `mode`. While it was one shared panel it rendered
  both pools on both rows. `MOVED` in `app.js` sends an old `#survivor/standings` bookmark to
  the survivor panel instead of letting `fromHash()` re-home it to Season Long by name.
- **Odds is one panel reached from two rows — not two copies.** Every panel is booted once at load
  and shown or hidden after that, so crossing rows never re-renders and never drops a half-filled
  pick sheet. Adding a third route to a panel is one line in `GROUPS`.
- **The Grid is Survivor-only** (changed 2026-08-14). It sat under both rows until then. Everything
  it actually answers — which weeks a team can still be spent in, what is left after the teams
  already used, how far ahead a run of good spots runs — is a survivor question; the straight-up
  pool is played one week at a time and is served by Pick Sheet, Odds and Recommend. Listing it
  twice implied two tools. Don't add it back to `season` without a reason that isn't "it's useful
  there too".
- **A two-level hash whose panel has since moved is re-homed, not discarded.** `fromHash()` keeps
  the panel half and finds a group that still carries it, so a bookmarked `#season/grid` lands on
  `#survivor/grid` rather than dumping the user on Schedule. That is what makes moving a panel
  between rows a safe edit.
- **The rows must not look alike.** Row 1 is pills on the purple field, row 2 is underline tabs on
  the paper below it. The old single row of seven peers gave no clue which game any tab belonged
  to, which is the whole reason this exists.
- **Neither row uses the old "active tab merges into the page" seam.** That only works when every
  group has a second row to hang the seam on, and Schedule has none.
- **A new season-long league (e.g. the confidence pool) is a control inside its views, not a new
  top-level tab** — the same way the three survivor pools are a switcher inside the Grid, per
  `js/survivorLeagues.js`. Row 1 stays the size of the *kinds* of game, not the count of leagues.
- **Hashes carry both levels** (`#survivor/grid`), so a reload returns to the row you were using.
  The bare legacy form (`#recommend`) still resolves, to the first group that carries that panel.

**Odds are not siloed in the Odds tab.** Any tab that lists matchups shows the favorite inline —
Pick Sheet does this now, and it's a requirement (not a nice-to-have) for the Survivor grid and
Lookback when they're built. The reusable half of this is `js/oddsMatch.js` (pure data: join a
`{away, home}` game to an odds event, oriented probabilities) and `js/oddsBadge.js`
(`favoriteLine(game, ev)` → a text fragment like `` Jaguars <strong>85%</strong> ``, or `''`
if there's no market line — callers treat `''` as "render nothing").

**Use `buildSeasonOddsIndex` / `matchSeasonOdds`, never `buildOddsIndex`.** `getOddsSnapshot()`
returns **all 272 games at once**, and the pair-only index collapses both meetings of every
division rivalry into whichever was written last — 96 games affected. Every tab now uses the
season join:

```js
import { getOddsSnapshot } from './data.js';
import { buildSeasonOddsIndex, matchSeasonOdds } from './oddsMatch.js';
import { favoriteLine } from './oddsBadge.js';

const snapshot = await getOddsSnapshot();               // null-safe, never throws
const seasonIndex = snapshot ? buildSeasonOddsIndex(snapshot.events) : null;
// per matchup, and the game needs a `date`:
const ev = matchSeasonOdds({ away, home, date }, seasonIndex);
favoriteLine(game, ev);   // '' means don't render anything
```

**This section used to print the `buildOddsIndex` version, and the Pick Sheet was built from it.**
The result was live for the whole 2026 preseason: the sheet named **Denver** the favorite in the
Week 1 Broncos-at-Chiefs tiebreaker game, reading the **November 1** line where Denver is at home.
Fixed 2026-09-09. `buildOddsIndex` now has **no callers** and is kept only because a genuinely
one-week set of events is still a valid thing to index; reach for it only when you can prove your
event list is one week.

**`favoriteLine()` takes the matched event, not an index** — for exactly this reason. Deciding the
join belongs to the caller, which is the only party that knows what its event list spans.

**A number-map game has no kickoff on it** (the workbook prints only a day name), so a tab
rendering the number map has to bridge through the schedule to get a date the join can use.
`kickoffIndex(schedule)` in `js/oddsMatch.js` builds that bridge once — a
`"week|Away|Home"` (mascots) → ISO kickoff Map — and `kickoffFor(kickoffs, week, away, home)`
reads it. Both the Pick Sheet (`oddsFor()`) and Recommend (`slateFor()`, `dateForPopGame()`)
call it; **do not write a third copy.** The popularity files are dateless for the same reason
and go through the same index.

**A missing date costs every game, not just the rivalries.** `matchSeasonOdds` returns null the
moment `game.date` is falsy — it never falls back to "the only event for this pair" — so a
dateless slate resolves *no* market line anywhere. `recommend.js` read `g.date || null` straight
off number-map games, which is always null, and its whole slate came back unpriced: **0 of 209
scored games for the 2026 season.** It read as "the market has no lines yet" rather than as a
bug, which is why it outlived the Pick Sheet's louder version of the same dateless join. Fixed
2026-09-10; Week 1 now prices 14 of 14, and the season 186 of 209 (the 23 are pairs genuinely
absent from the snapshot).

**What's deliberately NOT shared: the wrapper markup.** `favoriteLine()` returns a bare text
fragment, not a component with its own container — Pick Sheet wraps it in `.game-odds` (a
grid-spanning line above its pick buttons; see `css/styles.css`), because that's what fits its
grid layout. The Survivor grid will have a different row shape and needs its own wrapper class to
match — reuse the *function*, not `.game-odds` itself. Do not build a new odds-matching join for
Survivor/Lookback; do not duplicate `js/oddsMatch.js`'s logic inline in those tabs either.

**Cache busting:** `index.html` versions `css/styles.css` and `js/app.js` with `?v=YYYYMMDD`.
`js/data.js` and `js/picksheet.js` are imported *by JS*, never referenced from HTML, and
`data.js` holds module state — **never put a query string on it.** A versioned and an unversioned
import are two separate module instances with separate state; that exact mistake took the Majors
site down on U.S. Open launch day. Bump the CSS/app version with a letter suffix on same-day edits
(`20260810` → `20260810b`).

Hosted on **GitHub Pages** (no domain), so `.htaccess` cache headers do not apply here — the query
strings are the only layer. If this later moves to DreamHost, add the `.htaccess` per the workspace
CLAUDE.md.

**The gap that leaves, and it is real:** an unversioned shared module can be served stale while the
versioned entry point next to it is fresh. Bumping `app.js?v=` gives the browser a new URL, so the
new code loads immediately — but `js/teamIdentity.js` and friends have no query string, and GitHub
Pages serves them with its own `max-age`. **Add an export to a shared module and deploy it in the
same push as a caller that imports it, and some visitors get the new caller against the cached
module: `does not provide an export named 'x'`, and a blank page until the cache expires.** Hit
during the Squares build on 2026-09-08 when `contrastRatio` was added to `teamIdentity.js`.

Do **not** "fix" this by versioning the shared module — that is the module-identity outage the note
above describes, and these files hold state. The window is bounded (Pages' max-age, ~10 minutes)
and it self-heals. What helps:

- **A new export is a two-deploy change when it matters.** Push the shared module first, let it
  propagate, then push the caller. Only worth the ceremony for something on a live game day.
- **Locally, a reload is not enough** — Chrome holds the module. `fetch(path, {cache:'reload'})`
  from the console, then reload, or hard-reload with Ctrl+Shift+R.

**Design language** models Grant Thornton's site: `#4F2D7F` purple as the brand field, **light
display weights** (their h1 is weight 200 — ours matches), warm neutrals rather than cold greys
(`#44423F` ink on `#F2F0EE` paper), 20px card radii, `#A06DFF` violet and `#00838F` teal as
accents. Type is **Outfit** from Google Fonts — the closest free geometric match to their
proprietary GT Walsheim, and it has the light weights the look depends on.

Design constraints that are load-bearing, not preference:
- **Mobile is the primary surface.** Picks get made on a phone on Saturday. Every tap target is
  ≥46px; team names are tuned so none wrap at 375px across all 15 weeks.
- **Contrast is verified, not eyeballed.** All text ≥4.5:1. The AWAY/HOME label needed a bespoke
  `#5F5C58` because `--ink-faint` measured 2.65:1 there.
- Game rows use `minmax(0,1fr)` not `1fr`, or the two team buttons render unequal widths.
- **Page padding is written as `main.wrap`, never bare `main`.** `<main>` carries the `.wrap`
  class, and `.wrap { padding: 0 20px }` outranks an element selector on specificity no matter
  where it sits in the file — so a bare `main { padding: 28px 0 96px }` was silently overridden
  and every tab's heading sat flush against the nav for months. Same trap applies to `footer.wrap`.
- **`.section-head` aligns `flex-start`, not `baseline`.** With `baseline`, a `.pill` in the
  right-hand slot aligns its own baseline to the eyebrow's and pushes the whole left block down
  ~7px, so the tabs that carry a pill (Grid, Odds) sat lower than the ones that don't.

**Local dev** (fetch is blocked on `file://`, so it must be served):

```bash
python -m http.server 8765
```

Run it from the repo root, `C:\Users\bovac\code\bovas-picks`. A session's `.claude/launch.json`
can define it as the `pickem` preview server.
