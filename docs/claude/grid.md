# Grid Tab — Bova's Picks reference

Moved verbatim out of `CLAUDE.md` on 2026-11-11 so it loads only when needed. "Below" and "above" in this file can point to a section that now lives in another `docs/claude/` file; grep the folder for the heading.

## Grid Tab — Read Before Adding Any Highlight

The whole season as one table: 32 teams down, 18 weeks across, built from
`data/schedule-<year>.json` and painted from the odds snapshot. It replaces a hand-maintained
Excel sheet, and it is the tab that gets the most use, so the rules below exist to stop it
degrading into a swatch book.

**One paint, many marks.** A cell has one background, so exactly one *paint* is ever active —
win probability, survivor usability, or matchup type — and every background rule in `styles.css`
is scoped under a `.paint-<mode>` container class to enforce that. Everything else is a *mark*: a
border, a corner triangle, a glyph, a text line. **Any new highlight must be a mark, not a fourth
background**, unless it replaces one of the three paints outright.

**Toggles are container classes, never re-renders.** Paint, marks, zoom and the selection
crosshair are all switched by editing the class list on `.gridwrap`. Re-rendering 576 cells is
fast enough, but it drops the scroll position and the focused cell, and this grid is navigated
with the arrow keys. `renderTable()` is only for changes that alter *which* rows or columns exist.

**The table fits the page; it does not get a scrollbar of its own.** `applyFit()` measures
`.gridwrap`, divides by the number of weeks on screen, and writes `--cw` / `--ch` / `--fs` / `--tw`
as inline custom properties — which outrank the `.z0`–`.z3` classes, so *zooming is simply fit
switched off*. Rules that follow from that, all of them corrections rather than taste:

- **Two classes, not one.** `.is-fit` is what the user asked for; `.fit-ok` is whether the measured
  cells came out at least `FIT.minCell` wide. Only both together drop the scroller. 18 weeks on a
  375px phone wants 17px a cell, so there the grid keeps its scrollbar and honestly does not claim
  to fit — narrowing the week window is the fix, which is what the Weeks control is for.
- **Vertical overflow belongs to the page.** 32 rows never fit a viewport, and the old nested
  scroller meant two scrollbars fighting plus a sticky header pinned to the top of a box that was
  itself scrolled off. With `overflow: visible` the sticky header's scroll container becomes the
  window, so the week numbers pin to the top of the *screen*. Verified pinned at `top: 0`.
- **What a cell shows is keyed on measured height, not on the zoom step.** `.d-prob` / `.d-slot` /
  `.d-rest` (and `.tw-wide` for the team column's meta) are set from the geometry actually in
  force. The old `.z1 .gc-prob` selectors stopped meaning anything the moment heights were computed
  rather than picked from four. Thresholds live in `ROOM` in `js/grid.js`.
- **`ZOOM_CH` / `ZOOM_TW` in `js/grid.js` duplicate the `.gridwrap.zN` blocks in `styles.css`.**
  Deliberate — the density rules need a *number*, and a class name isn't one. Keep them in step.
- **Re-measure on a `ResizeObserver`, plus a `resize` listener, plus `panelchange`.** All three
  earn their place: the container's width changes without the window's (a page scrollbar appearing
  costs ~15px), observer callbacks are delivered at a rendering step so a non-compositing tab banks
  them, and a hidden panel measures zero — the grid boots hidden unless the hash points at it.
- **Cell widths are fractional, not floored.** Flooring 18 columns throws away up to 18px, which
  reads as the table failing to reach the edge of its own card.

**Weeks and rows are filtered by two different mechanisms, on purpose.** The Weeks select carries
both named ranges (`all`, `rest`, `ahead3`, `ahead6`) and a `from:<week>` group — one control, so a
range and a floor can never contradict each other. On the rows side, the hand-picked `hidden` list
and the standing **"Exclude my picks"** (`hideUsed`) are kept separate: the checkbox reads the pool
live, so a team spent *after* it was ticked disappears on its own. The old "Only unused" button
wrote the used set into `hidden` once and went stale on the next pick; it is gone, and reinstating
anything that copies pool state into `hidden` reinstates the bug.

**The team column carries the team's mark on an 8% wash of its own color**, the same `tintOn()`
treatment and badge size as the Schedule card, so a team looks like itself on both tabs. The wash
arrives as `--team-tint` rather than an inline `background`, because an inline background cannot be
beaten by a stylesheet and both the selection crosshair and the used-team state need to paint over
it. The flexbox lives on an inner `.gteam-in` span — `display: flex` on the `<th>` itself would
take it out of the table's internal layout and take the sticky column with it.

**The controls are three flat rows** (pickers · marks · team filter), inline labels, capped at one
line each — not the site's standard `.controls`, whose stacked label-over-input `.field`s came out
four rows tall and pushed the table below the fold on the one tab whose value is seeing everything
at once. Height came from flattening, never from shrinking tap targets: everything in there is
still ≥46px, and it is 202px on a 1280px desktop against ~300px before.

**No source pill in the header** (removed 2026-08-14). It read `271 priced · 1 modeled` — true,
unreadable without the vocabulary, and a season-wide tally nobody could act on. The market/model
distinction still matters and is still made in the only place it can be acted on: the cell, where a
modeled number wears a dotted underline, with the legend explaining it.

**The odds join is the season-wide one.** `js/oddsMatch.js`'s `buildOddsIndex` keys purely on the
team pair, which silently collapses both meetings of a division rivalry — harmless for one week's
slate, fatal here, where all 272 games are on screen and 96 of them share a pair with another
game. The grid uses `buildSeasonOddsIndex` / `matchSeasonOdds` from the same module, which key on
pair **and** kickoff. Do not add a third join.

`js/oddsBadge.js`'s `favoriteLine()` is deliberately **not** used here, and that is not a
violation of the "odds are not siloed" rule. That rule is about never rebuilding the join, and the
join is reused. `favoriteLine()` renders *the favorite*; every grid cell needs the probability
oriented to **that row's team**, including when it is the dog, which a favorite-only fragment
cannot express.

**Midnight Eastern is not a kickoff.** ESPN carries not-yet-scheduled flex games at 00:00 with no
time assigned — 24 of them in the 2026 file, all in Weeks 16-18. Read literally, every one looks
like a Sunday afternoon game and the rest-day figures either side of it are fiction.
`gridModel.js`'s `slotOf()` reports them as `TBD`, and those cells render no slot mark and no rest
figure rather than a confident wrong one.

**Rest days are a fact, not an edge.** STRATEGY.md §3 bans situational angles — revenge games,
letdown and lookahead spots — as post-hoc filtered noise. "Off a bye" painted green is the same
move wearing a lab coat. Rest is displayed as a plain number of days and left for the market
figure in the same cell to price. Do not add a lookahead/letdown/revenge mark.

**Text inside a painted cell uses the grid's own tones.** `--ink-soft` measures 5.30:1 on white
but 3.55:1 on the strongest warm paint step, and `--ink-faint` fails everywhere — the same trap
the AWAY/HOME label hit, one layer deeper. `--ink-quiet`, `--teal-ink` and `--amber-ink` were each
measured against the *worst* background they can land on and clear 4.5:1 on all seven paint steps.
Any new text in a `.gc` uses one of those.

**Where state lives** (all localStorage, all per season where it matters):

| Key | Holds |
|---|---|
| `grid:prefs` | paint, marks, fit, zoom, sort, week window, active pool, hidden teams, `hideUsed` |
| `grid:tags:<year>` | per-cell target / avoid / watch flags, keyed `TEAM\|WEEK` |
| `survivor:<year>:<pool>` | my used teams for one pool, as `week -> team` |
| `survivor:feed:<pool>:<year>` | the last fetched copy of ONE Sleeper pool (everyone's picks) |
| `infinity:<year>:<week>` | my eight picks for one Infinity War week |
| `infinity:prefs` | Infinity War's field size and spread |
| `infinity:feed:<pool>:<year>` | the last fetched copy of the Infinity War pool |
| `survivor:pool` | which pool is in play, shared with the Planning tab (see its section) |

Used teams are stored **per pool and never merged** — each pool is a different game, and a pick
that is right in a three-life pool can be wrong in a one-life pool the same Sunday. The two keys
above are separate for the same reason in miniature: one is mine and must survive a failed fetch,
the other is a copy of someone else's data that a refresh may replace whole.

**`LEAGUES` in `js/survivorLeagues.js` lists the pools that actually exist, in dropdown order** —
`Poop 2026`, `Deadpool`, `Mike's Suicide League`, then `Off`. The order is
the two played hardest, then the big one-life pool. **East Orange Squeeze was dissolved after Week 1
of 2026 and removed 2026-09-14**; its Week 1 pick stays in `data/survivor-log-2026.json` as a record,
and a device still holding it as its pool falls back on its own (see `knownLeague()` below). Pools are added as they are created;
SURVIVOR-STRATEGY.md may analyze one before it exists, which is not a reason to list it. The
Yahoo pool was listed for months without existing and was removed 2026-08-14. When a pool is
added or removed, note that `grid:prefs` outlives it: `knownLeague()` in `grid.js` resolves a
stored pool that is no longer in `LEAGUES` back to the default, because otherwise the pref
survives while the `<select>` — having no matching `<option>` — silently displays its first one,
and the grid strikes through one pool's used teams under another pool's name.

**Field scarcity now has two sources, in one shape.** Mike's pool comes from the mailed workbook
via `parse_survivor.py` into `data/survivor-<year>.json`; the Sleeper pool is fetched live by
`js/sleeperSurvivor.js`, which normalises Sleeper's answer into *that same shape* so
`fieldAvailability()` / `scarcityFor()` / `weekPickShare()` work on either without branching.
`S.feeds` in `grid.js` holds one per pool and `applyField()` points `S.field` at the active one.
A pool with no feed simply shows no share. See the Sleeper section below.

### The pick board — moved to Survivor Standings

**Moved off the Grid on 2026-09-14** (the pool's results were shown twice on the Survivor row).
It now renders inside the suicide-pool card on Survivor Standings, under the summary boxes, with a
status line per team (`Won 34–10`, `Lost`, kickoff time) passed in as `o.status` from the same
`survivorWeek()` result the boxes count. The rules below still hold.

`js/survivorPicks.js` answers "what did everyone else just spend",
which is the other half of a survivor decision and the half the tool could not show at all.

- **Only teams somebody picked are listed.** Filtered in `weekDistribution()`. In a 12-entry pool
  20+ of the 32 teams have no takers, and listing them buries the eight that carry the week.
- **The bar is scaled to the week's biggest pick, not to 100%.** A 12-entry pool spread over eight
  teams tops out near 25%, so share-scaled bars would all be stubs carrying no information the
  percentage text does not already. Longest bar = most-picked team, every week. The percent is
  printed beside it so the absolute figure is never inferred from bar length.
- **The count column is a fixed 82px, not `auto`.** Sized to content it is narrower on a row
  reading `1 entry` than on `12 entries`, which shifts that row's bar origin and widens its track
   — so two teams on the same count could draw visibly different bars. Bars that do not share an
  origin and a scale are not a chart.
- **It renders the kickoff gate rather than working around it.** Percentages are of the picks
  *visible*, which mid-week is not the pool, so the count line carries all three of `revealed` /
  `expected` / `locked` and a caveat line appears while the week is partial — and disappears once
  it is complete, because a disclaimer that never goes away is one nobody reads on the week it
  matters.
- **Embedded, it has no week selector of its own** (`o.embedded`): the Standings panel owns the
  week. Standalone, the selector offers only weeks with at least one visible pick
  (`weeksWithPicks()`). Either way the chosen week is not persisted — a remembered Week 3 would
  still be on screen in December.
- **`renderPickBoard` and `pickBoardShell` keep their old names on purpose.** The module is
  unversioned, so just after a deploy a fresh caller can meet a cached copy; importing a name the
  cached copy lacks blanks the whole site. Standings calls `renderPickBoard` into a detached
  element for that reason. `pickBoardShell` has no callers and can go in a later deploy.
- **Bar color comes from `js/teamIdentity.js`**, never a hardcoded hex, per the Team Identity
  rule. `--pb-bar` is set inline per row with a `--purple-mid` fallback for an identity that did
  not load.
- Pure render, no state and no fetching — the caller owns the feed, pool and week. That is what
  made the move off the Grid a change of mount point and nothing else.

`weekDistribution()` / `weeksWithPicks()` **replaced `weekPickShare()`**, which returned
`team -> pct` and nothing else. It was exported, never called anywhere, and could not answer the
question the board is asked first — *how many people* — so it was widened rather than duplicated.

**Not built yet, in rough priority order:** free-text notes per cell (the tags are the flag half
of that feature); ESPN team news and injury links in the detail strip; venue/neutral-site data,
which would need `scripts/fetch_schedule.py` to capture `competitions[0].venue` and `neutralSite`
— today the international slate is inferred from the 9:30am Eastern Sunday window, which catches
all six of 2026's but would miss a Friday or Saturday game abroad.
