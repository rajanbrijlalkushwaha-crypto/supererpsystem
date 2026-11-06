/* Full details of a sales order / purchase order for the journal screens:
 * order file no. (the SO), client, client PO, vendor, material, taxable, GST and order value.
 * A PO is tied to its SO through linkedSalesOrderId; an SO lists the POs placed against it. */
const num = v => parseFloat(v) || 0;
const r2 = n => Math.round(n * 100) / 100;

/* taxable / GST / total — the saved totals, else worked out from the items */
function totalsOf(o) {
  const items = Array.isArray(o.items) ? o.items : [];
  let taxable = num(o.subTotal), gst = num(o.totalGST);
  if (!taxable) taxable = items.reduce((s, it) => {
    const base = num(it.qty || it.quantity) * num(it.rate);
    const disc = it.discountType === '%' ? base * num(it.discount) / 100 : num(it.discount);
    return s + base - disc;
  }, 0);
  if (!gst) gst = items.reduce((s, it) => {
    const base = num(it.qty || it.quantity) * num(it.rate);
    const disc = it.discountType === '%' ? base * num(it.discount) / 100 : num(it.discount);
    return s + (base - disc) * num(it.gstPercent ?? it.gst) / 100;
  }, 0);
  const value = num(o.grandTotal) || taxable + gst;
  return { taxable: r2(taxable), gst: r2(gst), value: r2(value) };
}
/* "Mobile Toilet Van 10 Seater × 14 NOS, …" */
function materialOf(o) {
  return (Array.isArray(o.items) ? o.items : []).map(it => {
    const name = it.itemName || it.description || it.materialName || it.itemCode || '';
    const qty = num(it.qty || it.quantity);
    return name ? `${name}${qty ? ` × ${qty % 1 ? qty : qty.toFixed(0)} ${it.unit || ''}`.trimEnd() : ''}` : '';
  }).filter(Boolean).join(', ');
}

/* lookups built once from the SO / PO lists */
export function orderIndex(salesOrders = [], purchaseOrders = []) {
  const soById = {}, poById = {}, posBySo = {};
  salesOrders.forEach(o => { soById[String(o.orderId)] = o; });
  purchaseOrders.forEach(p => {
    poById[String(p.orderId)] = p;
    const s = String(p.linkedSalesOrderId || '');
    if (s) (posBySo[s] = posBySo[s] || []).push(p);
  });
  return { soById, poById, posBySo };
}

/* one order's details — type 'SO' or 'PO' */
export function orderDetails(idx, type, orderId) {
  const id = String(orderId || '');
  if (type === 'SO') {
    const o = idx.soById[id];
    if (!o) return null;
    const pos = idx.posBySo[id] || [];
    return {
      type: 'SO', orderId: id, no: o.orderNo || `SO #${id}`, date: o.orderDate || o.date || '', status: o.status || '',
      fileNo: o.orderNo || '', client: o.customerName || o.clientName || '', clientGstin: o.customerGstin || '', clientPO: o.customerPO || '',
      vendor: [...new Set(pos.map(p => p.vendorName).filter(Boolean))].join(', '), vendorGstin: '',
      pos: pos.map(p => p.poNo || p.poNumber || `PO #${p.orderId}`).join(', '),
      material: materialOf(o), ...totalsOf(o),
    };
  }
  const p = idx.poById[id];
  if (!p) return null;
  const so = idx.soById[String(p.linkedSalesOrderId || '')];
  return {
    type: 'PO', orderId: id, no: p.poNo || p.poNumber || `PO #${id}`, date: p.poDate || p.date || '', status: p.status || '',
    fileNo: so?.orderNo || '', client: so?.customerName || so?.clientName || '', clientGstin: so?.customerGstin || '', clientPO: so?.customerPO || '',
    vendor: p.vendorName || '', vendorGstin: p.vendorGstin || '', pos: '',
    material: materialOf(p), ...totalsOf(p),
  };
}

export const money = n => (parseFloat(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtDate = d => { if (!d) return '—'; const s = String(d).slice(0, 10).split('-'); return s.length === 3 ? `${s[2]}-${s[1]}-${s[0]}` : d; };
