#!/usr/bin/env python3
"""
The season-long pool, looked back on: how our cards did, how they SHOULD have
done, and how the rest of the field plays. Feeds the Lookback tab.

    python scripts/lookback.py 2026

Reads (all committed):
    data/raw/entries-<year>-w<NN>.json      every card, from parse_pool_picks.py
    data/results/pickem-<year>-w<NN>.json   graded weeks, from grade_week.py
    data/popularity/pop-<year>-w<NN>.json   the field's pick shares
    data/popularity/fit-<year>.json         the pick-share curve's k
    data/number-map-<year>.json             which games count, and their numbers
    data/schedule-<year>.json               kickoffs
    data/odds/history/*.json                every price ever taken, per game

Writes:
    data/results/lookback-<year>.json

Only weeks that are BOTH carded and graded complete are looked back on.

PROCESS, NOT OUTCOME. Thirteen games is nothing (STRATEGY.md §6), so the
headline number is not whether a card won but what its chance of winning the
week WAS. Each week is simulated TRIALS times from the last pre-kickoff
de-vigged price of every game, and every card is scored against the real
cards the other ~280 entrants sent in, with the real tie rule: most correct,
then the Monday-night total closest by absolute value, then an even split.
The Monday total is drawn around that game's market total at the historical
SD of 13.9 (STRATEGY.md §5). The same simulated weeks score every card, so
the comparison between cards is paired and a small difference is real.

Cards compared, each week:
    actual       what we sent (our entry in Mike's sheet)
    chalk        every Saturday favorite, our Monday guess
    rules        what the Recommend tab's rules pick, from SATURDAY prices
                 and a MODELED pick share -- the information it actually has
                 when picks are due (the cards arrive after the deadline).
                 Record-aware from Week 2 on, like the tab (2026-10-31). The
                 curve is fitted on these same weeks, so this card is mildly
                 in-sample: leave-one-week-out it measured 1.13% against the
                 in-sample figure here, Weeks 1-7.
    rulesKnown   the same rules given the field's real pick shares -- what
                 better share estimates alone would be worth
    best         a hill-climb from the best of the above, one game flipped at
                 a time, scored against the same simulated weeks. Knows the
                 field's cards, so it is a ceiling, not a target.
    random       1 in N, what an average entry is worth

The rules here are a COPY of markPicks()/tierOf() in js/recommend.js, kept
deliberately small and named the same. This script grades that tab, so if the
two ever disagree the copy here is the one to fix -- see RULES below.

Stdlib only, so the Tuesday workflow needs no pip install. Seeded, so the
same inputs write the same file and an unchanged week commits nothing.
"""

import datetime as dt
import glob
import json
import random
import statistics
import sys
from pathlib import Path

from fit_pick_share import record_share, team_records, win_pct

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
TRIALS = 40000
SEED = 20261003
TOTAL_SD = 13.9          # STRATEGY.md §5: 2,127 completed games
TIEBREAK_OFFSET = 7      # js/tiebreak.js: market total + 7 (high side first)
MY_NICK = "Bova"         # js/liveModel.js MY_NICK

# RULES -- quoted from js/recommend.js, which quotes STRATEGY.md §4.
FLOOR = 0.38
THIN_SHARE = 0.40
LONG_FLOOR = 0.25
LONELY_SHARE = 0.12
LONG_QUOTA = 1


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def ts(text):
    return dt.datetime.fromisoformat(text.replace("Z", "+00:00"))


def share_for(p, k):
    a, b = p ** k, (1 - p) ** k
    return a / (a + b)


def write_if_changed(path, obj):
    text = json.dumps(obj, indent=1, ensure_ascii=False) + "\n"
    if path.exists() and path.read_text(encoding="utf-8") == text:
        return False
    tmp = path.with_suffix(".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)
    return True


# ── Prices ──────────────────────────────────────────────────────────────────

def load_histories():
    out = []
    for path in glob.glob(str(DATA / "odds" / "history" / "*.json")):
        snaps = load(path)
        snaps = snaps if isinstance(snaps, list) else snaps.get("snapshots", [])
        if snaps:
            out.append(snaps)
    return out


def find_history(histories, sched, week, away, home):
    """The snapshot trail for one number-map game. Mascots against city names,
    kept inside that week's dates because rivals meet twice. Same match as
    scripts/fit_pick_share.py."""
    days = [ts(g["date"]) for g in sched if g["week"] == week]
    lo, hi = min(days) - dt.timedelta(days=1), max(days) + dt.timedelta(days=1)
    for snaps in histories:
        last = snaps[-1]
        if not (last["away"].endswith(" " + away) and last["home"].endswith(" " + home)):
            continue
        if lo <= ts(last["commenceTime"]) <= hi:
            return snaps
    return None


def price_before(snaps, cutoff):
    pre = [s for s in snaps if ts(s["fetchedAt"]) < cutoff]
    return pre[-1] if pre else None


# ── One week ────────────────────────────────────────────────────────────────

class Week:
    """Everything the simulation needs, as bitmasks: bit i set = home side of
    counted game i."""

    def __init__(self, year, week, games, entries, result, pop, histories, sched, k, record_fit=None):
        self.week = week
        self.games = games
        self.n = len(games)
        self.full = (1 << self.n) - 1
        kick = []
        self.p_home, self.p_home_sat, self.priced = [], [], True
        totals = []
        for g in games:
            snaps = find_history(histories, sched, week, g["away"], g["home"])
            if not snaps:
                raise ValueError(f"week {week}: no prices for {g['away']} at {g['home']}")
            kick.append(ts(snaps[-1]["commenceTime"]))
            g["_snaps"] = snaps
        # Picks are due Saturday night (Sunday ~04:00 UTC): 13h before the
        # first counted Sunday kickoff lands there for a 1pm ET start.
        deadline = min(kick) - dt.timedelta(hours=13)
        for g, ko in zip(games, kick):
            pre = price_before(g["_snaps"], ko)
            sat = price_before(g["_snaps"], min(ko, deadline)) or pre
            self.p_home.append(pre["homeWinProb"])
            self.p_home_sat.append(sat["homeWinProb"])
            if g.get("tiebreaker"):
                self.total_pre = pre.get("total")
                self.total_sat = sat.get("total") or pre.get("total")
        if not getattr(self, "total_pre", None):
            self.total_pre = self.total_sat = 44.0
        self.deadline = deadline

        # Real outcome, from the graded file.
        key = result["answerKey"]
        self.actual_out, self.tied_games = 0, set()
        for i, g in enumerate(games):
            k_ = key.get(str(g["awayNum"]))
            if not k_ or not k_.get("number"):
                self.tied_games.add(i)
            elif k_["number"] == g["homeNum"]:
                self.actual_out |= 1 << i
        self.actual_total = result.get("tiebreakerTotal")

        # Cards.
        num_to_bit = {}
        for i, g in enumerate(games):
            num_to_bit[g["awayNum"]] = (i, 0)
            num_to_bit[g["homeNum"]] = (i, 1)
        self.field, self.mine = [], None
        for e in entries:
            card, mask = 0, 0
            for num in e["picks"]:
                if num in num_to_bit:
                    i, side = num_to_bit[num]
                    mask |= 1 << i
                    card |= side << i
            rec = {"entry": e["entry"], "name": e["name"], "nick": e["nick"],
                   "card": card, "mask": mask, "mnf": e.get("mnf")}
            if e["nick"] == MY_NICK and self.mine is None:
                self.mine = rec
            else:
                self.field.append(rec)

        # Pick shares: measured (the cards) and modeled (what we had Saturday).
        meas = {(p["away"], p["home"]): p for p in pop["games"]}
        self.share_home_meas = []
        for g in games:
            p = meas.get((g["away"], g["home"]))
            self.share_home_meas.append(p["homePct"] / 100 if p else None)
        self.k = k
        # js/recommend.js modeledShare(): record-aware once a game has been
        # played, the plain k curve before then.
        self.record_fit = record_fit
        recs = team_records(sched, week)
        abbr = {t["mascot"]: a for a, t in load(DATA / "teams" / "team-identity.json")["teams"].items()}
        self.recs = [(recs.get(abbr.get(g["away"])), recs.get(abbr.get(g["home"]))) for g in games]

    # ── the rules, as js/recommend.js applies them ──
    def rules_card(self, measured):
        rows = []
        for i in range(self.n):
            ph = self.p_home_sat[i]
            dog_home = ph < 0.5
            dog_p = ph if dog_home else 1 - ph
            if measured and self.share_home_meas[i] is not None:
                sh = self.share_home_meas[i]
                share = sh if dog_home else 1 - sh
            else:
                ra, rh = self.recs[i]
                dog_r, fav_r = (rh, ra) if dog_home else (ra, rh)
                if self.record_fit and dog_r and fav_r:
                    share = record_share(dog_p, win_pct(dog_r) - win_pct(fav_r), self.record_fit)
                else:
                    share = share_for(dog_p, self.k)
            lev = dog_p / share if share else 0
            if dog_p < LONG_FLOOR:
                tier = "below"
            elif dog_p < FLOOR:
                tier = "lonely" if share <= LONELY_SHARE else "below"
            elif share > THIN_SHARE:
                tier = "thin"
            else:
                tier = "take"
            rows.append({"i": i, "dog_home": dog_home, "p": dog_p, "lev": lev, "tier": tier})
        take = sorted([r for r in rows if r["tier"] == "take"], key=lambda r: -r["lev"])
        lonely = sorted([r for r in rows if r["tier"] == "lonely"], key=lambda r: -r["p"])
        n = len(take)
        live = n if n <= 2 else 4 if n >= 6 else 3
        dogs = take[:live] + lonely[:LONG_QUOTA]
        card = self.chalk_card()
        for r in dogs:
            card ^= 1 << r["i"]
        return card

    def chalk_card(self):
        card = 0
        for i, ph in enumerate(self.p_home_sat):
            if ph > 0.5:
                card |= 1 << i
        return card

    def rule_guess(self):
        return round(self.total_sat + TIEBREAK_OFFSET)

    # ── the simulation ──
    def simulate(self):
        rng = random.Random(SEED + self.week)
        self.outs, self.totals = [], []
        for _ in range(TRIALS):
            o = 0
            for i, ph in enumerate(self.p_home):
                if rng.random() < ph:
                    o |= 1 << i
            self.outs.append(o)
            self.totals.append(max(0, round(rng.gauss(self.total_pre, TOTAL_SD))))
        # Collapse identical cards; chalk-ish cards repeat a lot.
        groups = {}
        for f in self.field:
            groups.setdefault((f["card"], f["mask"]), []).append(f["mnf"])
        groups = list(groups.items())
        self.fmax, self.fdist, self.fcount = [], [], []
        for t in range(TRIALS):
            o, tot = self.outs[t], self.totals[t]
            best, bd, bc = -1, None, 0
            for (card, mask), guesses in groups:
                s = (~(card ^ o) & mask).bit_count()
                if s < best:
                    continue
                if s > best:
                    best, bd, bc = s, None, 0
                for gss in guesses:
                    d = abs(tot - gss) if gss is not None else 10 ** 6
                    if bd is None or d < bd:
                        bd, bc = d, 1
                    elif d == bd:
                        bc += 1
            self.fmax.append(best)
            self.fdist.append(bd)
            self.fcount.append(bc)

    def win_chance(self, card, guess):
        full, won = self.full, 0.0
        for t in range(TRIALS):
            s = (~(card ^ self.outs[t]) & full).bit_count()
            m = self.fmax[t]
            if s > m:
                won += 1
            elif s == m:
                d = abs(self.totals[t] - guess)
                if d < self.fdist[t]:
                    won += 1
                elif d == self.fdist[t]:
                    won += 1 / (self.fcount[t] + 1)
        return won / TRIALS

    def best_card(self, start, guess):
        card, cur = start, self.win_chance(start, guess)
        while True:
            step = max(((self.win_chance(card ^ (1 << i), guess), i) for i in range(self.n)))
            if step[0] <= cur:
                return card, cur
            cur, card = step[0], card ^ (1 << step[1])

    # ── what actually happened ──
    def correct(self, card, mask=None):
        mask = self.full if mask is None else mask
        return (~(card ^ self.actual_out) & mask & ~self.tied_bits()).bit_count()

    def tied_bits(self):
        b = 0
        for i in self.tied_games:
            b |= 1 << i
        return b

    def dogs_of(self, card):
        """Each underdog side on a card, by the Saturday price."""
        out = []
        for i in range(self.n):
            ph = self.p_home_sat[i]
            picked_home = bool(card >> i & 1)
            p = ph if picked_home else 1 - ph
            if p >= 0.5:
                continue
            sh = self.share_home_meas[i]
            share = None if sh is None else (sh if picked_home else 1 - sh)
            g = self.games[i]
            team = g["home"] if picked_home else g["away"]
            won = None if i in self.tied_games else (bool(self.actual_out >> i & 1) == picked_home)
            out.append({"team": team, "p": round(p, 3),
                        "share": None if share is None else round(share, 3),
                        "won": won})
        return out

    def describe(self, card, guess, chance):
        return {"chance": round(chance, 5), "correct": self.correct(card),
                "dogs": self.dogs_of(card), "mnf": guess}


def field_dog_count(wk, f):
    n = 0
    for i in range(wk.n):
        if not (f["mask"] >> i & 1):
            continue
        ph = wk.p_home_sat[i]
        if (ph > 0.5) != bool(f["card"] >> i & 1):
            n += 1
    return n


# ── The season ──────────────────────────────────────────────────────────────

def main(argv):
    if len(argv) != 1 or not argv[0].isdigit():
        print(__doc__)
        return 2
    year = int(argv[0])
    number_map = load(DATA / f"number-map-{year}.json")["weeks"]
    sched = load(DATA / f"schedule-{year}.json")["games"]
    fit = DATA / "popularity" / f"fit-{year}.json"
    fit_doc = load(fit) if fit.exists() else {}
    k = fit_doc.get("k", 2.0)
    record_fit = fit_doc.get("record")
    histories = load_histories()

    weeks_out, people = [], {}
    calib = {}      # price bucket -> [games, favorite wins]
    for raw in sorted(glob.glob(str(DATA / "raw" / f"entries-{year}-w*.json"))):
        cards = load(raw)
        week = cards["week"]
        res_path = DATA / "results" / f"pickem-{year}-w{week:02d}.json"
        pop_path = DATA / "popularity" / f"pop-{year}-w{week:02d}.json"
        if not res_path.exists() or not pop_path.exists():
            continue
        result = load(res_path)
        if not result.get("complete"):
            continue
        games = [dict(g) for g in number_map[str(week)] if g["counts"]]
        wk = Week(year, week, games, cards["entries"], result, load(pop_path), histories, sched, k, record_fit)
        if wk.mine is None:
            print(f"week {week}: no card for {MY_NICK}, skipped")
            continue
        wk.simulate()

        my_guess = wk.mine["mnf"]
        rule_guess = wk.rule_guess()
        cards_ = {
            "actual": (wk.mine["card"], my_guess),
            "chalk": (wk.chalk_card(), my_guess),
            "rules": (wk.rules_card(False), rule_guess),
            "rulesKnown": (wk.rules_card(True), rule_guess),
        }
        evals = {name: wk.win_chance(c, g) for name, (c, g) in cards_.items()}
        start = max(cards_, key=lambda n: evals[n])
        best, best_chance = wk.best_card(cards_[start][0], cards_[start][1])
        cards_["best"] = (best, cards_[start][1])
        evals["best"] = best_chance
        actual_rule_tb = wk.win_chance(wk.mine["card"], rule_guess)

        graded = {e["entry"]: e for e in result["entries"]}
        mine_g = graded.get(wk.mine["entry"], {})
        scores = sorted((e["correct"] for e in result["entries"]), reverse=True)
        winners = [graded[w] for w in result.get("winners", []) if w in graded]
        field_by_entry = {f["entry"]: f for f in wk.field}
        field_by_entry[wk.mine["entry"]] = wk.mine
        dog_counts = [field_dog_count(wk, f) for f in field_by_entry.values()]

        weeks_out.append({
            "week": week,
            "entrants": len(result["entries"]),
            "games": wk.n,
            "k": k,
            "cards": {name: wk.describe(c, g, evals[name]) for name, (c, g) in cards_.items()},
            "random": round(1 / len(result["entries"]), 5),
            "actualWithRuleTiebreak": round(actual_rule_tb, 5),
            "rank": mine_g.get("rank"),
            "myCorrect": mine_g.get("correct"),
            "top": scores[0],
            "median": statistics.median(scores),
            "fieldDogsAvg": round(sum(dog_counts) / len(dog_counts), 2),
            "mnfTotal": wk.actual_total,
            "marketTotal": wk.total_sat,
            "myMnf": my_guess,
            "ruleMnf": rule_guess,
            "winners": [{
                "nick": w["nick"], "correct": w["correct"], "mnf": w.get("mnf"),
                "dogs": field_dog_count(wk, field_by_entry[w["entry"]]),
                "dogsWon": sum(1 for d in wk.dogs_of(field_by_entry[w["entry"]]["card"]) if d["won"]),
            } for w in winners],
            "tiedAtTop": sum(1 for s in scores if s == scores[0]),
        })

        # Market calibration: did favorites win as often as priced?
        for i in range(wk.n):
            if i in wk.tied_games:
                continue
            ph = wk.p_home[i]
            fav_p = max(ph, 1 - ph)
            b = min(int(fav_p * 10), 9) * 10
            c = calib.setdefault(b, [0, 0, 0.0])
            c[0] += 1
            c[1] += int(bool(wk.actual_out >> i & 1) == (ph > 0.5))
            c[2] += fav_p

        # The field, per person.
        for e in result["entries"]:
            f = field_by_entry.get(e["entry"])
            key = (e["name"], e["nick"])
            p = people.setdefault(key, {"name": e["name"], "nick": e["nick"], "weeks": 0,
                                        "correct": 0, "chalk": 0, "dogs": 0, "dogsWon": 0,
                                        "wins": 0, "top5": 0})
            p["weeks"] += 1
            p["correct"] += e["correct"]
            p["chalk"] += wk.correct(wk.chalk_card(), f["mask"] if f else wk.full)
            if f:
                ds = wk.dogs_of(f["card"] & f["mask"] | (wk.chalk_card() & ~f["mask"]))
                p["dogs"] += len(ds)
                p["dogsWon"] += sum(1 for d in ds if d["won"])
            p["wins"] += int(e["entry"] in result.get("winners", []))
            p["top5"] += int((e.get("rank") or 999) <= 5)

        c = weeks_out[-1]["cards"]
        print(f"week {week}: actual {c['actual']['chance']:.2%}  chalk {c['chalk']['chance']:.2%}  "
              f"rules {c['rules']['chance']:.2%}  rulesKnown {c['rulesKnown']['chance']:.2%}  "
              f"best {c['best']['chance']:.2%}  random {weeks_out[-1]['random']:.2%}  "
              f"| correct {c['actual']['correct']} vs chalk {c['chalk']['correct']} "
              f"rules {c['rules']['correct']}  rank {weeks_out[-1]['rank']}/{weeks_out[-1]['entrants']}")

    if not weeks_out:
        print("no weeks both carded and graded -- nothing written")
        return 0

    full_season = max(p["weeks"] for p in people.values())
    field = []
    for p in people.values():
        p["vsChalk"] = p["correct"] - p["chalk"]
        p["me"] = p["nick"] == MY_NICK
        field.append(p)
    field.sort(key=lambda p: (-p["correct"], -p["wins"], p["nick"].lower()))
    for i, p in enumerate(field):
        p["rank"] = 1 + sum(1 for q in field if q["correct"] > p["correct"])

    out = {
        "season": year,
        "trials": TRIALS,
        "k": k,
        "recordShare": bool(record_fit),
        "priceRule": "simulated from the last price before kickoff; rules choose from the last price before the Saturday deadline",
        "weeks": weeks_out,
        "calibration": [{"band": f"{b}-{b + 10}%", "games": c[0], "favWon": c[1],
                         "expected": round(c[2], 1)} for b, c in sorted(calib.items())],
        "fullSeasonWeeks": full_season,
        "field": [p for p in field if p["weeks"] == full_season][:15]
                 + [p for p in field if p["me"] and (p["weeks"] != full_season or field.index(p) >= 15)],
        "fieldSize": len(field),
    }
    path = DATA / "results" / f"lookback-{year}.json"
    print(("wrote " if write_if_changed(path, out) else "unchanged ") + str(path.relative_to(ROOT)))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
