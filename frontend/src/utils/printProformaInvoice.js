import { withPrintFont } from './printFont';
import { brandLine } from './printBranding';
import { withLiveContacts } from './liveContact';
/* printProformaInvoice.js — a Proforma Invoice generated from a Sales Order.
 * Deliberately lighter than printSalesOrder.js: a proforma is a customer-facing
 * pre-invoice/payment-request document, not the internal execution contract —
 * it carries client, items and totals, not scope of work, warranty, activities
 * or attachments.
 *
 * No number is persisted anywhere for this document (nothing about it is saved
 * to the database), so it cannot carry an official sequential Proforma No.
 * It is identified instead by the Sales Order it was generated from, which is
 * both honest and enough for a Proforma Invoice's purpose.
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

/* Grid table — every cell boxed (same convention as the Sales Order print). */
function buildItemTable(cols, widths, bodyRows, footRows) {
  const row = cells => '<tr>' + cells.map(c => {
    const span = c.colspan > 1 ? ` colspan="${c.colspan}"` : '';
    const cls  = /font-weight:bold/.test(c.style||'') ? ' class="tot"' : '';
    return `<td${span}${cls} style="${c.style||''}">${c.text}</td>`;
  }).join('') + '</tr>';
  const thead = '<thead><tr>' + cols.map((c,i) => `<th style="${widths[i] ? 'width:'+widths[i]+';' : ''}">${c}</th>`).join('') + '</tr></thead>';
  return `<table class="item-table">${thead}<tbody>${bodyRows.map(row).join('')}</tbody><tfoot>${footRows.map(row).join('')}</tfoot></table>`;
}

/* `pi` is the saved Proforma Invoice record (piNo, milestone, amount,
 * orderGrandTotal, previouslyInvoiced, balanceAfter) from api/proformaInvoices.js.
 * When omitted, falls back to showing the full order value — used only if a
 * caller prints before a PI record has been created. */
export const printProformaInvoice = async (order, company = {}, pi = null, user = null) => {
  let o     = order || {};
  const cid = company?.companyId || '';

  let logoB64 = null;
  if (company?.logoFileName)
    logoB64 = await fetchBase64(`/api/companies/logo/${encodeURIComponent(company.logoFileName)}?companyId=${cid}`);

  /* client record — PAN / GST type / current contact (same as the Sales Order print) */
  let cl = {};
  if (o.customerCode && cid) {
    try { const r = await fetch(`/api/clients/${o.customerCode}?companyId=${cid}`); if (r.ok) cl = await r.json(); } catch {}
  }
  o = withLiveContacts(o, cl);

  const items   = Array.isArray(o.items)   ? o.items   : [];
  const charges = Array.isArray(o.charges) ? o.charges : [];

  const coState   = (company.state||company.companyState||'').toLowerCase().trim();
  const custState = (o.customerState||'').toLowerCase().trim();
  const sameState = coState && custState && coState === custState;

  const itemTaxable = items.reduce((s,it)=>s+(parseFloat(it.qty)||0)*(parseFloat(it.rate)||0), 0);
  const itemGstAmt  = items.reduce((s,it)=>{
    const a=(parseFloat(it.qty)||0)*(parseFloat(it.rate)||0);
    return s+a*(parseFloat(it.gstPercent||it.gst)||0)/100;
  }, 0);
  const validChg  = charges.filter(c=>parseFloat(c.amount)>0);
  const chgNet    = validChg.reduce((s,c)=>s+(parseFloat(c.amount)||0), 0);
  const chgGstAmt = validChg.reduce((s,c)=>{ const a=parseFloat(c.amount)||0; return s+a*(parseFloat(c.gst)||0)/100; }, 0);
  const discount  = parseFloat(o.overallDiscount)||0;
  const freight   = parseFloat(o.freightCharges)||0;
  const packing   = parseFloat(o.packingCharges)||0;
  const roundOff  = parseFloat(o.roundOff)||0;
  const storedCgst= parseFloat(o.cgst)||0;
  const storedSgst= parseFloat(o.sgst)||0;
  const storedIgst= parseFloat(o.igst)||0;
  const totalGstAmt= (storedCgst+storedSgst+storedIgst)||(itemGstAmt+chgGstAmt);
  const combinedTaxable = itemTaxable + chgNet;
  const grand = parseFloat(o.grandTotal)||(itemTaxable+chgNet+totalGstAmt-discount+freight+packing+roundOff);

  const coName = dv(company.companyName||company.name)||'Epsilon Enterprise';
  const coAddr = [company.address,company.city,company.state,company.pincode].filter(Boolean).join(', ');
  const today  = fmtD(new Date());
  const logoTag = logoB64
    ? `<img src="${logoB64}" style="height:48px;max-width:110px;object-fit:contain;">`
    : '';

  const field = (lbl, v) => `
    <div class="field-row">
      <span class="field-lbl">${lbl}</span>
      <span class="field-colon">:</span>
      <span class="field-val">${v || '&nbsp;'}</span>
    </div>`;

  const itemCols   = ['Sr No','Item Name','HSN Code','Qty','UoM','Rate','Taxable'];
  const itemWidths = ['36px','','80px','44px','48px','90px','100px'];
  const itemBody = items.length
    ? items.map((it,i) => {
        const qty=parseFloat(it.qty)||0, rate=parseFloat(it.rate)||0, tax=qty*rate;
        const nm=dv(it.material||it.itemName||it.description||'');
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

  validChg.forEach(c => {
    const a = parseFloat(c.amount)||0;
    footRows.push([
      {text:[dv(c.chargeType),dv(c.description)].filter(Boolean).join(' — ')||'Additional Charge', style:R, colspan:6},
      {text:fmtN(a), style:R},
    ]);
  });

  footRows.push([{text:'Total Taxable', style:RB, colspan:6}, {text:fmtN(combinedTaxable), style:RB}]);

  const rates = [...new Set(items.map(it=>parseFloat(it.gstPercent||it.gst)||0).filter(r=>r>0))];
  const singleRate = rates.length===1 ? rates[0] : null;
  if (sameState) {
    const cgst = storedCgst||(totalGstAmt/2);
    const sgst = storedSgst||(totalGstAmt/2);
    footRows.push([{text:`CGST${singleRate?` @ ${singleRate/2}%`:''}`, style:R, colspan:6}, {text:fmtN(cgst), style:R}]);
    footRows.push([{text:`SGST${singleRate?` @ ${singleRate/2}%`:''}`, style:R, colspan:6}, {text:fmtN(sgst), style:R}]);
  } else {
    const igst = storedIgst||totalGstAmt;
    footRows.push([{text:`IGST${singleRate?` @ ${singleRate}%`:''}`, style:R, colspan:6}, {text:fmtN(igst), style:R}]);
  }

  if (discount>0) footRows.push([{text:'Discount', style:R, colspan:6}, {text:`− ${fmtN(discount)}`, style:`${R}color:#c00;`}]);
  if (freight>0)  footRows.push([{text:'Freight Charges',style:R,colspan:6},{text:fmtN(freight),style:R}]);
  if (packing>0)  footRows.push([{text:'Packing Charges',style:R,colspan:6},{text:fmtN(packing),style:R}]);
  if (roundOff)   footRows.push([{text:'Round Off',style:R,colspan:6},{text:fmtN(roundOff),style:R}]);

  footRows.push([{text: pi ? 'Total Order Value' : 'Total Amount Payable', style:RB, colspan:6}, {text:`₹ ${fmtN(grand)}`, style:RB}]);

  const itemTable = buildItemTable(itemCols, itemWidths, itemBody, footRows);

  const bankLine = [
    company.bankName ? `Bank: ${dv(company.bankName)}` : '',
    company.bankAccount ? `A/c No: ${dv(company.bankAccount)}` : '',
    company.bankIfsc ? `IFSC: ${dv(company.bankIfsc)}` : '',
  ].filter(Boolean).join('&nbsp;&nbsp;|&nbsp;&nbsp;');

  const css = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #000; background: #fff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .page { padding: 12px; }
    .outer { border: 1px solid #000; width: 100%; border-collapse: collapse; }
    .outer > tbody > tr > td { border: 1px solid #000; padding: 2px 6px; vertical-align: top; }
    .section-hdr { text-align: center; font-weight: bold; font-size: 10.5pt; padding: 2px; }
    .col-hdr { font-weight: bold; text-decoration: underline; font-size: 10pt; }
    .field-row { display: flex; gap: 2px; margin-bottom: 0; font-size: 9pt; line-height: 1.3; }
    .field-lbl { min-width: 130px; }
    .field-colon { margin: 0 4px; }
    .field-val { flex: 1; }
    .item-table { width: 100%; border-collapse: collapse; font-size: 9pt; }
    .item-table th { border: 1px solid #000; padding: 3px 5px; font-weight: bold; text-align: center; }
    .item-table td { border: 1px solid #000; padding: 2px 5px; vertical-align: middle; line-height: 1.25; }
    .item-table tfoot td { padding: 1px 6px; font-size: 8.5pt; }
    .item-table tr > :first-child { border-left: none; }
    .item-table tr > :last-child { border-right: none; }
    .item-table thead th { border-top: none; }
    .item-table tfoot tr:last-child td { border-bottom: none; }
    /* totals block: column line only between charge / tax rows; a rule above the
       block and above each total (Total Taxable, Total Order Value) */
    .item-table tfoot td { border-top: none; border-bottom: none; }
    .item-table tfoot tr:first-child td, .item-table tfoot td.tot { border-top: 1px solid #000; }
    .sig-row { page-break-inside: avoid; break-inside: avoid; }
    @media print {
      @page { margin: 8mm; size: A4 portrait; }
      .page { padding: 0; }
      tr { page-break-inside: avoid; break-inside: avoid; }
    }
  `;

  const coLine = [company?.gstin?'GSTIN: '+dv(company.gstin):'', company?.phone?'Ph: '+dv(company.phone):'', company?.email?'Email: '+dv(company.email):''].filter(Boolean).join('&nbsp;&nbsp;|&nbsp;&nbsp;');
  const custAddr = [dv(o.address||o.customerAddress||cl.billingAddr||cl.address)].filter(Boolean).join('');
  const cityState = [dv(o.customerCity||cl.city), dv(o.customerState||cl.state), dv(o.customerPincode||cl.pincode)].filter(Boolean).join(', ');
  /* ship-to: the order's delivery address, else the billing address */
  const hasShip  = !!(o.shipToAddress||o.deliveryAddr||o.shippingAddr||cl.shippingAddr);
  const shipAddr = hasShip ? dv(o.shipToAddress||o.deliveryAddr||o.shippingAddr||cl.shippingAddr) : custAddr;
  const shipCity = hasShip ? [dv(o.shipToCity), dv(o.shipToState), dv(o.shipToPincode)].filter(Boolean).join(', ') : cityState;

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>Proforma Invoice ${pi ? dv(pi.piNo)+' — ' : '— '}${dv(o.orderNo||o.orderId)}</title>
<style>${css}</style>
</head><body><div class="page">

<table class="outer">

  <!-- Company Header -->
  <tr>
    <td colspan="2" style="padding:8px 10px;">
      <div style="display:flex; align-items:center; gap:12px;">
        ${logoTag}
        <div>
          <div style="font-size:13pt; font-weight:bold;">${coName}</div>
          ${coAddr ? `<div style="font-size:8.5pt; color:#333;">${dv(coAddr)}</div>` : ''}
          ${coLine ? `<div style="font-size:8.5pt; color:#333;">${coLine}</div>` : ''}
        </div>
      </div>
    </td>
  </tr>

  <!-- Title -->
  <tr><td colspan="2" style="text-align:center; padding:6px;">
    <div style="font-size:13pt; font-weight:bold;">Proforma Invoice</div>
    <div style="font-size:8.5pt; color:#555; font-style:italic; margin-top:1px;">For advance payment / reference purposes only — not a Tax Invoice</div>
  </td></tr>

  <!-- Client Details + Tax Identity -->
  <tr><td colspan="2" class="section-hdr">Client Details &amp; Tax Identity</td></tr>
  <tr>
    <td style="width:50%"><span class="col-hdr">Client Details</span></td>
    <td><span class="col-hdr">Tax Identity</span></td>
  </tr>
  <tr>
    <td>
      ${field('Client ID', dv(o.customerCode||cl.clientId))}
      ${field('Client Name', `<strong>${dv(o.customerName||o.party)}</strong>`)}
      ${field('Contact Person', dv(o.contactPerson))}
      ${field('Mobile No', dv(o.mobile))}
      ${field('Email id', dv(o.email))}
    </td>
    <td>
      ${field('GSTIN No', dv(o.customerGstin||o.partyGstin||cl.gstin||cl.gst))}
      ${field('PAN No', dv(o.panNo||cl.pan||cl.panNo))}
      ${field('GST Type', dv(o.gstType||cl.gstType))}
      ${field('State', dv(o.customerState||cl.state))}
    </td>
  </tr>

  <!-- Bill To / Ship To -->
  <tr><td colspan="2" class="section-hdr">Bill To &amp; Ship To</td></tr>
  <tr>
    <td><span class="col-hdr">Bill To</span></td>
    <td><span class="col-hdr">Ship To</span></td>
  </tr>
  <tr>
    <td>
      ${field('Name', `<strong>${dv(o.customerName||o.party)}</strong>`)}
      ${field('Address', custAddr)}
      ${field('City / State', cityState)}
      ${field('GSTIN', dv(o.customerGstin||o.partyGstin||cl.gstin||cl.gst))}
    </td>
    <td>
      ${field('Name', `<strong>${dv(o.shipToName||o.customerName||o.party)}</strong>`)}
      ${field('Address', shipAddr)}
      ${field('City / State', shipCity)}
      ${field('Contact', [dv(o.shipToContact), dv(o.shipToMobile)].filter(Boolean).join(' — '))}
    </td>
  </tr>

  <!-- Reference -->
  <tr><td colspan="2" class="section-hdr">Reference</td></tr>
  <tr>
    <td>
      ${pi ? field('Proforma Invoice No', `<strong>${dv(pi.piNo)}</strong>`) : ''}
      ${field('Proforma Date', today)}
      ${field('Against Sales Order', `<strong>${dv(o.orderNo||o.orderId)}</strong>`)}
      ${field('Client PO No', dv(o.customerPO))}
    </td>
    <td>
      ${pi ? field('Milestone', dv(pi.milestone)) : ''}
      ${field('Order Date', fmtD(o.orderDate||o.date))}
      ${field('Client PO Date', fmtD(o.poDate))}
      ${field('Payment Terms', dv(o.paymentTerms))}
    </td>
  </tr>

  <!-- Items -->
  <tr><td colspan="2" class="section-hdr">Item Description</td></tr>
  <tr><td colspan="2" style="padding:0;">${itemTable}</td></tr>

  ${pi ? `
  <!-- Payment Milestone — the amount requested by this Proforma Invoice -->
  <tr><td colspan="2" class="section-hdr">Payment Milestone</td></tr>
  <tr><td colspan="2" style="padding:0;">
    <table class="item-table">
      <tbody>
        <tr><td>Total Order Value</td><td style="text-align:right;width:140px;">₹ ${fmtN(pi.orderGrandTotal)}</td></tr>
        <tr><td>Previously Invoiced</td><td style="text-align:right;">− ₹ ${fmtN(pi.previouslyInvoiced)}</td></tr>
        <tr><td style="font-weight:bold;font-size:10pt;">This Proforma Invoice${pi.splitType==='percent' ? ` (${dv(pi.splitValue)}%)` : ''}${pi.milestone ? ` — ${dv(pi.milestone)}` : ''}</td>
            <td style="text-align:right;font-weight:bold;font-size:10pt;">₹ ${fmtN(pi.amount)}</td></tr>
        <tr><td style="color:#444;">Balance Remaining After This Invoice</td><td style="text-align:right;color:#444;">₹ ${fmtN(pi.balanceAfter)}</td></tr>
      </tbody>
    </table>
  </td></tr>
  <tr><td colspan="2" style="padding:5px 8px;"><strong>Amount in Words (this Proforma Invoice):</strong>&nbsp;${numWords(pi.amount)}</td></tr>
  ` : `
  <tr><td colspan="2" style="padding:5px 8px;"><strong>Amount in Words:</strong>&nbsp;${numWords(grand)}</td></tr>
  `}

  ${bankLine ? `
  <tr><td colspan="2" class="section-hdr">Payment Details</td></tr>
  <tr><td colspan="2" style="padding:5px 8px;font-size:9.5pt;">${bankLine}</td></tr>
  ` : ''}

  ${(o.termsConditions||o.customerNotes) ? `
  <tr><td colspan="2" class="section-hdr">Terms &amp; Conditions</td></tr>
  <tr><td colspan="2" style="padding:6px 8px;font-size:9.5pt;line-height:1.5;white-space:pre-wrap;">${esc(o.termsConditions||o.customerNotes)}</td></tr>
  ` : ''}

  <!-- Signature -->
  <tr class="sig-row">
    <td style="text-align:center; padding:6px 10px 4px;">
      <div style="height:42px; margin:0 8px 3px; border:1px solid #ccc; display:flex; align-items:center; justify-content:center; color:#aaa; font-size:8.5pt;">Receiver's Signature</div>
      <div style="border-top:1px solid #000; margin:0 8px; padding-top:4px;"><strong>Customer Acknowledgement</strong><br><span style="font-size:9.5pt;">${dv(o.customerName||o.party)}</span></div>
    </td>
    <td style="text-align:center; padding:6px 10px 4px;">
      <div style="height:42px; margin:0 8px 3px; border:1px solid #ccc; display:flex; align-items:center; justify-content:center; color:#aaa; font-size:8.5pt;">Signature &amp; Stamp</div>
      <div style="border-top:1px solid #000; margin:0 8px; padding-top:4px;"><strong>Authorised Signatory</strong><br><span style="font-size:9.5pt;">For ${coName}</span></div>
    </td>
  </tr>
  <tr><td colspan="2" style="font-size:8pt; color:#555;">
    <div style="display:flex; justify-content:space-between;">
      <span>${brandLine(user)}</span>
      <span>Printed: ${today}</span>
    </div>
  </td></tr>

</table>
</div>
</body></html>`;

  const win = window.open('','_blank','width=920,height=980,scrollbars=yes');
  if (!win) { alert('Please allow pop-ups to print.'); return; }
  win.document.write(withPrintFont(html));
  win.document.close();
  win.focus();
  setTimeout(()=>win.print(),900);
};
