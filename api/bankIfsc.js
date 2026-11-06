/* IFSC lookup — GET /api/bank-ifsc/:code
 * Reads the branch page of https://ifsc.bankifsccode.com/<IFSC> and returns bank, branch, address, district,
 * state and MICR. Read-only; answers are kept in memory for a day so the same code is fetched once. */
const express = require('express');
const { resolveUser } = require('./helpers');

const router = express.Router();
const cache = new Map();   // IFSC → { at, data }
const DAY = 24 * 3600 * 1000;

const LABELS = { bank: 'Bank', address: 'Address', state: 'State', district: 'District', branch: 'Branch', contact: 'Contact', ifsc: 'IFSC Code', micr: 'MICR Code' };

/* the page as lines of text: tags removed, entities decoded */
const linesOf = html => html
  .replace(/<script[\s\S]*?<\/script>/gi, '\n').replace(/<style[\s\S]*?<\/style>/gi, '\n')
  .replace(/<[^>]*>/g, '\n')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);

function parse(html, code) {
  const lines = linesOf(html);
  // the details start after the "IFSC Code:- <code>, <bank>, <branch>" heading
  const start = lines.findIndex(l => /^IFSC Code:-/i.test(l) && l.toUpperCase().includes(code));
  if (start < 0) return null;
  const out = {};
  const isLabel = l => /^[A-Za-z ]+:$/.test(l);
  for (const [k, label] of Object.entries(LABELS)) {
    const i = lines.findIndex((l, j) => j > start && l.toLowerCase() === `${label.toLowerCase()}:`);
    if (i < 0) continue;
    const v = lines[i + 1];
    if (v && !isLabel(v)) out[k] = v;
  }
  if (!out.bank || !out.branch) return null;
  if (out.micr && !/^\d{9}$/.test(out.micr)) delete out.micr;
  const title = x => String(x || '').toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
  return {
    ifsc: code, bank: out.bank, branch: out.branch, address: out.address || '',
    district: title(out.district), state: title(out.state), micr: out.micr || '', contact: out.contact || '',
  };
}

router.get('/:code', async (req, res) => {
  if (!resolveUser(req)) return res.status(401).json({ error: 'Please sign in again.' });
  const code = String(req.params.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(code)) return res.status(400).json({ error: 'An IFSC code has 11 characters, e.g. SBIN0001234.' });
  const hit = cache.get(code);
  if (hit && Date.now() - hit.at < DAY) return res.json(hit.data);
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(`https://ifsc.bankifsccode.com/${code}`, { signal: ctl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
    const html = await r.text();
    const data = r.ok ? parse(html, code) : null;
    if (!data) return res.status(404).json({ error: `No bank branch found for IFSC ${code}.` });
    cache.set(code, { at: Date.now(), data });
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.name === 'AbortError' ? 'The IFSC site did not answer — try again.' : 'Could not reach the IFSC site — check the internet.' });
  } finally { clearTimeout(t); }
});

module.exports = router;
module.exports.parse = parse;
