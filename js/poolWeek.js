/* ==========================================================================
   Which week a pool page opens on — the Wednesday 6pm changeover.

   A pool's week is not the NFL's week. The games end Monday night, but the
   week is still the week people are looking at on Tuesday: who won, who got
   knocked out, what it paid. So a week stays on screen until 6:00 PM local
   the Wednesday after its last game, and only then does the page open on the
   next one. Owner's rule, 2026-09-14, and one clock for every pool page:
   Standings and Squares both read cutoverFor() from here.

   NOT gameState.currentWeek(). That rolls over a few hours after the last
   game, which is right for a schedule and wrong for a pool -- it would swap
   Monday night's settled standings for an empty Week 2 before anyone had
   looked at them.

   The 36-hour tail is what makes one rule cover every kickoff slot. Measured
   from a Sunday afternoon game it lands early Monday, so the cutover is that
   same week's Wednesday; measured from a Monday nighter it lands Wednesday
   morning, so the cutover is that evening rather than eight days later.
   Without it a Monday-only week would need a special case, and that is the
   one week nobody would remember to test.

   Local time throughout, deliberately: "Wednesday at 6" means the clock on
   the phone of whoever is looking, which for everyone using this is Eastern.

   Pure, imports nothing. NEVER add a ?v= to this file -- see data.js's note
   on module identity.
   ========================================================================== */

/** Wednesday, as getDay() counts them. */
const WEDNESDAY = 3;

/** 6:00 PM local. */
export const CUTOVER_HOUR = 18;

/** Hours after the last kickoff before a week counts as settled. */
export const TAIL_HOURS = 36;

/**
 * When a week whose last game kicks off at `kickoff` stops being the default:
 * the first Wednesday 6pm at least TAIL_HOURS after that kickoff.
 */
export function cutoverFor(kickoff, tailHours = TAIL_HOURS, hour = CUTOVER_HOUR) {
  const settled = new Date(new Date(kickoff).getTime() + tailHours * 3_600_000);

  const at = new Date(settled);
  at.setHours(hour, 0, 0, 0);
  while (at.getDay() !== WEDNESDAY || at < settled) {
    at.setDate(at.getDate() + 1);
    at.setHours(hour, 0, 0, 0);
  }
  return at;
}

/**
 * The week a pool page should open on, from the schedule feed: the first week
 * whose cutover has not passed. Holds on the final week once the season is
 * over, so January opens on Week 18 rather than on nothing.
 *
 * Returns null for an empty schedule so the caller decides what "no season"
 * looks like.
 */
export function poolWeek(schedule, now = new Date()) {
  const lastKick = new Map();
  for (const g of schedule?.games || []) {
    const t = new Date(g.date).getTime();
    if (!Number.isFinite(t) || !Number.isFinite(Number(g.week))) continue;
    const w = Number(g.week);
    if (!lastKick.has(w) || t > lastKick.get(w)) lastKick.set(w, t);
  }
  const weeks = [...lastKick.keys()].sort((a, b) => a - b);
  if (!weeks.length) return null;

  const live = weeks.find((w) => cutoverFor(lastKick.get(w)) > now);
  return live ?? weeks[weeks.length - 1];
}
