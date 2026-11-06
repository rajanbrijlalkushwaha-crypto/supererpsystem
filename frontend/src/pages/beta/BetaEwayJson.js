/* E-way bill bulk-upload JSON (NIC portal format "1.0.0621") from delivery challans.
 * One DC = one vehicle = one e-way bill; several DCs go into one file (billLists), like the sample the portal accepts.
 * Field names / codes follow the portal's bulk JSON; values come from the DC (saved order details + e-way section). */

export const DOC_TYPES = [['INV', 'Tax Invoice'], ['BIL', 'Bill of Supply'], ['CHL', 'Delivery Challan'], ['OTH', 'Others']];
export const SUB_TYPES = [[1, 'Supply'], [4, 'Job Work'], [5, 'For Own Use'], [6, 'Job work Returns'], [7, 'Sales Return'], [8, 'Others'], [9, 'SKD/CKD/Lots'],
  [10, 'Line Sales'], [11, 'Recipient Not Known'], [12, 'Exhibition or Fairs']];
export const TRANS_TYPES = { 1: 'Regular', 2: 'Bill To - Ship To', 3: 'Bill From - Dispatch From', 4: 'Combination of 2 and 3' };

/* GST state codes */
const STATES = {
  'jammu and kashmir': 1, 'himachal pradesh': 2, punjab: 3, chandigarh: 4, uttarakhand: 5, haryana: 6, delhi: 7, rajasthan: 8, 'uttar pradesh': 9, bihar: 10,
  sikkim: 11, 'arunachal pradesh': 12, nagaland: 13, manipur: 14, mizoram: 15, tripura: 16, meghalaya: 17, assam: 18, 'west bengal': 19, jharkhand: 20,
  odisha: 21, orissa: 21, chhattisgarh: 22, 'madhya pradesh': 23, gujarat: 24, 'dadra and nagar haveli and daman and diu': 26, 'daman and diu': 26, 'dadra and nagar haveli': 26,
  maharashtra: 27, karnataka: 29, goa: 30, lakshadweep: 31, kerala: 32, 'tamil nadu': 33, puducherry: 34, pondicherry: 34, 'andaman and nicobar islands': 35,
  telangana: 36, 'andhra pradesh': 37, ladakh: 38,
};
export const STATE_NAMES = Object.entries(STATES).filter(([k], i, a) => a.findIndex(([, c]) => c === STATES[k]) === i)
  .map(([k, c]) => [c, k.replace(/\b\w/g, m => m.toUpperCase()).replace(/\bAnd\b/g, 'and')]).sort((a, b) => a[1].localeCompare(b[1]));
export const stateCode = (name, gstin) => {
  const k = String(name || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (STATES[k]) return STATES[k];
  const g = parseInt(String(gstin || '').slice(0, 2), 10);
  return g >= 1 && g <= 38 ? g : 0;
};

const n = v => parseFloat(v) || 0;
const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
const dmy = iso => { const d = iso ? new Date(iso) : null; return d && !isNaN(d) ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` : ''; };
const clip = (s, len) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, len);
const pin = v => parseInt(String(v || '').replace(/\D/g, '').slice(0, 6), 10) || 0;
/* a long address → two lines of up to 120 characters (split at a comma when it can) */
const twoLines = s => {
  const t = clip(s, 240);
  if (t.length <= 120) return [t, ''];
  const cut = t.lastIndexOf(',', 120);
  const at = cut > 40 ? cut + 1 : 120;
  return [t.slice(0, at).trim().replace(/,$/, ''), t.slice(at).trim().slice(0, 120)];
};
const GSTIN_RE = /^[0-9]{2}[A-Z0-9]{13}$/;

/* how the e-way doc of a DC is defaulted: material with / against a bill → that tax invoice; material first → DC no. as "Bill of Supply" (as in the sample) */
export const ewayDocOf = dc => {
  const billDoc = (dc.dcType === 'with-bill' || dc.dcType === 'against-bill') && dc.invoiceNo;
  return {
    docType: dc.ewayDocType || (billDoc ? 'INV' : 'BIL'),
    subSupplyType: n(dc.ewaySubSupplyType) || 1,
    docNo: dc.ewayDocNo || (billDoc ? dc.invoiceNo : dc.dcNo || ''),
    docDate: dc.ewayDocDate || (billDoc ? dc.invoiceDate || dc.dcDate : dc.dcDate),
  };
};

/* one DC → one entry of billLists, plus the list of things that are missing */
export function ewayBillOf(dc, company) {
  const co = company || {};
  const doc = ewayDocOf(dc);
  const fromGstin = String(co.gstin || '').toUpperCase();
  const fromState = stateCode(co.state, fromGstin);
  const dispAddr = dc.dispatchFrom || [co.address, co.city].filter(Boolean).join(', ');
  const [fromAddr1, fromAddr2] = twoLines(dispAddr);
  const toGstin = GSTIN_RE.test(String(dc.customerGstin || '').toUpperCase()) ? String(dc.customerGstin).toUpperCase() : 'URP';
  const toState = stateCode(dc.billingState, toGstin);
  const actualTo = stateCode(dc.shippingState, '') || toState;
  const actualFrom = n(dc.dispatchStateCode) || stateCode(dc.dispatchState, '') || fromState;
  const [toAddr1, toAddr2] = twoLines(dc.shippingAddress || dc.billingAddress);
  const intra = fromState && toState && fromState === toState;
  const items = (dc.items || []).filter(it => n(it.qty) > 0);
  let cgst = 0, sgst = 0, igst = 0, taxable = 0;
  const itemList = items.map((it, i) => {
    const t = r2(n(it.qty) * n(it.rate)), g = n(it.gst);
    taxable += t;
    if (intra) { cgst += t * g / 200; sgst += t * g / 200; } else igst += t * g / 100;
    return {
      itemNo: i + 1, productName: clip(it.description || it.itemName, 100), productDesc: '', hsnCode: String(it.hsnCode || '').replace(/\D/g, ''),
      quantity: n(it.qty), qtyUnit: clip(it.unit || 'NOS', 3).toUpperCase() || 'NOS', taxableAmount: t,
      sgstRate: intra ? g / 2 : 0, cgstRate: intra ? g / 2 : 0, igstRate: intra ? 0 : g, cessRate: 0, cessNonAdvol: 0,
    };
  });
  const billToShipTo = String(dc.shippingAddress || '').trim() && String(dc.shippingAddress).trim() !== String(dc.billingAddress || '').trim();
  const dispatchElsewhere = !!String(dc.dispatchFrom || '').trim() || actualFrom !== fromState;
  const transType = billToShipTo && dispatchElsewhere ? 4 : billToShipTo ? 2 : dispatchElsewhere ? 3 : 1;
  const bill = {
    userGstin: fromGstin, supplyType: 'O', subSupplyType: doc.subSupplyType, subSupplyDesc: doc.subSupplyType === 8 ? clip(dc.ewaySubSupplyDesc || 'Others', 20) : '',
    docType: doc.docType, docNo: clip(doc.docNo, 16), docDate: dmy(doc.docDate), transType,
    fromGstin, fromTrdName: clip(co.companyName || co.name, 100).replace(/^M\/s\.?\s*/i, ''), fromAddr1, fromAddr2,
    fromPlace: clip(dc.dispatchPlace || co.city, 50), fromPincode: pin(dc.dispatchPincode || co.pincode), fromStateCode: fromState, actualFromStateCode: actualFrom,
    toGstin, toTrdName: clip(dc.customerName, 100), toAddr1, toAddr2,
    toPlace: clip(dc.shippingCity || dc.billingCity, 50), toPincode: pin(dc.shippingPincode || dc.billingPincode), toStateCode: toState, actualToStateCode: actualTo,
    totalValue: r2(taxable), cgstValue: r2(cgst), sgstValue: r2(sgst), igstValue: r2(igst), cessValue: 0, TotNonAdvolVal: 0, OthValue: 0,
    totInvValue: r2(taxable + cgst + sgst + igst),
    transMode: 1, transDistance: Math.round(n(dc.approxDistanceKm)), transporterName: clip(dc.transporterName, 100), transporterId: String(dc.transporterId || '').toUpperCase(),
    transDocNo: clip(dc.transDocNo, 15), transDocDate: dmy(dc.transDocDate) || dmy(dc.dcDate),
    vehicleNo: String(dc.vehicleNo || '').toUpperCase().replace(/[^A-Z0-9]/g, ''), vehicleType: 'R',
    mainHsnCode: parseInt(itemList[0]?.hsnCode, 10) || 0,
    itemList,
  };
  const miss = [];
  if (!GSTIN_RE.test(fromGstin)) miss.push('company GSTIN');
  if (!bill.docNo) miss.push('document no.');
  if (!bill.docDate) miss.push('document date');
  if (!bill.fromPincode || String(bill.fromPincode).length !== 6) miss.push('dispatch-from pincode');
  if (!bill.toPincode || String(bill.toPincode).length !== 6) miss.push('ship-to pincode');
  if (!toState) miss.push('bill-to state');
  if (!actualTo) miss.push('ship-to state');
  if (!bill.vehicleNo && !bill.transporterId) miss.push('vehicle no. (or transporter ID)');
  if (!itemList.length) miss.push('products');
  if (itemList.some(it => !it.hsnCode)) miss.push('HSN code of every product');
  if (bill.totInvValue <= 0) miss.push('value (rate) of the products');
  return { bill, miss };
}

/* several DCs → the file; returns the problems per DC instead when any is missing something */
export function ewayJsonOf(dcs, company) {
  const out = dcs.map(dc => ({ dc, ...ewayBillOf(dc, company) }));
  const bad = out.filter(x => x.miss.length);
  return { json: { version: '1.0.0621', billLists: out.map(x => x.bill) }, bad };
}

export function downloadJson(obj, name) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ── e-way bill status helpers ── */
export const CANCEL_REASONS = [[1, 'Duplicate'], [2, 'Order Cancelled'], [3, 'Data Entry Mistake'], [4, 'Others']];
const MONS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/* "01/11/2026 05:12:00 PM" (portal) or "26-Oct-26 11:42 AM" (e-way PDF) → Date */
export function parseEwayDate(s) {
  const t = String(s || '').trim();
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?)?/i);
  let d, mo, y, h = 0, mi = 0, ap;
  if (m) { [, d, mo, y, h = 0, mi = 0, , ap] = m; mo = +mo - 1; }
  else {
    m = t.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M)?)?/i);
    if (!m) return null;
    [, d, mo, y, h = 0, mi = 0, ap] = m; mo = MONS.indexOf(String(mo).toLowerCase()); if (mo < 0) return null;
    if (+y < 100) y = 2000 + +y;
  }
  h = +h; if (ap) { if (/pm/i.test(ap) && h < 12) h += 12; if (/am/i.test(ap) && h === 12) h = 0; }
  const out = new Date(+y, mo, +d, h, +mi);
  return isNaN(out) ? null : out;
}
export const ewayActive = dc => !!dc?.ewayBillNo && dc.ewayStatus !== 'cancelled' && dc.ewayStatus !== 'expired';   // expired = validity over (not cancelled)
/* the portal allows a cancel only within 24 hours of generation */
export const cancelHoursLeft = dc => { const g = parseEwayDate(dc?.ewayGenDate); return g ? 24 - (Date.now() - g.getTime()) / 3600000 : null; };
/* text of the e-way bill QR, the same as on the e-way bill print: "EWB No. : … / GSTIN : … / Date : 26-Oct-26 11:42 AM" */
export function ewayQrText(dc, company) {
  if (!dc?.ewayBillNo) return '';
  const g = parseEwayDate(dc.ewayGenDate);
  const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dt = g ? `${g.getDate()}-${MON3[g.getMonth()]}-${String(g.getFullYear()).slice(2)} ${(g.getHours() % 12) || 12}:${String(g.getMinutes()).padStart(2, '0')} ${g.getHours() < 12 ? 'AM' : 'PM'}` : String(dc.ewayGenDate || '');
  return `EWB No. : ${dc.ewayBillNo} / GSTIN : ${String(dc.ewayGeneratedBy || company?.gstin || '').toUpperCase()} / Date : ${dt}`;
}
