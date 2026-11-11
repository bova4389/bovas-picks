# Sleeper Pools — Bova's Picks reference

Moved verbatim out of `CLAUDE.md` on 2026-11-11 so it loads only when needed. "Below" and "above" in this file can point to a section that now lives in another `docs/claude/` file; grep the folder for the heading.

## Sleeper Pools — Live Feed

**Two survivor pools** (`Poop 2026` 29 entries, `Deadpool` 20 — roster counts re-read
2026-09-09; East Orange Squeeze was the third until it dissolved after Week 1) plus the
**Infinity War** pick'em are fetched straight from Sleeper by a **Refresh from Sleeper** button —
on the Grid tab for the survivor pools, in the tab itself for Infinity War. The browser calls
Sleeper and caches the answer in localStorage -- and, since 2026-09-26, a GitHub job also fetches
every pool and commits a shared copy (see **The shared feed** below), so a device with no token
still shows them.

**The transport lives in `js/sleeperApi.js`.** Endpoints, the leg-id format, the JAX/JAC fix and
**the kickoff gate** are shared by every pool the site reads. `js/sleeperSurvivor.js` and
`js/infinityFeed.js` are the two shapes on top of it — see the Infinity War section for why they
are separate files rather than one with a flag.

**Pick'em pools are not fantasy leagues in Sleeper's data model.** Their `sport` is `pickem:nfl`
and [docs.sleeper.com](https://docs.sleeper.com/) has no pick'em section at all.

**This file used to say they "never appear" on the documented user-leagues endpoint. That was
wrong, and it cost a session.** The route works — it just needs the right sport:

```
GET /v1/user/<user_id>/leagues/pickem:nfl/<year>     ← every pool, with settings
GET /v1/user/<user_id>/leagues/nfl/<year>            ← fantasy only, which is what misled us
```

That is how all four 2026 league ids were found on 2026-09-01, rather than copied out of a
browser URL bar, and it is how the next one should be. `listPickemLeagues()` in `sleeperApi.js`
wraps it. The settings it returns are also worth reading — `weekly_pick_limit`, `use_confidence`,
`use_spread` and `pickem_type` independently confirmed Infinity War's rules.

The other surfaces, all unauthenticated, all sending `access-control-allow-origin: *` (verified
2026-09-01 — the CORS header is the only reason this can be a browser button rather than a server
job):

| Surface | Gives |
|---|---|
| `GET /v1/league/<id>` | name, settings, `metadata.current_pickem_leg_id` |
| `GET /v1/league/<id>/users` | `user_id` → display name |
| `GET /v1/league/<id>/rosters` | `roster_id` → owner, `metadata.is_eliminated` |
| `GET api.sleeper.app/schedule/nfl/regular/<yr>` | `game_id` → week + matchup |
| `POST api.sleeper.app/graphql` | `get_pickem_picks_for_league(league_id, leg_id, include_tiebreaker)` |

**2026-09-13: it changed. `get_pickem_picks_for_league` (and `get_pickem_legs`) now answer
`"Unauthorized"` to every unauthenticated request** — REST still serves leagues, users and rosters,
but no pick data. The Grid's Refresh button fails, no field pick shares arrive, and my own picks
are recorded in `data/picks-sent-<year>.json` / on the Picks tab instead (see My Picks).
`scripts/log_week_card.mjs` reads the sent file before falling back to the log. (This said "do
not put a Sleeper auth token in this public repo". The owner reversed that on 2026-09-26: the
token is now the `SLEEPER_TOKEN` Actions *secret* -- encrypted, never in a file. See **The
shared feed**.)

**Resolved the same day with a per-device token — `js/sleeperAuth.js`.** Every pick query in the
schema (`get_pickem_picks_for_league`, `get_pickem_leg`, `get_pickem_legs`) was probed across all
four pools and all require a login; sending Sleeper's own web headers does not help. The endpoint
still allows any origin *and* the `Authorization` header (preflight checked), so the browser sends
the owner's own Sleeper JWT, pasted once per device into a **Connect Sleeper** box on the Grid's
live row and the Infinity War controls.

- **The token lives in that browser's localStorage (`sleeper:token`).** Never commit it and
  never write it to `data/`. It is the Sleeper password in effect. The one other copy is the
  `SLEEPER_TOKEN` repo secret the shared-feed job uses (owner's call, 2026-09-26).
- It is a JWT, so the box shows whose it is and when it expires (Sleeper's run about a year).
  `user_id` is regex-read from the payload text, not `JSON.parse`d — it is an 18-digit bare number
  and would round into someone else's id.
- An `unauthorized` answer is turned into an instruction: connect, or paste a fresh token.
- The kickoff gate is unchanged: a login shows the same early picks the API always leaked.
- A successful Infinity War refresh is cached (`infinity:feed:infinity:<year>`) and `infinityPicks()`
  in `js/myPicks.js` reads it first, so the Schedule's Infinity tags follow Sleeper.
- **How to get the token — the bookmark is the primary path (added 2026-09-14).** The Connect box
  offers **Copy the bookmark** (and, on a computer, a link to drag to the bookmarks bar). Saved as a
  bookmark and tapped on sleeper.com while logged in, it copies the token; the box's **Paste &
  save** reads it back. It works on an iPad, which the DevTools route never did. Rules for
  `js/sleeperBookmarklet.js`, all load-bearing:
  - It runs on **Sleeper's** page, so it calls nothing — no fetch, no redirect, and never the token
    in a URL. It reads storage, writes the clipboard, and says what happened.
  - It **never hardcodes a storage key.** It regex-scans every string in localStorage,
    sessionStorage and `document.cookie` for anything JWT-shaped, however deeply nested, and keeps
    the unexpired one naming a `user_id` that expires last — the same shape `tokenInfo()` reads.
  - Clipboard first, `prompt()` holding the token as the fallback for iOS versions that refuse the
    write.
  - The source is collapsed onto one line, so it has **no `//` comments** and explicit semicolons.
  - **Verified only against planted fake tokens**, since no Sleeper login was available when it was
    built. If it finds nothing on the real site, Sleeper keeps the token somewhere a page script
    cannot read (an HttpOnly cookie, or IndexedDB) — fall back to the DevTools steps, which stay in
    the box under "If the bookmark doesn't work": sleeper.com → F12 → Network → filter `graphql` →
    reload → click a row → Request Headers → `authorization`.
- **How often:** once per device; again only on expiry, a Sleeper logout, or a password change.
  The connected box turns amber ("Time to reconnect") inside 30 days of expiry, and `saveToken()`
  refuses a token that has already expired.

### The shared feed -- every device, no Connect box

Added 2026-09-26 because pasting a token into every phone, iPad and browser was the owner's
standing complaint. `.github/workflows/sleeper-feeds.yml` runs `scripts/fetch_sleeper_feeds.mjs`
with the `SLEEPER_TOKEN` secret and commits `data/sleeper/feeds-<year>.json`: every pool's feed,
keyed by Sleeper league id, in exactly the shape the browser caches.

- **The job runs the site's own fetchers** (`fetchSleeperSurvivor`, `fetchInfinityPool`) under a
  stand-in `localStorage` that holds only the token, in memory. That is what makes the committed
  file safe in a public repo: the kickoff gate that hides a pick is the browser's own, not a
  second copy that could drift open. **Do not port the fetch to Python.**
- **At load, `js/sharedFeeds.js` seeds each device's caches from it** before any tab boots
  (`app.js`, capped at 3s, dynamically imported so a failure costs the seeding and never the
  page). A local copy is replaced only by a *newer* shared one, so a connected device that just
  refreshed live keeps its answer.
- **A Refresh on a device with no usable token re-reads the shared copy** instead of failing:
  `noUsableToken()` / `sharedFeedFor()` in `sleeperApi.js`, checked at the top of both fetchers.
  The Connect box turns into an optional "Live refresh" once the shared feed has loaded, and
  Standings shows pool numbers when `readable()` (connected *or* shared).
- **Late, never early.** The copy is gated as of the run that made it, so a game that kicked off
  since then stays hidden until the next run. The schedule follows kickoffs and finals (Thu
  night, Sunday afternoon and night, Monday night, plus a daily run) at minute :41.
- The job writes nothing when no pool changed apart from `fetchedAt`, so "updated N ago" is when
  the data last changed, and fails without writing if any pool fails.
- **Expiry:** Sleeper tokens last a year (the current one to 2027-09-22). Commish Hub's Tuesday
  workflow opens an issue 30 days ahead with the `gh secret set` commands for both repos.
- **Never add a `pull_request` trigger to that workflow.** The secret is the whole account.

**The GraphQL endpoint is undocumented and may change without notice.** Every failure path leaves
the last good cached feed in place and says why, rather than writing a partial pool over a
complete one — a stale field number is recoverable, a half-parsed one silently understates
scarcity and looks fine. Introspection is currently open (`query { __schema { query_type { fields
{ name } } } }`), which is how these queries were found; that is the tool to reach for if the
shape changes.

Four details that each cost time to work out:

- **`include_tiebreaker` changes the response *shape*, not just its contents.** `true` gives
  `{"<roster_id>": {picks: {...}, tiebreaker: {}}}`; `false` hoists the picks to the top of the
  roster object and there is no `picks` key at all. Reading `.picks` after passing `false` returns
  undefined — **HTTP 200, no error, and a pool that looks empty.** We ask for `true`; `picksOf()`
  reads either.
- **`leg_id` is `"v1:regular:<week>"`, not the bare week number.** Passing `"1"` also returns
  `{}` with a 200.
- **`metadata.is_eliminated` is the string `'true'`/`'false'`.** Compared as a boolean, the whole
  pool reads alive and scarcity is measured against the wrong denominator.
- **Sleeper spells Jacksonville `JAX`; this project and `js/teams.js` use `JAC`.** One team, one
  direction, handled by `TEAM_FIX` — don't build a second crosswalk.

### The kickoff gate — do not remove

**Sleeper's app hides a pick until its game kicks off. Sleeper's API does not.** It handed over a
Week 1 pick on 2026-08-14, four weeks before the September 13 kickoff. This is a real money pool,
so **this project enforces the lock that the API doesn't**: `hasKickedOff()` in
`js/sleeperSurvivor.js` withholds any pick whose game has not started.

Four decisions in it, each of which would be easy to undo by accident:

- **Withheld picks are dropped during the fetch, never stored and hidden at render time.** A pick
  that never enters the cache cannot leak out of it later — not through localStorage, not through
  a future feature that reads the feed for something else. Verified: the cached blob does not
  contain the withheld team's abbreviation anywhere.
- **My own pick is exempt.** I already know it, and withholding it would leave the used-teams
  ledger this feed exists to maintain permanently a week behind.
- **The gate keys on the schedule feed's `status`, not on a clock.** That feed carries a *date
  only* (`"2026-09-13"`) with no kickoff time, so a date comparison would reveal the 8:20pm game
  at midnight.
- **It is a hide-list (`pre_game`, `canceled`, `postponed`), not a reveal-list.** The only
  statuses ever observed are `pre_game`, `complete` and `canceled`, so the string for a game in
  progress is unknown; a reveal-list would keep picks hidden right through the game they were
  meant to be revealed for — a failure that looks exactly like the gate working. An unknown or
  missing game is still hidden: missing data must never open the gate.

Each week therefore carries three counts, and collapsing them would hide the gate: `submitted`
(how many have picked at all), `revealed` (how many of those are ours to see yet), `expected`
(the pool). The status line reads `Week 1 — 0 of 12 shown, 1 locked until kickoff` — a bare
"0 of 12" would imply nobody has picked. Percentages are over `revealed`, not the pool, or a week
with two games kicked off reports every share at a sixth of its real value.

**The feed cache is keyed per pool, and that is load-bearing.** `survivor:feed:<pool>:<year>` was
`survivor:feed:sleeper:<year>` while exactly one Sleeper pool existed, which was indistinguishable
from correct. Adding Deadpool and East Orange on 2026-09-01 made it a live bug: refreshing either
overwrote the other's cached field, and the next reload handed Poop whichever pool was fetched
last — one pool's scarcity painted onto another's grid, no error, no visible seam. `S.feeds` in
`grid.js` is likewise built by iterating `LEAGUES`, not from a hand-written list, so a fourth pool
cannot silently get no cache. **Do not collapse either back.** Poop's pool id is still `sleeper`,
so its existing key was unchanged and no migration was needed.

**My own picks come back with everyone else's**, so `survivor:<year>:sleeper` fills itself in on
refresh instead of being hand-typed. `mergeMyPicks()` merges rather than replaces — a week the
feed has not reached keeps whatever was entered by hand.

**Explained 2026-08-28, still do not "fix" it — and now contradicted in three directions at
once.** Poop reports `num_revives_allowed: 0`, Deadpool `2`, East Orange (since dissolved) `10`; all
three pools ran two buy-backs by their commissioners' accounts. Sleeper's settings report
`num_revives_allowed: 0` for Poop while the pool plainly runs buy-backs — because the commissioner
administers re-entry **outside the app**, by hand. So that field describes Sleeper's own
bookkeeping, not the pool's rules. Treat the API value as inert: never let it gate a buy-back
feature, and never edit SURVIVOR-STRATEGY.md to agree with it. Corollary — `metadata.is_eliminated`
is Sleeper's opinion too, so an entry it calls eliminated may have bought back and still be
playing.

## The Site Gate — removed 2026-09-13

From 2026-09-08 to 2026-09-13 a password gate (`js/siteGate.js`) kept every tab but Squares out
of the nav and un-booted, with an **Admin** button in the Squares footer. **Removed at the
owner's request**: the site opens on **Schedule** again, every tab boots at load, and the Squares
footer always shows the way back to Schedule / Season Long / Survivor.

Two things that were true before the gate and are true again now:

- **It never protected a file.** The repo is public and Pages serves it from the root, so
  `/STRATEGY.md` and `/data/raw/*` were always fetchable. The real fix for sharing Squares with
  the club is still the separate `bova4389/stjude-squares` repo `.sq-theme` was scoped for.
- **The link to hand the club is `…/bovas-picks/#squares`.** A bare URL now lands on Schedule.

Do not rebuild a gate from git history without asking — it was taken out on purpose.

### Titles and link previews

`paintTitle()` names the document per view: Squares panels read *"Board · St. Jude Men's Club
Squares"*, everything else *"Pick Sheet · Bova's Picks"*. The Squares group carries its own
`title` in `GROUPS` — its link goes to people outside the pool, and this site's branding is the
wrong name in their tab bar and their bookmarks.

**Link-preview crawlers never see any of that.** iMessage, WhatsApp and Slack fetch the URL and
read the markup without running scripts, and a `#hash` never reaches the server at all. So the
Open Graph tags in `index.html` are named for the Squares board — correct, because the link that
goes outside the pool is the `#squares` one. The static `<title>` stays this site's.
