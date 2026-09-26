/* ==========================================================================
   Seed this device's Sleeper caches from the shared feed, once, at load.

   Every tab reads the pools synchronously out of localStorage
   (loadCachedFeed / loadCachedPool). Writing the GitHub job's copy into those
   same keys before the tabs boot means no tab needs to know the shared feed
   exists: a device that has never connected shows the pools the same way a
   connected one does. See "The shared feed" in js/sleeperApi.js.

   A local copy is only replaced by a NEWER shared one, so a device that just
   refreshed live with its own token keeps its fresher answer.

   NEVER add a ?v= to this file -- see data.js's note on module identity.
   ========================================================================== */

import { loadSharedFeeds } from './sleeperApi.js';
import { setSharedFeed } from './sleeperAuth.js';
import { LEAGUES } from './survivorLeagues.js';
import { POOL as INFINITY } from './infinityPool.js';
import { loadCachedFeed, saveCachedFeed } from './sleeperSurvivor.js';
import { loadCachedPool, saveCachedPool } from './infinityFeed.js';

const newer = (copy, local) => Boolean(copy) && !(Number(local?.fetchedAt) >= Number(copy.fetchedAt));

/** Never holds the page up for long: a slow or missing file just means the
 *  tabs boot on whatever this device already had. */
export async function seedSharedFeeds(season, timeoutMs = 3000) {
  const data = await Promise.race([
    loadSharedFeeds(season),
    new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
  if (!data?.pools) return;
  setSharedFeed({ generated: data.generated });

  for (const l of LEAGUES) {
    const copy = l.sleeper && data.pools[l.sleeper.leagueId];
    if (newer(copy, loadCachedFeed(season, l.id))) saveCachedFeed(season, l.id, copy);
  }
  const copy = data.pools[INFINITY.sleeper.leagueId];
  if (newer(copy, loadCachedPool(season, INFINITY.id))) saveCachedPool(season, INFINITY.id, copy);
}
