# GitHub Setup and Syncing — Bova's Picks reference

Moved verbatim out of `CLAUDE.md` on 2026-11-11 so it loads only when needed. "Below" and "above" in this file can point to a section that now lives in another `docs/claude/` file; grep the folder for the heading.

## GitHub Setup

**Complete as of 2026-08-11.** All four setup steps are done:

| Step | Status | Evidence |
|---|---|---|
| Remote created + `git remote add origin` | Done | `origin` → `https://github.com/bova4389/bovas-picks` |
| `git push -u origin main` | Done | Root commit `fe0e6d4` onward on `origin/main` |
| `ODDS_API_KEY` repo secret | Done | `github-actions[bot]` odds commits land daily; the workflow cannot commit without it |
| **GitHub Pages enabled** | **Done 2026-08-11 23:11 UTC** | 5 successful `pages build and deployment` runs from `main`, latest 2026-08-12 14:48 UTC |

**The site is live at `https://bova4389.github.io/bovas-picks/`.** Pages serves the repository root,
so every tracked file is fetchable at its repo path — `data/odds/current.json` and the rest of
`data/` included. That is by design: the tabs fetch those paths directly.

## Syncing Local ↔ GitHub

Work reaches this repo from two places that never see each other: **a local machine**, and
**Claude Code on the web**, which runs in an ephemeral container that clones from GitHub and pushes
back. GitHub is the only shared ground. Nothing written in a web session exists anywhere else until
it is pushed, and nothing on the local drive is visible to a web session until it is pushed.

**A third writer moves `main` on its own:** `.github/workflows/fetch-odds.yml` commits to `main`
eight times a day Thursday–Saturday and once daily Sunday–Wednesday. **`origin/main` will almost
always be ahead of a local checkout that has sat overnight.** This is the single most likely source
of a surprising push rejection, and it is expected behavior rather than a problem.

### Start every local session with a pull

```bash
cd "path/to/NFL Pickems"
git fetch origin
git status -sb                    # shows how far behind main is
git pull --ff-only origin main    # refuses to invent a merge if histories diverged
```

`--ff-only` is deliberate: it fails loudly on divergence instead of silently creating a tangled
merge commit. If it fails, use `git pull --rebase origin main` to replay local commits on top.

### Pulling a branch pushed from a web session

```bash
git fetch origin <branch-name>
git checkout <branch-name>
```

To fold it into `main` (docs-only branches need no PR):

```bash
git checkout main
git pull --ff-only origin main
git merge --no-ff <branch-name>
git push origin main
```

### Why a local push cannot destroy web-session work

Three independent protections, worth knowing so the fear doesn't drive bad workarounds:

1. **Single root commit** (`fe0e6d4`, 2026-08-11). Local and GitHub share one lineage — there is no
   "unrelated histories" hazard, which is the failure mode where two repos silently overwrite.
2. **Branches are independent refs.** Pushing `main` cannot alter, remove, or ignore a branch like
   `claude/*`. Only an explicit push to that branch name touches it.
3. **Git refuses non-fast-forward pushes by default.** A local `main` behind `origin/main` gets a
   *rejection*, never a silent overwrite. The rejection is the safety net working.

**The one thing that does destroy remote work: `git push --force` (or `-f`, or
`--force-with-lease`).** Never use it here. A rejected push is solved with `git pull --rebase`, not
with force.

### Odds data conflicts

`data/odds/` is bot-owned. Do not hand-edit it locally. On a conflict there, take the remote copy —
the next scheduled run regenerates it anyway:

```bash
git checkout origin/main -- data/odds/
git add data/odds/
```
