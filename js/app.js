/* ==========================================================================
   Shell: tab navigation, then hand off to whichever tab owns the panel.

   Each tab's logic lives in its own module. Sleeper FF's single 10k-line
   index.html is the cautionary tale — keep these small and separate.
   ========================================================================== */

import { initPickSheet } from './picksheet.js';
import { initOdds } from './odds.js';

const tabs = [...document.querySelectorAll('.tab')];

function select(tab) {
  for (const t of tabs) {
    const on = t === tab;
    t.setAttribute('aria-selected', String(on));
    document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
  }
  history.replaceState(null, '', `#${tab.id.replace('tab-', '')}`);
}

tabs.forEach((tab) => {
  tab.addEventListener('click', () => select(tab));

  // Roving arrow-key navigation, per the tablist pattern.
  tab.addEventListener('keydown', (e) => {
    const i = tabs.indexOf(tab);
    const next =
      e.key === 'ArrowRight' ? tabs[(i + 1) % tabs.length] :
      e.key === 'ArrowLeft'  ? tabs[(i - 1 + tabs.length) % tabs.length] :
      null;
    if (!next) return;
    e.preventDefault();
    next.focus();
    select(next);
  });
});

// Deep link support — #odds, #survivor, etc.
const fromHash = document.getElementById(`tab-${location.hash.slice(1)}`);
if (fromHash) select(fromHash);

initPickSheet(document.getElementById('picksheet-root'));
initOdds(document.getElementById('odds-root'));
