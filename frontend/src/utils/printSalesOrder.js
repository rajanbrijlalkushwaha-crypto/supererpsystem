import { withPrintFont } from './printFont';
import { brandLine } from './printBranding';
import { withLiveContacts } from './liveContact';
/* printSalesOrder.js — restyled to the Delivery Challan format: Arial, a
 * fully bordered grid (.outer — every cell boxed in black) and field()-style
 * label:value rows, instead of the old Times New Roman / selective-line
 * layout. All calculations below are unchanged from before — only the HTML
 * template and CSS changed. */

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
const fmtN = n => Number(n||0).toFixed(2);

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
   Grid table builder — every cell boxed (Delivery Challan's .item-table
   convention), replacing the old selective-left-border nested table.
──────────────────────────────────────────────────────────────────── */
function buildGridTable(cols, widths, bodyRows, footRows) {
  let thead = `<thead><tr>`;
  cols.forEach((c, i) => {
    const w = widths[i] ? `width:${widths[i]};` : '';
    thead += `<th style="${w}">${c}</th>`;
  });
  thead += `</tr></thead>`;

  let tbody = `<tbody>`;
  bodyRows.forEach(row => {
    tbody += `<tr>`;
    row.forEach(cell => {
      const span = cell.colspan || 1;
      const colAttr = span > 1 ? ` colspan="${span}"` : '';
      tbody += `<td${colAttr} style="${cell.style||''}">${cell.text}</td>`;
    });
    tbody += `</tr>`;
  });
  tbody += `</tbody>`;

  let tfoot = '';
  if (footRows && footRows.length) {
    tfoot = `<tfoot>`;
    footRows.forEach(row => {
      tfoot += `<tr>`;
      row.forEach(cell => {
        const span = cell.colspan || 1;
        const colAttr = span > 1 ? ` colspan="${span}"` : '';
        tfoot += `<td${colAttr} style="${cell.style||''}">${cell.text}</td>`;
      });
      tfoot += `</tr>`;
    });
    tfoot += `</tfoot>`;
  }

  return `<table class="item-table">${thead}${tbody}${tfoot}</table>`;
}

/* ══════════════════════════════════════════════════════════════════
   MAIN EXPORT
══════════════════════════════════════════════════════════════════ */
export const printSalesOrder = async (order, company = {}, user = null) => {
  let o     = order || {};
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
  // contact name / mobile / email follow later edits on the client record
  o = withLiveContacts(o, cl);

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

  /* ── Process specification / drawing files (per-item or general uploads) ── */
  const specFilesRaw = Array.isArray(o.specFiles) ? o.specFiles : [];
  const processedSpecFiles = await Promise.all(specFilesRaw.map(async sf => {
    if (!sf.fileName || !o.orderId || !cid) return { ...sf, kind: 'missing' };
    const ext = (sf.fileName.split('.').pop()||'').toLowerCase();
    if (ext === 'pdf') {
      const url = `${origin}/api/sales-orders/${o.orderId}/download/${encodeURIComponent(sf.fileName)}?companyId=${cid}&inline=1`;
      return { ...sf, kind: 'pdf', pdfUrl: url };
    }
    const rd = await fetchRendered(o.orderId, sf.fileName, cid);
    return { ...sf, kind: rd?.kind||'unknown', ...(rd||{}) };
  }));

  const hasPdfs = processedAtts.some(a => a.kind === 'pdf') || processedSpecFiles.some(a => a.kind === 'pdf');

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

  /* ── Prepared By — the user who created the order, from the audit trail.
     Look up their live record for login ID + designation (not stored on
     older audit entries, and designation may have changed since creation). ── */
  const createdBy = Array.isArray(o.audit) ? o.audit.find(a => a.action === 'created')?.by : null;
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
  const preparedName = dv(createdBy?.name || createdBy?.username || o.salesPerson) || '&nbsp;';
  const preparedLoginId    = dv(preparedUser?.username || createdBy?.username);
  const preparedDesignation = dv(preparedUser?.designation);
  const logoTag = logoB64
    ? `<img src="${logoB64}" style="height:48px;max-width:110px;object-fit:contain;">`
    : '';
  /* GSTIN embeds the PAN (chars 3-12) — once it's shown, a separate blank
     "Pan No" row is redundant, so it's only printed when there's no GSTIN. */
  const custGstin = dv(o.customerGstin||o.partyGstin||cl.gstinNo);

  /* Field row — matches Delivery Challan's field() helper exactly. */
  const field = (lbl, v) => `
    <div class="field-row">
      <span class="field-lbl">${lbl}</span>
      <span class="field-colon">:</span>
      <span class="field-val">${dv(v) || '&nbsp;'}</span>
    </div>`;

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
    : [[{text:'No items',style:'text-align:center;color:#888;font-style:italic;',colspan:9}]];

  // Order: 1) each charge (base, no GST)  2) Total Taxable  3) GST  4) Total Order Value
  const footRowsRaw = [];
  const R  = 'text-align:right;';
  const RB = 'text-align:right;font-weight:bold;white-space:nowrap;';

  validChg.forEach(c => {
    const a = parseFloat(c.amount)||0;
    footRowsRaw.push([
      {text:[dv(c.chargeType),dv(c.description)].filter(Boolean).join(' — ')||'Additional Charge', style:R, colspan:8},
      {text:fmtN(a), style:R},
    ]);
  });

  const combinedTaxable = itemTaxable + chgNet;
  footRowsRaw.push([{text:'Total Taxable', style:RB, colspan:8}, {text:fmtN(combinedTaxable), style:RB}]);

  const rates = [...new Set(items.map(it=>parseFloat(it.gstPercent||it.gst)||0).filter(r=>r>0))];
  const singleRate = rates.length===1 ? rates[0] : null;
  if (sameState) {
    const cgst = storedCgst||(totalGstAmt/2);
    const sgst = storedSgst||(totalGstAmt/2);
    footRowsRaw.push([{text:`CGST${singleRate?` @ ${singleRate/2}%`:''}`, style:R, colspan:8}, {text:fmtN(cgst), style:R}]);
    footRowsRaw.push([{text:`SGST${singleRate?` @ ${singleRate/2}%`:''}`, style:R, colspan:8}, {text:fmtN(sgst), style:R}]);
  } else {
    const igst = storedIgst||totalGstAmt;
    footRowsRaw.push([{text:`IGST${singleRate?` @ ${singleRate}%`:''}`, style:R, colspan:8}, {text:fmtN(igst), style:R}]);
  }

  if (discount>0) footRowsRaw.push([{text:'Discount', style:R, colspan:8}, {text:`− ${fmtN(discount)}`, style:`${R}color:#c00;`}]);
  if (freight>0)  footRowsRaw.push([{text:'Freight Charges',style:R,colspan:8},{text:fmtN(freight),style:R}]);
  if (packing>0)  footRowsRaw.push([{text:'Packing Charges',style:R,colspan:8},{text:fmtN(packing),style:R}]);
  if (roundOff)   footRowsRaw.push([{text:'Round Off',style:R,colspan:8},{text:fmtN(roundOff),style:R}]);

  footRowsRaw.push([{text:'Total Order Value', style:RB, colspan:8}, {text:`₹ ${fmtN(grand)}`, style:RB}]);

  /* No line between the summary rows themselves — just a single rule
     above the block (separating it from the item body) and the table's
     own closing border below the last row. */
  footRowsRaw.forEach((row, i) => {
    const extra = (i>0 ? 'border-top:none;' : '') + (i<footRowsRaw.length-1 ? 'border-bottom:none;' : '');
    row.forEach(cell => { cell.style = (cell.style||'') + extra; });
  });

  const itemTable = buildGridTable(itemCols, itemWidths, itemBody, footRowsRaw);

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
    : [[{text:'No add-on items',style:'text-align:center;color:#888;font-style:italic;',colspan:10}]];
  const addonTable = buildGridTable(addonCols, addonWidths, addonBody, []);

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
    : [[{text:'—',style:'text-align:center;color:#888;',colspan:5}]];
  const scopeTable = buildGridTable(scopeCols, scopeWidths, scopeBody, []);

  /* ══ SPECIFICATIONS ══ */
  let spec = {};
  try { spec = JSON.parse(o.specSheet || '{}'); } catch {}
  let specHTML = '';
  if (spec.mode === 'freewrite' && spec.html && spec.html.trim()) {
    specHTML = `<div style="font-size:10pt;line-height:1.6;padding:4px 8px;">${spec.html}</div>`;
  } else if (spec.mode === 'structured' && Array.isArray(spec.groups) && spec.groups.some(g => g.itemName || (g.headers||[]).length)) {
    specHTML = spec.groups.map(group => {
      let g = `<div style="margin-bottom:14px;">`;
      if (group.itemName) g += `<div style="font-weight:bold;font-size:12pt;border-bottom:1px solid #000;padding-bottom:3px;margin-bottom:8px;">${esc(group.itemName)}</div>`;
      (group.headers||[]).forEach(hdr => {
        if (hdr.title) g += `<div style="font-weight:bold;font-size:10.5pt;text-decoration:underline;margin-bottom:4px;margin-top:4px;">${esc(hdr.title)}</div>`;
        (hdr.subHeaders||[]).forEach(sub => {
          if (sub.title) g += `<div style="font-size:10pt;font-weight:bold;margin-bottom:3px;margin-top:6px;">${esc(sub.title)}</div>`;
          const rows = (sub.rows||[]).filter(r => r.description||r.srNo||r.qty||r.remarks);
          if (rows.length) {
            g += `<table style="width:100%;border-collapse:collapse;font-size:10pt;margin-bottom:6px;">
              <thead><tr>
                <th style="border:1px solid #000;padding:3px 6px;width:36px;text-align:center;">Sr</th>
                <th style="border:1px solid #000;padding:3px 6px;">Description</th>
                <th style="border:1px solid #000;padding:3px 6px;width:56px;text-align:center;">Qty</th>
                <th style="border:1px solid #000;padding:3px 6px;">Remarks</th>
              </tr></thead><tbody>`;
            rows.forEach(r => {
              g += `<tr>
                <td style="border:1px solid #000;padding:3px 6px;text-align:center;">${esc(r.srNo)}</td>
                <td style="border:1px solid #000;padding:3px 6px;">${esc(r.description)}</td>
                <td style="border:1px solid #000;padding:3px 6px;text-align:center;">${esc(r.qty)}</td>
                <td style="border:1px solid #000;padding:3px 6px;">${esc(r.remarks)}</td>
              </tr>`;
            });
            g += `</tbody></table>`;
          }
        });
      });
      g += `</div>`;
      return g;
    }).join('');
  }
  /* per-item written specs (from the item-level "Write Specs" panel) */
  if (Array.isArray(spec.itemNotes) && spec.itemNotes.some(n => n && n.text && n.text.trim())) {
    const notesHTML = spec.itemNotes.filter(n => n && n.text && n.text.trim()).map(n => `
      <div style="margin-bottom:10px;">
        <div style="font-weight:bold;font-size:10.5pt;border-bottom:1px solid #000;padding-bottom:2px;margin-bottom:4px;">${esc(n.itemName||'Item')}</div>
        <div style="font-size:10pt;white-space:pre-wrap;line-height:1.5;">${esc(n.text)}</div>
      </div>`).join('');
    specHTML = notesHTML + specHTML;
  }

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
    : [[{text:'—',style:'text-align:center;color:#888;',colspan:7}]];
  const actTable = buildGridTable(actCols, actWidths, actBody, []);

  /* Renders one processed file (attachment or spec/drawing) as an inline print block.
     `headerBg` lets spec/drawing blocks use a different banner colour so they read as
     a distinct group from plain attachments. */
  const renderInlineFile = (f, i, label, headerBg = '#3A6186') => {
    if (f.kind === 'pdf') {
      /* PDF: each file after the first starts on its own fresh page. The
         first one doesn't force its own break — the section wrapper around
         the whole list already starts on a fresh page, so breaking again
         here would leave a blank page in between. */
      return `<div style="${i>0?'page-break-before:always;break-before:page;':''}">
        <div style="background:${headerBg};color:#fff;font-weight:bold;font-size:10.5pt;padding:4px 10px;margin-bottom:4px;">${i+1}. ${dv(label)}</div>
        <div class="pdf-render" data-pdf-url="${f.pdfUrl||''}" style="width:100%;"></div>
      </div>`;
    }
    let content;
    if (f.kind === 'excel') {
      content = `<div style="overflow-x:auto;padding:6px;font-size:10pt;">${f.html||''}</div>`;
    } else if (f.kind === 'word') {
      content = `<div style="padding:10px;font-size:10pt;line-height:1.6;">${f.html||''}</div>`;
    } else if (f.kind === 'text') {
      const safe=(f.text||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      content = `<pre style="padding:10px;font-family:monospace;font-size:10pt;white-space:pre-wrap;background:#f8f8f8;">${safe}</pre>`;
    } else if (f.kind === 'image') {
      content = `<div style="padding:8px;text-align:center;"><img src="${f.base64||''}" style="max-width:100%;max-height:900px;"></div>`;
    } else {
      const ext=(f.fileName||'').split('.').pop().toUpperCase();
      content = `<div style="padding:12px;text-align:center;color:#888;font-style:italic;">.${ext} file — cannot render inline</div>`;
    }
    return `<div class="att-block" style="border:1px solid #000;${i>0?'border-top:none;':''}">
      <div style="background:${headerBg};color:#fff;font-weight:bold;font-size:10.5pt;padding:4px 10px;">${i+1}. ${dv(label)}</div>
      ${content}
    </div>`;
  };

  /* ══ ATTACHMENTS ══ */
  let attHTML = '';
  if (!processedAtts.length) {
    attHTML = `<div style="border:1px solid #000;padding:12px;text-align:center;color:#888;font-style:italic;border-top:none;">No attachments</div>`;
  } else {
    processedAtts.forEach((att,i) => {
      attHTML += renderInlineFile(att, i, att.name||att.fileName||`Document ${i+1}`);
    });
  }

  /* ══ SPECIFICATION / DRAWING FILES ══ */
  let specFilesHTML = '';
  processedSpecFiles.forEach((sf,i) => {
    const tag   = sf.category === 'Drawing' ? '📐 Drawing' : '📎 Specification';
    const label = `${tag}${sf.itemName?` — ${sf.itemName}`:''}${sf.name?`: ${sf.name}`:''}`;
    specFilesHTML += renderInlineFile(sf, i, label, sf.category === 'Drawing' ? '#92400E' : '#2A4D6E');
  });

  /* ══ CSS — matches printDeliveryChallan.js's system exactly ══ */
  const css = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #000; background: #fff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .page { padding: 12px; }
    /* border-collapse:separate (not collapse) — collapsed shared borders can
       vanish between rows on some print engines (notably Firefox) once a
       table crosses a forced page-break; the separate model paints every
       cell's own border independently so rows never lose their divider. */
    .outer { border: 1px solid #000; width: 100%; border-collapse: separate; border-spacing: 0; }
    .outer td, .outer th { border: 1px solid #000; padding: 2px 6px; vertical-align: top; }
    .section-hdr { text-align: center; font-weight: bold; font-size: 11pt; background: #fff; padding: 3px; }
    .col-hdr { font-weight: bold; text-decoration: underline; font-size: 10pt; }
    .field-row { display: flex; gap: 2px; margin-bottom: 1px; font-size: 9.5pt; }
    .field-lbl { min-width: 130px; font-weight: normal; }
    .field-colon { margin: 0 4px; }
    .field-val { flex: 1; }
    .item-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 9pt; }
    .item-table th { border: 1px solid #000; padding: 4px 5px; font-weight: bold; text-align: center; background: #fff; }
    .item-table td { border: 1px solid #000; padding: 3px 5px; vertical-align: middle; }
    .embed-excel table { border-collapse: collapse; width: 100%; }
    .embed-excel td, .embed-excel th { border: 1px solid #ccc; padding: 2px 5px; font-size: 9pt; }
    .att-block { page-break-inside: auto; break-inside: auto; margin-bottom: 0; }
    .sig-row { page-break-before: avoid; break-before: avoid; page-break-inside: avoid; break-inside: avoid; }
    @media print {
      @page {
        margin: 8mm;
        size: A4 portrait;
        @bottom-center { content: "Page " counter(page) " of " counter(pages); font-size: 8pt; font-family: Arial, sans-serif; color: #555; }
      }
      .page { padding: 0; }
      canvas { max-width: 100%; display: block; }
      tr { page-break-inside: avoid; break-inside: avoid; }
    }
  `;

  /* ══ HTML ══ */
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>Sales Order — ${dv(o.orderNo||o.orderId)}</title>
<style>${css}</style>
</head><body><div class="page">

<table class="outer">

  <!-- Company Header -->
  <tr>
    <td colspan="2" style="padding:8px 10px; border-bottom:2px solid #000;">
      <div style="display:flex; align-items:center; gap:12px;">
        ${logoTag}
        <div>
          <div style="font-size:13pt; font-weight:bold;">${coName}</div>
          <div style="font-size:8.5pt; color:#333;">${coAddr}</div>
          <div style="font-size:8.5pt; color:#333;">${[company?.gstin?'GSTIN: '+dv(company.gstin):'',company?.phone?'Ph: '+dv(company.phone):'',company?.email?'Email: '+dv(company.email):''].filter(Boolean).join('&nbsp;&nbsp;|&nbsp;&nbsp;')}</div>
        </div>
      </div>
    </td>
  </tr>

  <!-- Title -->
  <tr><td colspan="2" style="text-align:center; font-size:13pt; font-weight:bold; padding:6px; border-bottom:2px solid #000;">Sales Order</td></tr>

  <!-- Client Details + Tax Identity -->
  <tr><td colspan="2" class="section-hdr" style="border-top:1px solid #000; border-bottom:1px solid #000;">Client Details &amp; Tax Identity</td></tr>
  <tr>
    <td><span class="col-hdr">Client Details</span></td>
    <td><span class="col-hdr">Tax Identity</span></td>
  </tr>
  <tr>
    <td>
      ${field('Client ID', o.customerCode||cl.clientId)}
      ${field('Client Name', o.customerName||o.party)}
      ${field('Business Type', cl.businessType||o.businessType)}
      ${field('Industries Type', cl.industryType||cl.industriesType||o.industryType)}
      ${field('Category', cl.category||o.category)}
      ${field('TDS Applicable', cl.tdsApplicable||o.tdsApplicable)}
    </td>
    <td>
      ${custGstin ? '' : field('Pan No', cl.panNo||o.panNo)}
      ${field('GSTIN No', custGstin)}
      ${field('CIN No', cl.cinNo||o.cinNo)}
      ${field('MSME if Applicable', cl.msme||cl.msmeNo||o.msme)}
      ${field('GST Type', cl.gstType||o.gstType)}
      ${field('GST Registered', cl.gstRegistered||o.gstRegistered)}
    </td>
  </tr>

  <!-- Order Description -->
  <tr><td colspan="2" class="section-hdr" style="border-top:1px solid #000; border-bottom:1px solid #000;">Order Description</td></tr>
  <tr>
    <td>
      ${field('ERP No', o.orderId)}
      ${field('Order No', o.orderNo||o.voucherNumber)}
      ${field('Order Date', fmtD(o.orderDate||o.date))}
      ${field('Order Type', o.orderType)}
    </td>
    <td>
      ${field('Client PO Date', fmtD(o.poDate))}
      ${field('Client Order No', o.customerPO||o.reference)}
      ${field('Delivery Due Date', fmtD(o.deliveryDate||o.dueDate))}
      ${field('Payment Terms', o.paymentTerms)}
    </td>
  </tr>

  <!-- Contact -->
  <tr><td colspan="2" class="section-hdr" style="border-top:1px solid #000; border-bottom:1px solid #000;">Contact</td></tr>
  <tr>
    <td><span class="col-hdr">Billing</span></td>
    <td><span class="col-hdr">Shipping</span></td>
  </tr>
  <tr>
    <td>
      ${field('Name', o.contactPerson)}
      ${field('Mobile No', o.mobile)}
      ${field('Alternate No', o.alternateMobile||o.alternateNo||cl.alternateMobile)}
      ${field('Email id', o.email)}
    </td>
    <td>
      ${field('Name', o.shipToContact||o.shipToName)}
      ${field('Mobile No', o.shipToMobile)}
      ${field('Alternate No', o.shipToAlternate)}
      ${field('Email id', o.shipToEmail)}
    </td>
  </tr>

  <!-- Address -->
  <tr><td colspan="2" class="section-hdr" style="border-top:1px solid #000; border-bottom:1px solid #000;">Address</td></tr>
  <tr>
    <td><span class="col-hdr">Billing</span></td>
    <td><span class="col-hdr">Shipping</span></td>
  </tr>
  <tr>
    <td>
      ${field('Address', o.address||o.customerAddress)}
      ${field('City', o.customerCity)}
      ${field('State', o.customerState||o.stateName)}
      ${field('Pincode', o.customerPincode)}
    </td>
    <td>
      ${field('Address', o.shipToAddress||o.deliveryAddr||o.destination)}
      ${field('City', o.shipToCity)}
      ${field('State', o.shipToState)}
      ${field('Pincode', o.shipToPincode)}
    </td>
  </tr>

  <!-- Item Description -->
  <tr><td colspan="2" class="section-hdr" style="border-top:1px solid #000; border-bottom:1px solid #000;">Item Description</td></tr>
  <tr style="page-break-inside:auto;break-inside:auto;"><td colspan="2" style="padding:0;">${itemTable}</td></tr>
  <tr style="page-break-inside:auto;break-inside:auto;"><td colspan="2" style="padding:6px 8px;">
    <strong>Amount in Words:</strong>&nbsp;${numWords(grand)}
  </td></tr>

  ${addons.length > 0 ? `
  <!-- Add On Item -->
  <tr><td colspan="2" class="section-hdr" style="border-top:1px solid #000; border-bottom:1px solid #000;">Add On Item</td></tr>
  <tr style="page-break-inside:auto;break-inside:auto;"><td colspan="2" style="padding:0;">${addonTable}</td></tr>
  ` : ''}

  ${bg.applicable ? `
  <!-- Bank Guarantee -->
  <tr><td colspan="2" class="section-hdr" style="border-top:1px solid #000; border-bottom:1px solid #000;">Bank Guarantee</td></tr>
  <tr>
    <td>
      ${field('Applicable', 'Yes')}
      ${field('Basis', bg.basis)}
      ${field('Percentage', bg.pct?bg.pct+'%':'')}
      ${field('BG Amount', bg.pct&&grand?'₹ '+fmtN(grand*(parseFloat(bg.pct)||0)/100):'')}
    </td>
    <td>
      ${field('Bank Name', bg.bankName)}
      ${field('BG No', bg.bgNo)}
      ${field('Expiry Date', fmtD(bg.expiry))}
      ${field('Remarks', bg.remarks)}
    </td>
  </tr>
  ` : ''}

  ${scope.length > 0 ? `
  <!-- Scope of Work -->
  <tr><td colspan="2" class="section-hdr" style="border-top:1px solid #000; border-bottom:1px solid #000;">Scope of Work</td></tr>
  <tr style="page-break-inside:auto;break-inside:auto;"><td colspan="2" style="padding:0;">${scopeTable}</td></tr>
  ` : ''}

  ${(wty.period||wty.type||wty.certNo||wty.issuedBy||wty.terms||wty.exclusions||wty.startDate||wty.endDate) ? `
  <!-- Warranty Period -->
  <tr><td colspan="2" class="section-hdr" style="border-top:1px solid #000; border-bottom:1px solid #000;">Warranty Period</td></tr>
  <tr>
    <td>
      ${field('Warranty Period', wty.period)}
      ${field('Type', wty.type)}
      ${field('Start Date', fmtD(wty.startDate))}
      ${field('End Date', fmtD(wty.endDate))}
    </td>
    <td>
      ${field('Certificate No', wty.certNo)}
      ${field('Issued By', wty.issuedBy)}
      ${field('Terms', wty.terms)}
      ${field('Exclusions', wty.exclusions)}
    </td>
  </tr>
  ` : ''}

  ${tasks.length > 0 ? `
  <!-- Activities -->
  <tr><td colspan="2" class="section-hdr" style="border-top:1px solid #000; border-bottom:1px solid #000;">Activities</td></tr>
  <tr style="page-break-inside:auto;break-inside:auto;"><td colspan="2" style="padding:0;">${actTable}</td></tr>
  ` : ''}

  ${specHTML ? `
  <!-- Specifications -->
  <tr><td colspan="2" class="section-hdr" style="border-top:1px solid #000; border-bottom:1px solid #000;">Specifications</td></tr>
  <tr style="page-break-inside:auto;break-inside:auto;"><td colspan="2" style="padding:6px 8px;">${specHTML}</td></tr>
  ` : ''}

  ${(o.termsConditions||o.customerNotes)?`
  <!-- Terms & Conditions -->
  <tr><td colspan="2" class="section-hdr" style="border-top:1px solid #000; border-bottom:1px solid #000;">Terms &amp; Conditions</td></tr>
  <tr style="page-break-inside:auto;break-inside:auto;"><td colspan="2" style="padding:6px 8px; font-size:9.5pt; line-height:1.5; white-space:pre-wrap;">${esc(o.termsConditions||o.customerNotes)}</td></tr>
  `:''}

  ${o.internalNotes?`
  <!-- Internal Notes -->
  <tr><td colspan="2" class="section-hdr" style="border-top:1px solid #000; border-bottom:1px solid #000;">Internal Notes</td></tr>
  <tr style="page-break-inside:auto;break-inside:auto;"><td colspan="2" style="padding:6px 8px; font-size:9.5pt; line-height:1.5; white-space:pre-wrap; background:#fffdf0;">${esc(o.internalNotes)}</td></tr>
  `:''}

  <!-- Signature — always on the last page of the main order content -->
  <tr class="sig-row">
    <td style="text-align:center; padding:10px 10px 8px; width:50%;">
      <div style="height:85px; margin:0 8px 4px; border:1px solid #ccc; display:flex; align-items:center; justify-content:center; color:#aaa; font-size:8.5pt;">Signature</div>
      <div style="border-top:1px solid #000; margin:0 8px; padding-top:4px;">
        <strong>Prepared By</strong><br>
        <span style="font-size:9.5pt;">${preparedName}</span>
        ${preparedLoginId ? `<br><span style="font-size:8pt;color:#555;">Login ID: ${preparedLoginId}</span>` : ''}
        ${preparedDesignation ? `<br><span style="font-size:8pt;color:#555;">${preparedDesignation}</span>` : ''}
      </div>
    </td>
    <td style="text-align:center; padding:10px 10px 8px; width:50%;">
      <div style="height:85px; margin:0 8px 4px; border:1px solid #ccc; display:flex; align-items:center; justify-content:center; color:#aaa; font-size:8.5pt;">Signature &amp; Stamp</div>
      <div style="border-top:1px solid #000; margin:0 8px; padding-top:4px;">
        <strong>Authorised Signatory</strong><br><span style="font-size:9.5pt;">For ${coName}</span>
      </div>
    </td>
  </tr>
  <tr><td colspan="2" style="border-top:1px solid #000; font-size:8pt; color:#555;">
    <div style="display:flex; justify-content:space-between;">
      <span>${brandLine(user)}</span>
      <span>Printed: ${today}</span>
    </div>
  </td></tr>

</table>
</div>

${processedAtts.length > 0 ? `
<!-- ALL ATTACHMENTS — outside main table; each PDF starts on its own fresh page -->
<div style="page-break-before:always;break-before:page;font-family:Arial,Helvetica,sans-serif;padding:0 12mm;">
  <div style="text-align:center;font-size:12pt;font-weight:bold;border-top:1px solid #000;border-bottom:1px solid #000;padding:6px;margin-bottom:0;">All Attachments</div>
  ${attHTML}
</div>
` : ''}

${processedSpecFiles.length > 0 ? `
<!-- SPECIFICATION & DRAWING FILES — the per-item write/upload panel's attached files -->
<div style="page-break-before:always;break-before:page;font-family:Arial,Helvetica,sans-serif;padding:0 12mm;">
  <div style="text-align:center;font-size:12pt;font-weight:bold;border-top:1px solid #000;border-bottom:1px solid #000;padding:6px;margin-bottom:0;">Specification &amp; Drawing Files</div>
  ${specFilesHTML}
</div>
` : ''}

${hasPdfs?`
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"><\/script>
<script>
pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
/* getDocument() occasionally hits a transient server hiccup (an unexpected
   empty response on an otherwise-valid file) — a couple of quick retries
   clear it up without the viewer ever seeing an error. */
const getDocWithRetry=async(url,tries)=>{
  for(let i=0;i<tries;i++){
    try{ return await pdfjsLib.getDocument(url).promise; }
    catch(e){ if(i===tries-1) throw e; await new Promise(r=>setTimeout(r,400*(i+1))); }
  }
};
(async()=>{
  const containers=document.querySelectorAll('.pdf-render');
  for(const c of containers){
    const url=c.getAttribute('data-pdf-url');
    if(!url)continue;
    try{
      const pdf=await getDocWithRetry(url,3);
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
  win.document.write(withPrintFont(html));
  win.document.close();
  win.focus();
  if (!hasPdfs) setTimeout(()=>win.print(),900);
};
