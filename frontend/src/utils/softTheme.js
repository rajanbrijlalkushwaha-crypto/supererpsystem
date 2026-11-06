/* ════════════════════════════════════════════════════════════════════
   Soft (neumorphic) look — page tagger
   ────────────────────────────────────────────────────────────────────
   Pages are styled inline with many different blues/whites, so CSS alone
   can't list them all. While the SOFT look is on, this watches .content-area
   and tags elements by the colour in their inline style:

     neu-bar      dark, wide bar (page toolbar, panel header)  → soft bar
     neu-pill     see-through white button/chip inside a bar   → raised soft pill
     neu-pill-on  …the "active" one (≥ 20 % white)             → pressed in
     neu-ink      white/near-white text inside a bar           → dark text
     neu-surface  white / near-white panel                     → soft surface
     neu-card     …that is rounded and reasonably large        → raised card

   soft-theme.css styles the tags (only under body.theme-neu, so they are
   inert when the look is off). Pages with their own soft styling carry
   `neu-native` and are skipped. Each scan works out the exact tag set for
   every element and removes stale tags (e.g. a tab that stopped being
   active). Only inline styles are read, plus offsetWidth on dark candidates;
   rescans are debounced.
   ════════════════════════════════════════════════════════════════════ */

const TAGS = ['neu-bar', 'neu-pill', 'neu-pill-on', 'neu-ink', 'neu-ink-tint', 'neu-surface', 'neu-card', 'neu-btn-light', 'neu-darkcell'];
const TAG_SEL = TAGS.map(c => '.' + c).join(',');

/* first rgb()/rgba() in a CSS value → { r, g, b, a } (also the keywords white / black) */
const parseRgb = (v) => {
  const m = /rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)/.exec(v || '');
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  if (/(^|\s)white(\s|$)/.test(v || '')) return { r: 255, g: 255, b: 255, a: 1 };
  if (/(^|\s)black(\s|$)/.test(v || '')) return { r: 0, g: 0, b: 0, a: 1 };
  return null;
};
const lum = ({ r, g, b }) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
/* untinted white/grey — tinted pastels (light green "selected", light red, light blue info)
   keep their colour because the tint carries meaning */
const isNeutral = ({ r, g, b }) => Math.max(r, g, b) - Math.min(r, g, b) <= 12;
const isWhiteish = c => c && c.r >= 235 && c.g >= 235 && c.b >= 235;
const bgOf = el => el.style.background || el.style.backgroundColor || '';

function computeTags(root) {
  const want = new Map();                         // element → Set of tags
  const add = (el, cls) => { let s = want.get(el); if (!s) want.set(el, (s = new Set())); s.add(cls); };
  const bars = [];

  // pass 1 — dark bars and light surfaces
  const withBg = [...root.querySelectorAll('[style*="background"]')].filter(el => !el.closest('.neu-native'));
  for (const el of withBg) {
    const t = el.tagName;
    if (t === 'TH' || t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA' || t === 'OPTION') continue;
    const v = bgOf(el);
    const c = parseRgb(v);
    if (!c || c.a < 0.85) continue;
    // dark table rows/cells (e.g. a navy "Grand Total" row) → soft emphasis row
    if (t === 'TD' || t === 'TR') {
      if (lum(c) < 0.4) { add(el, 'neu-darkcell'); bars.push(el); }
      continue;
    }
    if (t === 'BUTTON' && lum(c) >= 0.93 && !v.includes('gradient')) {
      if (isNeutral(c)) add(el, 'neu-btn-light');
      continue;
    }
    if ((v.includes('gradient') || lum(c) < 0.5) && t !== 'BUTTON' && t !== 'A' && t !== 'SPAN') {
      if (el.offsetWidth >= 360) { add(el, 'neu-bar'); bars.push(el); }
    } else if (t !== 'BUTTON' && lum(c) >= 0.93 && isNeutral(c)) {
      add(el, 'neu-surface');
      const br = el.style.borderRadius;
      if (br && br !== '0px' && el.offsetWidth >= 140) add(el, 'neu-card');
    }
  }

  // table headers: remember each header's own colour (as --neu-th) so the soft
  // header can show it as text + underline instead of a solid block
  for (const th of root.querySelectorAll('th[style*="background"]')) {
    if (th.closest('.neu-native')) continue;
    const c = parseRgb(bgOf(th));
    const val = c && c.a >= 0.85 && lum(c) < 0.75 ? `rgb(${c.r}, ${c.g}, ${c.b})` : '';
    if ((th.style.getPropertyValue('--neu-th') || '') !== val) {
      if (val) th.style.setProperty('--neu-th', val); else th.style.removeProperty('--neu-th');
    }
  }

  // pass 2 — inside bars: see-through white pills, white text
  for (const bar of bars) {
    for (const el of bar.querySelectorAll('[style*="background"]')) {
      const c = parseRgb(bgOf(el));
      if (c && isWhiteish(c) && c.a < 0.5 && el.style.width !== '1px') {
        add(el, 'neu-pill');
        if (c.a >= 0.2) add(el, 'neu-pill-on');
      }
    }
    for (const el of [bar, ...bar.querySelectorAll('[style*="color"]')]) {
      const col = parseRgb(el.style.color);
      if (!col) continue;
      if (el !== bar) {
        const own = parseRgb(bgOf(el));
        if (own && own.a >= 0.5 && !isWhiteish(own)) continue;  // e.g. green "+ Create" keeps white text
      }
      if (isWhiteish(col)) { add(el, 'neu-ink'); continue; }
      // pale coloured text made for a dark background (light green / yellow totals)
      // → the same hue, darkened, so it reads on the soft surface
      if (lum(col) > 0.55) {
        const val = `rgb(${Math.round(col.r * 0.55)}, ${Math.round(col.g * 0.55)}, ${Math.round(col.b * 0.55)})`;
        if (el.style.getPropertyValue('--neu-ink-col') !== val) el.style.setProperty('--neu-ink-col', val);
        add(el, 'neu-ink-tint');
      }
    }
  }
  return want;
}

function apply(root) {
  const want = computeTags(root);
  for (const el of root.querySelectorAll(TAG_SEL)) {
    if (!want.has(el)) el.classList.remove(...TAGS);
  }
  for (const [el, set] of want) {
    for (const cls of TAGS) {
      const has = el.classList.contains(cls);
      if (set.has(cls) && !has) el.classList.add(cls);
      else if (!set.has(cls) && has) el.classList.remove(cls);
    }
  }
}

/** Start tagging; returns stop(), which disconnects and removes every tag. */
export function startSoftTheme() {
  let timer = null;
  const run = () => {
    timer = null;
    const root = document.querySelector('.content-area');
    if (root) apply(root);
  };
  const schedule = () => { if (!timer) timer = setTimeout(run, 120); };

  // one observer on <body>: catches page changes, re-renders that change inline
  // styles, and the .content-area being re-created when the company changes.
  // Our own edits only touch `class`, which is not observed → no feedback loop.
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
  run();

  return () => {
    clearTimeout(timer);
    observer.disconnect();
    document.querySelectorAll(TAG_SEL).forEach(el => el.classList.remove(...TAGS));
  };
}
