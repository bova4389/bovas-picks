# Refreshing team assets to the current season

## Why this document exists

A Claude Code **web** session in this repo runs in a cloud container whose egress
policy allows GitHub and refuses everything else — `nfl.com`, `espncdn.com`, the
32 club sites and even Wikipedia all answer `403 CONNECT`. That is why
`scripts/build_team_identity.py` reads GitHub mirrors of upstream data rather
than official sources.

**A local Claude Code session has no such restriction.** It uses your own
network. So anything in this document is work for a local session (or you, by
hand), and the results get committed and pushed like any other change.

## What is already current, and what is not

| Asset | State | Fix |
|---|---|---|
| **Palettes** (primary/secondary) | 4 of 10 disagreements resolved *against* the screen feed | §3 — table filled in |
| **Pantone / CMYK** | 15 teams have it; 10 withheld where sources disagree | optional, §3 |
| **Logos** | Current — verified team-by-team 2026-08-13 | §1, done |
| **Wordmarks** | Current, but **no working refresh endpoint exists** | §1, unfixable for now |
| **Helmets** | Current — NYJ and TEN rebuilt from the template | §2, `scripts/rebuild_helmet.py` |
| **Uniforms** (home/away) | Derived from 2015–2020 observations | §4, optional |

> **Audit of 2026-08-13 (local session, full network).** The three assumptions
> in the original version of this table were all wrong in an interesting way,
> and the corrections are recorded in each section below. Short version: the
> logos were already current and refreshing them *degrades* them; the wordmark
> endpoints are dead on both CDNs; and the helmet gap is a different set of
> teams than "Jets, Broncos, Texans".

The helmet gap is smaller than it sounds, but it is **not** the set named in the
2024 reporting. "New uniforms" is not the same claim as "new primary helmet":

- **NYJ** and **TEN** are the only two whose primary helmet genuinely differs
  from the installed 2023 artwork (new decal / new shell color).
- **DEN** and **HOU** got new uniform *sets* in 2024, but their primary helmet
  kept its shell color and side decal — Denver changed finish and striping,
  Houston's new "H" mark went on an **alternate** helmet.
- **DET** (2024) and **ATL** (2026) changed only the facemask color and, for
  Atlanta, the front bumper — neither is visible in a flat side-profile render.
- Everything else since 2023 — Ravens "Purple Rising"/"Darkness", Commanders
  "Hail Raiser", Browns "Alpha Dawg", Bills "The Charge", Jets "White Out",
  Rams "Fearsome White"/"Classic Sol", Saints white, Packers 1923 — is an
  **alternate**, and this asset set models primaries only.

---

## 1. Logos and wordmarks — one command each

```bash
python scripts/fetch_team_assets.py logos --dry-run     # check the URLs first
python scripts/fetch_team_assets.py logos
python scripts/fetch_team_assets.py wordmarks
python scripts/check_team_assets.py                     # must pass
```

Nothing is overwritten until the replacement decodes as a real PNG, so a 403
error page cannot land on top of a good asset. If a team fails, retry it against
the other CDN:

```bash
python scripts/fetch_team_assets.py logos --source espn --only NYJ,DEN,HOU
```

The URL templates live in `SOURCES` at the top of that script. If the league
changes its CDN paths, that dict is the only thing to edit.

### What the 2026-08-13 audit found — read before bulk-refreshing

**Do not run a blanket `fetch_team_assets.py logos`.** All 32 logos were
compared against the league's current artwork (bounding-box normalised, so
the comparison is immune to the different padding each CDN applies). 31 of 32
were already the current design. Refreshing them all replaces good assets with
worse ones:

| Source | Encoding | Colors per mark | Verdict |
|---|---|---|---|
| Installed (nflplotR/ESPN mirror) | 8-bit RGBA | 1294–3227 | **best** |
| `nfl` CDN via `f_png` | 8-bit RGBA | 804–1092 | acceptable |
| `nfl` CDN via `t_q-best` | 8-bit **palette** | 79–256 | degraded |

`t_q-best` — which `SOURCES` used to request — quantises to an indexed palette
and drops partial-alpha pixels from ~1,500 to ~27 per mark, which visibly frays
every antialiased curve. `SOURCES` now requests `f_png`. Two traps found while
measuring this, both now noted in the script: `t_lazy` is Cloudinary's *blurred
placeholder*, not a quality reference; and ESPN answers some unknown subpaths
(`500-dark/`, `500/scoreboard/`) with the plain logo bytes instead of a 404, so
a 200 alone does not prove an endpoint exists.

**The one real logo fix was LAR.** Both the mirror and ESPN serve the Rams'
*mono-blue* wordmark-style mark; the club's primary is the blue-and-gold "LA"
with the horn. Only the league CDN has it. Already applied:

```bash
python scripts/fetch_team_assets.py logos --only LAR
```

Two near-misses worth not re-litigating: **NYG** differs because the league CDN
serves a white-and-red *alternate colorway* of the "ny" — the installed navy
one is correct, do not "fix" it. **DAL** differs only by antialiasing on the
star's edge; the designs are identical.

> ⚠️ **`build_team_identity.py` reverts the LAR fix.** `extract_images()`
> unconditionally rewrites `assets/teams/logos/<ABBR>.png` from the nflplotR
> blob for all 32 teams. Any run of the build undoes LAR. Re-apply the one
> command above afterwards, every time.

### Wordmarks cannot be refreshed at all (checked 2026-08-13)

Both `SOURCES["wordmarks"]` templates 404 on every team, and there is no
replacement. nfl.com no longer exposes club wordmarks at a templated per-club
path — its pages reference opaque Cloudinary ids like
`/image/private/f_auto/league/kujtrvt65vrfbzvlp9p7`, which cannot be derived
from an abbreviation. ESPN has no NFL wordmark directory: `/500/wordmark/`,
`/wordmarks/`, `/500-dark/wordmark/` and the combiner form were all tried.

This is not urgent — the installed wordmarks come from the nflplotR mirror via
`build_team_identity.py` and are current. `fetch_team_assets.py wordmarks` will
simply skip all 32 rather than damage anything.

## 2. Helmets — the part that needs hands

**There is no free programmatic source for current NFL helmet renders.** ESPN
doesn't publish them, the league's CDN serves logos rather than helmets, and the
[Gridiron Uniform Database](https://www.gridiron-uniforms.com/) — which *is* the
authority and does carry current seasons — draws its own helmet templates that
belong to its author. Read it as reference; don't copy the artwork.

So: download the helmets you need, name them, and let the script install them.

### Which helmets actually need replacing (audited 2026-08-13)

Only **two**, and both have now been rebuilt — see below.

| Team | Installed (2023) | Current primary | Verdict |
|---|---|---|---|
| **NYJ** | green shell, 2019 "Jets" oval mark | green shell, 1978–89-style **"JETS" wordmark with a jet off the "J"**, white facemask (2024 Legacy Collection) | **was wrong — rebuilt** |
| **TEN** | navy shell, flaming-thumbtack "T" | **white shell**, new block-"T"-in-red-circle mark, guitar-string centre stripe, white facemask (2026 rebrand) | **was wrong — rebuilt** |

Left alone, with the reason:

| Team | Change since 2023 | Why the 2023 artwork still stands |
|---|---|---|
| DEN | 2024 redesign | metallic-satin finish + striping only; navy shell and bronco decal unchanged. White helmet is an alternate |
| HOU | 2024 redesign | Deep Steel Blue shell and bull decal unchanged; the new "H" mark went on an **alternate** helmet |
| DET | 2024 refresh | facemask black → blue only; silver shell and lion decal unchanged. Blue helmet is an alternate |
| ATL | 2026 refresh | facemask → silver and a new winged-ATL **front bumper**; low-gloss black shell and falcon side decal unchanged. Neither reads in side profile |
| BAL, WAS, CLE, BUF, LAR, NO, GB, PIT, TB | 2025–26 | **alternates and throwbacks only**; each club's primary helmet is unchanged |
| all others | none | no primary helmet change since 2023 |

Note that NYJ's replacement decal is **strongly directional** — the jet flies
out of the "J" toward the rear of the helmet — so `--mirror` is invalid for it
and the script correctly refuses. Both facings must be sourced separately.

### Both were rebuilt, from the set itself — `scripts/rebuild_helmet.py`

**Sourcing helmet artwork turned out to be the wrong problem.** Confirmed first
that no source exists: seven CDN paths across `static.www.nfl.com` and
`a.espncdn.com` all 404; club sites publish `.mp4` turntables and poster `.jpg`s
rather than transparent artwork; GUD's templates are its author's drawings; and
retailer product photography is a third party's copyright, three-quarter angle
against a set drawn in flat side profile, and only ever one facing.

Then the measurement that mattered: **silhouette IoU between any two helmets in
this set is exactly 1.0000.** They are all the same drawing. A helmet here is
only

    shell color + shared linework + facemask + decal

so a changed helmet can be *composed* from pieces already in the repo. The
facemask confirms it independently — `(149,149,149)` covers 0.12177 of every
single helmet, to five decimal places.

| Team | Built from | Edits |
|---|---|---|
| **TEN** | `IND` (the template's white-shelled instance) | Colts horseshoe cleared, 2026 Shield decal from `logos/TEN.png`, six-string crown stripe |
| **NYJ** | its own 2023 render (green shell kept) | 2019 decal removed and inpainted, 2024 "JETS with a jet" glyph from `logos/NYJ.png`, facemask black → light |

```bash
python scripts/rebuild_helmet.py TEN NYJ --out ~/helmets
python scripts/fetch_team_assets.py ingest-helmets ~/helmets
python scripts/check_team_assets.py
```

Four things that were not obvious, all now handled in the script:

- **Inpaint by diffusion, not by row median.** The shells carry a
  two-dimensional gradient, so one color per row leaves the removed decal
  legible as letter-shaped banding. This produced a visible ghost twice before
  the cause was clear.
- **Define a decal by what it is *not*.** The 2019 Jets mark is white lettering
  over a dark keyline, so removing "white pixels" strips the fill and leaves the
  outline behind. Removing "anything in the panel that is not shell green"
  takes both.
- **Lift a wordmark without its keyline.** Several logos are a colored field
  with a white keyline outside and white lettering inside; "all white pixels"
  grabs the ring too and composites an ellipse onto the helmet. The ring touches
  the outside and the lettering does not, so a flood inward separates them.
- **Clip the decal to the shell.** At the decal's height the mark can be wider
  than the flat part of the shell, and without clipping it runs over the crown
  edge into transparency on one facing.

The decal is composited **unmirrored onto both facings**, which is the point of
the whole exercise and the thing `--mirror` cannot do.

Note the recipes differ in one important way: **TEN is reproducible, NYJ is
not.** TEN composes from IND every run and reproduces byte-for-byte; NYJ edits
the Jets' own render in place and must start from the 2023 artwork. Running it
against its own output would inpaint the new decal away and paste a second one
on top, so the script refuses when it sees an already-lightened facemask.

**Two facings per team, named by the direction the helmet points:**

```
~/Downloads/helmets/
  NYJ-left.png     helmet pointing left  (sits on the RIGHT of a matchup)
  NYJ-right.png    helmet pointing right (sits on the LEFT of a matchup)
  DEN-left.png
  DEN-right.png
```

```bash
python scripts/fetch_team_assets.py ingest-helmets ~/Downloads/helmets --dry-run
python scripts/fetch_team_assets.py ingest-helmets ~/Downloads/helmets
python scripts/check_team_assets.py
```

Transparent background, at least 64px on the short edge, PNG. Matching the
existing 350×320 is nice but not required.

**Why both facings, rather than one flipped?** A helmet decal faces forward on
*both* sides of the real helmet, so the two views are drawn separately. Mirroring
one reverses the decal and gives you backwards lettering — measured against the
hand-drawn pair, a flip matches the shell to ~2% but the decal region differs by
7–12%. `--mirror` exists for the handful of teams whose mark survives it (the
Cowboys star, Colts horseshoe, Packers G, Browns blank shell — see `MIRROR_SAFE`
in the script), and the script refuses to mirror anything else.

## 3. Pantone for the 10 disagreeing teams — optional

`data/teams/team-identity.json` carries a `palette.disagreement` block for the
teams where the screen feed and the style-guide mirror describe different
palettes:

```
CHI  CLE  DET  LAC  LAR  NO  NYJ  PHI  TB  TEN
```

Usually the mirror predates a rebrand, but not always — Chicago's `#C83803` and
Tampa Bay's `#D50A0A` are cases where the *mirror* is right and the screen feed
is stale (Tampa Bay's own uniform observations sample at `#D60A0B`, which
corroborates the mirror). Resolving these means reading each club's actual brand
or style guide and recording which value is current. Web rendering is unaffected;
this matters if anything ever goes to print or apparel.

### Resolved 2026-08-13

**The screen feed is wrong for 4 of the 10, not 2.** Values below carry a
Pantone reference, which is the useful cross-check — a hex can be transcribed
wrong in a hundred places, a PMS number generally is not.

| Team | Installed | Current | Which source was right |
|---|---|---|---|
| **CHI** | `#E64100` sec | **`#C83803`** Orange · PMS 1665 C | **mirror** (as the note above predicted) |
| **TB** | `#A71930` pri | **`#D50A0A`** Red · PMS 186 C | **mirror** (as predicted) |
| **LAC** | `#007BC7` pri | **`#0080C6`** Powder Blue · PMS 285 C | **neither** — screen is close but wrong; mirror's `#0073CF` is the pre-2020 value. Gold `#FFC20E` (PMS 1235 C) is right |
| **NYJ** | `#003F2D` pri | **`#125740`** Gotham Green · PMS 7484 C | **neither** — and note the mirror's `#203731` is *Green Bay's* green, so that entry is simply corrupt |
| **TEN** | `#4495D2` / `#D50A0A` | **`#0C2340`** Navy · PMS 289 C, **`#4B92DB`** Titans Blue · PMS 279 C, **`#C8102E`** Red · PMS 186 C | **neither** — superseded by the 2026 rebrand. The mirror's `#4B92DB` survives as the new Titans Blue |
| CLE | `#FF3C00` / `#311D00` | unchanged · PMS 2028 C / PMS Black 4 C | **screen** — mirror's `#FB4F14` is Cincinnati's orange |
| DET | `#0076B6` / `#B0B7BC` | unchanged · PMS 7462 C / PMS 8180 C | **screen** — mirror's `#005A8B` is the pre-2017 blue |
| LAR | `#003594` / `#FFD100` | unchanged · PMS 661 C / PMS 109 C | **screen** — mirror is the pre-2020 navy/gold |
| PHI | `#004C54` / `#A5ACAF` | unchanged · PMS 316 C | **screen** — mirror's `#004953` is a near-miss variant |
| NO | `#D3BC8D` / `#000000` | Old Gold unchanged · PMS 8383 C; black is **`#101820`** | **screen** on the gold; the pure-black secondary is a simplification |

**Provenance caveat, stated plainly:** NFL clubs almost universally do not
publish a public style guide. The Bears are the closest — they have a real
brand-guidelines page — but it puts the actual values behind a PDF/asset
download rather than on the page. So the values above are the consensus of
independent color references that all cite the same Pantone numbers, not
transcriptions from a club-published chart. That is a genuinely weaker claim
than "read off the style guide", and it is the reason nothing here has been
written into `team-identity.json` automatically.

**Applied 2026-08-13.** Every `palette.disagreement` block is gone, replaced by
a `palette.resolution` block recording the outcome (`corrected` for CHI, LAC,
NYJ, TB, TEN; `confirmed` for CLE, DET, LAR, NO, PHI), the prior values from
both sources, the basis, and the provenance caveat above. Seven hex values moved
in total.

One coupling worth knowing about, because it will bite anyone editing this file
by hand: **kit colors are snapped to the palette**, so a corrected palette
value has to move with its kit. Chicago's home socks were `#E64100` — the old
palette secondary — and are now `#C83803`. That was the only such case among the
five corrections. `uniforms.*.sampled` is *raw per-game observation* and was
deliberately left alone; it is evidence, not derived output, and overwriting it
would destroy the thing that lets the derivation be checked.

Not applied: New Orleans' black. The club's is `#101820` rather than the pure
`#000000` recorded here. It is a simplification rather than an error, and moving
it would churn kit fields across both sides for no visible gain.

## 4. Uniforms — optional, and lower value than it looks

The home/away kits are derived from per-game observations that stop in 2020, then
snapped to each team's current palette — so the *colors* are right and the
design details may lag. The derivation independently reproduces the known
convention (Dallas and Miami as the only white-at-home teams), which is the
check that it works, and home/away color conventions are among the most stable
things in the league.

If you do want current-season kits, the Gridiron Uniform Database has them
per-team per-season at
`.../controller.php?action=teams-season&team_id=DAL&year=<year>`. Read the
combinations, don't take the images.

### TEN is the one hand-set kit (2026-08-13)

Tennessee's March 2026 rebrand invalidated its derivation outright — the club
now wears a **white helmet with every jersey combination**, Titans Blue at home
and white on the road, where the 2015–20 window had it in navy throughout. Six
color fields were set by hand.

The pattern used there is the one to copy if another team ever needs it:

- the four color fields hold the override;
- `uniforms.<side>.derived` keeps the values that were replaced;
- `uniforms.<side>.sampled` is **raw per-game observation and is never touched**
  — it is the evidence the derivation is checked against, not derived output;
- `observations`, `modalShare` and `whiteJerseyRate` still describe `derived`,
  **not** the override, which is why `source` is recorded alongside.

The club's own brand board corroborates the palette choice independently of
this: its color-proportions panel gives Titans Blue the dominant field with
navy and red as thin accents, which is why `#4B92DB` is the primary here rather
than Titans Navy `#0C2340`.

---

## Paste this into a local Claude Code session

> I'm working in the `bovas-picks` repo on branch `claude/nfl-team-resources-95x7ic`
> (pull it first — it was pushed from a web session). Read
> `docs/REFRESH-TEAM-ASSETS.md` and `assets/teams/NOTICE.md` before starting.
>
> You have full network access; the web session that built this did not, which is
> why the assets came from GitHub mirrors instead of official sources. Your job is
> to bring them to the current season.
>
> 1. Refresh logos and wordmarks from the official CDNs using
>    `scripts/fetch_team_assets.py`, then run `scripts/check_team_assets.py`.
>    If the CDN paths have changed, fix the `SOURCES` dict rather than
>    hardcoding URLs elsewhere.
> 2. Work out which teams' **helmets** actually differ from their 2023 design —
>    start from the Jets, Broncos and Texans (2024 redesigns) and verify the rest
>    rather than assuming. For each one that changed, find a current helmet image
>    in both facings, put them in a folder named `ABBR-left.png` / `ABBR-right.png`,
>    and install them with `fetch_team_assets.py ingest-helmets`. Don't mirror a
>    single image for a team with a directional decal — the script will refuse,
>    and it's right to.
> 3. For the 10 teams with a `palette.disagreement` block in
>    `data/teams/team-identity.json`, check each club's official brand/style guide
>    and tell me which hex is current. Don't guess from logo artwork — ESPN
>    re-renders the marks with its own color treatment, so it's a third opinion.
> 4. Re-run `scripts/build_team_identity.py` and `scripts/check_team_assets.py`,
>    confirm all 128 assets pass, commit, and push to the same branch.
>
> Tell me explicitly which helmets you replaced, which you left alone and why,
> and anything you couldn't source. Don't quietly substitute a lower-quality or
> unofficial image for an official one.

Once that's pushed, a web session can `git pull` and pick the work back up.
