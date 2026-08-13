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
| **Palettes** (primary/secondary) | Current — the screen feed tracks rebrands | none needed |
| **Pantone / CMYK** | 15 teams have it; 10 withheld where sources disagree | optional, §3 |
| **Logos** | Current as of the mirror's last sync | §1, one command |
| **Wordmarks** | Same | §1 |
| **Helmets** | **2023 vintage** | §2, needs hands |
| **Uniforms** (home/away) | Derived from 2015–2020 observations | §4, optional |

The helmet gap is smaller than it sounds. Only the **Jets, Broncos and Texans**
introduced new sets in 2024; the 2025 Chargers and Commanders changes were
*alternates*, not primary helmets. So roughly 28 of 32 helmets are still right —
verify before replacing all of them.

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

## 2. Helmets — the part that needs hands

**There is no free programmatic source for current NFL helmet renders.** ESPN
doesn't publish them, the league's CDN serves logos rather than helmets, and the
[Gridiron Uniform Database](https://www.gridiron-uniforms.com/) — which *is* the
authority and does carry current seasons — draws its own helmet templates that
belong to its author. Read it as reference; don't copy the artwork.

So: download the helmets you need, name them, and let the script install them.

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

## 4. Uniforms — optional, and lower value than it looks

The home/away kits are derived from per-game observations that stop in 2020, then
snapped to each team's current palette — so the *colours* are right and the
design details may lag. The derivation independently reproduces the known
convention (Dallas and Miami as the only white-at-home teams), which is the
check that it works, and home/away colour conventions are among the most stable
things in the league.

If you do want current-season kits, the Gridiron Uniform Database has them
per-team per-season at
`.../controller.php?action=teams-season&team_id=DAL&year=<year>`. Read the
combinations, don't take the images.

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
>    re-renders the marks with its own colour treatment, so it's a third opinion.
> 4. Re-run `scripts/build_team_identity.py` and `scripts/check_team_assets.py`,
>    confirm all 128 assets pass, commit, and push to the same branch.
>
> Tell me explicitly which helmets you replaced, which you left alone and why,
> and anything you couldn't source. Don't quietly substitute a lower-quality or
> unofficial image for an official one.

Once that's pushed, a web session can `git pull` and pick the work back up.
