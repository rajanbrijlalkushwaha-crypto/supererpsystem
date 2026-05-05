/* printSalesOrder.js — clean SO print, single outer table, no double borders */

/* ── Helpers ── */
const fetchBase64 = async (url) => {
  try {
    const res  = await fetch(url);
    const blob = await res.blob();
    return await new Promise(r => {
      const rd = new FileReader(); rd.onload = () => r(rd.result); rd.readAsDataURL(blob);
    });
  } catch { return null; }
};

const fetchRendered = async (orderId, fileName, companyId) => {
  try {
    const r = await fetch(`/api/sales-orders/${orderId}/render-attachment/${encodeURIComponent(fileName)}?companyId=${companyId}`);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
};

/* ── Formatters ── */
const esc  = v => (!v && v !== 0) ? '' : String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const dv   = v => esc(v) || '';
const fmtD = v => {
  if (!v) return '';
  const dt = new Date(v);
  return isNaN(dt) ? String(v) : `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`;
};
const fmtN = n => Number(n||0).toLocaleString('en-IN', { minimumFractionDigits:2, maximumFractionDigits:2 });

/* ── Amount in words ── */
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

/* ──────────────────────────────────────────────────────────────────
   Nested table builder — removes outer edges so containing <td>
   provides the frame; no double borders.
──────────────────────────────────────────────────────────────────── */
const B = '1px solid #555';   // column separator / frame

function buildNestedTable(cols, headerWidths, bodyRows, footRows) {
  const n = cols.length;
  const hasfoot = footRows && footRows.length > 0;

  /* Header: bottom border under the header row + left border for each column divider.
     No background fill. */
  let thead = `<thead><tr>`;
  cols.forEach((c, i) => {
    const w = headerWidths[i] ? `width:${headerWidths[i]};` : '';
    const s = `border-top:none;border-bottom:${B};border-left:${i===0?'none':B};border-right:none;`;
    thead += `<th style="${s}${w}font-weight:bold;text-align:center;font-size:8.5pt;padding:3px 5px;white-space:nowrap;">${c}</th>`;
  });
  thead += `</tr></thead>`;

  /* Body rows: ONLY left border (vertical column divider) — no horizontal lines between rows. */
  let tbody = `<tbody>`;
  bodyRows.forEach((row) => {
    tbody += `<tr>`;
    row.forEach((cell, ci) => {
      const s = `border-top:none;border-bottom:none;border-left:${ci===0?'none':B};border-right:none;`;
      tbody += `<td style="${cell.style||''}${s}padding:3px 5px;font-size:9pt;vertical-align:middle;">${cell.text}</td>`;
    });
    tbody += `</tr>`;
  });
  tbody += `</tbody>`;

  /* Footer rows: top border on first row only (separator from body), then left borders per column.
     cell.style comes first so that the explicit border sides in s override any border:none shorthand
     that expandRow() puts on placeholder cells. */
  let tfoot = '';
  if (hasfoot) {
    tfoot = `<tfoot>`;
    footRows.forEach((row, ri) => {
      tfoot += `<tr>`;
      row.forEach((cell, ci) => {
        /* Keep colspan intact — do NOT pre-expand footer rows.
           Left border only on non-first cells (vertical separator before amount). */
        const span = cell.colspan || 1;
        const colAttr = span > 1 ? ` colspan="${span}"` : '';
        const s = `border-top:${ri===0?B:'none'};border-bottom:none;border-left:${ci===0?'none':B};border-right:none;`;
        tfoot += `<td${colAttr} style="${cell.style||''}${s}padding:4px 8px;font-size:9.5pt;">${cell.text}</td>`;
      });
      tfoot += `</tr>`;
    });
    tfoot += `</tfoot>`;
  }

  return `<table style="width:100%;border-collapse:collapse;border:${B};">${thead}${tbody}${tfoot}</table>`;
}

/* ══════════════════════════════════════════════════════════════════
   MAIN EXPORT
══════════════════════════════════════════════════════════════════ */
export const printSalesOrder = async (order, company = {}) => {
  const o   = order || {};
  const cid = company?.companyId || '';
  const origin = window.location.origin;

  /* ── Logo ── */
  let logoB64 = null;
  if (company?.logoFileName)
    logoB64 = await fetchBase64(`/api/companies/logo/${encodeURIComponent(company.logoFileName)}?companyId=${cid}`);

  /* ── Client record ── */
  let cl = {};
  if (o.customerCode && cid) {
    try { const r = await fetch(`/api/clients/${o.customerCode}?companyId=${cid}`); if (r.ok) cl = await r.json(); } catch {}
  }

  /* ── Process attachments ── */
  const atts = Array.isArray(o.attachments) ? o.attachments : [];
  const processedAtts = await Promise.all(atts.map(async att => {
    if (!att.fileName || !o.orderId || !cid) return { ...att, kind: 'missing' };
    const ext = (att.fileName.split('.').pop()||'').toLowerCase();
    if (ext === 'pdf') {
      const url = `${origin}/api/sales-orders/${o.orderId}/download/${encodeURIComponent(att.fileName)}?companyId=${cid}&inline=1`;
      return { ...att, kind: 'pdf', pdfUrl: url };
    }
    const rd = await fetchRendered(o.orderId, att.fileName, cid);
    return { ...att, kind: rd?.kind||'unknown', ...(rd||{}) };
  }));
  const hasPdfs = processedAtts.some(a => a.kind === 'pdf');

  /* ── Arrays ── */
  const items   = Array.isArray(o.items)      ? o.items      : [];
  const charges = Array.isArray(o.charges)    ? o.charges    : [];
  const addons  = Array.isArray(o.addons)     ? o.addons     : [];
  const scope   = Array.isArray(o.scopeItems) ? o.scopeItems : [];
  const tasks   = Array.isArray(o.tasks)      ? o.tasks      : [];
  const bg      = o.bankGuarantee || {};
  const wty     = o.warranty      || {};

  /* ── GST state logic ── */
  const coState   = (company.state||company.companyState||'').toLowerCase().trim();
  const custState = (o.customerState||'').toLowerCase().trim();
  const sameState = coState && custState && coState === custState;

  /* ── Calculations ── */
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
  const grand     = parseFloat(o.grandTotal)||(itemTaxable+chgNet+totalGstAmt-discount+freight+packing+roundOff);

  /* ── Company ── */
  const coName = dv(company.companyName||company.name)||'Epsilon Enterprise';
  const coAddr = [company.address,company.city,company.state,company.pincode].filter(Boolean).join(', ');
  const today  = new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'});
  const logoTag = logoB64
    ? `<img src="${logoB64}" style="height:56px;max-width:120px;object-fit:contain;vertical-align:middle;margin-right:12px;">`
    : '';

  /* ── Outer table: NO cell borders; only section-separator lines ── */
  const SECL = '1.5px solid #555';  // section separator line

  /* Data cells — NO border; just padding */
  const oc    = `border:none;padding:3px 8px;vertical-align:top;font-size:9.5pt;`;
  const lbl   = `${oc}white-space:nowrap;width:130px;font-weight:normal;`;
  const sep   = `${oc}width:12px;text-align:center;`;
  const val   = oc;

  /* Section header — line ABOVE and BELOW, no fill */
  const secHdr= `border-top:${SECL};border-bottom:${SECL};border-left:none;border-right:none;text-align:center;font-size:10.5pt;font-weight:bold;background:none;padding:6px 8px;`;

  /* Sub-header (e.g. "Client Details | Tax Identity") — bold underline, no border */
  const subHdr= `border:none;padding:7px 8px 2px;font-weight:bold;font-size:10pt;text-decoration:underline;`;

  /* Company logo/name cell */
  const coCell= `border:none;text-align:center;padding:12px 14px;`;

  /* "Sales Order" title — line ABOVE and BELOW (like ─── SALES ORDER ───) */
  const ttlCell=`border-top:${SECL};border-bottom:${SECL};border-left:none;border-right:none;text-align:center;font-size:15pt;font-weight:bold;letter-spacing:3px;padding:9px;`;

  /* Nested table wrapper — no outer border (table itself carries its own frame) */
  const ndWrap= `border:none;padding:2px 0 8px;`;

  // Row builder: left-label : left-val | right-label : right-val
  const fr = (ll,lv,rl,rv) => `<tr>
    <td style="${lbl}">${ll}</td><td style="${sep}">:</td><td style="${val}">${lv}</td>
    <td style="${lbl}">${rl}</td><td style="${sep}">:</td><td style="${val}">${rv}</td>
  </tr>`;

  /* ══ ITEM TABLE ══ */
  const itemCols   = ['Sr No','ITEM code','Item Name','Additional Description','HSN Code','Qty','UoM','Rate','Taxable'];
  const itemWidths = ['30px','75px','','','75px','38px','44px','80px','90px'];

  const itemBody = items.length
    ? items.map((it,i) => {
        const qty=parseFloat(it.qty)||0, rate=parseFloat(it.rate)||0, tax=qty*rate;
        const nm=dv(it.material||it.itemName||it.description||'');
        const addD=dv((it.description&&it.description!==nm?it.description:'')||it.additionalDesc||'');
        return [
          {text:`${i+1}`,style:'text-align:center;'},
          {text:dv(it.itemCode||it.code)},
          {text:nm||'—'},
          {text:addD},
          {text:dv(it.hsnCode),style:'text-align:center;'},
          {text:qty?String(qty):'',style:'text-align:center;'},
          {text:dv(it.unit),style:'text-align:center;'},
          {text:rate?fmtN(rate):'',style:'text-align:right;'},
          {text:tax?fmtN(tax):'',style:'text-align:right;'},
        ];
      })
    : [[
        {text:'No items',style:`text-align:center;color:#888;font-style:italic;`,colspan:9}
      ]];

  // Build total foot rows
  // Order: 1) each charge (base, no GST)  2) Total Taxable  3) GST  4) Total Order Value
  const footRowsRaw = [];
  const R = 'text-align:right;';
  const RB = 'text-align:right;font-weight:bold;';

  // 1. Each additional charge — base amount only (no GST included)
  validChg.forEach(c => {
    const a = parseFloat(c.amount)||0;
    footRowsRaw.push([
      {text:dv(c.chargeType||c.description||'Additional Charge'), style:R, colspan:8},
      {text:fmtN(a), style:R},
    ]);
  });

  // 2. Total Taxable = items + sum of charge base amounts
  const combinedTaxable = itemTaxable + chgNet;
  footRowsRaw.push([
    {text:'Total Taxable', style:RB, colspan:8},
    {text:fmtN(combinedTaxable), style:RB},
  ]);

  // 3. GST on total taxable (split by state)
  const rates = [...new Set(items.map(it=>parseFloat(it.gstPercent||it.gst)||0).filter(r=>r>0))];
  const singleRate = rates.length===1 ? rates[0] : null;
  if (sameState) {
    const cgst = storedCgst||(totalGstAmt/2);
    const sgst = storedSgst||(totalGstAmt/2);
    footRowsRaw.push([
      {text:`CGST${singleRate?` @ ${singleRate/2}%`:''}`, style:R, colspan:8},
      {text:fmtN(cgst), style:R},
    ]);
    footRowsRaw.push([
      {text:`SGST${singleRate?` @ ${singleRate/2}%`:''}`, style:R, colspan:8},
      {text:fmtN(sgst), style:R},
    ]);
  } else {
    const igst = storedIgst||totalGstAmt;
    footRowsRaw.push([
      {text:`IGST${singleRate?` @ ${singleRate}%`:''}`, style:R, colspan:8},
      {text:fmtN(igst), style:R},
    ]);
  }

  // Optional adjustments
  if (discount>0) footRowsRaw.push([
    {text:'Discount', style:R, colspan:8},
    {text:`− ${fmtN(discount)}`, style:`${R}color:#c00;`},
  ]);
  if (freight>0) footRowsRaw.push([{text:'Freight Charges',style:R,colspan:8},{text:fmtN(freight),style:R}]);
  if (packing>0) footRowsRaw.push([{text:'Packing Charges',style:R,colspan:8},{text:fmtN(packing),style:R}]);
  if (roundOff)  footRowsRaw.push([{text:'Round Off',style:R,colspan:8},{text:fmtN(roundOff),style:R}]);

  // 4. Total Order Value — bold, no background fill
  footRowsRaw.push([
    {text:'Total Order Value', style:RB, colspan:8},
    {text:`₹ ${fmtN(grand)}`, style:RB},
  ]);

  // Convert colspan rows for buildNestedTable (which expects N cells per row)
  const expandRow = (row, n) => {
    const out = [];
    row.forEach(cell => {
      const span = cell.colspan||1;
      out.push({text:cell.text, style:cell.style||''});
      for (let k=1;k<span;k++) out.push({text:'',style:'border:none;'});
    });
    while (out.length < n) out.push({text:'',style:''});
    return out.slice(0,n);
  };

  const N_ITEM = itemCols.length; // 9
  const itemBodyExpanded = itemBody[0]?.[0]?.colspan
    ? [expandRow(itemBody[0], N_ITEM)]
    : itemBody;
  // Footer rows keep their colspan — buildNestedTable emits <td colspan> directly
  const itemTable = buildNestedTable(itemCols, itemWidths, itemBodyExpanded, footRowsRaw);

  /* ══ ADDON TABLE ══ */
  const addonCols   = ['Sr No','ITEM code','Item Name','Additional Description','HSN Code','Qty','UoM','Category','Included Price','Remarks'];
  const addonWidths = ['30px','75px','','','75px','38px','50px','80px','80px',''];
  const addonBody = addons.length
    ? addons.map(a=>[
        {text:String(addons.indexOf(a)+1),style:'text-align:center;'},
        {text:dv(a.itemCode)},
        {text:dv(a.itemName||a.description)},
        {text:dv(a.additionalDesc)},
        {text:dv(a.hsnCode),style:'text-align:center;'},
        {text:String(a.qty||''),style:'text-align:center;'},
        {text:dv(a.unit),style:'text-align:center;'},
        {text:dv(a.category)},
        {text:a.includedInPrice?'Yes':'No',style:'text-align:center;'},
        {text:dv(a.remarks)},
      ])
    : [[...Array(10)].map((_,i)=>i===0?{text:'No add-on items',style:'text-align:center;color:#888;font-style:italic;',colspan:10}:{text:'',style:'border:none;'})];
  const addonTable = buildNestedTable(addonCols, addonWidths,
    addons.length?addonBody:[expandRow(addonBody[0],10)], []);

  /* ══ SCOPE TABLE ══ */
  const scopeCols   = ['#','Scope Item','Client Scope','Our Scope','Remarks'];
  const scopeWidths = ['30px','','80px','80px',''];
  const scopeBody = scope.length
    ? scope.map((s,i)=>[
        {text:String(i+1),style:'text-align:center;'},
        {text:dv(s.item||s.description)},
        {text:s.clientScope?'✓':'',style:'text-align:center;'},
        {text:s.ourScope?'✓':'',style:'text-align:center;'},
        {text:dv(s.remarks)},
      ])
    : [[{text:'—',style:'text-align:center;color:#888;',colspan:5},{text:'',style:'border:none;'},{text:'',style:'border:none;'},{text:'',style:'border:none;'},{text:'',style:'border:none;'}]];
  const scopeTable = buildNestedTable(scopeCols, scopeWidths,
    scope.length?scopeBody:[expandRow(scopeBody[0],5)], []);

  /* ══ ACTIVITY TABLE ══ */
  const actCols   = ['#','Task / Activity','Assigned To','Start Date','End Date','Status','Remarks'];
  const actWidths = ['30px','','100px','75px','75px','80px',''];
  const actBody = tasks.length
    ? tasks.map((t,i)=>[
        {text:String(i+1),style:'text-align:center;'},
        {text:dv(t.task||t.description)},
        {text:dv(t.assignedTo)},
        {text:fmtD(t.startDate)},
        {text:fmtD(t.endDate)},
        {text:dv(t.status)},
        {text:dv(t.remarks)},
      ])
    : [[{text:'—',style:'text-align:center;color:#888;',colspan:7},...Array(6).fill({text:'',style:'border:none;'})]];
  const actTable = buildNestedTable(actCols, actWidths,
    tasks.length?actBody:[expandRow(actBody[0],7)], []);

  /* ══ ATTACHMENTS ══ */
  let attHTML = '';
  if (!processedAtts.length) {
    attHTML = `<div style="border:1px solid #555;padding:12px;text-align:center;color:#888;font-style:italic;border-top:none;">No attachments</div>`;
  } else {
    processedAtts.forEach((att,i) => {
      const label = att.name||att.fileName||`Document ${i+1}`;
      let content = '';
      if (att.kind==='pdf') {
        content = `<div class="pdf-render" data-pdf-url="${att.pdfUrl||''}" style="width:100%;min-height:40px;background:#f9f9f9;"></div>`;
      } else if (att.kind==='excel') {
        content = `<div style="overflow-x:auto;padding:6px;font-size:8.5pt;">${att.html||''}</div>`;
      } else if (att.kind==='word') {
        content = `<div style="padding:10px;font-size:9.5pt;line-height:1.6;">${att.html||''}</div>`;
      } else if (att.kind==='text') {
        const safe=(att.text||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        content = `<pre style="padding:10px;font-family:monospace;font-size:8.5pt;white-space:pre-wrap;background:#f8f8f8;">${safe}</pre>`;
      } else {
        const ext=(att.fileName||'').split('.').pop().toUpperCase();
        content = `<div style="padding:12px;text-align:center;color:#888;font-style:italic;">.${ext} file — cannot render inline</div>`;
      }
      attHTML += `<div class="att-block" style="border:1px solid #555;${i>0?'border-top:none;':''}">
        <div style="background:#2a4a7a;color:#fff;font-weight:bold;font-size:9.5pt;padding:4px 10px;">${i+1}. ${dv(label)}</div>
        ${content}
      </div>`;
    });
  }

  /* ══ CSS ══ */
  const css = `
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:Arial,Helvetica,sans-serif;font-size:9.5pt;color:#000;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
    .page{padding:8mm 12mm;}
    .embed-excel table{border-collapse:collapse;width:100%;}
    .embed-excel td,.embed-excel th{border:1px solid #ccc;padding:2px 5px;font-size:8pt;}
    .att-block{page-break-inside:avoid;break-inside:avoid;}
    .sig-row{page-break-before:avoid;break-before:avoid;}
    @media print{
      @page{
        margin:10mm 10mm 14mm;
        size:A4 portrait;
        @bottom-center{content:"Page " counter(page) " of " counter(pages);font-size:8pt;font-family:Arial,sans-serif;color:#555;}
      }
      .page{padding:0;}
      canvas{max-width:100%;display:block;}
      tr{page-break-inside:avoid;break-inside:avoid;}
    }
  `;

  /* ══ HTML ══ */
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>Sales Order — ${dv(o.orderNo||o.orderId)}</title>
<style>${css}</style>
</head><body><div class="page">

<table style="width:100%;border-collapse:collapse;">
<colgroup>
  <col style="width:130px"><col style="width:14px"><col>
  <col style="width:130px"><col style="width:14px"><col>
</colgroup>
<tbody>

<!-- ═══ COMPANY HEADER ═══ -->
<tr><td colspan="6" style="${coCell}">
  <div style="text-align:center;">
    ${logoTag?`<div style="margin-bottom:6px;">${logoTag}</div>`:''}
    <div style="font-size:22pt;font-weight:bold;line-height:1.2;letter-spacing:1px;">${coName}</div>
    ${coAddr?`<div style="font-size:8.5pt;color:#444;margin-top:3px;">${coAddr}</div>`:''}
    ${company?.gstin||company?.phone||company?.email?`<div style="font-size:8.5pt;margin-top:2px;">${[company?.gstin?'GSTIN: '+dv(company.gstin):'',company?.phone?'Ph: '+dv(company.phone):'',company?.email?'Email: '+dv(company.email):''].filter(Boolean).join('&nbsp;&nbsp;|&nbsp;&nbsp;')}</div>`:''}
  </div>
</td></tr>

<!-- ═══ TITLE ═══ -->
<tr><td colspan="6" style="${ttlCell}">Sales Order</td></tr>

<!-- CLIENT DETAILS | TAX IDENTITY -->
<tr>
  <td colspan="3" style="${subHdr}">Client Details</td>
  <td colspan="3" style="${subHdr}">Tax Identity</td>
</tr>
${fr('Client ID',         dv(o.customerCode||cl.clientId),          'Pan No',           dv(cl.panNo||o.panNo))}
${fr('Client Name',       `<strong>${dv(o.customerName||o.party)}</strong>`,  'GSTIN No', dv(o.customerGstin||o.partyGstin||cl.gstinNo))}
${fr('Business Type',     dv(cl.businessType||o.businessType),      'CIN No',           dv(cl.cinNo||o.cinNo))}
${fr('Industries Type',   dv(cl.industryType||cl.industriesType||o.industryType), 'MSME if Applicable', dv(cl.msme||cl.msmeNo||o.msme))}
${fr('Category',          dv(cl.category||o.category),              'GST Type',         dv(cl.gstType||o.gstType))}
${fr('TDS Applicable',    dv(cl.tdsApplicable||o.tdsApplicable),    'GST Registered',   dv(cl.gstRegistered||o.gstRegistered))}

<!-- ORDER DESCRIPTION -->
<tr><td colspan="6" style="${secHdr}">Order Description</td></tr>
${fr('ERP No',      dv(o.orderId),                            'Client PO Date',    fmtD(o.poDate))}
${fr('Order No',    `<strong>${dv(o.orderNo||o.voucherNumber)}</strong>`, 'Client Order No', `<strong>${dv(o.customerPO||o.reference)}</strong>`)}
${fr('Order Date',  fmtD(o.orderDate||o.date),                'Delivery Due Date', `<strong>${fmtD(o.deliveryDate||o.dueDate)}</strong>`)}
${fr('Order Type',  dv(o.orderType),                          'Payment Terms',     dv(o.paymentTerms))}

<!-- CONTACT -->
<tr><td colspan="6" style="${secHdr}">Contact</td></tr>
<tr>
  <td colspan="3" style="${subHdr}">Billing</td>
  <td colspan="3" style="${subHdr}">Shipping</td>
</tr>
${fr('Name',        dv(o.contactPerson),               'Name',        dv(o.shipToContact||o.shipToName))}
${fr('Mobile No',   dv(o.mobile),                      'Mobile No',   dv(o.shipToMobile))}
${fr('Alternate No',dv(o.alternateMobile||o.alternateNo||cl.alternateMobile),'Alternate No',dv(o.shipToAlternate))}
${fr('Email id',    dv(o.email),                       'Email id',    dv(o.shipToEmail))}

<!-- ADDRESS -->
<tr><td colspan="6" style="${secHdr}">Address</td></tr>
<tr>
  <td colspan="3" style="${subHdr}">Billing</td>
  <td colspan="3" style="${subHdr}">Shipping</td>
</tr>
${fr('Address', dv(o.address||o.customerAddress),      'Address', dv(o.shipToAddress||o.deliveryAddr||o.destination))}
${fr('City',    dv(o.customerCity),                    'City',    dv(o.shipToCity))}
${fr('State',   dv(o.customerState||o.stateName),      'State',   dv(o.shipToState))}
${fr('Pincode', dv(o.customerPincode),                 'Pincode', dv(o.shipToPincode))}

<!-- ITEM DESCRIPTION -->
<tr><td colspan="6" style="${secHdr}">Item Description</td></tr>
<tr><td colspan="6" style="${ndWrap}">${itemTable}</td></tr>
<tr><td colspan="6" style="border:none;padding:4px 8px 8px;font-size:9.5pt;">
  <strong>Amount in Words:</strong>&nbsp;${numWords(grand)}
</td></tr>

<!-- ADD ON ITEM -->
<tr><td colspan="6" style="${secHdr}">Add On Item</td></tr>
<tr><td colspan="6" style="${ndWrap}">${addonTable}</td></tr>

<!-- BANK GUARANTEE -->
<tr><td colspan="6" style="${secHdr}">Bank Guarantee</td></tr>
${fr('Applicable', bg.applicable?'Yes':'No', 'Bank Name', dv(bg.bankName))}
${bg.applicable?`
${fr('Basis',      dv(bg.basis),                    'BG No',      dv(bg.bgNo))}
${fr('Percentage', bg.pct?bg.pct+'%':'',            'Expiry Date',fmtD(bg.expiry))}
${fr('BG Amount',  bg.pct&&grand?'₹ '+fmtN(grand*(parseFloat(bg.pct)||0)/100):'', 'Remarks', dv(bg.remarks))}
`:''}

<!-- SCOPE OF WORK -->
<tr><td colspan="6" style="${secHdr}">Scope of Work</td></tr>
<tr><td colspan="6" style="${ndWrap}">${scopeTable}</td></tr>

<!-- WARRANTY PERIOD -->
<tr><td colspan="6" style="${secHdr}">Warranty Period</td></tr>
${fr('Warranty Period', dv(wty.period),         'Certificate No', dv(wty.certNo))}
${fr('Type',            dv(wty.type),            'Issued By',      dv(wty.issuedBy))}
${fr('Start Date',      fmtD(wty.startDate),    'Terms',          dv(wty.terms))}
${fr('End Date',        fmtD(wty.endDate),       'Exclusions',     dv(wty.exclusions))}

<!-- ACTIVITIES -->
<tr><td colspan="6" style="${secHdr}">Activities</td></tr>
<tr><td colspan="6" style="${ndWrap}">${actTable}</td></tr>

<!-- ALL ATTACHMENTS -->
<tr><td colspan="6" style="${secHdr}">All Attachment</td></tr>
<tr><td colspan="6" style="${ndWrap}">
  ${attHTML||`<div style="padding:14px;text-align:center;color:#888;font-style:italic;">No attachments</div>`}
</td></tr>

${(o.termsConditions||o.customerNotes)?`
<!-- TERMS -->
<tr><td colspan="6" style="${secHdr}">Terms &amp; Conditions</td></tr>
<tr><td colspan="6" style="${oc}font-size:9pt;line-height:1.5;white-space:pre-wrap;">${esc(o.termsConditions||o.customerNotes)}</td></tr>
`:''}

<!-- SIGNATURE -->
<tr class="sig-row">
  <td colspan="2" style="border:none;text-align:center;padding:44px 10px 8px;">
    <div style="border-top:1px solid #000;margin:0 8px;padding-top:4px;">
      <strong>Prepared By</strong><br><span style="font-size:9pt;">${dv(o.salesPerson)||'&nbsp;'}</span>
    </div>
  </td>
  <td colspan="2" style="border:none;text-align:center;padding:44px 10px 8px;">
    <div style="border-top:1px solid #000;margin:0 8px;padding-top:4px;"><strong>Checked By</strong></div>
  </td>
  <td colspan="2" style="border:none;text-align:center;padding:44px 10px 8px;">
    <div style="border-top:1px solid #000;margin:0 8px;padding-top:4px;">
      <strong>Authorised Signatory</strong><br><span style="font-size:9pt;">For ${coName}</span>
    </div>
  </td>
</tr>
<tr><td colspan="6" style="border-top:${SECL};border-left:none;border-right:none;border-bottom:none;text-align:right;font-size:8pt;color:#666;background:#f5f5f5;padding:3px 8px;">
  Printed: ${today}
</td></tr>

</tbody>
</table>
</div>

${hasPdfs?`
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"><\/script>
<script>
pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
(async()=>{
  const containers=document.querySelectorAll('.pdf-render');
  for(const c of containers){
    const url=c.getAttribute('data-pdf-url');
    if(!url)continue;
    try{
      const pdf=await pdfjsLib.getDocument(url).promise;
      const pw=c.clientWidth||760;
      for(let p=1;p<=pdf.numPages;p++){
        const page=await pdf.getPage(p);
        const vp0=page.getViewport({scale:1});
        const vp=page.getViewport({scale:pw/vp0.width});
        const canvas=document.createElement('canvas');
        canvas.width=vp.width;canvas.height=vp.height;
        canvas.style.cssText='width:100%;display:block;margin-bottom:2px;';
        await page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;
        c.appendChild(canvas);
      }
    }catch(e){c.innerHTML='<div style="padding:10px;color:#c00;">Could not render PDF: '+e.message+'<\/div>';}
  }
  setTimeout(()=>window.print(),700);
})();
<\/script>`:''}

</body></html>`;

  const win = window.open('','_blank','width=920,height=980,scrollbars=yes');
  if (!win){alert('Please allow pop-ups to print.');return;}
  win.document.write(html);
  win.document.close();
  win.focus();
  if (!hasPdfs) setTimeout(()=>win.print(),900);
};
