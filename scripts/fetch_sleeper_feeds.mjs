#!/usr/bin/env node
/* ==========================================================================
   Fetch every Sleeper pool with the owner's token and write the shared feed:
   data/sleeper/feeds-<year>.json, keyed by Sleeper league id.

   Run by .github/workflows/sleeper-feeds.yml with SLEEPER_TOKEN from the repo
   secret. The site seeds each device's caches from this file (js/sharedFeeds.js),
   so a phone or iPad that never pasted a token still shows Poop, Deadpool and
   Infinity War. See "The shared feed" in js/sleeperApi.js.

   ── IT RUNS THE SITE'S OWN FETCHERS. DO NOT PORT THEM HERE. ──────────────
   Same carve-out and same reason as log_week_card.mjs: fetchSleeperSurvivor
   and fetchInfinityPool normalize Sleeper's answer AND apply the kickoff gate.
   A second copy of either would be a second gate, and the file this writes is
   committed to a public repo -- a gate that drifted open here would publish
   picks before kickoff. Running the one the browser runs is the only way the
   committed copy hides exactly what the site hides.

   The token never touches disk or the log: it is handed to sleeperAuth.js
   through a stand-in localStorage that holds only it, in memory.

   Writes nothing when no pool changed (fetchedAt aside), so a quiet hour makes
   no commit. Exits 1 if any pool fails, and then writes nothing at all rather
   than a file with a pool missing.
   ========================================================================== */

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const token = (process.env.SLEEPER_TOKEN || '').trim().replace(/^bearer\s+/i, '');
if (!token) {
  console.error('SLEEPER_TOKEN is not set');
  process.exit(1);
}
// Before the site's modules load: sleeperAuth.js reads the token from here.
globalThis.localStorage = {
  getItem: (k) => (k === 'sleeper:token' ? token : null),
  setItem: () => {},
  removeItem: () => {},
};

// No year literal -- CLAUDE.md's season rule, same as log_week_card.mjs.
const { activeSeason } = await import('../js/season.js');
const season = Number(process.argv[2]) || activeSeason();

const { LEAGUES } = await import('../js/survivorLeagues.js');
const { POOL: INFINITY } = await import('../js/infinityPool.js');
const { fetchSleeperSurvivor } = await import('../js/sleeperSurvivor.js');
const { fetchInfinityPool } = await import('../js/infinityFeed.js');

const jobs = [
  ...LEAGUES.filter((l) => l.sleeper).map((l) => [l.name, l.sleeper, fetchSleeperSurvivor]),
  [INFINITY.name, INFINITY.sleeper, fetchInfinityPool],
];

const pools = {};
let failed = 0;
for (const [name, pool, fetchPool] of jobs) {
  try {
    const feed = await fetchPool(pool, season);
    pools[pool.leagueId] = feed;
    const week = feed.weeks?.[String(feed.currentWeek)];
    console.log(`${name}: ${feed.entries.length} entries, week ${feed.currentWeek}` +
      (week ? `, ${week.revealed ?? 0} of ${week.expected ?? '?'} picks shown` : ''));
  } catch (err) {
    failed++;
    console.error(`${name}: FAILED -- ${err.message}`);
  }
}
if (failed) {
  console.error(`${failed} pool(s) failed; nothing written`);
  process.exit(1);
}

const path = join(ROOT, 'data', 'sleeper', `feeds-${season}.json`);
const strip = (d) => JSON.stringify(d, (k, v) => (k === 'fetchedAt' || k === 'generated' ? undefined : v));
if (existsSync(path)) {
  const old = JSON.parse(readFileSync(path, 'utf8'));
  if (strip(old.pools) === strip(pools)) {
    console.log('no pool changed; not writing');
    process.exit(0);
  }
}

mkdirSync(dirname(path), { recursive: true });
const out = { season, generated: new Date().toISOString(), pools };
writeFileSync(`${path}.tmp`, `${JSON.stringify(out, null, 1)}\n`);
renameSync(`${path}.tmp`, path);
console.log(`wrote data/sleeper/feeds-${season}.json`);
