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

The helmet set is the `2023_helm` vintage. Teams that have changed uniform or
helmet design since — the Jets, Broncos and Texans all introduced new sets in
2024 — will render as their 2023 design. Palette data for those teams is
current; only the helmet artwork lags.

`scripts/fetch_team_assets.py` refreshes logos and helmets from the league and
ESPN CDNs directly, for running in an environment whose network policy allows
those hosts. Claude Code web sessions in this repo do not: their egress
allowlist covers GitHub only, which is why the build reads from GitHub mirrors.
