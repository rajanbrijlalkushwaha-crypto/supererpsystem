/* Terms of delivery (commercial terms) — shared by the Sales Order and the Purchase Order.
 * Kept on the order as commercialTerms { delivery, priceBasis, freight, packing, unloading, installation, insurance, inspection, taxes, warranty }
 * next to paymentTerms and termsConditions (free text).
 *   <TermsRows terms setTerm busy skip />  table rows (label | value | label | value) for a form card, each value with suggestions
 *   termsList(order, { skip, pay })        [label, value] of the filled terms — for prints
 *   termsHtml(order, opts)                 a bordered "Terms of Delivery" table for the printed SO / PO */
import React from 'react';

export const PAY_SUGGEST = ['100% advance', '50% advance, balance before dispatch', '30% advance, balance before dispatch',
  '50% advance, 40% before dispatch, 10% after installation', '30% advance, 60% before dispatch, 10% after installation',
  'Against delivery', 'Within 30 days of delivery', 'Within 45 days of invoice', 'Within 60 days of invoice', 'Against Proforma Invoice'];

export const TERMS = [
  ['delivery', 'Delivery Period', ['Within 2 weeks from PO & advance', 'Within 3–4 weeks from PO & advance', 'Within 4–6 weeks from drawing approval & advance', 'Immediate, from ready stock', 'As per your schedule']],
  ['priceBasis', 'Price Basis', ['Ex-Works', 'FOR Site', 'FOR Destination', 'Door delivery', 'Ex-Godown']],
  ['freight', 'Freight', ['Included', 'Extra at actuals', 'To pay', 'Paid', 'Client scope']],
  ['packing', 'Packing & Forwarding', ['Included', 'Extra at actuals', 'Standard packing included']],
  ['unloading', 'Unloading at Site', ['Client scope', 'Our scope', 'Crane / hydra at client cost']],
  ['installation', 'Installation', ['Included', 'Extra', 'Not in scope', 'Supervision only']],
  ['insurance', 'Transit Insurance', ['Client scope', 'Our scope', 'Included', 'Not applicable']],
  ['inspection', 'Inspection', ['At our works before dispatch', 'At site on delivery', 'Third party, at client cost']],
  ['taxes', 'Taxes', ['GST extra as applicable', 'GST 18% extra', 'GST included']],
  ['warranty', 'Warranty', ['12 months from installation', '12 months from delivery', '12 months from installation or 18 months from dispatch, whichever is earlier', 'No warranty']],
];
const LABEL = Object.fromEntries(TERMS.map(([k, l]) => [k, l]));

/* table rows for a form card: two terms per row, each a free-text box with suggestions (type anything) */
export function TermsRows({ terms, setTerm, busy, skip = [], idp = 'tm' }) {
  const list = TERMS.filter(([k]) => !skip.includes(k));
  const rows = [];
  for (let i = 0; i < list.length; i += 2) rows.push(list.slice(i, i + 2));
  return (<>
    {rows.map(pair => (
      <tr key={pair[0][0]}>
        {pair.map(([k, label, sug]) => (
          <React.Fragment key={k}>
            <th className={pair[1] && pair[1][0] === k ? 'sm' : undefined}><label htmlFor={`${idp}-${k}`}>{label}</label></th>
            <td colSpan={pair.length === 1 ? 3 : 1}>
              <input id={`${idp}-${k}`} value={(terms || {})[k] || ''} onChange={e => setTerm(k, e.target.value)} disabled={busy} list={`${idp}-l-${k}`} autoComplete="off" placeholder={sug[0]} />
              <datalist id={`${idp}-l-${k}`}>{sug.map(s => <option key={s} value={s} />)}</datalist>
            </td>
          </React.Fragment>
        ))}
      </tr>
    ))}
  </>);
}

/* empty terms filled with the usual choice (the first suggestion); filled ones stay */
export const standardTerms = (terms, skip = []) => {
  const t = { ...(terms || {}) };
  TERMS.forEach(([k, , sug]) => { if (!skip.includes(k) && !String(t[k] || '').trim()) t[k] = sug[0]; });
  return t;
};
/* only the filled terms, trimmed — what is saved */
export const cleanTerms = terms => {
  const t = {};
  TERMS.forEach(([k]) => { const v = String((terms || {})[k] || '').trim(); if (v) t[k] = v.slice(0, 300); });
  return t;
};

export const termsList = (o, { skip = [], pay = true } = {}) => {
  const t = o.commercialTerms || {};
  return [
    ...(pay && o.paymentTerms ? [['Payment Terms', o.paymentTerms]] : []),
    ...TERMS.filter(([k]) => !skip.includes(k) && String(t[k] || '').trim()).map(([k]) => [LABEL[k], t[k]]),
  ];
};

const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;');
/* the printed table: label : value, two terms per row */
export function termsHtml(o, opts = {}) {
  const list = termsList(o, opts);
  if (!list.length) return '';
  const rows = [];
  for (let i = 0; i < list.length; i += 2) rows.push(list.slice(i, i + 2));
  return `<!-- terms of delivery -->
<table class="tod">
  <colgroup><col style="width:17%"><col style="width:33%"><col style="width:17%"><col style="width:33%"></colgroup>
  <tbody>
    <tr class="sec"><td colspan="4">${esc(opts.title || 'Terms of Delivery')}</td></tr>
    ${rows.map(r => `<tr>${r.map(([l, v]) => `<td class="tl">${esc(l)}</td><td><b>${esc(v)}</b></td>`).join('')}${r.length === 1 ? '<td class="tl"></td><td></td>' : ''}</tr>`).join('')}
  </tbody>
</table>`;
}
