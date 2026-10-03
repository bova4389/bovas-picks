"""Fit the pick-share curve's k from this season's measured field, against pre-kickoff prices.

    python scripts/fit_pick_share.py 2026

Writes data/popularity/fit-<year>.json, which the Recommend tab reads as its k.

WHY THIS EXISTS (2026-10-03): js/recommend.js already fits k at boot, but it
pairs each popularity file with the CURRENT odds snapshot -- and the snapshot
drops a game once it is played, so every past week finds no prices and the fit
silently falls back to the default k=2.0. The Weeks 1-3 lookback measured the
real value at 2.75 over 44 games: this pool chases favorites far harder than
k=2 says, which makes every underdog look more crowded than it is.

The price used for each game is the LAST history snapshot taken before kickoff,
the same rule js/standings.js uses -- an in-play price already knows the score.

Same objective as fitK() in js/pickShare.js (squared error of the share curve
against measured share, both sides of every game, k from 1.00 to 4.00 by 0.01),
so the number here is the number the browser would have fitted if it could see
the prices. Run it after each parse_pool_picks.py. Stdlib only.
"""

import datetime as dt
import glob
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
K_MIN, K_MAX = 1.0, 4.0


def load(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def ts(text):
    return dt.datetime.fromisoformat(text.replace('Z', '+00:00'))


def share_for(p, k):
    a, b = p ** k, (1 - p) ** k
    return a / (a + b)


def main(argv):
    if len(argv) != 1 or not argv[0].isdigit():
        print(__doc__)
        return 2
    year = int(argv[0])
    sched = load(os.path.join(ROOT, 'data', f'schedule-{year}.json'))['games']

    histories = []
    for path in glob.glob(os.path.join(ROOT, 'data', 'odds', 'history', '*.json')):
        snaps = load(path)
        snaps = snaps if isinstance(snaps, list) else snaps.get('snapshots', [])
        if snaps:
            histories.append(snaps)

    def pregame(week, away, home):
        """Away win probability from the last snapshot before kickoff, or None.
        Popularity files name mascots; odds name cities, so match on the suffix
        and keep it inside that week's dates (rivalries meet twice)."""
        days = [ts(g['date']) for g in sched if g['week'] == week]
        if not days:
            return None
        lo, hi = min(days) - dt.timedelta(days=1), max(days) + dt.timedelta(days=1)
        for snaps in histories:
            last = snaps[-1]
            if not (last['away'].endswith(' ' + away) and last['home'].endswith(' ' + home)):
                continue
            ko = ts(last['commenceTime'])
            if not lo <= ko <= hi:
                continue
            pre = [s for s in snaps if ts(s['fetchedAt']) < ko]
            return pre[-1]['awayWinProb'] if pre else None
        return None

    pairs, weeks, missing = [], [], []
    for path in sorted(glob.glob(os.path.join(ROOT, 'data', 'popularity', f'pop-{year}-w*.json'))):
        pop = load(path)
        week = pop['week']
        got = 0
        for g in pop['games']:
            pa = pregame(week, g['away'], g['home'])
            if pa is None:
                missing.append(f"W{week} {g['away']} at {g['home']}")
                continue
            pairs.append((pa, g['awayPct'] / 100))
            pairs.append((1 - pa, g['homePct'] / 100))
            got += 1
        if got:
            weeks.append(week)

    usable = [(p, s) for p, s in pairs if 0.02 < p < 0.98 and 0 < s < 1]
    if len(usable) < 4:
        print(f'only {len(usable)} usable pairs -- nothing written')
        return 0

    best_k, best_err = None, float('inf')
    for i in range(int(K_MIN * 100), int(K_MAX * 100) + 1):
        k = i / 100
        err = sum((share_for(p, k) - s) ** 2 for p, s in usable)
        if err < best_err:
            best_k, best_err = k, err

    out = {
        'season': year,
        'k': best_k,
        'n': len(usable),
        'games': len(usable) // 2,
        'weeks': weeks,
        'rmse': round((best_err / len(usable)) ** 0.5, 4),
        'priceRule': 'last odds snapshot before kickoff',
        'fittedAt': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
    }
    path = os.path.join(ROOT, 'data', 'popularity', f'fit-{year}.json')
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(out, f, indent=2)
        f.write('\n')
    os.replace(tmp, path)
    print(f"k = {best_k} from {out['games']} games in weeks {weeks} (rmse {out['rmse']})"
          f" -> {os.path.relpath(path, ROOT)}")
    if missing:
        print(f'  {len(missing)} game(s) had no pre-kickoff price: ' + ', '.join(missing))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
