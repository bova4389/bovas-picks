"""Freeze finished Squares games into data/squares-<year>.json.

    python scripts/freeze_squares.py 2026            # freeze every finished week
    python scripts/freeze_squares.py 2026 --dry-run  # report only

The Season tab reads each finished week's quarter scores from the `result`
block in the pool document, so the ledger is permanent and offline-capable
rather than depending on ESPN still serving a week from October (see the
Squares section of CLAUDE.md). Nothing wrote those blocks until 2026-09-27:
the step was meant to be done by hand, never was, and the Season tab showed
no winners at all for Weeks 1 and 2. This script is that step, and
.github/workflows/fetch-schedule.yml runs it every Tuesday.

RULES, each with a reason:

  * Only a week ESPN marks COMPLETED is frozen, and only when each side's
    per-period points add up to its final score. A line that does not sum is
    a half-reported box score; freezing it would pay the wrong squares
    forever, and a week left unfrozen still grades live on the Season tab.
  * A frozen week is never rewritten. `result` is the record; if ESPN later
    corrects a score, fix the file by hand and say so in the commit.
  * The file is edited as TEXT, replacing only that week's `"result": null`.
    It is hand-maintained with one-line arrays (the 10 x 10 names board), and
    a json.dump round trip would reflow every line of it.
  * Written through a temp file and os.replace, so a failure never leaves a
    truncated file behind.

Stdlib only, like every other script here.
"""

import json
import os
import re
import shutil
import subprocess
import sys
import urllib.error
import urllib.request

SCOREBOARD = ('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'
              '?dates={year}&seasontype=2&week={week}')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def fetch_week(year, week):
    """ESPN's scoreboard for one regular-season week, as {event id: event}."""
    url = SCOREBOARD.format(year=year, week=week)
    # ESPN answers 403 to a custom User-Agent; fetch_schedule.py sends this too.
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            data = json.load(res)
    except urllib.error.HTTPError as err:
        # From some home connections ESPN 403s Python's client whatever the
        # headers, while curl gets through (seen 2026-09-27; CI is unaffected).
        if err.code != 403 or not shutil.which('curl'):
            raise
        out = subprocess.run(['curl', '-sf', '--max-time', '30', url],
                             capture_output=True, check=True)
        data = json.loads(out.stdout)
    return {str(ev.get('id')): ev for ev in data.get('events', [])}


def result_of(event):
    """The `result` block for a finished game, or (None, reason)."""
    comp = (event.get('competitions') or [{}])[0]
    status = (comp.get('status') or event.get('status') or {}).get('type') or {}
    if status.get('state') == 'pre':
        return None, None  # not kicked off: nothing worth reporting
    if not status.get('completed'):
        return None, f"not final ({status.get('shortDetail') or status.get('description') or 'no status'})"

    sides = {c.get('homeAway'): c for c in comp.get('competitors', [])}
    if 'home' not in sides or 'away' not in sides:
        return None, 'ESPN sent no home/away competitors'

    out = {}
    for side in ('away', 'home'):
        c = sides[side]
        try:
            score = int(float(c.get('score')))
            line = [int(float(q.get('value'))) for q in c.get('linescores') or []]
        except (TypeError, ValueError):
            return None, f'{side} score or quarter line is not numeric'
        if len(line) < 4:
            return None, f'{side} has only {len(line)} periods reported'
        if sum(line) != score:
            return None, f'{side} quarters sum to {sum(line)}, final is {score}'
        out[f'{side}Score'] = score
        out[f'{side}Line'] = line

    out['detail'] = status.get('shortDetail') or 'Final'
    return out, None


def inline(result):
    """One line, key order fixed, arrays with ", " -- matches the file."""
    parts = []
    for key in ('awayScore', 'homeScore', 'awayLine', 'homeLine', 'detail'):
        val = result[key]
        text = ('[' + ', '.join(str(v) for v in val) + ']') if isinstance(val, list) else json.dumps(val)
        parts.append(f'"{key}": {text}')
    return '{' + ', '.join(parts) + '}'


def freeze_in_text(text, game_id, result):
    """Replace the `"result": null` belonging to one gameId. Raises if the
    block cannot be found exactly once, rather than editing the wrong week."""
    pattern = re.compile(r'("gameId":\s*"' + re.escape(game_id) + r'".*?"result":\s*)null', re.S)
    matches = pattern.findall(text)
    if len(matches) != 1:
        raise RuntimeError(f'gameId {game_id}: expected one unfrozen block, found {len(matches)}')
    return pattern.sub(lambda m: m.group(1) + inline(result), text, count=1)


def main(argv):
    args = [a for a in argv if not a.startswith('--')]
    dry = '--dry-run' in argv
    if len(args) != 1 or not args[0].isdigit():
        print(__doc__)
        return 2
    year = int(args[0])
    path = os.path.join(ROOT, 'data', f'squares-{year}.json')
    if not os.path.exists(path):
        print(f'no {os.path.relpath(path, ROOT)} -- nothing to freeze')
        return 0

    with open(path, encoding='utf-8') as f:
        text = f.read()
    doc = json.loads(text)

    boards = {}
    frozen = 0
    for pool in doc.get('pools', []):
        for wk in pool.get('weeks', []):
            if wk.get('result') is not None:
                continue
            week, gid = wk['week'], str(wk['gameId'])
            if week not in boards:
                try:
                    boards[week] = fetch_week(year, week)
                except Exception as err:  # noqa: BLE001 -- report and move on
                    print(f"  week {week:>2}: ESPN unavailable ({err}) -- left unfrozen")
                    boards[week] = {}
            event = boards[week].get(gid)
            if not event:
                continue  # not played yet, or ESPN did not answer: nothing to say
            result, why = result_of(event)
            label = f"  {pool.get('id')} week {week:>2} {wk.get('away')} @ {wk.get('home')}"
            if not result:
                if why:
                    print(f'{label}: {why}')
                continue
            print(f"{label}: {result['awayScore']}-{result['homeScore']}  "
                  f"lines {result['awayLine']} / {result['homeLine']}  ({result['detail']})")
            text = freeze_in_text(text, gid, result)
            frozen += 1

    if not frozen:
        print('nothing new to freeze')
        return 0

    check = json.loads(text)  # the edited text must still be the same document
    if len(check.get('pools', [])) != len(doc.get('pools', [])):
        raise RuntimeError('edited file lost a pool -- not writing')

    if dry:
        print(f'dry run -- {frozen} week(s) would be frozen, nothing written')
        return 0

    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    os.replace(tmp, path)
    print(f'froze {frozen} week(s) -> {os.path.relpath(path, ROOT)}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
