#!/usr/bin/env node
/* ==========================================================================
   Write this week's survivor card into data/survivor-log-<year>.json.

   Run by .github/workflows/fetch-odds.yml on every odds snapshot, so the
   season's record keeps itself with nobody having to remember anything. The
   log is what SURVIVOR-STRATEGY.md §6 step 7 asked for and what the Lookback
   tab has been blocked on.

   ── IT IMPORTS THE SITE'S OWN MODULES. DO NOT PORT THE MODEL HERE. ───────

   js/weekCardModel.js and everything under it are plain ES modules with no
   DOM and no fetching, so Node can import them as they are. That is the whole
   design of this script: a second implementation of the card -- in Python,
   or reimplemented here -- would be two models that agree until the day they
   quietly do not, and the log would then record a recommendation the site
   never made. There is exactly one model, and this runs it.

   `js/package.json` exists solely to tell Node those files are ESM. It is
   four lines, no dependencies, and the browser never reads it. THIS IS NOT A
   BUILD STEP: nothing is compiled, bundled or installed, the site does not
   know this file exists, and `node` is never required to serve the site. It
   is the same carve-out the Python scripts in this directory already have --
   offline tooling that produces data, not a toolchain the page depends on.

   ── WHERE EACH POOL'S USED TEAMS COME FROM ──────────────────────────────

     Poop, Deadpool, East Orange   Sleeper, live. My own picks come back with
                                   everyone else's, so these are exact and
                                   need no state from anywhere.
     Mike's                        THE LOG'S OWN PREVIOUS WEEKS. There is no
                                   feed, and the mailed workbook carries no
                                   flag saying which entry is mine, so the
                                   only thing here that knows what Mike's has
                                   spent is what this log previously said was
                                   recommended.

   That last one assumes the recommendation was actually submitted. The
   browser holds the truth in `survivor:<season>:mike`, and js/weekCard.js
   compares the two and shows a drift warning when they disagree -- because a
   wrong used-set does not throw, it just starts confidently recommending a
   team that is already gone.

   ── IT MUST NEVER TAKE THE ODDS FEED DOWN ───────────────────────────────

   This runs inside the odds workflow, and the odds snapshot is the more
   important of the two jobs by a long way. Every failure path here logs and
   exits 0. Sleeper being unreachable, a missing projections file, a malformed
   log -- none of them may cost the odds commit.
   ========================================================================== */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { activeSeason } from '../js/season.js';
import { buildGrid } from '../js/gridModel.js';
import { currentWeek } from '../js/gameState.js';
import { LEAGUES } from '../js/survivorLeagues.js';
import { fetchSleeperSurvivor, myPicksFrom } from '../js/sleeperSurvivor.js';
import {
  buildWeekCard, cardForLog, usedFromLog, mergeIntoLog, liveEntrantsFrom,
} from '../js/weekCardModel.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const say = (...a) => console.log('[week-card]', ...a);

/** Read a JSON file, or null. Absence is a normal state for several of these
 *  and must not read as a failure. */
async function readJSON(rel) {
  try {
    return JSON.parse(await readFile(join(ROOT, rel), 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  // No year literal anywhere -- CLAUDE.md's season rule. The argument is for
  // rebuilding a past season by hand, not for the workflow.
  const season = Number(process.argv[2]) || activeSeason();
  say(`season ${season}`);

  const [schedule, projections, odds] = await Promise.all([
    readJSON(`data/schedule-${season}.json`),
    readJSON(`data/projections-${season}.json`),
    readJSON('data/odds/current.json'),
  ]);

  if (!schedule?.games?.length) return say('no schedule — nothing to log');
  if (!projections?.teamOutlook) return say('no projections — nothing to log');
  if (!odds?.events?.length) return say('no odds snapshot — nothing to log');

  const model = buildGrid({ schedule, projections, odds });
  const week = currentWeek(schedule);
  const log = (await readJSON(`data/survivor-log-${season}.json`)) || { season, weeks: {} };
  say(`week ${week}, odds fetched ${odds.fetchedAt}`);

  const boards = [];
  const feeds = [];
  for (const league of LEAGUES) {
    const { used, source, feed } = await usedFor(league, season, log, week);
    const size = feed?.entries?.length;
    say(`  ${league.short}: ${used.size} spent (${source})`
      + (size ? `, ${size} entries` : ''));
    boards.push({ league, used });
    feeds.push([league.id, feed]);
  }

  // Sleeper is the source of truth for entry counts, and this is the one
  // place that always has a fresh answer -- the feeds were just fetched.
  const card = buildWeekCard({
    model, projections, odds, week, weeks: model.weeks, boards,
    liveEntrants: liveEntrantsFrom(feeds),
  });

  const teamsLeft = new Map(boards.map((b) => [b.league.id, 32 - b.used.size]));
  const entry = cardForLog(card, { teamsLeft });

  const { log: next, wrote, reason } = mergeIntoLog(log, week, entry);

  say(card.picks.map((p) => `${p.leagueId}=${p.pick?.team ?? '—'}`).join(' '),
    `[${card.confidence.state}]`);

  if (!wrote) return say(`${reason} — leaving the log alone`);

  // Trailing newline: the file is committed, and a diff that shows "\ No
  // newline at end of file" every run is noise in a record meant to be read.
  await writeFile(
    join(ROOT, `data/survivor-log-${season}.json`),
    `${JSON.stringify(next, null, 2)}\n`,
    'utf8'
  );
  say(`${reason} week ${week}`);
}

/**
 * One pool's spent teams, from the best source that pool has.
 *
 * A Sleeper failure falls back to the log rather than aborting: a slightly
 * stale used-set produces a slightly stale recommendation, which is recoverable
 * and is labeled in the run output. Aborting produces no record at all.
 */
async function usedFor(league, season, log, week) {
  if (league.sleeper) {
    try {
      const feed = await fetchSleeperSurvivor(league.sleeper, season);
      return { used: new Set(Object.values(myPicksFrom(feed))), source: 'sleeper', feed };
    } catch (err) {
      say(`  ! ${league.short}: Sleeper unreachable (${err.message}) — falling back to the log`);
    }
  }
  return { used: usedFromLog(log, league.id, week), source: 'log', feed: null };
}

// One catch for everything. See the header: the odds commit must survive
// whatever happens in here.
main().catch((err) => {
  say('failed, leaving the log unchanged:', err?.stack || err);
});
