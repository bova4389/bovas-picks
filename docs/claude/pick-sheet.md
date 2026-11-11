# Pick Sheet, Lock / Unlock, and My Picks — Bova's Picks reference

Moved verbatim out of `CLAUDE.md` on 2026-11-11 so it loads only when needed. "Below" and "above" in this file can point to a section that now lives in another `docs/claude/` file; grep the folder for the heading.

## Submission Format — Quoted From The Commissioner, Do Not Invent

Confirmed by Mike's 2026-09-01 email to the pool ("Please put your picks in like this"). **Both
pools go out in ONE email**, and `buildMessage()` in `js/picksheet.js` produces exactly this:

```
2,4,5,7,10,11,14,15,17,20,22,24,26,28
points 50
Suicide KC
```

- **Numbers are the pick'em pool only**, comma-separated with **no spaces**, ascending.
- **`points` is the Monday-night tiebreaker total** for the one Monday game (see Data Pipeline).
- **The suicide pick is a CITY OR TEAM NAME, never a number** — Mike's words: *"do not give me a
  number off the sheets, just a City or team name."* This is the one place a number and a name mean
  different things, so `survivorPickName()` reads the survivor state and never touches `picks`.
  **Do not "helpfully" add the sheet number to the suicide line.**
- **Everything below the `--- Week N check ---` divider is ours, not Mike's** — the name/number
  readback that catches a transposition. Safe to drop if it ever bothers him; the three lines above
  it are not.

**Deadlines, also from that email:**

| | |
|---|---|
| Both pools | **Midnight Saturday** |
| Suicide pick on a Wed/Thurs game | **6pm before that game** — days earlier |
| New entrants | Until Saturday the 12th |

The Wed/Thurs rule is a *strategy* fact, not just an operational one: taking a Thursday team in the
suicide pool costs you two days of injury news for no compensating edge, so it needs a genuinely
better spot to justify. It does not change SURVIVOR-STRATEGY.md §2's "no late-information edge" —
the deadline moves earlier, never later.

**Thursday games are excluded from the pick'em but ARE usable in the suicide pool.** These are not
in conflict: the Pick Sheet renders the number map (scored games only) and the Survivor grid renders
the schedule feed (all games). A change to one must not be propagated to the other on the assumption
they should agree.

## Pick Sheet — What It Renders

**Scored games only.** `renderGames()` reads `scoredGames()`, not `gamesForWeek()`. The workbook
prints the excluded Thursday (and any Wednesday/Friday) game for reference, and the tab used to
mirror that with a hatched `.game.excluded` row reading "Does not count this week". Those rows were
removed 2026-09-01 at the pool's request: there is nothing to pick on them, and a row you cannot
act on is one more thing to read past on the way to the twenty-eight numbers that matter. The
excluded games **stay in `number-map-<year>.json`** — `counts: false` is the record of why a game
is absent, and dropping them at parse time would make the sheet and the file disagree. If they are
ever wanted back, it is a render change, not a re-parse.

**The tiebreaker is marked in three places, from one flag.** `tiebreakerGame()` feeds the row badge
(`.game.is-tiebreak`), the hint under the Monday-night points input, and the game name appended to
the outgoing email line. All three read the parser's `tiebreaker` flag — none of them re-derives
it. See the Data Pipeline section for why that matters.

### The tiebreaker guess — the market number is the worst answer

The hint under the Monday-night input prints the market over/under **and warns you off it**:
`market O/U 43 (the field guesses this number)`. That parenthetical is the feature; the number
alone would be actively harmful.

Both halves are measured, not asserted:

- **The field guesses the line.** The 267 parsed cards in `data/raw/entries-2025-w01.json` are the
  only real sample we have. That week's total was ~43.5, and the field's median guess was 44, mean
  43.4, with **41% of all entries inside 42–45**.
- **Games do not land on the line.** 2,127 completed games across `data/schedule-*.json` give mean
  45.1, median 44, **SD 13.9**. Recentered on a 43 total, the chance of landing anywhere in 41–45
  is **15%**; it comes in at 36 or under 33% of the time and at 52 or over 25% of the time.

Simulated together — draw a real outcome, draw rivals from the real field, closest absolute wins —
the equity curve is a U with its trough exactly on the line: **~4% for guessing 43–44 against 8
tied rivals, ~24% for guessing 34–36 or 53–55.** Guessing the market number is the tiebreaker
equivalent of picking all favorites, and it fails for the same reason: you are only ever right at
the same moment as 25 other people.

The low side is preferred over the high side at equal simulated equity, because the recentered
distribution puts more mass below 37 than above 51, and because it is the half that survives if
the pool rule ever turns out to be closest-without-going-over.

**It suggests a number now (2026-10-06, the owner's call — reversing "prints the caveat and
stops there").** A box under the input reads `Line 54.5 · Suggested 62 (or 48)` with a one-tap
**Use 62** button, and Recommend's plan card carries the same line. The rule — market total ± 7,
high side first — and its measurement live in `js/tiebreak.js` and STRATEGY.md §5: half the pool
guesses within 3 of the line, ties at the top are 1–3 entries, and 6–9 off wins a tie ~30% of the
time against ~20% on the line. `js/tiebreak.js` is a new file so neither caller imports a new name
from a cached shared module. The hint line under the input now names only the game.

**Do not restore `placeholder="44"` on the input.** It was there from the first build and it is a
nudge toward the exact worst answer, sitting inches from text that says so.

## Lock / Unlock — Pick Sheet and Picks Tab

Added 2026-09-14 so a submitted card cannot be changed by a stray tap on a phone. `js/pickLock.js`
holds the state; `js/picksheet.js` and `js/weekCard.js` render its `lockControl()` and honor it.

- **Per week.** `picks:lock:<year>:w<N>` (Pick Sheet) and `survivor:lock:<year>:w<N>` (Picks tab),
  in localStorage, so locking Week 1 leaves Week 2 open.
- **The default is right without pressing anything:** a week opens **locked once its card is in
  `data/picks-sent-<year>.json`** (Pick Sheet: `numbers` present; Picks tab: any `survivor` pick),
  unlocked before that. A tap overrides the default and is remembered on that device.
- **It guards editing only.** Locked disables the pick buttons, the Monday total and Clear week on
  the Pick Sheet, and the "I picked" buttons and pick menus on the Picks tab — and each handler
  re-checks the lock, so a control forced back on still does nothing. Copying and emailing the
  message, live scores, and the recommendation all keep working on a locked card.
- **Unlocking is one tap, no confirm.** The failure being prevented is a thumb brushing a screen.
- **A tinted left edge (`--purple-mid`), not a warning color** — locked is the normal state of a
  submitted week.

### Lock saves for every device — `js/githubSync.js`

Added 2026-09-27, after a card locked on the iPad was a blank sheet on the phone: everything above
lives in one browser's localStorage, and the only shared record, `data/picks-sent-<year>.json`,
was updated by pasting the email to Claude. **Tapping Lock now writes that file itself**, through
GitHub's contents API, and a line under the Lock button says `Saved for every device` (teal) or
`Only on this device` (amber) with **Save for every device** / **Connect GitHub**.

- **What each Lock writes.** Pick Sheet: `numbers` (ascending), `points`, and `survivor.mike` as
  the email's suicide line carries it — a marked pick, or the recommendation the message fell back
  to, because that is what was sent. Picks tab: every pool's marked pick for the week, merged into
  `survivor`. The Picks tab's missing-picks banner can also save device-only picks from past weeks.
  Unlock never deletes anything; re-locking a corrected card replaces the week.
- **The key.** A fine-grained GitHub token, **only** `bova4389/bovas-picks`, **Contents: Read and
  write**, one year. Pasted once per device into the Connect GitHub box, stored in that browser's
  localStorage (`github:token`), sent only to api.github.com. The box links GitHub's new-key page
  with the name, expiry and permission pre-filled by URL parameters; the repository has to be
  picked by hand (no parameter exists for it). Never commit it, never give it to CI. It sits on
  the shared `bova4389.github.io` origin, so the owner's other Pages sites could read it — all his
  own code, and the key can edit only this repo.
- **Reading needs no key.** `loadSent()` reads the public contents API first, because Pages can
  serve the file ~10 minutes stale — exactly the window in which the phone would miss the iPad's
  lock — and falls back to the Pages copy after 4s or on any failure. `myPicks.js` reads the file
  live from `currentSent()`, so a save shows on every tab without a reload.
- **Every write is read-modify-write on the file's current sha**, patched onto the copy just
  fetched, never the boot copy — so the phone cannot erase what the iPad saved. A 409/422 re-reads
  and retries. The odds bot commits to `main` all day but to other files; the contents API checks
  only this file's sha, so the bot never conflicts. An unchanged card commits nothing.
- **The file keeps its hand-written shape** (arrays on one line; `serialize()` reproduces the
  committed file byte for byte, and the test asserts it). Hand edits stay fine.
- **The form carries `method="dialog"` and its listeners are wired at import.** The first build
  wired them only in `mountGhConnect()`, which the Pick Sheet never calls, so Save submitted the
  form natively and put the key in the address bar as `?token=`. Caught in testing with a fake key.
- **A new file on purpose**, so no existing unversioned module gained an export (the stale-module
  blank page under Cache busting). `getSentPicks()` in `data.js` has no callers now but stays until
  cached copies of the old `myPicks.js` age out.
- **Tests:** `test/githubsync.test.html` plays GitHub in memory (26 assertions: shape, fresh read vs.
  stale Pages, fallback, key checks, first write, no-op, sha conflict keeping another device's
  pick, 403/401 messages, a season with no file yet). No network, no key; any real key on the
  origin is set aside and restored.

## My Picks — One Resolver, Three Tabs

`js/myPicks.js` (added 2026-09-13) answers "what did I pick" for the Pick Sheet's email and the
Schedule's highlights, so the two can never disagree. Precedence:

| Question | 1st | 2nd | then |
|---|---|---|---|
| Season-long card | localStorage `picks:<year>:w<N>` (this device) | `data/picks-sent-<year>.json` | — |
| Survivor pick, per pool | marked on this device (Picks tab / Grid) or an old cached Sleeper feed | sent file's `survivor` map | **nothing** — see below |

- **Why a committed sent file.** localStorage is per browser. A card typed on one device showed as
  a blank sheet on another and read as "the pick sheet reset". `data/picks-sent-<year>.json` holds
  each card exactly as emailed (`numbers`, `points`, `suicide` abbreviation). **Tapping Lock
  writes it** (see "Lock saves for every device" above); hand edits still work. The device copy wins only when it holds at least one pick, so a
  half-edited card is never swapped for the sent one.
- **An actual pick and a recommendation are two functions, never one.** `survivorPick()` returns
  only real picks; `survivorRecommendation()` returns the card's opinion (final log → stored card
  → log). For one morning a missing pick fell back to the recommendation, and the Picks tab told
  the owner he had picked the Chargers in Poop and East Orange when he had not. **Only the Pick
  Sheet's email falls back**, and it prints a note saying the suicide line is the recommendation.
- **`data/picks-sent-<year>.json` holds every pool's pick**: `weeks.<N>.survivor = { mike, sleeper,
  deadpool }` (abbreviations; `sleeper` is Poop; `eastorange` may appear in Week 1 only). The Picks tab builds its used-teams
  boards from `survivorBoard()` (sent file + this device), excluding the week on screen so marking
  this week's pick does not flip this week's recommendation.
- **The Picks tab shows "Your pick" above "Recommended"** on each pool card, with a live result
  (`Kicks off` / `Winning 14–7 · Q2` / `Won 27–7`) from `gameState.loadWeek()`, polled every 25s
  under the Schedule tab's policy and repainting only the result lines. "I picked X" marks the
  recommendation in one tap; the menu marks anything else. Past weeks missing from the sent file
  are listed in a banner, because the CI log cannot see a device-only pick.
- **The Pick Sheet opens on the current week** (`currentWeek()` from the schedule), not Week 1.
- **No entry-name field.** Removed 2026-09-13 — the sheet is only ever the owner's card, so the
  email is the commissioner's three lines plus the readback.
- **Schedule outlines the team that won or is ahead**, not the side I picked (changed
  2026-09-16; the purple `.is-picked` ring only repeated the tags and said nothing about the
  score). `pickVerdict()` in `schedule.js` picks the tone: **green** if that team is my pick,
  **red** if it is the team I picked against, **yellow** if I picked both sides in different
  pools. No outline before kickoff, on a tied score or a tie final, or in a game I have no pick
  in. Inset shadows, no width cost; each color clears 3:1 on white. The picked side still carries
  tags on a second grid row: `Pick'em` (purple) for the season card, the pool's short name
  (dark teal `#006B75`, ~6.3:1 under white) per survivor pool, and `Infinity` (dark amber
  `#7E4B00`, 7.26:1) per Infinity War pick. Re-read on every render.
- **Infinity War picks** come from `infinityPicks()`: this device's
  `infinity:<year>:<week>:teams` (written by `js/infinityWar.js` beside its game-id card, because
  that card stores ids only and the side is derived from the odds), then the sent file's
  `weeks.<N>.infinity` list of abbreviations. The tab's **unsaved** chalk-eight default is not a
  pick and never tags the Schedule — a tag means a card was actually saved or recorded as sent.
