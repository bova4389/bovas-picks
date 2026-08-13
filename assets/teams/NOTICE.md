# Team marks — provenance and terms

## What these files are

Club identity artwork for the 32 NFL teams, used to identify teams in this
personal pick'em tool.

| Set | Files | Size | Source |
|---|---|---|---|
| `logos/` | 32 | 500×500 PNG, transparent | [nflverse/nflplotR](https://github.com/nflverse/nflplotR) embedded assets, mirroring ESPN's team feed |
| `helmets/` | 64 | 350×320 PNG, transparent, two facings each | [ajreinhard/data-viz](https://github.com/ajreinhard/data-viz) `2023_helm/` |
| `wordmarks/` | 32 | ~1500×260 PNG, transparent, single ink | [nflverse/nflplotR](https://github.com/nflverse/nflplotR) embedded assets |

Colour and uniform data derived from these and other sources lives in
`data/teams/team-identity.json`; every field there carries its own
`provenance` entry. Both are produced by `scripts/build_team_identity.py`
and checked by `scripts/check_team_assets.py`.

## Trademark

**These are not our marks and they are not licensed to us.** Team names, logos,
helmet designs, wordmarks and colour schemes are trademarks of the individual
clubs and of the National Football League. They are reproduced here to identify
teams in a personal, non-commercial analysis tool — nominative use — and nothing
about their presence in this repository grants any right to use them.

Two consequences worth being deliberate about, given this repo is public and
published to GitHub Pages:

- **Do not put these marks on anything sold, sponsored, or advertised**, and do
  not use them in a way that suggests the NFL or any club endorses this tool.
  That is the line between identifying a team and trading on its brand.
- **If a club or the league asks for removal, remove it.** The build script
  regenerates the whole set from upstream in one command, so nothing here is
  irreplaceable.

The upstream repositories are community mirrors that publish no license for the
artwork itself, because they are not in a position to — the marks are not theirs
to license either. Treat their availability as convenience, not permission.

## Currency

The helmet set is the `2023_helm` vintage. Audited 2026-08-13 against current
club designs: **NYJ and TEN are the only two whose primary helmet is genuinely
wrong** (New York's 2024 "JETS" wordmark decal, Tennessee's 2026 white shell).
The other 30 are still accurate — Denver's and Houston's 2024 redesigns kept
their primary shell colour and side decal, Detroit's and Atlanta's changes are
facemask/front-bumper only, and everything else since 2023 is an alternate or
throwback rather than a primary. Both replacements are **unsourced**: no CDN
publishes helmet renders, club sites publish video rather than transparent
artwork, and the Gridiron Uniform Database's templates are its author's own
drawings. See `docs/REFRESH-TEAM-ASSETS.md` §2 for what was tried.

Logos were verified team-by-team on the same date and are current; `LAR` was
corrected to the club's blue-and-gold primary, which only the league CDN
carries. Note that re-running `build_team_identity.py` reverts that one file.

`scripts/fetch_team_assets.py` refreshes logos from the league and ESPN CDNs
directly, for running in an environment whose network policy allows those hosts.
Claude Code web sessions in this repo do not: their egress allowlist covers
GitHub only, which is why the build reads from GitHub mirrors. Its wordmark
endpoints no longer resolve on either CDN; the installed wordmarks come from the
mirror and remain current.
