/* ==========================================================================
   "Get my Sleeper token" -- a bookmarklet, so connecting needs no DevTools.

   The DevTools route (F12 -> Network -> copy a header) only exists on a
   computer, and the device picks get made on is an iPad. A bookmark works
   on both: save it once, open sleeper.com while logged in, tap it, and the
   token is on the clipboard ready to paste into the Connect Sleeper box.

   RULES, all of them load-bearing:

     * It runs on SLEEPER'S page, so it must never call anything of ours or
       anything else. No fetch, no image beacon, no redirect carrying the
       token. It reads storage, copies to the clipboard, and says what it did.
       A bookmarklet that phones home is one that deserves to get flagged.
     * It never hardcodes a storage key. Sleeper can rename or re-nest a key
       whenever it likes, and a hardcoded lookup fails silently, which is the
       exact failure this file exists to remove. Instead every string in
       localStorage, sessionStorage and document.cookie is scanned for
       anything JWT-shaped, however deeply it is nested inside JSON -- a
       regex over the raw text needs no idea of the structure around it.
     * A candidate counts only if its payload names a `user_id` and has not
       expired: the same shape tokenInfo() in js/sleeperAuth.js reads, so what
       this copies is what saveToken() accepts. With several, the one that
       expires last wins.
     * The token never goes in a URL. Handing it over through a link into our
       site would be easier and would leave it in browser history.
     * Clipboard first, prompt() as the fallback. Some iOS Safari versions
       refuse a clipboard write they do not count as a user gesture; a prompt
       box holding the token costs a few lines and removes that whole class of
       failure.

   First real run is the test: this was written without a Sleeper login to
   try it on. If it finds nothing, the DevTools steps are still in the box.

   Imports nothing. NEVER add a ?v= to this file -- see data.js's note on
   module identity.
   ========================================================================== */

/* Written as plain ES5-ish source with no comments and explicit semicolons,
   because it is collapsed onto one line. Keep it that way when editing:
   a `//` comment here would swallow the rest of the bookmarklet. */
const SOURCE = `
(function () {
  var jwt = /eyJ[\\w-]+\\.[\\w-]+\\.[\\w-]+/g;
  var now = Date.now() / 1000;
  var best = null;
  var bestExp = 0;
  function payload(t) {
    var p = t.split('.')[1] || '';
    try {
      return atob(p.replace(/-/g, '+').replace(/_/g, '/') + '===='.slice((p.length % 4) || 4));
    } catch (e) { return ''; }
  }
  function consider(t) {
    var text = payload(t);
    if (!/"user_id"/.test(text)) { return; }
    var m = text.match(/"exp"\\s*:\\s*(\\d+)/);
    var exp = m ? Number(m[1]) : 0;
    if (m && exp <= now) { return; }
    var rank = exp || 1;
    if (rank > bestExp) { best = t; bestExp = rank; }
  }
  function scan(v) {
    if (typeof v !== 'string') { return; }
    var found = v.match(jwt);
    if (found) { found.forEach(consider); }
  }
  [function () { return window.localStorage; }, function () { return window.sessionStorage; }]
    .forEach(function (get) {
      try {
        var s = get();
        for (var i = 0; i < s.length; i++) { scan(s.getItem(s.key(i))); }
      } catch (e) {}
    });
  try { scan(document.cookie); } catch (e) {}
  if (!best) {
    alert('No Sleeper token found on this page. Make sure you are logged in at sleeper.com, then tap the bookmark again.');
    return;
  }
  function showIt() {
    prompt("Copy this Sleeper token, then paste it into Bova's Picks. It works like your password: don't paste it anywhere else.", best);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(best).then(function () {
      alert("Sleeper token copied. Go back to Bova's Picks and paste it into the Connect Sleeper box.");
    }, showIt);
  } else {
    showIt();
  }
})();
`;

/** The bookmark's address: one `javascript:` line, percent-encoded so it
 *  survives being pasted into a bookmark editor. */
export function bookmarkletHref() {
  const oneLine = SOURCE.replace(/\s*\n\s*/g, ' ').trim();
  return `javascript:${encodeURIComponent(oneLine)}`;
}
