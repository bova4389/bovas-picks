# Squares — Bova's Picks reference

Moved verbatim out of `CLAUDE.md` on 2026-11-11 so it loads only when needed. "Below" and "above" in this file can point to a section that now lives in another `docs/claude/` file; grep the folder for the heading.

## Squares — Read Before Changing Any Color

Built 2026-09-08 for the **St. Jude Men's Club** board: 100 squares at **$250**, **$275** to every
quarter of every Colts game, **18 weeks**. `js/squares.js` (Board) and `js/squaresLedger.js`
(Season) over `js/squaresModel.js` (pure math), the same split as `grid.js` / `gridModel.js`.

**All 18 weeks are already wired** in `data/squares-2026.json` from the committed schedule. Week 13
is the Colts' bye, and the pool grades that week on the Monday nighter — **DAL @ SEA, Mon Dec 7**,
carried as `substitute: true` with the real `gameId`. Nothing about the bye is inferred at render
time.

### The redraw is the whole game — do not build strategy on top of it

The names are fixed for the season; **the ten digits on each axis are redrawn before every game.**
So every square is dealt eighteen independent pairs and **all 100 are worth exactly the same over a
season.** There is no good square to chase and no bad one to regret. A single week is wildly
uneven — a 7 and a 0 is a great draw, a 2 and a 5 is a dead one — but nobody owns either.

Consequences that constrain the code:

- **Nothing scores, ranks or projects a square.** The only honest per-square number is "here is
  what you drew this week", and both tabs say exactly that. `ledger()` reports what *has* happened
  and what is still in the pool; it must never grow a per-square forecast.
- **`economics()` states the rake out loud.** $25,000 in, $19,800 out, **$5,200 (20.8%) to St.
  Jude**; a square is worth $198 of a $250 buy-in. This is a charity board and the shortfall *is*
  the donation — that belongs on the page, not buried.
- **`liveOutlook()` lists ONE score by ONE team**, never multi-score sequences. With ten digits an
  axis some combination reaches almost any square, so the full list says nothing; during a game the
  only useful question is what the *next* score does.

### Quarter scores: the one piece of new plumbing

`js/espn.js` now carries `awayLine` / `homeLine` — points scored **in** each period, which is how
ESPN sends it. The running end-of-period totals are derived in `squaresModel.js`, not baked in,
because Squares is the only consumer.

- **`periodClosed()` reads the status *text*, not just the period number.** ESPN leaves `period` at
  2 for the whole of halftime, so the clock alone calls the half unfinished right up until the
  second-half kickoff — which is exactly when a halftime payout is being looked up. ESPN writes
  "Halftime" and "End of 1st" itself; that is the tiebreaker.
- **Closed and reported are separate conditions.** The committed schedule carries final scores but
  no period breakdown, so a week ESPN cannot serve still grades its **Final** and simply has no
  quarters. Never collapse the two.
- **`overtime` is a config flag**, `'final'` or `'regulation'`, because pools split on whether the
  last payout lands on the score the game ended on or the score at the end of the fourth.
  **St. Jude uses `'final'` — confirmed by the user 2026-09-11.** The fourth payout is the score the
  game ends on. In an overtime game the end-of-fourth score is ignored entirely and pays nothing;
  only the final score after overtime pays. There are four payouts, never five.

**Finished weeks get frozen into `data/squares-<year>.json`** via `result`, and `frozenGame()`
rebuilds them. That is what makes the ledger permanent and offline-capable rather than dependent on
ESPN still serving a week from October — the same reason the Majors pool hardcodes a tournament
once it is over. The live path stays authoritative only for the week in progress.

**`scripts/freeze_squares.py` does the freezing, every Tuesday** (added 2026-09-27, a step in
`fetch-schedule.yml`). It was meant to be a hand step and never happened: Weeks 1–2 sat at
`"result": null`, the Season tab loaded only the *current* week live, and it showed no winners at
all. Three rules in it: it freezes only a game ESPN marks completed whose per-period points sum to
the final (a half-reported box score would pay the wrong squares forever); it never rewrites a
frozen week; and it edits the file as **text**, replacing one `"result": null`, because a
`json.dump` round trip would reflow the hand-kept names board. Locally ESPN may 403 Python's
client from a home connection — the script falls back to `curl`. **The Season tab also loads any
unfrozen week up to the current one from ESPN**, so a missed Tuesday costs a fetch, never a week.

**The Board's week picker is set from `week` on every render** (fixed 2026-09-27). It was built
with no `selected` option, so it read Week 1 above the current week's board.

### The board: two bands, three channels

**The team banners are part of the grid, not cards above it.** `.sq-board-frame` spans them — the
column team runs full width above the digits, the row team runs full height down the left, no gap
and no padding anywhere, so each band's edge is the edge of the grid it names. `.sq-board-card`
carries **no padding** for that reason; any would reopen the seam.

This replaced two side-by-side cards, which was wrong rather than merely plain: it put the team
labelled *down the side* along the top, next to the one labelled *across the top*. The board
contradicted its own legend.

**Both bands are the same thickness**, held by one `--band` custom property on the frame rather
than two numbers that must be kept equal by eye. That also squares the corner cell, which is what
lets the parish emblem sit in it undistorted.

**The corner belongs to neither team.** The top band used to run on over the side band's column,
which left the row team's mark jammed under the column team's slab — two teams overlapping in the
one square that belongs to neither. Now each band starts at the corner and stops, and the corner
goes to the house: `assets/stjude/saint-jude-emblem.png`, the cross-and-sunburst cropped out of the
full lockup because the wordmark is illegible at 56px.

Four details in the band that are not decoration:

- **A mark at each end, not one in the middle.** The board scrolls sideways on a phone, so a single
  centered logo is off screen from whichever end you did not start at — and saying whose axis this
  is, is the band's entire job.
- **No "across the top" / "down the side" label.** The band's position says it. The words were
  restating the layout in the one place the layout is unambiguous.
- **A wash, not a saturated field.** At full strength the two bands were two slabs of near-black —
  Colts navy against Ravens purple read as one dark frame rather than as two teams. On a 10% wash
  the logo is itself, the name is the team's color, and the saturated hex is spent on a 3px edge
  where it works hardest.
- **`readableTeamInk()`, not `readableInkOn()`.** Black or white is the right answer on a saturated
  team field and is still what the digit bands use. On a 10% wash black is *safe* and also throws
  the team away, so the primary is mixed toward black in 5% steps until it clears 4.5:1 and no
  further. Most teams need no step; the pale ones (Vikings gold, Chargers powder) take a few and
  still look like themselves. `contrastRatio()` was exported from `js/teamIdentity.js` for it —
  "verified, not eyeballed" needs the number available to callers, not just internally.
- **The team name is text, not the wordmark art.** It has to fill the band, and a fixed-aspect
  image cannot. It takes the leftover space with `flex: 1` and a `clamp()` size; the wide
  letter-spacing is what carries a short name like Colts across the full width. **Both bands use
  the same clamp** — the side band having its own smaller one made the row team read as a
  subheading of the column team rather than its equal.

The corner is styled as a **cell**, not a panel: the board's own 3px gutter, the same corner
radius, and a 2px border in **St. Jude gold** — the one color on the page belonging to neither
team, so it cannot be misread as either one's axis. `--band` is 50px specifically so that the
corner's inner box lands at 44px, which is exactly the width of the board's digit column. At 56px
it read as a slab parked beside the table instead of the table's own top-left cell.

**A cell has three independent states and each gets its own CSS property.** A square can be all
three at once — yours, one that took the half, and one the live score has just come back to:

| State | Channel | Color |
|---|---|---|
| Your square | **wash** + 1px border | crimson (the club's, because this cell is about you) |
| Won a quarter | **3px border** | gold — the only heavy border on the board |
| Score right now | **outline**, offset, pulsing | charcoal — the third club color, nothing else uses it |

Any two of them sharing a property would mean the rarer combination silently disappears, and the
rarest combination — your square, live, having already won a quarter — is the one anybody would
most want to see.

**The legend always renders all three keys.** It was conditional at first — the live key only
during a game, the "your square" key only once a square was recorded, on the reasoning that a key
for a state nothing is currently in is one more thing to read past. That was wrong in the way
legends usually are: a key you only ever see at the moment you needed to already know it is a key
nobody has learned. The legend describes the board's vocabulary, not its current state, and the
quiet Tuesday is when there is time to read it. Do not make it conditional again.

### Marks are sized per team — `markBox()`, not a CSS box

**Every team logo is a 500×500 canvas, and the artwork inside them is not the same shape.** The
Steelers mark fills 462×462 of its canvas; the Seahawks 462×206. Rendered at one fixed size the
visual mass spans **2.24×** across the 32 — which is what "the Ravens logo looks smaller than the
Colts" actually was.

**A CSS box cannot fix this, and trying is the trap.** Because the canvas is square,
`object-fit: contain` binds on the same dimension for all 32 no matter what box you give it — a
wider box changes nothing at all. Only sizing the *image* per team does.

`scripts/measure_logo_trim.py` measures each mark's visible bounding box into
`data/teams/logo-trim.json`; `markBox(team, area)` in `js/teamIdentity.js` turns that into the
square pixel size at which a mark's artwork covers `area` square pixels. **Area, not height or
width** — "looks the same size" tracks how much ink is covered, not edge length. Squares asks for
600, clamped to 20–40px, which brings the spread to **1.07×**.

It is a *hint*, never a crop: nothing modifies the images, so every tab that does not read it is
unaffected.

**`readableTeamInk()` lives in `js/teamIdentity.js` alongside it**, and is the counterpart to
`readableInkOn()` rather than a replacement. On a *saturated* team field the only safe answers are
black and white, which is what `readableInkOn()` picks. On a pale *wash* of the team's color black
is safe too — and throws the team away, so `readableTeamInk()` mixes the primary toward black in 5%
steps until it clears the target and no further. Verified across all 32 at 4.5:1 on a 10% wash: 23
teams keep their exact brand hex, and nine pale or bright ones (Chargers powder, Saints old gold,
Dolphins teal, Browns orange, Lions, Panthers, Chiefs, Titans, Bengals) take a step or two and
still read as themselves. The Grid, Schedule, Odds and Recommend tabs all still size marks with a fixed box and
carry the same inconsistency; adopting `markBox()` there is a safe, self-contained improvement
whenever those are next touched.

**Re-run the script after any asset refresh** (`scripts/fetch_team_assets.py`,
`scripts/build_team_identity.py`) — a rebrand that changes a logo's proportions changes its
correct size, and the stale hint would size the new art wrongly.

### The matchup card — short on purpose, and it carries the clock

It sits between the banner and the board, so **every pixel of it is a pixel between the reader and
the 100 squares they came for**. It runs ~132px, down from ~220px: the marks shrank, the logo and
wordmark share one line, and the score lost a size step it did not need at that width.

The middle column has **one shape and a fixed width for all three states**, so the card does not
resize under your thumb when a live poll lands:

| | badge | line 2 | line 3 |
|---|---|---|---|
| Before kickoff | `AT` | kickoff, day over time | network |
| Live | `Q3` (pulsing, crimson) | **game clock**, the loud element | network |
| Final | `F` (charcoal) | ESPN's own final text | — |

**All three panels share one explicit row rhythm** (`.sq-matchup-grid > *` is a grid with fixed
`grid-template-rows`), rather than three flex columns each centring their own contents. Flex
centring is only equivalent while the contents are the same height, and they stopped being the same
height the moment marks began to be sized per team: a 38px Ravens shield beside a 27px Colts
horseshoe pushed one column's score and axis pill below the other's. The pills are what the eye
tracks across the card, so that drift is immediately visible. Explicit rows mean the three panels
cannot come apart again whatever goes in them.

`periodLabel()` reads **Half** off the status text rather than the period number, for the same
reason `periodClosed()` does in the model: ESPN leaves `period` at 2 for the whole break. `OT` is
period 5+.

**The network comes from the live ESPN payload only.** `scripts/fetch_schedule.py` does not capture
`broadcasts`, so the committed file has none and the chip is blank until the scoreboard has been
fetched at least once. Verified working 2026-09-08: Week 1 Ravens at Colts returns `CBS`.

**Late-season flex games genuinely have no network assigned**, and the chip says `Network TBD` in a
dashed outline rather than rendering nothing. That is deliberate — it is the cue to re-check, not a
rendering failure. **Weekly routine: glance at the network chip when the week's board is set.** If
it still reads TBD by game week, the game has not been picked up by a broadcaster yet, which is a
fact about the schedule and not a bug to chase.

**Team chips on the Season tab use the same wash**, added 2026-09-08. They were solid brand at full
saturation, which put eighteen rows of near-black slabs down the left of the table and buried the
abbreviations — worse the darker the team. Wash, team-colored type, team-colored 1px edge, and the
mark sized by `markBox()` at a smaller target area. The two tabs now agree about what a team looks
like, which they did not when one used washes and the other saturated fills.

**The row header is a flex line inside the cell, and both of its fixed sizes are load-bearing.**
Inline children align on their *baselines*, which is only the same thing as aligning them
centre-to-centre while they are all the same height — and they stopped being the same height the
moment chips began sizing their marks per team. A 22px Ravens shield and a 15px Colts horseshoe put
their two chips at different heights, and the shorter "No draw" pill sat lower than both. So:

- **The chip has a fixed height** (28px), so a per-team mark size cannot change its box, and the
  mark sits in a fixed 22px slot inside it.
- **The chip has a fixed min-width** (74px), so a two-letter abbreviation and a three-letter one
  occupy the same space. That is what puts the `@` and every flag after it at the same x on all
  eighteen rows — the column alignment you only notice by looking *down* the table rather than
  across one row of it.
- **The flex goes on an inner `<span>`, never on the `<th>`.** `display: flex` on a table cell takes
  it out of the table's internal layout — the same trap the Grid tab documents for `.gteam-in`.

Verified: every week number, chip, flag and score cell centres to within 0px of its row's centre
line, all 36 chips render at exactly 74px, and row heights are uniform.

*Known soft spot, not a defect:* the lightest artwork in the set (Steelers at 0.65 mean luminance,
Chiefs at 0.63) reads a little quietly on a pale wash. Nothing disappears — no logo in the set is
uniformly light, they all carry internal contrast — and it was no better on the saturated chips,
where Pittsburgh's gold sat on Pittsburgh's gold. If it ever needs solving, the fix is a white
plate behind the mark, not a return to saturated chips.

### The week changeover — 6pm Wednesday, not the NFL's rollover

`defaultWeek()` holds a week on screen **until 6pm the Wednesday after its game**, then flips to
the next. **It was 2pm until 2026-09-14**, when the owner put every pool page on one 6pm clock: the
rule now lives in `js/poolWeek.js` (`cutoverFor()`, `poolWeek()`), shared with both Standings
panels, and `squaresModel.js` imports and re-exports `cutoverFor` rather than keeping a copy. `currentWeek()` in `gameState.js` deliberately is **not** used here: it rolls over a few
hours after an NFL week's last game, which is right for a schedule and wrong for a pool — it would
replace Sunday's settled board with next week's empty one before anybody had looked at what they
won. The board turns over midweek and is ready before Thursday.

**The 36-hour tail in `cutoverFor()` is what makes one rule cover every kickoff slot.** Measured
from a Sunday afternoon game it lands early Monday, so the cutover is that same week's Wednesday;
measured from a Monday nighter — which is exactly what the Colts' bye week grades on — it lands
Wednesday morning, so the cutover is that evening rather than eight days later. Without it a
Monday game needs a special case, and the one week that needs it is the one nobody would remember
to test. Verified against the real 2026 file on 2026-09-14: Week 1 (last game Mon Sep 14, 8:15pm)
holds through Wed Sep 16 17:59 and flips to Week 2 at 18:01; a Monday-night week and a Sunday-only
week the same weekend both flip the following Wednesday at 6pm. Squares at Wed 3pm still shows the
old week.

Local time throughout, deliberately: "Wednesday at 6" means the clock on the phone of whoever is
looking, which for everyone using this is Eastern.

### Polling — already the conservative version, do not replace it with load-once

The board polls ESPN **every 30s, and only while all of these hold**: the panel is the visible one,
the browser tab is not backgrounded, and the game is either live or within ten minutes of kickoff.
Outside that window it makes **no requests at all** — a Tuesday visit costs one fetch. There is
also a manual **Refresh score** button, and a freshness line beside it reading `Scores as of 3:47
PM`, or `Committed schedule` when there is no live layer at all so an ESPN outage reads as an
outage rather than as a stale time.

Replacing this with load-once-plus-a-button was considered and **rejected**: the live square
highlight is the feature, and a highlight that only moves when someone remembers to press a button
is a highlight that is usually wrong. Wrong is worse than absent here, because you would act on it.
The endpoint is keyless, public and free (see `js/espn.js`), so the cost of the poll is a few
requests an hour on three afternoons of the week.

### The theme is St. Jude's, not this site's — and the scoping is the point

**Everything visual is scoped under `.sq-theme`** in `css/styles.css`, and the club's banner,
theme hook and footer nav all live in `js/squaresChrome.js`. Nothing else in `js/` knows the parish
exists. That is not tidiness: **these tabs are built to lift out whole and go back to the club as
their own product**, so they must leave as St. Jude's thing rather than as a purple page with a
logo dropped on it. Two rules enforce it — no rule in the block may match outside `.sq-theme`, and
nothing in it may reference a token from the site's `:root`.

Palette sampled from [stjudeindy.org](https://www.stjudeindy.org/), **contrast measured, not
eyeballed**, same bar the rest of the site holds:

| | |
|---|---|
| white on crimson `#BE1F24` | **6.16:1** — the banner bar, buttons |
| crimson on white | **6.16:1** — headings, emphasis |
| charcoal `#404041` on white | **10.36:1** — body copy |
| ink `#333` on gold `#D8A941` | **5.82:1** — gold chips carry DARK text |
| **gold on white** | **2.17:1 — FAILS** |

That last row is load-bearing: **gold is never type on white.** It is a rule, a fill or a border,
and where it must carry words the words are `--sq-ink` (or `#7A5B12`, measured at 5.68:1 on the
gold wash). Their own site uses it exactly this way. Type is **Lato**, loaded alongside Outfit in
`index.html` for this tab alone.

Three specific decisions that look wrong until you try the alternative:

- **The banner is a white logo plate over a crimson bar, not a logo on crimson.** The parish logo
  art is crimson-and-gold on a transparent ground, so reversing it onto the bar erases the
  wordmark. The obvious-looking layout is the wrong one.
- **`.sq-theme .sq-banner-title`, not `.sq-banner-title`.** The theme's own `.sq-theme h2` rule
  sets every heading charcoal and outranks a bare class, which rendered the title at 1.68:1 on the
  crimson bar — legible enough in a thumbnail to pass a glance, and a failure everywhere else.
- **Team color is NOT part of the theme.** The matchup card, axis bands and digit headers still
  read from `js/teamIdentity.js`, because eighteen different opponents are the *content* while
  crimson and gold are the *chrome*. Repainting the Colts in crimson is the one change that would
  make every week look the same.

**The board scrolls sideways rather than shrinking to fit, and its names wrap.** Shrinking a 10 × 10
board onto a 375px phone would give each cell ~28px, where no name is readable at any size — and a
board you cannot find your own name on has failed at the only thing it does. The digit column is
pinned with `position: sticky`, and the "your square" card above carries the answer for anyone who
would rather not scroll at all.

**Names wrap and are never cut off** (changed 2026-09-11). They used to be one line with an
ellipsis, which on a phone cut all 100 to "John …" — scrollable and still unreadable. `.sq-name` now
wraps at spaces and sizes itself off the board's visible width (`100cqi` of `.sq-board-scroll`, a
size container), clamped 10px–13px. The formula and the column minimums (68px, and 66px on a phone)
are **measured** so the longest word on the 2026 board, "Steinbrenner", fits one line at the 10px
floor; `overflow-wrap: break-word` is only a last resort. **If a longer surname joins the board,
re-measure** — the arithmetic is in the comment above `.sq-name`. A won cell carries top padding so
its Q1/Q2/Q3/F chips never sit on a wrapped name.

**There is no sample mode.** A "Preview with sample data" toggle filled the board with fake names and
a seeded draw while the club's board was outstanding. It was removed 2026-09-11, at the user's
request, once the real board was in: the checkbox, the overlay code, the banner and their styles.
Do not reinstate it — an empty board (next season, before the club sends it) already renders as a
deliberate hatched blank with a note in the legend.

### The board and all 18 draws — entered 2026-09-11

The club posted every week's board at once on stjudemensclub.com, and the 100 names, all 18 draws
and `mine` went into `data/squares-2026.json` from screenshots of it. `mine` is **Matt Bova**,
`{row: 9, col: 1}` (zero-indexed). `axisConfirmed` is now `true`: the Colts are across the top on
all 17 Colts weeks, and Seattle is across the top for the Week 13 substitute.

- **Names are verbatim from the club's board, typos included** — `Joe Huber#2`, `Stephen Reitz Jr2`,
  `Ryan Deiterding #2` beside `Ryan Deitering #1`. Do not tidy them: members find themselves on the
  board by the name the club printed.
- **`Mikey Cahill #2` appears twice on the club's own board** (row 1 col 1 and row 8 col 2), and is
  left that way by the user's call. `leaderboard()` tallies by name, so those two squares share one
  line on the Season tab. That is expected, not a bug to fix.
- **Checked against the images, not just re-read.** Each image's digit bands were cropped out of the
  original screenshot and laid over the digits the site rendered, for all 360 positions.
- **The screenshots live in `St Jude Squares Images/`, which is gitignored** because they show
  members' names. They are the record to go back to if a week's draw is ever disputed.

### What is still owed

- **The digit-probability layer** — an offline script pulling quarter-by-quarter scores from past
  ESPN seasons to answer "is this week's pair live or dead", including a Colts-specific table since
  they hold an axis 17 weeks of 18. Designed, not built.
- **Pools the user runs**, imported from a filled Google Sheet. `data/squares-<year>.json` is a
  `pools` array from day one for exactly this, and both tabs render any pool generically, so this
  is an import step rather than a new tab.

### Marks

`saint-jude-emblem.png` was cropped out of the lockup **in pure stdlib Python** — there is no
Pillow here and no build step, so the PNG was decoded, unfiltered, sliced and re-encoded by hand.
The cut is measured, not guessed: the emblem and the wordmark are joined by the gold rule, so the
boundary comes from the first transparent column run in the **top third**, above that rule. If the
parish ever reissues the logo, re-crop rather than eyeballing a new one.

The parish logo is served from `assets/stjude/`, **never hotlinked** from their CDN — a hotlink
breaks when they redeploy and reports every view of a private pool tool to their host. Parish and
NFL marks are nominative use, identifying the pool and its games, and the banner says so in a
permanent line. Same footing as [`assets/teams/NOTICE.md`](assets/teams/NOTICE.md): fine in a
personal tool, not on anything sold, sponsored or advertised. **If this is ever actually handed to
the club, get their sign-off on the logo use in writing first.**
