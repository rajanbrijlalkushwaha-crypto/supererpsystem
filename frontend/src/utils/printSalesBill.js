import QRCode from 'qrcode';
import { withPrintFont } from './printFont';
import { brandLine } from './printBranding';
/* printSalesBill.js — the company's own Tax Invoice printout for a saved
 * Sales Bill record (api/bills.js, type:'sales'). Unlike the uploaded PDF
 * (which is whatever the accountant scanned/attached), this is generated
 * entirely from the bill's own saved fields — IRN, Ack No/Date, E-way Bill
 * No, Bill To / Ship To, items, GST breakup — so it always matches what is
 * in the system, and prints even when no PDF was ever uploaded.
 *
 * The QR code encodes the IRN + core invoice fields as a verification
 * reference — it is NOT the government portal's signed e-invoice QR
 * (that raw signed payload is only issued at generation time and this app
 * never receives it), so this is a readable reprint aid, not a substitute
 * for the original e-invoice QR.
 *
 * `order` (the linked Sales Order, if the caller has it loaded) is optional
 * and only used to show Order Date / Client PO No — everything else comes
 * from the bill itself. `user` (from useAuth()) is optional and only used
 * for the "printed by" branding line.
 */

const fetchBase64 = async (url) => {
  try {
    const res  = await fetch(url);
    const blob = await res.blob();
    return await new Promise(r => {
      const rd = new FileReader(); rd.onload = () => r(rd.result); rd.readAsDataURL(blob);
    });
  } catch { return null; }
};

const esc  = v => (!v && v !== 0) ? '' : String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const dv   = v => esc(v) || '';
const fmtD = v => {
  if (!v) return '';
  const dt = new Date(v);
  return isNaN(dt) ? String(v) : `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`;
};
const fmtN = n => Number(n||0).toFixed(2);

/* GST state codes, for the "State Code" field in Bill To / Ship To / e-Way Bill. */
const STATE_CODES = {
  'jammu and kashmir':'01','himachal pradesh':'02','punjab':'03','chandigarh':'04','uttarakhand':'05',
  'haryana':'06','delhi':'07','rajasthan':'08','uttar pradesh':'09','bihar':'10','sikkim':'11',
  'arunachal pradesh':'12','nagaland':'13','manipur':'14','mizoram':'15','tripura':'16','meghalaya':'17',
  'assam':'18','west bengal':'19','jharkhand':'20','odisha':'21','chhattisgarh':'22','madhya pradesh':'23',
  'gujarat':'24','daman and diu':'25','dadra and nagar haveli':'26','maharashtra':'27','andhra pradesh':'28',
  'karnataka':'29','goa':'30','lakshadweep':'31','kerala':'32','tamil nadu':'33','puducherry':'34',
  'andaman and nicobar islands':'35','telangana':'36','ladakh':'38',
};
const stateCode = s => STATE_CODES[String(s||'').trim().toLowerCase()] || '';

/* Same "Prepared By" lookup used by printSalesOrder.js / printPurchaseOrder.js
 * — the user who created this bill, from its own audit trail, with a live
 * fetch for their login ID (not stored on the audit snapshot itself). */
async function getPreparedBy(bill) {
  const createdBy = Array.isArray(bill?.audit) ? bill.audit.find(a => a.action === 'created')?.by : null;
  let preparedUser = null;
  if (createdBy?.id || createdBy?.username) {
    try {
      const r = await fetch('/api/auth/users');
      if (r.ok) {
        const all = await r.json();
        preparedUser = all.find(u => String(u.id) === String(createdBy.id)) ||
                       all.find(u => u.username === createdBy.username) || null;
      }
    } catch {}
  }
  return {
    name: createdBy?.name || createdBy?.username || '',
    loginId: preparedUser?.username || createdBy?.username || '',
  };
}

function numWords(n) {
  n = Math.round(Math.abs(n||0));
  if (!n) return 'Zero Rupees Only';
  const a = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve',
    'Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const b = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const seg = x => !x?'':x<20?a[x]+' ':b[Math.floor(x/10)]+(x%10?' '+a[x%10]:'')+' ';
  let w = '';
  if (Math.floor(n/10000000))          w += seg(Math.floor(n/10000000))+'Crore ';
  if (Math.floor((n%10000000)/100000)) w += seg(Math.floor((n%10000000)/100000))+'Lakh ';
  if (Math.floor((n%100000)/1000))     w += seg(Math.floor((n%100000)/1000))+'Thousand ';
  if (Math.floor((n%1000)/100))        w += seg(Math.floor((n%1000)/100))+'Hundred ';
  if (n%100) w += seg(n%100);
  return 'INR ' + w.trim() + ' Only';
}

const B = '1px solid #555';

function buildItemTable(cols, widths, bodyRows, footRows) {
  let thead = `<thead><tr>`;
  cols.forEach((c,i) => {
    const w = widths[i] ? `width:${widths[i]};` : '';
    thead += `<th style="border-bottom:${B};border-left:${i===0?'none':B};${w}font-weight:bold;text-align:center;font-size:11.5pt;padding:4px 6px;white-space:nowrap;">${c}</th>`;
  });
  thead += `</tr></thead>`;

  let tbody = `<tbody>`;
  bodyRows.forEach(row => {
    tbody += `<tr>`;
    row.forEach((cell,ci) => {
      tbody += `<td style="${cell.style||''}border-left:${ci===0?'none':B};padding:4px 6px;font-size:11pt;vertical-align:middle;">${cell.text}</td>`;
    });
    tbody += `</tr>`;
  });
  footRows.forEach((row,ri) => {
    tbody += `<tr>`;
    row.forEach((cell,ci) => {
      const span = cell.colspan||1;
      const colAttr = span>1 ? ` colspan="${span}"` : '';
      tbody += `<td${colAttr} style="${cell.style||''}border-top:${ri===0?B:'none'};border-left:${ci===0?'none':B};padding:5px 8px;font-size:11.5pt;">${cell.text}</td>`;
    });
    tbody += `</tr>`;
  });
  tbody += `</tbody>`;

  return `<table style="width:100%;border-collapse:collapse;border:${B};">${thead}${tbody}</table>`;
}

/* `bill` is the saved Sales Bill record from api/bills.js.
 * `company` is the selected company profile (logo, address, GSTIN, bank).
 * `order` (optional) is the linked Sales Order, used only for Order Date /
 * Client PO reference — everything else is read straight off the bill. */
export const printSalesBill = async (bill, company = {}, order = null, user = null) => {
  const b   = bill || {};
  const o   = order || {};
  const cid = company?.companyId || '';

  let logoB64 = null;
  if (company?.logoFileName)
    logoB64 = await fetchBase64(`/api/companies/logo/${encodeURIComponent(company.logoFileName)}?companyId=${cid}`);

  const prepared = await getPreparedBy(b);

  let irnQrB64 = null;
  if (b.irnNo) {
    const irnPayload = [
      `IRN:${b.irnNo}`, b.acknNo ? `AckNo:${b.acknNo}` : '', b.acknDate ? `AckDt:${fmtD(b.acknDate)}` : '',
      `Inv:${b.billNo||''}`, `InvDt:${fmtD(b.billDate)}`, `Amt:${fmtN(b.grandTotal)}`,
    ].filter(Boolean).join('|');
    try { irnQrB64 = await QRCode.toDataURL(irnPayload, { margin: 1, width: 100 }); } catch { irnQrB64 = null; }
  }

  let ewayQrB64 = null;
  if (b.ewayBillNo) {
    const ewayPayload = [
      `EWB:${b.ewayBillNo}`, b.vehicleNo ? `Veh:${b.vehicleNo}` : '',
      b.ewayGenDate ? `Gen:${b.ewayGenDate}` : '', b.ewayValidUpto ? `Valid:${b.ewayValidUpto}` : '',
    ].filter(Boolean).join('|');
    try { ewayQrB64 = await QRCode.toDataURL(ewayPayload, { margin: 1, width: 100 }); } catch { ewayQrB64 = null; }
  }

  const items       = Array.isArray(b.items) ? b.items : [];
  const intrastate  = b.gstType === 'intrastate';
  const subTotal    = parseFloat(b.subTotal)   || 0;
  const totalCGST   = parseFloat(b.totalCGST)  || 0;
  const totalSGST   = parseFloat(b.totalSGST)  || 0;
  const totalIGST   = parseFloat(b.totalIGST)  || 0;
  const grand       = parseFloat(b.grandTotal) || (subTotal + totalCGST + totalSGST + totalIGST);

  const coName = dv(company.companyName||company.name)||'Epsilon Enterprise';
  const coAddr = [company.address,company.city,company.state,company.pincode].filter(Boolean).join(', ');
  const today  = new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'});
  const logoTag = logoB64
    ? `<img src="${logoB64}" style="height:52px;max-width:110px;object-fit:contain;flex-shrink:0;">`
    : '';

  const SECL = '1.5px solid #555';
  const oc   = `border:none;padding:2px 8px;vertical-align:top;font-size:11pt;word-wrap:break-word;overflow-wrap:break-word;`;
  const secHdr = `border-top:${SECL};border-bottom:${SECL};text-align:center;font-size:10.5pt;font-weight:bold;padding:3px 8px;`;
  const subHdr = `border:none;padding:5px 8px 2px;font-weight:bold;font-size:10.5pt;text-decoration:underline;`;
  const coCell = `border:none;text-align:center;padding:8px 12px;`;
  const ttlCell= `border-top:${SECL};border-bottom:${SECL};text-align:center;font-size:16pt;font-weight:bold;letter-spacing:3px;padding:6px;`;

  /* Compact label:value row, used throughout for structured fields (Bill
     To / Ship To, e-Invoice Details, Bank Details, e-Way Bill page). */
  const ocS  = `border:none;padding:1px 6px;vertical-align:top;font-size:8.5pt;word-wrap:break-word;overflow-wrap:break-word;`;
  const lblS = `${ocS}white-space:nowrap;width:95px;font-weight:normal;`;
  const sepS = `${ocS}width:10px;text-align:center;`;
  const frS = (ll,lv,rl,rv) => `<tr>
    <td style="${lblS}">${ll}</td><td style="${sepS}">:</td><td style="${ocS}">${lv}</td>
    <td style="${lblS}">${rl}</td><td style="${sepS}">:</td><td style="${ocS}">${rv}</td>
  </tr>`;
  /* Single full-width label:value row (label, colon, value spanning the
     rest) — for fields that shouldn't be paired with an unrelated field
     on the same line (Name, Address, GSTIN, Contact, bank fields, etc). */
  const frSingle = (ll,lv) => `<tr>
    <td style="${lblS}">${ll}</td><td style="${sepS}">:</td><td colspan="3" style="${ocS}">${lv}</td>
  </tr>`;

  const itemCols   = ['Sr No','Description','HSN Code','Qty','UoM','Rate','Taxable'];
  const itemWidths = ['34px','','80px','42px','48px','85px','95px'];
  const itemBody = items.length
    ? items.map((it,i) => {
        const qty = parseFloat(it.qty)||0, rate = parseFloat(it.rate)||0;
        const tax = it.taxable !== undefined ? parseFloat(it.taxable)||0 : qty*rate;
        const nm  = dv(it.description||it.itemName||it.material||'');
        return [
          {text:`${i+1}`,style:'text-align:center;'},
          {text:nm||'—'},
          {text:dv(it.hsnCode),style:'text-align:center;'},
          {text:qty?String(qty):'',style:'text-align:center;'},
          {text:dv(it.unit),style:'text-align:center;'},
          {text:rate?fmtN(rate):'',style:'text-align:right;'},
          {text:tax?fmtN(tax):'',style:'text-align:right;'},
        ];
      })
    : [[{text:'No items',style:'text-align:center;color:#888;font-style:italic;',colspan:7}]];

  const footRows = [];
  const R  = 'text-align:right;';
  const RB = 'text-align:right;font-weight:bold;white-space:nowrap;';

  footRows.push([{text:'Total Taxable', style:RB, colspan:6}, {text:fmtN(subTotal), style:RB}]);

  const rates = [...new Set(items.map(it=>parseFloat(it.gstPct||it.gstPercent||it.gst)||0).filter(r=>r>0))];
  const singleRate = rates.length===1 ? rates[0] : null;
  if (intrastate) {
    footRows.push([{text:`CGST${singleRate?` @ ${singleRate/2}%`:''}`, style:R, colspan:6}, {text:fmtN(totalCGST), style:R}]);
    footRows.push([{text:`SGST${singleRate?` @ ${singleRate/2}%`:''}`, style:R, colspan:6}, {text:fmtN(totalSGST), style:R}]);
  } else {
    footRows.push([{text:`IGST${singleRate?` @ ${singleRate}%`:''}`, style:R, colspan:6}, {text:fmtN(totalIGST), style:R}]);
  }

  footRows.push([{text:'Grand Total', style:RB, colspan:6}, {text:`₹ ${fmtN(grand)}`, style:RB}]);

  const itemTable = buildItemTable(itemCols, itemWidths, itemBody, footRows);

  /* Bank Details — one field per row (A/c Holder Name, Bank Name, A/c No,
     IFS Code, Branch Name) instead of a squeezed inline string. */
  const hasBankDetails = !!(company.bankName || company.bankAccount || company.bankIfsc);
  const bankRows = hasBankDetails ? [
    frSingle('A/c Holder Name', dv(coName)),
    frSingle('Bank Name', dv(company.bankName)||'—'),
    frSingle('A/c No', dv(company.bankAccount)||'—'),
    frSingle('IFS Code', dv(company.bankIfsc)||'—'),
    frSingle('Branch Name', dv(company.bankBranch)||'—'),
  ] : [];

  /* Bill To / Ship To — full labeled fields (Name/Address/City/Pincode/
     State/State Code/GSTIN/Contact), side by side in a 2-column layout so
     each stays clearly organised without stacking one block under the other. */
  const oneLine = `border:none;padding:2px 8px;font-size:10.5pt;word-wrap:break-word;overflow-wrap:break-word;`;
  const pv = v => dv(v) || '—';
  const billContact = o.mobile || '';
  const shipContact = o.shipToMobile || o.mobile || '';
  const hasShipTo = !!(b.shipToName || b.shipToAddress);

  const partyTable = rows => `<table style="width:100%;border-collapse:collapse;"><colgroup><col style="width:62px"><col style="width:8px"><col><col style="width:60px"><col style="width:8px"><col></colgroup><tbody>${rows.join('')}</tbody></table>`;

  const billFieldRows = partyTable([
    frSingle('Name',    pv(b.partyName)),
    frSingle('Address', pv(b.billToAddress)),
    frS('City', pv(b.billToCity), 'State', pv(b.partyState)),
    frS('Pincode', pv(b.billToPincode), 'State Code', stateCode(b.partyState)||'—'),
    frSingle('GSTIN',   pv(b.partyGstin)),
    frSingle('Contact', pv(billContact)),
  ]);
  const shipFieldRows = hasShipTo ? partyTable([
    frSingle('Name',    pv(b.shipToName)),
    frSingle('Address', pv(b.shipToAddress)),
    frS('City', pv(b.shipToCity), 'State', pv(b.shipToState)),
    frS('Pincode', pv(b.shipToPincode), 'State Code', stateCode(b.shipToState)||'—'),
    frSingle('GSTIN',   pv(b.partyGstin)),
    frSingle('Contact', pv(shipContact)),
  ]) : `<div style="${ocS}color:#888;font-style:italic;padding:6px 8px;">Same as Bill To</div>`;

  const billShipRow = `
<tr>
  <td colspan="3" style="${subHdr}">Bill To</td>
  <td colspan="3" style="${subHdr}">Ship To</td>
</tr>
<tr>
  <td colspan="3" style="border:none;padding:0;vertical-align:top;border-right:1px solid #ccc;">${billFieldRows}</td>
  <td colspan="3" style="border:none;padding:0;vertical-align:top;">${shipFieldRows}</td>
</tr>`;

  /* Page 2 — a dedicated e-Way Bill page (mirrors the government e-Way Bill
     printout: its own QR, e-way details, from/to addresses, goods table)
     instead of cramming everything onto the tax invoice. Always printed,
     even when the e-way bill hasn't been generated yet, so Vehicle No /
     Generated / Valid Upto / Approx Distance are always visible with
     placeholders — matching how Bill To / Ship To always show now. */
  const ewayPageHtml = `
<div class="page" style="page-break-before:always;"><div class="outer">
<table style="width:100%;border-collapse:collapse;">
<colgroup>
  <col style="width:130px"><col style="width:14px"><col>
  <col style="width:130px"><col style="width:14px"><col>
</colgroup>
<tbody>

<tr><td colspan="6" style="${ttlCell}">e-Way Bill</td></tr>

<tr><td colspan="6" style="border:none;padding:6px 10px;">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;">
    <div style="font-size:10.5pt;">
      <div><strong>Doc No:</strong> ${dv(b.billNo)||'—'}</div>
      <div><strong>Date:</strong> ${fmtD(b.billDate)}</div>
      ${b.irnNo?`<div style="margin-top:4px;"><strong>IRN:</strong> <span style="word-break:break-all;font-size:9pt;">${dv(b.irnNo)}</span></div>`:''}
      ${b.acknNo?`<div><strong>Ack No:</strong> ${dv(b.acknNo)} &nbsp;&nbsp; <strong>Ack Date:</strong> ${fmtD(b.acknDate)}</div>`:''}
    </div>
    ${ewayQrB64?`<div style="text-align:center;flex-shrink:0;">
      <img src="${ewayQrB64}" style="width:110px;height:110px;" alt="e-Way Bill QR">
      <div style="font-size:8pt;color:#666;margin-top:2px;">e-Way Bill QR</div>
    </div>`:`<div style="text-align:center;color:#888;font-size:9pt;max-width:140px;flex-shrink:0;">e-Way Bill not yet generated — QR unavailable</div>`}
  </div>
</td></tr>

<tr><td colspan="6" style="${secHdr}">1. e-Way Bill Details</td></tr>
${frS('E-way Bill No', dv(b.ewayBillNo)||'Not Generated', 'Mode', dv(b.ewayMode)||'—')}
${frS('Generated Date', dv(b.ewayGenDate)||'—', 'Valid Upto', dv(b.ewayValidUpto)||'—')}
${frS('Generated By', dv(company.gstin)||'—', 'Approx Distance', b.approxDistanceKm?`${dv(b.approxDistanceKm)} KM`:'—')}
${frS('Supply Type', dv(b.supplyType)||'—', 'Transaction Type', dv(b.transactionType)||'—')}

<tr><td colspan="6" style="${secHdr}">2. Address Details</td></tr>
<tr>
  <td colspan="3" style="${oneLine}border-right:1px solid #ccc;">
    <strong>From</strong><br>${coName}<br>${coAddr}${company?.gstin?`<br>GSTIN: ${dv(company.gstin)}`:''}
  </td>
  <td colspan="3" style="${oneLine}">
    <strong>To</strong><br>${dv(b.partyName)}<br>${[dv(b.billToAddress),dv(b.billToCity),dv(b.billToPincode),dv(b.partyState)].filter(Boolean).join(', ')}${b.partyGstin?`<br>GSTIN: ${dv(b.partyGstin)}`:''}
  </td>
</tr>
<tr>
  <td colspan="3" style="${oneLine}border-right:1px solid #ccc;border-top:1px solid #eee;">
    <strong>Dispatch From</strong><br>${dv(b.dispatchFrom)||`<span style="color:#888;font-style:italic;">Same as From</span>`}
  </td>
  <td colspan="3" style="${oneLine}border-top:1px solid #eee;">
    <strong>Ship To</strong><br>${hasShipTo
      ? `${dv(b.shipToName)}<br>${[dv(b.shipToAddress),dv(b.shipToCity),dv(b.shipToPincode),dv(b.shipToState)].filter(Boolean).join(', ')}`
      : `<span style="color:#888;font-style:italic;">Same as To</span>`}
  </td>
</tr>

<tr><td colspan="6" style="${secHdr}">3. Goods Details</td></tr>
<tr><td colspan="6" style="border:none;padding:2px 0 8px;">${itemTable}</td></tr>

<tr><td colspan="6" style="${secHdr}">4. Transportation Details</td></tr>
${frS('Transporter ID', dv(b.transporterId)||'—', 'Transporter Name', dv(b.transporterName)||'—')}

<tr><td colspan="6" style="${secHdr}">5. Vehicle Details</td></tr>
${frS('Vehicle No', dv(b.vehicleNo)||'—', 'From', dv(b.vehicleFromCity)||'—')}
${frSingle('CEWB No', dv(b.cewbNo)||'—')}

<tr><td colspan="6" style="border-top:${SECL};font-size:8.5pt;color:#666;background:#f5f5f5;padding:3px 8px;">
  <div style="display:flex;justify-content:space-between;">
    <span>${brandLine(user)}</span>
    <span>Page 2 — e-Way Bill · Printed: ${today}</span>
  </div>
</td></tr>

</tbody>
</table>
</div></div>`;

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>Tax Invoice ${dv(b.billNo)}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Times New Roman',Times,serif;font-size:11.5pt;color:#000;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .page{padding:8mm 12mm;}
  .outer{border:1px solid #000;padding:6px;}
  @media print{
    @page{ margin:10mm; size:A4 portrait; }
    .page{padding:0;}
    tr{page-break-inside:avoid;break-inside:avoid;}
  }
</style>
</head><body><div class="page"><div class="outer">

<table style="width:100%;border-collapse:collapse;">
<colgroup>
  <col style="width:130px"><col style="width:14px"><col>
  <col style="width:130px"><col style="width:14px"><col>
</colgroup>
<tbody>

<tr><td colspan="6" style="${coCell}">
  <div style="display:flex;align-items:center;gap:14px;">
    ${logoTag}
    <div style="text-align:left;">
      <div style="font-size:19pt;font-weight:bold;line-height:1.2;letter-spacing:0.5px;">${coName}</div>
      ${coAddr?`<div style="font-size:10.5pt;color:#444;margin-top:2px;">${coAddr}</div>`:''}
      ${company?.gstin||company?.phone||company?.email?`<div style="font-size:10.5pt;margin-top:1px;">${[company?.gstin?'GSTIN: '+dv(company.gstin):'',company?.phone?'Ph: '+dv(company.phone):'',company?.email?'Email: '+dv(company.email):''].filter(Boolean).join('&nbsp;&nbsp;|&nbsp;&nbsp;')}</div>`:''}
    </div>
  </div>
</td></tr>

<tr><td colspan="6" style="${ttlCell}">Tax Invoice</td></tr>

${billShipRow}

<tr><td colspan="6" style="${secHdr}">Order Details</td></tr>
${frS('Sales Order',  dv(b.orderNo||(b.orderId?`SO-${b.orderId}`:''))||'—', 'Order Date', fmtD(o.orderDate||o.date)||'—')}
${(o.customerPO||o.clientOrderNo) ? frS('Client PO No', dv(o.customerPO||o.clientOrderNo), 'Client PO Date', fmtD(o.poDate||o.clientOrderDate)) : ''}

<tr><td colspan="6" style="${secHdr}">Invoice Details</td></tr>
<tr><td colspan="${irnQrB64?5:6}" style="border:none;padding:0;vertical-align:top;">
  <table style="width:100%;border-collapse:collapse;"><colgroup><col style="width:95px"><col style="width:10px"><col><col style="width:95px"><col style="width:10px"><col></colgroup><tbody>
  ${frS('Invoice No',   dv(b.billNo)||'—', 'Invoice Date', fmtD(b.billDate))}
  ${frS('Ack No',    dv(b.acknNo)||'—', 'Ack Date', fmtD(b.acknDate)||'—')}
  ${frS('E-way Bill No', dv(b.ewayBillNo)||'Not Generated', 'Vehicle No', dv(b.vehicleNo)||'—')}
  </tbody></table>
</td>${irnQrB64?`<td style="border:none;text-align:center;vertical-align:middle;padding:2px 4px;">
  <img src="${irnQrB64}" style="width:70px;height:70px;" alt="e-Invoice QR">
  <div style="font-size:6.5pt;color:#666;margin-top:2px;">e-Invoice QR</div>
</td>`:''}</tr>
${b.irnNo ? `<tr><td colspan="6" style="border:none;padding:1px 8px 3px;font-size:9.5pt;white-space:nowrap;">
  <strong>IRN:</strong> <span style="font-family:'Courier New',monospace;font-size:8.5pt;letter-spacing:-0.2px;">${dv(b.irnNo)}</span>
</td></tr>` : ''}

<tr><td colspan="6" style="${secHdr}">Item Description</td></tr>
<tr><td colspan="6" style="border:none;padding:2px 0 8px;">${itemTable}</td></tr>

<tr><td colspan="6" style="border:none;padding:3px 8px 4px;font-size:11pt;">
  <strong>Amount in Words:</strong>&nbsp;${numWords(grand)}
</td></tr>

${hasBankDetails ? `
<tr><td colspan="6" style="${secHdr}">Bank Details</td></tr>
<tr><td colspan="6" style="border:none;padding:0;">
  <table style="width:100%;border-collapse:collapse;"><colgroup><col style="width:95px"><col style="width:10px"><col><col style="width:95px"><col style="width:10px"><col></colgroup><tbody>${bankRows.join('')}</tbody></table>
</td></tr>
` : ''}

${o.termsConditions ? `
<tr><td colspan="6" style="${secHdr}">Terms &amp; Conditions</td></tr>
<tr><td colspan="6" style="${oc}font-size:11pt;line-height:1.5;white-space:pre-wrap;">${esc(o.termsConditions)}</td></tr>
`:''}

<tr>
  <td colspan="3" style="text-align:center;padding:10px 10px 6px;border:none;">
    <div style="height:46px;margin:0 8px 3px;border:1px solid #ccc;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:8pt;">Signature</div>
    <div style="border-top:1px solid #000;margin:0 8px;padding-top:3px;">
      <strong style="font-size:10pt;">Prepared By</strong><br>
      <span style="font-size:9pt;">${dv(prepared.name)||'—'}</span>
      ${prepared.loginId ? `<br><span style="font-size:8pt;color:#555;">Login ID: ${dv(prepared.loginId)}</span>` : ''}
    </div>
  </td>
  <td colspan="3" style="text-align:center;padding:10px 10px 6px;border:none;">
    <div style="height:46px;margin:0 8px 3px;border:1px solid #ccc;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:8pt;">Signature &amp; Stamp</div>
    <div style="border-top:1px solid #000;margin:0 8px;padding-top:3px;">
      <strong style="font-size:10pt;">Authorised Signatory</strong><br><span style="font-size:9pt;">For ${coName}</span>
    </div>
  </td>
</tr>
<tr><td colspan="6" style="border-top:${SECL};font-size:8.5pt;color:#666;background:#f5f5f5;padding:3px 8px;">
  <div style="display:flex;justify-content:space-between;">
    <span>${brandLine(user)}</span>
    <span>This is a system-generated Tax Invoice · Printed: ${today}</span>
  </div>
</td></tr>

</tbody>
</table>
</div></div>
${ewayPageHtml}
</body></html>`;

  const win = window.open('','_blank','width=920,height=980,scrollbars=yes');
  if (!win) { alert('Please allow pop-ups to print.'); return; }
  win.document.write(withPrintFont(html));
  win.document.close();
  win.focus();
  setTimeout(()=>win.print(),900);
};
