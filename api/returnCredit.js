/**
 * Return Note ↔ Credit Note — like DC ↔ Bill: the material comes back on a Return Note, the money goes back on a
 * Credit Note. Either can be made first, or both together. Each keeps the other's id and no.:
 *   Returns/<id>/<id>.json    creditNoteId, creditNoteNo
 *   CreditNotes/<id>.json     returnId, returnNo, orderId, orderNo
 */
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./helpers');

const co = c => path.join(ROOT, 'Database', 'Companies', String(c));
const rnFile = (c, id) => path.join(co(c), 'Returns', String(id), `${id}.json`);
const cnFile = (c, id) => path.join(co(c), 'CreditNotes', `${id}.json`);
const read = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const write = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));
const safe = v => /^\d{1,12}$/.test(String(v || ''));

/* the credit note `cn` now belongs to return note `returnId` (or to none: returnId empty) */
function linkFromCredit(c, cn, oldReturnId) {
  if (!cn || !cn.cnId) return;
  const now = String(cn.returnId || '');
  // the note it was tied to before lets go
  if (oldReturnId && String(oldReturnId) !== now && safe(oldReturnId)) {
    const f = rnFile(c, oldReturnId), r = read(f);
    if (r && String(r.creditNoteId || '') === String(cn.cnId)) { delete r.creditNoteId; delete r.creditNoteNo; write(f, r); }
  }
  if (!now || !safe(now)) return;
  const f = rnFile(c, now), r = read(f);
  if (!r) return;
  r.creditNoteId = String(cn.cnId); r.creditNoteNo = cn.cnNo || '';
  write(f, r);
}

/* the return note `rn` now names credit note `creditNoteId` (or none) */
function linkFromReturn(c, rn, oldCnId) {
  if (!rn || !rn.returnId) return;
  const now = String(rn.creditNoteId || '');
  if (oldCnId && String(oldCnId) !== now && safe(oldCnId)) {
    const f = cnFile(c, oldCnId), x = read(f);
    if (x && String(x.returnId || '') === String(rn.returnId)) { delete x.returnId; delete x.returnNo; write(f, x); }
  }
  if (!now || !safe(now)) return;
  const f = cnFile(c, now), x = read(f);
  if (!x) return;
  x.returnId = String(rn.returnId); x.returnNo = rn.returnNo || '';
  if (!x.orderId && rn.orderId) { x.orderId = String(rn.orderId); x.orderNo = rn.orderNo || ''; }
  write(f, x);
}

/* the credit note no. for a return note when it is saved */
const cnNoOf = (c, id) => (safe(id) ? (read(cnFile(c, id)) || {}).cnNo || '' : '');

module.exports = { linkFromCredit, linkFromReturn, cnNoOf };
