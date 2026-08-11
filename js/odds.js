/* ==========================================================================
   Odds — market win probabilities and line movement.

   Reads the snapshot scripts/fetch_odds.py commits to data/odds/. This tab
   does no fetching of its own: The Odds API key must never reach client JS,
   and a page full of visitors hitting the API directly would blow the free
   tier's monthly budget in a day. Static JSON, updated on a schedule, is the
   whole design.
   ========================================================================== */

import { getOddsSnapshot, getOddsHistory, getOddsQuota } from './data.js';
import { mascotOf } from './teams.js';

const DAY_ORDER = ['Thursday', 'Friday', 'Saturday', 'Sunday', 'Monday'];

export async function initOdds(root) {
  const snapshot = await getOddsSnapshot();

  if (!snapshot || !snapshot.events.length) {
    root.innerHTML = emptyState();
    return;
  }

  const byBucket = new Map();
  for (const ev of snapshot.events) {
    if (!byBucket.has(ev.bucket)) byBucket.set(ev.bucket, []);
    byBucket.get(ev.bucket).push(ev);
  }
  const buckets = [...byBucket.keys()].sort((a, b) => a - b);

  const quota = await getOddsQuota();
  const histories = await Promise.all(
    buckets.map((b) => getOddsHistory(bucketLabel(b)))
  );
  const historyByBucket = new Map(buckets.map((b, i) => [b, histories[i]]));

  root.innerHTML = `
    <div class="section-head">
      <div>
        <p class="eyebrow">Market data</p>
        <h2>Odds</h2>
      </div>
      ${quota ? budgetNote(quota) : ''}
    </div>
    <p class="hint" style="margin:0 0 20px;color:var(--ink-soft);">
      Snapshot from ${formatTimestamp(snapshot.fetchedAt)}. Win probability is
      the de-vigged moneyline, averaged across ${bookmakerRange(snapshot.events)}
      sportsbook${bookmakerRange(snapshot.events) === 1 ? '' : 's'}.
    </p>
    ${buckets.map((b) => bucketSection(b, byBucket.get(b), historyByBucket.get(b))).join('')}
  `;
}

function bucketLabel(bucket) {
  return bucket === 0 ? 'current' : `bucket${bucket > 0 ? '+' : ''}${bucket}`;
}

function bucketTitle(bucket) {
  if (bucket === 0) return 'This week';
  if (bucket === 1) return 'Next week';
  if (bucket === -1) return 'Last week';
  return bucket > 0 ? `${bucket} weeks out` : `${-bucket} weeks ago`;
}

function bucketSection(bucket, events, history) {
  const byDay = new Map();
  for (const ev of events) {
    const day = weekdayOf(ev.commenceTime);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(ev);
  }
  const days = [...byDay.keys()].sort(
    (a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b)
  );

  return `
    <div class="bucket">
      <h2 class="bucket-title">${escape(bucketTitle(bucket))}</h2>
      ${days.map((day) => `
        <div class="daygroup">
          <h3>${escape(day)}</h3>
          ${byDay.get(day).map((ev) => oddsRow(ev, history)).join('')}
        </div>`).join('')}
    </div>`;
}

function oddsRow(ev, history) {
  const homePct = Math.round(ev.homeWinProb * 100);
  const awayPct = 100 - homePct;
  const move = movementFor(ev, history);

  return `
    <div class="card oddsgame">
      <div class="oddsgame-time">${formatKickoff(ev.commenceTime)}</div>
      <div class="oddsgame-teams">
        <div class="oddsteam">
          <span class="oddsteam-name">${escape(mascotOf(ev.away))}</span>
          <span class="oddsteam-pct">${awayPct}%</span>
        </div>
        <div class="oddsteam oddsteam-home">
          <span class="oddsteam-name">${escape(mascotOf(ev.home))}</span>
          <span class="oddsteam-pct">${homePct}%</span>
        </div>
      </div>
      <div class="prob-bar" role="img" aria-label="${escape(mascotOf(ev.away))} ${awayPct}%, ${escape(mascotOf(ev.home))} ${homePct}%">
        <div class="prob-seg prob-away" style="width:${awayPct}%"></div>
        <div class="prob-seg prob-home" style="width:${homePct}%"></div>
      </div>
      <div class="oddsgame-meta">
        <span>${ev.bookmakerCount} book${ev.bookmakerCount === 1 ? '' : 's'} · ${(ev.vig * 100).toFixed(1)}% hold</span>
        ${move ? `<span class="odds-move ${move.dir}">${move.text}</span>` : '<span class="odds-move">Opening line</span>'}
      </div>
    </div>`;
}

function movementFor(ev, history) {
  if (!history || history.length < 2) return null;
  const snapshotsWithGame = history
    .map((h) => h.events.find((e) => e.id === ev.id))
    .filter(Boolean);
  if (snapshotsWithGame.length < 2) return null;

  const opening = snapshotsWithGame[0];
  const current = snapshotsWithGame[snapshotsWithGame.length - 1];
  const deltaPts = Math.round((current.homeWinProb - opening.homeWinProb) * 100);
  if (deltaPts === 0) return { dir: 'flat', text: 'Unchanged since open' };

  const side = deltaPts > 0 ? mascotOf(ev.home) : mascotOf(ev.away);
  return {
    dir: deltaPts > 0 ? 'up' : 'down',
    text: `${escape(side)} +${Math.abs(deltaPts)} pts since open`,
  };
}

function weekdayOf(iso) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'long' });
}

function formatKickoff(iso) {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  });
}

function formatTimestamp(iso) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  });
}

function bookmakerRange(events) {
  const counts = events.map((e) => e.bookmakerCount);
  return Math.round(counts.reduce((a, b) => a + b, 0) / counts.length) || 0;
}

function budgetNote(quota) {
  if (quota.requestsRemaining == null) return '';
  return `<span class="pill" title="Odds API requests left this month">${escape(quota.requestsRemaining)} API credits left</span>`;
}

function emptyState() {
  return `
    <div class="section-head">
      <div>
        <p class="eyebrow">Market data</p>
        <h2>Odds</h2>
      </div>
    </div>
    <div class="notice">
      <strong>No odds snapshot yet.</strong><br />
      <code>data/odds/current.json</code> is written by
      <code>scripts/fetch_odds.py</code>, run on a schedule by
      <code>.github/workflows/fetch-odds.yml</code> once the repo is pushed
      and an <code>ODDS_API_KEY</code> secret is set.
      <br /><br />
      To generate a snapshot locally:
      <br /><code>ODDS_API_KEY=xxxxx python scripts/fetch_odds.py</code>
    </div>`;
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
