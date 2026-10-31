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

THE RECORD TERM (added 2026-10-31, STRATEGY.md "Lookback -- 2026 Weeks 1-7").
The field picks the team with the better record over and above the price, so
the file also carries a second, record-aware curve, fitted on the underdog
side of every game:

    logit(dog share) = intercept + price * logit(dog win prob)
                       + record * (dog win% - favorite win%)

where win% = (wins + ties/2 + 0.5) / (games + 1), counting only weeks before
the one being picked. js/recordShare.js applies it and js/recommend.js uses it
whenever it has to MODEL a share. It describes the FIELD, never who wins: win
probability still comes only from the market. k stays in the file for every
other reader.
"""

import datetime as dt
import glob
import json
import math
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


def team_records(sched, week):
    """abbr -> (wins, losses, ties) over completed games before `week`."""
    out = {}
    for g in sched:
        if g['week'] >= week or not g.get('completed'):
            continue
        a, h = g['awayScore'], g['homeScore']
        if a is None or h is None:
            continue
        for team, mine, theirs in ((g['away'], a, h), (g['home'], h, a)):
            w, l, t = out.get(team, (0, 0, 0))
            out[team] = (w + (mine > theirs), l + (mine < theirs), t + (mine == theirs))
    return out


def win_pct(rec):
    """Shrunk toward .500 by half a game each way, so 1-0 is .75, not 1.00.
    Same formula as winPct() in js/recordShare.js."""
    w, l, t = rec or (0, 0, 0)
    return (w + t / 2 + 0.5) / (w + l + t + 1)


def record_share(p_dog, rec_diff, fit):
    x = fit['intercept'] + fit['price'] * math.log(p_dog / (1 - p_dog)) + fit['record'] * rec_diff
    return 1 / (1 + math.exp(-x))


def fit_record(rows):
    """Least squares on logit(dog share), three terms, by the normal equations
    (stdlib: no numpy in CI). rows = (p_dog, rec_diff, share_dog)."""
    lg = lambda x: math.log(x / (1 - x))
    X = [(1.0, lg(p), d) for p, d, _ in rows]
    y = [lg(min(max(s, 0.01), 0.99)) for _, _, s in rows]
    A = [[sum(r[i] * r[j] for r in X) for j in range(3)] + [sum(r[i] * v for r, v in zip(X, y))]
         for i in range(3)]
    for c in range(3):
        piv = max(range(c, 3), key=lambda r: abs(A[r][c]))
        A[c], A[piv] = A[piv], A[c]
        for r in range(3):
            if r != c:
                f = A[r][c] / A[c][c]
                A[r] = [a - f * b for a, b in zip(A[r], A[c])]
    return [A[i][3] / A[i][i] for i in range(3)]


def record_block(rows, k):
    """The record-aware curve, with its error beside the plain k curve's on the
    same underdog rows, so the file says whether the extra term earns its keep."""
    if len(rows) < 20:
        return None
    a, b, c = fit_record(rows)
    fit = {'intercept': round(a, 4), 'price': round(b, 4), 'record': round(c, 4)}
    rm = lambda f: round((sum((f(p, d) - s) ** 2 for p, d, s in rows) / len(rows)) ** 0.5, 4)
    fit['games'] = len(rows)
    fit['rmse'] = rm(lambda p, d: record_share(p, d, fit))
    fit['rmseK'] = rm(lambda p, d: share_for(p, k))
    return fit


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

    abbr = {t['mascot']: a for a, t in load(os.path.join(ROOT, 'data', 'teams', 'team-identity.json'))['teams'].items()}
    pairs, weeks, missing, dog_rows = [], [], [], []
    for path in sorted(glob.glob(os.path.join(ROOT, 'data', 'popularity', f'pop-{year}-w*.json'))):
        pop = load(path)
        week = pop['week']
        got = 0
        recs = team_records(sched, week)
        for g in pop['games']:
            pa = pregame(week, g['away'], g['home'])
            if pa is None:
                missing.append(f"W{week} {g['away']} at {g['home']}")
                continue
            pairs.append((pa, g['awayPct'] / 100))
            pairs.append((1 - pa, g['homePct'] / 100))
            got += 1
            dog_home = pa > 0.5
            p_dog = 1 - pa if dog_home else pa
            dog, fav = (g['home'], g['away']) if dog_home else (g['away'], g['home'])
            diff = win_pct(recs.get(abbr.get(dog))) - win_pct(recs.get(abbr.get(fav)))
            share = (g['homePct'] if dog_home else g['awayPct']) / 100
            if 0.02 < p_dog < 0.98:
                dog_rows.append((p_dog, diff, share))
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
        'record': record_block(dog_rows, best_k),
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
    if out['record']:
        r = out['record']
        print(f"record curve: intercept {r['intercept']}, price {r['price']}, record {r['record']}"
              f" over {r['games']} games (rmse {r['rmse']} vs {r['rmseK']} for k alone)")
    if missing:
        print(f'  {len(missing)} game(s) had no pre-kickoff price: ' + ', '.join(missing))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
