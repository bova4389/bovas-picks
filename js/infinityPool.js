/* ==========================================================================
   The Infinity War pool's identity, on its own so Node can import it.

   scripts/fetch_sleeper_feeds.mjs needs the league id, and js/infinityWar.js
   pulls in half the site on import. infinityWar.js re-exports this as POOL,
   so every existing import is unchanged.

   NEVER add a ?v= to this file -- see data.js's note on module identity.
   ========================================================================== */

/* Not in js/survivorLeagues.js -- that file is the survivor pools, and its
   every helper assumes one pick a week and a monotonic used-teams ledger.
   Neither is true here. */
export const POOL = {
  id: 'infinity',
  name: 'Infinity War',
  sleeper: {
    leagueId: '1400511807180828672',
    userId: '721908735856967680',
  },
  economics: { entry: 50, weekly: 20, season: { first: 380, second: 160 }, potShare: 1 },
};
