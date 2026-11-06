/* Beta — Purchase: Create Purchase Bill | Purchase Bill | Purchase Pending. The tab is kept in the URL (?tab=…).
 *   Create Purchase Bill — the vendor's invoice against a PO: qty per PO product (bill can come before or after the material),
 *                          rate, the PO's additional charges; the invoice PDF is attached (its no. / date are read from it)
 *   Purchase Bill        — every purchase bill; select → View PDF / Edit / Send for approval / Delete
 *   Purchase Pending     — per PO product: ordered · received (GRN) · billed · left to bill;
 *                          "bill pending" = material came, bill not yet · "material pending" = bill came, material not yet
 * Saved in the classic shape (/api/bills type=purchase): one item per PO line in PO order (qty may be 0) + charges (unit LOT). */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/permissions';
import { Svg } from '../../components/ui/Icon';
import { CSS as SALES_CSS, BIG, fyOf, FyFilter, fyCounts, useClearSel } from './BetaSales';
import { num, amt, money, fdate, dash } from './BetaSalesBill';
import { n, r2, today, SKIP_PO, poLines, poStatusOf, loadGrns, nextBillNo, sameState, ownerIdx, billCounts, billItemsFor, billPoIds, dropBillGrns } from './BetaPurchaseLib';
import { ListPicker, PX_CSS } from './BetaPurchaseParts';
import { printList, esc } from './BetaPurchasePrint';
import { fyLabel } from './BetaSales';

const TABS = [{ key: 'create', label: 'Create Purchase Bill' }, { key: 'list', label: 'Purchase Bill' }, { key: 'pending', label: 'Purchase Pending' }];
const STATUS = { draft: ['D', '#667085', 'Draft'], pending: ['P', '#F79009', 'Pending approval'], posted: ['A', '#16A34A', 'Approved'], approved: ['A', '#16A34A', 'Approved'], rejected: ['R', '#D92D20', 'Rejected'] };
const pdfUrl = (companyId, b, a) => `/api/bills/${b.billId}/download/${encodeURIComponent(a.fileName)}?companyId=${companyId}&type=purchase`;

export default function BetaPurchaseBill() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const urlTab = TABS.some(t => t.key === params.get('tab')) ? params.get('tab') : 'list';   // opens on the list
  const { selectedCompany } = useCompany() || {};
  const companyId = selectedCompany?.companyId;
  const { user } = useAuth() || {};

  const [pos, setPos] = useState(null);
  const [orders, setOrders] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [bills, setBills] = useState(null);
  const [grns, setGrns] = useState([]);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(null);
  const [createFor, setCreateFor] = useState(() => (params.get('po') ? { poId: params.get('po'), k: 1 } : null));
  const [note, setNote] = useState(null);
  const [slot, setSlot] = useState(null);
  const [pdf, setPdf] = useState(null);

  useEffect(() => {
    if (!companyId) return;
    const p = { params: { companyId } };
    axios.get('/api/purchase-orders', p).then(r => setPos(Array.isArray(r.data) ? r.data : [])).catch(() => setPos([]));
    axios.get('/api/sales-orders', p).then(r => setOrders(Array.isArray(r.data) ? r.data : [])).catch(() => setOrders([]));
    axios.get('/api/vendors', p).then(r => setVendors(Array.isArray(r.data) ? r.data : [])).catch(() => setVendors([]));
    axios.get('/api/bills', { params: { companyId, type: 'purchase' } }).then(r => setBills(Array.isArray(r.data) ? r.data.filter(b => b && b.type !== 'sales') : [])).catch(() => setBills([]));
    loadGrns(companyId).then(setGrns);
  }, [companyId, reload]);

  const soMap = useMemo(() => { const m = {}; orders.forEach(o => { m[String(o.orderId)] = o; }); return m; }, [orders]);
  const poMap = useMemo(() => { const m = {}; (pos || []).forEach(p => { m[String(p.orderId)] = p; }); return m; }, [pos]);
  const livePos = useMemo(() => (pos || []).filter(p => !SKIP_PO.includes(p.status)), [pos]);
  const tab = editing ? 'create' : urlTab;
  const go = k => { setEditing(null); navigate(`/beta/purchase-bill?tab=${k}`); };
  const loading = pos === null || bills === null;

  return (
    <div className="sb">
      <style>{SALES_CSS + PX_CSS + '.gl { line-height:1.35; } .gl + .gl { margin-top:3px; }'}</style>
      <div className="sb-tabs" role="tablist">
        {TABS.map(t => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`sb-tab${tab === t.key ? ' on' : ''}`} onClick={() => go(t.key)}>
            {t.label}{t.key === 'list' && bills && <span className="n">{bills.length}</span>}
          </button>
        ))}
        <div className="sb-slot" ref={setSlot} />
      </div>
      {note && <div className="sb-note" role="status">{note}<button type="button" onClick={() => setNote(null)} aria-label="Dismiss">×</button></div>}

      {tab === 'create' && (
        <div className="sb-body">
          {loading ? <div className="sb-empty">Loading purchase orders and bills…</div>
            : <BillForm key={editing ? `e-${editing.billId}` : createFor ? `p-${createFor.poId}-${createFor.k}` : 'new'}
              companyId={companyId} company={selectedCompany} pos={livePos} poMap={poMap} soMap={soMap} bills={bills} grns={grns} vendors={vendors}
              editBill={editing} presetPoId={createFor?.poId}
              onCancel={() => { setEditing(null); navigate('/beta/purchase-bill?tab=list'); }}
              onSaved={text => { setReload(x => x + 1); setNote(text); setCreateFor(null); if (editing) { setEditing(null); navigate('/beta/purchase-bill?tab=list'); } }} />}
        </div>
      )}
      {tab === 'list' && <BillList bills={bills} poMap={poMap} soMap={soMap} companyId={companyId} company={selectedCompany} user={user} slot={slot} setNote={setNote}
        onEdit={b => { setNote(null); setEditing(b); }} onPdf={setPdf} onChanged={() => setReload(x => x + 1)} />}
      {tab === 'pending' && <PendingList pos={livePos} soMap={soMap} bills={bills || []} grns={grns} loading={loading} slot={slot} company={selectedCompany} user={user}
        onBill={po => { setNote(null); setCreateFor({ poId: po.orderId, k: Date.now() }); navigate('/beta/purchase-bill?tab=create'); }}
        onGrn={po => navigate(`/beta/grn?tab=create&po=${po.orderId}`)} />}
      {pdf && (
        <div className="sf-pkb" onMouseDown={e => { if (e.target === e.currentTarget) { URL.revokeObjectURL(pdf.url); setPdf(null); } }}>
          <div className="sf-pk" style={{ maxWidth: 1000, height: '84vh', maxHeight: '84vh' }}>
            <div className="sf-pkh"><b>{pdf.name}</b><span className="grow" /><button type="button" onClick={() => { URL.revokeObjectURL(pdf.url); setPdf(null); }} aria-label="Close">×</button></div>
            <iframe title={pdf.name} src={pdf.url} style={{ flex: 1, border: 0 }} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Create / edit a purchase bill ──
 * Vendor first → every open PO of that vendor is listed (one vendor invoice can cover several POs).
 * "Material" asks how the goods stand: already received on a GRN · bill first (goods later) · goods came with this bill (a GRN is made with it). */
const MODES = {
  'after-grn': ['Material already received', 'GRN done before — bill the received qty'],
  'before-grn': ['Bill first — material later', 'No GRN yet — the GRN comes when the goods arrive'],
  'with-grn': ['Material came with this bill', 'A GRN is made with this bill'],
};
const vKey = p => (p.vendorId ? `id:${p.vendorId}` : `nm:${String(p.vendorName || '').trim().toLowerCase()}`);
function BillForm({ companyId, company, pos, poMap, soMap, bills, grns, vendors = [], editBill, presetPoId, onSaved, onCancel }) {
  const { user: me } = useAuth() || {};
  const firstPo = editBill ? poMap[String(editBill.orderId)] : presetPoId ? poMap[String(presetPoId)] : null;
  const [vendor, setVendor] = useState(() => (firstPo ? vKey(firstPo) : editBill ? `nm:${String(editBill.partyName || '').trim().toLowerCase()}` : ''));
  const [head, setHead] = useState(() => ({
    billNo: editBill?.billNo || nextBillNo(bills, today()), vendorBillNo: editBill?.vendorBillNo || '',
    billDate: editBill?.billDate || today(), remarks: editBill?.remarks || '',
    mode: editBill?.materialMode || '', grnType: editBill?.grnDeliveryType || 'our-yard', grnVendorId: editBill?.grnToVendorId ? String(editBill.grnToVendorId) : '',
  }));
  const [qty, setQty] = useState({});     // `${poId}:${idx}` → qty
  const [rate, setRate] = useState({});
  const [chg, setChg] = useState({});     // `${poId}:c${i}` → amount
  const [showAll, setShowAll] = useState(false);
  const [grnSel, setGrnSel] = useState(() => new Set((editBill?.grnRefs || []).map(r => String(r.id))));   // GRNs this bill is against ("material already received")
  const [file, setFile] = useState(null);
  const [reading, setReading] = useState(false);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [tried, setTried] = useState(false);
  const fileRef = useRef(null);

  const vendorPos = useMemo(() => pos.filter(p => vKey(p) === vendor).sort((a, b) => String(a.poDate || '').localeCompare(String(b.poDate || ''))), [pos, vendor]);
  const inBill = useMemo(() => new Set(editBill ? billPoIds(editBill) : []), [editBill]);
  /* each PO of the vendor: its lines (received / billed — without this bill) and its additional charges */
  const groups = useMemo(() => vendorPos.map(po => {
    const lines = poStatusOf(po, bills, grns, { skipBill: editBill?.billId });
    const others = bills.filter(b => billCounts(b) && b.billId !== editBill?.billId);
    const charges = [...(po.charges || []).filter(c => c && n(c.amount)).map(c => ({ name: c.chargeType || c.description || 'Charges', amount: n(c.amount), gstPct: n(c.gstPercent ?? c.gst) })),
      ...(n(po.packingCharges) ? [{ name: 'Packing & Forwarding', amount: n(po.packingCharges), gstPct: 0 }] : []),
      ...(n(po.freightCharges) ? [{ name: 'Freight Charges', amount: n(po.freightCharges), gstPct: 0 }] : [])]
      .map((c, i) => ({ ...c, i, key: `${po.orderId}:c${i}`, billed: others.reduce((s, b) => s + billItemsFor(b, po.orderId).filter(({ li }) => li.unit === 'LOT' && li.itemIdx == null && String(li.description).trim().toLowerCase() === c.name.trim().toLowerCase()).reduce((a, { li }) => a + n(li.taxable ?? li.rate), 0), 0) }));
    return { po, so: soMap[String(po.linkedSalesOrderId)], lines, charges, open: lines.some(l => l.toBill > 0) || charges.some(c => c.amount - c.billed > 0.5) };
  }), [vendorPos, bills, grns, editBill, soMap]);
  const shown = groups.filter(g => showAll || g.open || inBill.has(String(g.po.orderId)) || String(g.po.orderId) === String(presetPoId));
  const mode = head.mode || (groups.some(g => g.lines.some(l => l.billPending > 0)) ? 'after-grn' : 'before-grn');
  const billedOn = useMemo(() => {
    const m = {};
    bills.filter(b => billCounts(b) && b.billId !== editBill?.billId).forEach(b => (b.grnRefs || []).forEach(r => { m[String(r.id)] = b.vendorBillNo || b.billNo; }));
    return m;
  }, [bills, editBill]);
  const vendorGrns = useMemo(() => {
    const ids = new Set(vendorPos.map(p => String(p.orderId)));
    return grns.filter(g => g.status !== 'deleted' && ids.has(String(g.poId)) && g.source !== 'bill')
      .sort((a, b) => String(a.receiptDate || '').localeCompare(String(b.receiptDate || '')));
  }, [grns, vendorPos]);
  /* ticking GRNs fills the bill qty with what they received (never more than is left to bill) */
  const openGrns = () => new Set(vendorGrns.filter(g => !billedOn[g._id] && (!presetPoId || String(g.poId) === String(presetPoId))).map(g => g._id));
  const pickGrns = sel => {
    setGrnSel(sel);
    const q = {};
    vendorGrns.filter(g => sel.has(g._id)).forEach(g => {
      const po = poMap[String(g.poId)]; if (!po) return;
      const lines = poLines(po);
      (g.items || []).forEach((li, j) => { const i = ownerIdx(li, j, lines); if (i == null) return; const k = `${g.poId}:${i}`; q[k] = n(q[k]) + n(li.receivedQty ?? li.qty); });
    });
    const out = {};
    groups.forEach(g => g.lines.forEach(l => { const k = `${g.po.orderId}:${l.idx}`; if (q[k]) out[k] = String(Math.min(q[k], l.toBill, l.billPending)); }));
    setQty(out);
  };

  /* qty to start with, by the material answer */
  const startQty = (l, m) => (m === 'after-grn' ? l.billPending : m === 'with-grn' ? Math.min(l.toBill, l.toReceive) : l.toBill);
  const fill = m => {
    const q = {}, c = {};
    shown.forEach(g => {
      if (presetPoId && String(g.po.orderId) !== String(presetPoId)) return;   // opened for one PO: only that one is filled
      g.lines.forEach(l => { const v = startQty(l, m); if (v > 0) q[`${g.po.orderId}:${l.idx}`] = String(v); });
      g.charges.forEach(ch => { const left = r2(ch.amount - ch.billed); if (left > 0) c[ch.key] = String(left); });
    });
    setQty(q); setChg(c);
  };
  const initFor = useRef(null);
  useEffect(() => {
    if (!vendor || !groups.length || initFor.current === vendor) return;
    initFor.current = vendor;
    const r = {};
    groups.forEach(g => g.lines.forEach(l => { r[`${g.po.orderId}:${l.idx}`] = String(l.rate); }));
    if (editBill) {
      const q = {}, c = {};
      groups.forEach(g => {
        const lines = poLines(g.po);
        billItemsFor(editBill, g.po.orderId).forEach(({ li, j }) => {
          if (li.unit === 'LOT' && li.itemIdx == null) { const ch = g.charges.find(x => x.name.trim().toLowerCase() === String(li.description).trim().toLowerCase()); if (ch) c[ch.key] = String(n(li.taxable ?? li.rate)); return; }
          const i = ownerIdx(li, j, lines); if (i == null) return;
          const k = `${g.po.orderId}:${i}`;
          if (n(li.qty)) q[k] = String(n(q[k]) + n(li.qty));
          if (n(li.rate)) r[k] = String(n(li.rate));
        });
      });
      setQty(q); setChg(c);
    } else if (mode === 'after-grn') { pickGrns(openGrns()); setChg(Object.fromEntries(groups.flatMap(g => g.charges.filter(ch => ch.amount - ch.billed > 0.5).map(ch => [ch.key, String(r2(ch.amount - ch.billed))])))); } else fill(mode);
    setRate(r);
  }, [vendor, groups, editBill]);   // eslint-disable-line react-hooks/exhaustive-deps

  const intra = sameState(company?.state, vendorPos[0]?.vendorState || vendorPos[0]?.shipFromState);
  const calc = useMemo(() => {
    const lines = [], ch = [];
    shown.forEach(g => {
      g.lines.forEach(l => {
        const k = `${g.po.orderId}:${l.idx}`, q = n(qty[k]), rt = n(rate[k] ?? l.rate);
        const gross = q * rt, disc = gross * Math.min(100, l.discPct) / 100 + (l.qty ? l.discFlat * q / l.qty : 0);
        const taxable = r2(gross - disc), gstAmt = r2(taxable * l.gstPct / 100);
        lines.push({ g, l, k, q, rt, disc: r2(disc), taxable, gstAmt });
      });
      g.charges.forEach(c => { const a = n(chg[c.key]); ch.push({ g, c, a, gstAmt: r2(a * c.gstPct / 100) }); });
    });
    const sub = r2(lines.reduce((s, x) => s + x.taxable, 0) + ch.reduce((s, x) => s + x.a, 0));
    const gst = r2(lines.reduce((s, x) => s + x.gstAmt, 0) + ch.reduce((s, x) => s + x.gstAmt, 0));
    return { lines, ch, sub, gst, total: r2(sub + gst) };
  }, [shown, qty, rate, chg]);
  const errs = {};
  calc.lines.forEach(x => {
    if (!x.q) return;
    if (x.q > x.l.toBill + 1e-9) errs[x.k] = `Only ${num(x.l.toBill)} left to bill on the PO`;
    else if (mode === 'after-grn' && x.q > x.l.billPending + 1e-9) errs[x.k] = `Only ${num(x.l.billPending)} received and not billed — choose “Bill first” for the rest`;
    else if (mode === 'with-grn' && x.q > x.l.toReceive + 1e-9) errs[x.k] = `Only ${num(x.l.toReceive)} left to receive on the PO`;
  });
  const grnVendor = vendors.find(v => String(v.vendorId) === head.grnVendorId) || null;
  const usedPos = [...new Set([...calc.lines.filter(x => x.q > 0).map(x => String(x.g.po.orderId)), ...calc.ch.filter(x => x.a > 0).map(x => String(x.g.po.orderId))])];

  const pickFile = async f => {
    if (!f) return;
    setFile(f);
    if (!/\.pdf$/i.test(f.name)) return;
    setReading(true);
    try {
      const fd = new FormData(); fd.append('file', f);
      const { data: d } = await axios.post('/api/bills/parse-pdf', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setHead(h => ({ ...h, vendorBillNo: h.vendorBillNo || d.billNo || '', billDate: d.billDate || h.billDate }));
      setMsg(d.billNo || d.billDate ? { k: 'ok', t: `Read from the PDF: invoice ${d.billNo || '—'}${d.billDate ? `, dated ${fdate(d.billDate)}` : ''}. Check before saving.` } : null);
    } catch { /* the PDF is still attached */ }
    finally { setReading(false); }
  };

  /* GRNs for "material came with this bill": one per PO, made afresh on every save */
  const syncGrns = async (billId, billNo) => {
    await dropBillGrns(companyId, billId, { hard: true });
    if (mode !== 'with-grn') return 0;
    let made = 0;
    for (const pid of usedPos) {
      const g = shown.find(x => String(x.po.orderId) === pid); if (!g) continue;
      const items = calc.lines.filter(x => String(x.g.po.orderId) === pid && x.q > 0)
        .map(x => ({ itemIdx: x.l.idx, itemCode: x.l.code, itemName: x.l.name, hsnCode: x.l.hsn, unit: x.l.unit, orderedQty: x.l.qty, rate: x.rt, receivedQty: x.q, remarks: '' }));
      if (!items.length) continue;
      await axios.post('/api/grn', {
        companyId, poId: pid, poNo: g.po.poNo || '', vendorId: g.po.vendorId || '', vendorName: g.po.vendorName || '',
        receiptDate: head.billDate, vendorDcNo: head.vendorBillNo.trim(), soId: g.po.linkedSalesOrderId || '', orderNo: g.so?.orderNo || '',
        clientId: g.so?.clientId || g.so?.customerCode || '', clientName: g.so?.customerName || '',
        deliveryType: head.grnType, deliveryLocation: head.grnType === 'direct-client' ? [g.so?.shipToName, g.so?.shipToCity || g.so?.customerCity].filter(Boolean).join(', ') : '',
        ...(head.grnType === 'to-vendor' && grnVendor ? { toVendorId: grnVendor.vendorId, toVendorName: grnVendor.vendorName } : {}),
        source: 'bill', billId, billNo, remarks: `Received with vendor invoice ${head.vendorBillNo.trim()}`, items,
        createdBy: { id: me?.id, name: me?.name || me?.username || '', username: me?.username || '' },
      });
      made += 1;
    }
    return made;
  };

  const save = async status => {
    setTried(true); setMsg(null);
    if (!vendor || !vendorPos.length) return setMsg({ k: 'err', t: 'Pick the vendor first.' });
    if (!head.vendorBillNo.trim()) return setMsg({ k: 'err', t: 'Enter the vendor invoice no.' });
    if (!head.billDate) return setMsg({ k: 'err', t: 'Enter the invoice date.' });
    if (mode === 'with-grn' && head.grnType === 'to-vendor' && !grnVendor) return setMsg({ k: 'err', t: 'Choose the vendor whose location received the material.' });
    if (Object.keys(errs).length) return setMsg({ k: 'err', t: 'Some quantities are more than allowed — see the red boxes.' });
    if (!usedPos.length) return setMsg({ k: 'err', t: 'Enter the bill qty for at least one product (or a charge).' });
    const dup = bills.find(b => b.billId !== editBill?.billId && billCounts(b) && String(b.vendorBillNo || '').trim().toLowerCase() === head.vendorBillNo.trim().toLowerCase()
      && billPoIds(b).some(id => vendorPos.some(p => String(p.orderId) === id)));
    if (dup) return setMsg({ k: 'err', t: `Vendor invoice ${head.vendorBillNo} is already booked (bill ${dup.billNo}).` });
    setBusy(true);
    try {
      const sp = x => (intra ? r2(x / 2) : 0), ip = x => (intra ? 0 : x);
      const main = poMap[usedPos[0]], mainSo = soMap[String(main.linkedSalesOrderId)];
      const line = x => ({ poId: String(x.g.po.orderId), poNo: x.g.po.poNo || '', itemIdx: x.l.idx, itemCode: x.l.code, description: x.l.name, hsnCode: x.l.hsn, unit: x.l.unit, qty: x.q, rate: x.rt, disc: x.disc,
        discStr: x.l.discPct ? `${x.l.discPct}%` : '—', taxable: x.taxable, gstPct: x.l.gstPct, gstAmt: x.gstAmt, cgst: sp(x.gstAmt), sgst: sp(x.gstAmt), igst: ip(x.gstAmt), total: r2(x.taxable + x.gstAmt) });
      // the main PO keeps one line per PO line in PO order (the classic screens count billed qty by position); other POs add their billed lines
      const items = (main.items || []).map((it, idx) => {
        const x = calc.lines.find(y => String(y.g.po.orderId) === usedPos[0] && y.l.idx === idx);
        return x ? line(x) : { poId: usedPos[0], poNo: main.poNo || '', itemIdx: idx, description: (it && (it.itemName || it.description)) || '—', hsnCode: it?.hsnCode || '', unit: it?.unit || 'NOS', qty: 0, rate: n(it?.rate), disc: 0, discStr: '—', taxable: 0, gstPct: n(it?.gstPercent ?? it?.gst), gstAmt: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
      });
      calc.lines.filter(x => x.q > 0 && String(x.g.po.orderId) !== usedPos[0]).forEach(x => items.push(line(x)));
      calc.ch.filter(x => x.a > 0).forEach(x => items.push({ poId: String(x.g.po.orderId), poNo: x.g.po.poNo || '', description: x.c.name, hsnCode: '', unit: 'LOT', qty: 1, rate: x.a, disc: 0, discStr: '—', taxable: x.a, gstPct: x.c.gstPct, gstAmt: x.gstAmt, cgst: sp(x.gstAmt), sgst: sp(x.gstAmt), igst: ip(x.gstAmt), total: r2(x.a + x.gstAmt) }));
      const gstT = calc.gst;
      const payload = {
        companyId, type: 'purchase', billNo: head.billNo.trim(), vendorBillNo: head.vendorBillNo.trim(), billDate: head.billDate, remarks: head.remarks.trim(),
        materialMode: mode, grnDeliveryType: mode === 'with-grn' ? head.grnType : '',
        grnToVendorId: mode === 'with-grn' && head.grnType === 'to-vendor' && grnVendor ? grnVendor.vendorId : '',
        grnRefs: mode === 'after-grn' ? vendorGrns.filter(g => grnSel.has(g._id)).map(g => ({ id: g._id, grnNo: g.grnNo || '', poId: String(g.poId) })) : [],
        orderId: usedPos[0], orderNo: main.poNo || main.poNumber || `PO-${main.orderId}`,
        poRefs: usedPos.map(id => ({ orderId: id, poNo: poMap[id]?.poNo || '' })),
        vendorId: main.vendorId || '', vendorName: main.vendorName || '', partyName: main.vendorName || '—', partyGstin: main.vendorGstin || '',
        partyState: main.vendorState || main.shipFromState || '', companyState: company?.state || '', gstType: intra ? 'intrastate' : 'interstate',
        linkedSalesOrderId: main.linkedSalesOrderId || '', soNo: mainSo?.orderNo || '',
        items, subTotal: calc.sub, totalCGST: sp(gstT), totalSGST: sp(gstT), totalIGST: ip(gstT), totalGST: gstT, grandTotal: calc.total,
        ...(status ? { status } : {}),
        ...(editBill ? {} : { createdBy: { id: me?.id, name: me?.name || me?.username || '', username: me?.username || '' } }),
      };
      const r = editBill
        ? await axios.put(`/api/bills/${editBill.billId}`, payload, { params: { companyId, type: 'purchase' } })
        : await axios.post('/api/bills', payload, { params: { companyId } });
      const id = editBill?.billId || r.data?.billId;
      let extra = '';
      if (file && id) {
        try { const fd = new FormData(); fd.append('file', file); await axios.post(`/api/bills/${id}/upload`, fd, { params: { companyId, type: 'purchase' } }); }
        catch { extra += ' The invoice file could not be attached — attach it again from Edit.'; }
      }
      if (id && (mode === 'with-grn' || editBill)) {
        try { const made = await syncGrns(id, payload.billNo); if (made) extra += ` ${made} GRN${made === 1 ? '' : 's'} made for the material that came with it.`; }
        catch { extra += ' The GRN could not be made — save the bill again.'; }
      }
      onSaved?.(`${editBill ? 'Updated' : 'Saved'} purchase bill for vendor invoice ${payload.vendorBillNo} (${payload.partyName}) on ${usedPos.length} PO${usedPos.length === 1 ? '' : 's'} — ₹ ${amt(calc.total)}${status === 'pending' ? ', sent for approval' : status === 'draft' ? ', as draft' : ''}.${extra}`);
    } catch (e) { setMsg({ k: 'err', t: e.response?.data?.error || 'Could not save the bill.' }); }
    finally { setBusy(false); }
  };

  const set = k => e => { const v = e.target.value; setHead(h => ({ ...h, [k]: v, ...(k === 'billDate' && !editBill ? { billNo: nextBillNo(bills, v) } : {}) })); };
  const setMode = m => { setHead(h => ({ ...h, mode: m })); if (!editBill) { if (m === 'after-grn') pickGrns(grnSel.size ? grnSel : openGrns()); else fill(m); } };
  /* vendors that have POs: how many are open, what is left to bill */
  const vendorRows = useMemo(() => {
    const m = new Map();
    pos.forEach(p => {
      const k = vKey(p), s = poStatusOf(p, bills, grns);
      const r = m.get(k) || { key: k, name: p.vendorName || '—', gstin: p.vendorGstin || '', city: p.vendorCity || '', pos: 0, open: 0, left: 0, bp: 0 };
      r.pos += 1; const left = s.reduce((a, l) => a + l.toBill, 0); if (left > 0) r.open += 1; r.left += left; r.bp += s.filter(l => l.billPending > 0).length;
      m.set(k, r);
    });
    return [...m.values()].sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
  }, [pos, bills, grns]);
  const vRow = vendorRows.find(r => r.key === vendor);
  const att = (editBill?.attachments || []).filter(Boolean);
  const radio = (k, sub) => (
    <label className={mode === k ? 'on' : ''}><input type="radio" checked={mode === k} onChange={() => setMode(k)} /><span><b>{MODES[k][0]}</b><small>{sub || MODES[k][1]}</small></span></label>
  );

  return (
    <div className="sf">
      <div className="sf-hero">
        <span className="ic"><Svg name="file" size={15} /></span>
        <h1>{editBill ? `Edit Purchase Bill — vendor invoice ${editBill.vendorBillNo || ''}` : 'Create Purchase Bill'}</h1>
        <span className="grow" />
        {usedPos.length > 0 && <span className="sf-chip"><small>POs</small><b>{usedPos.length}</b></span>}
        <span className="sf-chip"><small>Bill Amount</small><b>₹ {amt(calc.total)}</b></span>
      </div>

      <div className="sf-2" style={{ marginTop: 10 }}>
        <div className="sf-card">
          <div className="sf-ch"><span className="ico"><Svg name="users" size={13} /></span><b>Vendor</b></div>
          <table className="sf-kv"><tbody>
            <tr><th>Vendor <i>*</i></th><td>
              <div className="sf-srch">
                <input readOnly value={vRow ? vRow.name : ''} placeholder="Click to pick the vendor" onClick={() => !editBill && setPicker(true)} className={tried && !vRow ? 'bad' : ''} disabled={!!editBill} />
                <button type="button" className="sf-sbtn" onClick={() => setPicker(true)} disabled={!!editBill} aria-label="Pick vendor"><Svg name="search" size={14} /></button>
              </div>
            </td></tr>
            <tr><th>GSTIN</th><td>{vRow?.gstin || '—'}</td></tr>
            <tr><th>Purchase Orders</th><td>{vRow ? <>{vRow.pos} PO{vRow.pos === 1 ? '' : 's'} · <b>{vRow.open}</b> with qty left to bill</> : '—'}</td></tr>
            <tr><th>GST</th><td>{vRow ? <span className={`sf-tag ${intra ? 'intra' : 'inter'}`}>{intra ? 'CGST + SGST (same state)' : 'IGST (other state)'}</span> : '—'}</td></tr>
          </tbody></table>
        </div>
        <div className="sf-card">
          <div className="sf-ch"><span className="ico"><Svg name="file" size={13} /></span><b>Vendor Invoice</b></div>
          <table className="sf-kv"><tbody>
            <tr><th>Invoice PDF</th><td>
              <div className="px-file">
                <span className={`fn${file || att.length ? '' : ' mut'}`}>{reading ? 'Reading the PDF…' : file ? file.name : att.length ? `${att.length} file(s) attached — ${att.map(a => a.name || a.fileName).join(', ')}` : 'Attach the vendor invoice (PDF fills the no. and date)'}</span>
                <button type="button" className="px-up" onClick={() => fileRef.current?.click()} disabled={busy}>{file ? 'Change' : 'Attach'}</button>
                <input ref={fileRef} type="file" hidden accept=".pdf,.jpg,.jpeg,.png" onChange={e => { pickFile(e.target.files?.[0]); e.target.value = ''; }} />
              </div>
            </td></tr>
            <tr><th>Vendor Invoice No. <i>*</i></th><td><input value={head.vendorBillNo} onChange={set('vendorBillNo')} className={tried && !head.vendorBillNo.trim() ? 'bad' : ''} placeholder="As printed on the vendor's invoice" /></td></tr>
            <tr><th>Invoice Date <i>*</i></th><td><input type="date" value={head.billDate} onChange={set('billDate')} className={tried && !head.billDate ? 'bad' : ''} /></td></tr>
            <tr><th>Remarks</th><td><input value={head.remarks} onChange={set('remarks')} placeholder="Optional" /></td></tr>
          </tbody></table>
        </div>
      </div>

      <div className="sf-card">
        <div className="sf-ch"><span className="ico"><Svg name="box" size={13} /></span><b>Material</b><small>has the material of this bill come?</small></div>
        <div style={{ padding: 10 }}>
          <div className="px-rad" role="radiogroup" aria-label="Material">
            {radio('after-grn')}{radio('before-grn')}{radio('with-grn')}
          </div>
          {mode === 'with-grn' && (
            <div className="px-rad" role="radiogroup" aria-label="Received at" style={{ marginTop: 8, alignItems: 'center' }}>
              {[['our-yard', 'At our factory / store'], ['direct-client', 'Direct at the client'], ['to-vendor', 'At a vendor’s location']].map(([k, l]) => (
                <label key={k} className={head.grnType === k ? 'on' : ''} style={{ minWidth: 160, flex: '0 0 auto' }}><input type="radio" checked={head.grnType === k} onChange={() => setHead(h => ({ ...h, grnType: k }))} /><span><b>{l}</b></span></label>
              ))}
              {head.grnType === 'to-vendor' && (
                <select value={head.grnVendorId} onChange={e => setHead(h => ({ ...h, grnVendorId: e.target.value }))} className={tried && !grnVendor ? 'bad' : ''} style={{ width: 320 }} aria-label="Vendor location">
                  <option value="">Choose the vendor…</option>
                  {vendors.filter(v => vKey(v) !== vendor).sort((a, b) => String(a.vendorName).localeCompare(String(b.vendorName))).map(v => <option key={v.vendorId} value={String(v.vendorId)}>{v.vendorName}{v.city ? ` · ${v.city}` : ''}</option>)}
                </select>
              )}
            </div>
          )}
          {mode === 'after-grn' && vRow && (
            <div style={{ marginTop: 10, border: '1px solid #DCE6E8' }}>
              {!vendorGrns.length ? <div className="sf-empty">No GRN on the POs of this vendor yet — choose “Bill first — material later”.</div> : (
                <table className="sf-t">
                  <thead><tr><th style={{ width: 34 }} /><th>GRN No.</th><th>Date</th><th>PO No.</th><th>Products received</th><th>Received at</th><th>Bill</th></tr></thead>
                  <tbody>{vendorGrns.map(g => {
                    const on = grnSel.has(g._id), done = billedOn[g._id];
                    return (
                      <tr key={g._id} className={done && !on ? 'off' : ''} style={{ cursor: 'pointer' }} onClick={() => { const nx = new Set(grnSel); if (on) nx.delete(g._id); else nx.add(g._id); pickGrns(nx); }}>
                        <td className="c"><input type="checkbox" checked={on} readOnly style={{ width: 15, height: 15 }} aria-label={`Bill against ${g.grnNo}`} /></td>
                        <td className="sf-no">{g.grnNo || g._id}</td><td>{fdate(g.receiptDate)}</td><td>{g.poNo || poMap[String(g.poId)]?.poNo || '—'}</td>
                        <td>{(g.items || []).filter(i => n(i.receivedQty ?? i.qty) > 0).map(i => `${i.itemName} × ${num(i.receivedQty ?? i.qty)}`).join('; ')}</td>
                        <td>{g.deliveryType === 'direct-client' ? `Direct to client${g.clientName ? `: ${g.clientName}` : ''}` : g.deliveryType === 'to-vendor' ? `At vendor${g.toVendorName ? `: ${g.toVendorName}` : ''}` : (g.deliveryLocation || g.receiveAt || 'Our factory / store')}</td>
                        <td>{done ? <span className="px-tag ok">Billed on {done}</span> : <span className="px-tag bp">Not billed</span>}</td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              )}
              <div className="px-hint" style={{ padding: '6px 10px' }}>Tick the GRN(s) this invoice is for — the bill qty fills from them.</div>
            </div>
          )}
        </div>
      </div>

      <div className="sf-card">
        <div className="sf-ch"><span className="ico"><Svg name="cart" size={13} /></span><b>Purchase orders of this vendor</b><small>one invoice can cover several POs</small><span className="grow" />
          {vRow && <label className="sf-lnk" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} style={{ width: 13, height: 13 }} />Show fully billed POs</label>}</div>
        {!vRow ? <div className="sf-empty">Pick the vendor to see its purchase orders.</div> : !shown.length ? <div className="sf-empty">Every PO of this vendor is fully billed. Tick “Show fully billed POs” to see them.</div> : (
          <table className="sf-t sf-pt">
            <colgroup><col style={{ width: 34 }} /><col /><col style={{ width: 66 }} /><col style={{ width: 72 }} /><col style={{ width: 64 }} /><col style={{ width: 70 }} /><col style={{ width: 100 }} /><col style={{ width: 100 }} /><col style={{ width: 104 }} /><col style={{ width: 52 }} /><col style={{ width: 94 }} /><col style={{ width: 108 }} /></colgroup>
            <thead>
              <tr className="grp"><th colSpan={2} /><th colSpan={4} className="c">On the PO</th><th colSpan={6} className="c now">On this bill</th></tr>
              <tr><th>Sl</th><th>Product</th><th className="r">PO Qty</th><th className="r">Received</th><th className="r">Billed</th><th className="r">Left to bill</th>
                <th className="r now first">Bill Qty</th><th className="r now">Rate</th><th className="r now">Taxable</th><th className="r now">GST %</th><th className="r now">{intra ? 'CGST + SGST' : 'IGST'}</th><th className="r now">Amount</th></tr>
            </thead>
            <tbody>
              {shown.map(g => (
                <React.Fragment key={g.po.orderId}>
                  <tr className="sub"><td colSpan={12}>{g.po.poNo || g.po.orderId} · {fdate(g.po.poDate)}{g.so ? ` · ${g.so.orderNo} · ${g.so.customerName || ''}` : ''}{g.po.paymentTerms ? ` · ${g.po.paymentTerms}` : ''}</td></tr>
                  {calc.lines.filter(x => x.g === g).map(({ l, k, q, taxable, gstAmt }, i) => (
                    <tr key={k} className={l.toBill <= 0 && !q ? 'off' : ''}>
                      <td>{i + 1}</td>
                      <td><div className="pn">{l.name}</div><div className="ps">{l.hsn ? `HSN ${l.hsn}` : 'No HSN'} · {l.unit}
                        {l.billPending > 0 && <> · <span className="px-tag bp">Received, bill pending {num(l.billPending)}</span></>}
                        {l.matPending > 0 && <> · <span className="px-tag mp">Billed, material pending {num(l.matPending)}</span></>}</div></td>
                      <td className="r">{num(l.qty)}</td><td className="r">{l.received ? num(l.received) : <span className="mut">0</span>}</td>
                      <td className="r">{l.billed ? num(l.billed) : <span className="mut">0</span>}</td>
                      <td className={`r ${l.toBill > 0 ? 'pend' : 'done'}`}>{l.toBill > 0 ? num(l.toBill) : '✓ Billed'}</td>
                      <td className="r now first">
                        <input className={`sf-q${errs[k] ? ' bad' : ''}`} inputMode="decimal" value={qty[k] ?? ''} placeholder="0" disabled={l.toBill <= 0 && !q}
                          onChange={e => { const v = e.target.value.replace(/[^\d.]/g, ''); setQty(x => ({ ...x, [k]: v })); }} aria-label={`Bill qty for ${l.name} of ${g.po.poNo}`} />
                        {errs[k] && <span className="sf-err">{errs[k]}</span>}
                      </td>
                      <td className="r now"><input className="sf-q" inputMode="decimal" value={rate[k] ?? ''} onChange={e => { const v = e.target.value.replace(/[^\d.]/g, ''); setRate(x => ({ ...x, [k]: v })); }} aria-label={`Rate for ${l.name}`} />
                        {rate[k] != null && n(rate[k]) !== l.rate && <span className="sf-err" style={{ color: '#B54708' }}>PO rate {num(l.rate)}</span>}</td>
                      <td className="r now">{q ? amt(taxable) : <span className="mut">—</span>}</td>
                      <td className="r now">{num(l.gstPct)}%</td>
                      <td className="r now">{q ? amt(gstAmt) : <span className="mut">—</span>}</td>
                      <td className="r now"><b>{q ? amt(taxable + gstAmt) : '—'}</b></td>
                    </tr>
                  ))}
                  {calc.ch.filter(x => x.g === g).map(({ c, a, gstAmt }) => (
                    <tr key={c.key} className="chg">
                      <td /><td><b>{c.name}</b><div className="ps">Charge on PO ₹ {amt(c.amount)}{c.billed ? ` · billed before ₹ ${amt(c.billed)}` : ''}</div></td>
                      <td colSpan={4} />
                      <td className="r now first" colSpan={2}><input className="sf-q" inputMode="decimal" value={chg[c.key] ?? ''} placeholder="0" onChange={e => { const v = e.target.value.replace(/[^\d.]/g, ''); setChg(x => ({ ...x, [c.key]: v })); }} aria-label={`Amount for ${c.name}`} style={{ width: '100%' }} /></td>
                      <td className="r now">{a ? amt(a) : <span className="mut">—</span>}</td><td className="r now">{num(c.gstPct)}%</td>
                      <td className="r now">{a ? amt(gstAmt) : <span className="mut">—</span>}</td><td className="r now"><b>{a ? amt(a + gstAmt) : '—'}</b></td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={6}>Total on this bill{usedPos.length > 1 ? ` (${usedPos.length} POs)` : ''}</td><td className="r now first">{num(calc.lines.reduce((s, x) => s + x.q, 0))}</td><td className="now" />
                <td className="r now">{amt(calc.sub)}</td><td className="now" /><td className="r now">{amt(calc.gst)}</td><td className="r now">{amt(calc.total)}</td></tr>
            </tfoot>
          </table>
        )}
      </div>

      {msg && <div className={`sf-msg ${msg.k}`} role="status">{msg.t}</div>}
      <div className="sf-bar">
        <div className="info">{vRow ? <>{MODES[mode][0]} · Taxable ₹ {amt(calc.sub)} · GST ₹ {amt(calc.gst)} · <b>Total ₹ {amt(calc.total)}</b></> : 'Pick the vendor to start.'}</div>
        {editBill ? <button type="button" className="sf-b ghost" onClick={onCancel} disabled={busy}>Cancel</button> : null}
        {(!editBill || ['draft', 'rejected'].includes(editBill.status)) && <button type="button" className="sf-b ghost" onClick={() => save('draft')} disabled={busy}>Save as Draft</button>}
        {editBill && !['draft', 'rejected'].includes(editBill.status)
          ? <button type="button" className="sf-b pri" onClick={() => save(null)} disabled={busy}>{busy ? 'Saving…' : 'Update Bill'}</button>
          : <button type="button" className="sf-b pri" onClick={() => save('pending')} disabled={busy}>{busy ? 'Saving…' : 'Send for Approval'}</button>}
      </div>

      {picker && <ListPicker title="Select Vendor" placeholder="Search vendor, GSTIN, city…" onClose={() => setPicker(false)}
        cols={[['Vendor'], ['GSTIN'], ['City'], ['POs', 'r'], ['Open POs', 'r'], ['Qty left to bill', 'r'], ['Received — bill pending', 'r']]}
        rows={vendorRows.map(r => ({ key: r.key, dim: !r.open, search: `${r.name} ${r.gstin} ${r.city}`, cells: [<b key="n">{r.name}</b>, r.gstin || '—', r.city || '—', r.pos, r.open, num(r.left), r.bp || '—'] }))}
        onPick={k => { setPicker(false); if (k !== vendor) { initFor.current = null; setVendor(k); setQty({}); setChg({}); setMsg(null); } }} />}
    </div>
  );
}

/* ── Purchase Bill list ── */
const BCOLS = [['Bill Date', '6.4%'], ['Vendor Inv. No.', '9.6%'], ['Vendor', '12.6%'], ['PO No.', '10%'], ['Order No.', '8.6%'], ['Client', '11%'], ['Products', '13.4%'], ['Qty', '3.2%', 'r'],
  ['Taxable', '6.2%', 'r'], ['GST', '5.4%', 'r'], ['Amount', '6.6%', 'r'], ['St.', '2.8%', 'c'], ['PDF', '2.8%', 'c']];
function BillList({ bills, poMap, soMap, companyId, company, user, slot, setNote, onEdit, onPdf, onChanged }) {
  const [fySel, setFySel] = useState(() => [fyOf(new Date())]);
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState(null);
  const [askDel, setAskDel] = useState(null);
  const [busy, setBusy] = useState('');
  useClearSel(askDel ? null : selId, setSelId, '.sb-t tbody.og, .sb-tools, .sb-ask');
  const all = useMemo(() => [...(bills || [])].sort((a, b) => String(b.billDate || '').localeCompare(String(a.billDate || '')) || String(b.billNo || '').localeCompare(String(a.billNo || ''), undefined, { numeric: true })), [bills]);
  const fyList = useMemo(() => fyCounts(all, b => b.billDate), [all]);
  const sosOf = b => [...new Set(billPoIds(b).map(id => String(poMap[id]?.linkedSalesOrderId || '')).concat(String(b.linkedSalesOrderId || '')).filter(Boolean))].map(id => soMap[id]).filter(Boolean);
  const posOf = b => billPoIds(b).map(id => poMap[id]?.poNo || (b.poRefs || []).find(r => String(r.orderId) === id)?.poNo || (String(b.orderId) === id ? b.orderNo : id));
  const list = useMemo(() => {
    const w = q.toLowerCase().split(/\s+/).filter(Boolean);
    return all.filter(b => (!fySel.length || fySel.includes(fyOf(b.billDate)))
      && (!w.length || w.every(x => `${b.billNo} ${b.vendorBillNo || ''} ${b.partyName || ''} ${posOf(b).join(' ')} ${sosOf(b).map(o => `${o.orderNo} ${o.customerName || ''}`).join(' ')} ${(b.items || []).map(i => i.description).join(' ')} ${(STATUS[b.status] || [])[2] || ''}`.toLowerCase().includes(x))));
  }, [all, fySel, q, soMap, poMap]);   // eslint-disable-line react-hooks/exhaustive-deps
  const sel = list.find(b => b.billId === selId) || null;
  const pdfOf = b => (b.attachments || []).find(a => a && (a.fileName || a.name));
  const openPdf = async b => {
    const a = pdfOf(b); if (!a) return;
    setBusy('pdf');
    try {
      const r = await axios.get(pdfUrl(companyId, b, a), { responseType: 'blob' });
      if (/html/i.test(r.data?.type || '')) throw new Error('missing');
      onPdf({ url: URL.createObjectURL(r.data), name: a.name || a.fileName });
    } catch { setNote(`Could not open the file of bill ${b.billNo} — it is missing on the server.`); }
    finally { setBusy(''); }
  };
  const send = async b => {
    setBusy('send');
    try { await axios.put(`/api/bills/${b.billId}`, { status: 'pending' }, { params: { companyId, type: 'purchase' } }); setNote(`Purchase bill (vendor invoice ${b.vendorBillNo || b.billNo}) sent for approval.`); onChanged(); }
    catch (e) { setNote(e.response?.data?.error || 'Could not send the bill.'); }
    finally { setBusy(''); }
  };
  /* Approve — button shown only to users with Purchase Bill approve rights; enabled for a pending bill.
     'posted' is the approved status the Approvals module uses for purchase bills. */
  const canApproveBill = can(user, 'purchaseBill', 'approve');
  const approve = async b => {
    if (!window.confirm(`Approve purchase bill (vendor invoice ${b.vendorBillNo || b.billNo}) — ${b.partyName || ''}?`)) return;
    setBusy('approve');
    try { await axios.put(`/api/bills/${b.billId}`, { status: 'posted', approvedBy: user?.name || user?.username || 'Admin', approvedAt: new Date().toISOString() }, { params: { companyId, type: 'purchase' } }); setNote(`Purchase bill (vendor invoice ${b.vendorBillNo || b.billNo}) approved.`); onChanged(); }
    catch (e) { setNote(e.response?.data?.error || 'Could not approve the bill.'); }
    finally { setBusy(''); }
  };
  const doDelete = async b => {
    setBusy('del');
    try { await axios.delete(`/api/bills/${b.billId}`, { params: { companyId, type: 'purchase' } }); await dropBillGrns(companyId, b.billId); setAskDel(null); setSelId(null); setNote(`Deleted purchase bill (vendor invoice ${b.vendorBillNo || b.billNo}) — its quantities are pending to bill again.`); onChanged(); }
    catch (e) { setNote(e.response?.data?.error || 'Could not delete the bill.'); }
    finally { setBusy(''); }
  };
  const sum = k => list.reduce((s, b) => s + n(b[k]), 0);
  const locked = b => ['posted', 'approved'].includes(b?.status);
  const printAll = () => printList({
    title: 'Purchase Bills', company, user,
    filter: [fySel.length ? [...fySel].sort().reverse().map(fyLabel).join(', ') : 'All years', q.trim() && `Search: ${q.trim()}`].filter(Boolean).join('  |  '),
    cols: [['Bill Date', 'c', '6.5%'], ['Vendor Inv. No.', '', '9%'], ['Vendor', '', '12%'], ['PO No.', '', '10%'], ['Order No.', '', '8.5%'], ['Client', '', '11%'], ['Products', '', '15%'], ['Qty', 'r', '4%'], ['Taxable', 'r', '7%'], ['GST', 'r', '6%'], ['Amount', 'r', '7%'], ['Status', 'c', '6%']],
    rows: list.map(b => { const sos = sosOf(b);
      return [fdate(b.billDate), esc(b.vendorBillNo || ''), esc(b.partyName || ''), esc(posOf(b).join(', ')), esc(sos.map(o => o.orderNo).join(', ')), esc(sos.map(o => o.customerName).filter(Boolean).join(', ')),
        ...(ls => [ls.map(li => esc(li.description || '')).join('<br>'), ls.map(li => num(li.qty)).join('<br>')])((b.items || []).filter(li => n(li.qty) > 0 && !(li.unit === 'LOT' && li.itemIdx == null))),
        money(b.subTotal), money(b.totalGST), `<b>${money(b.grandTotal)}</b>`, esc((STATUS[b.status] || STATUS.draft)[2])]; }),
    total: ['', '', '', '', '', '', `Total (${list.length} bills)`, '', money(sum('subTotal')), money(sum('totalGST')), money(sum('grandTotal')), ''],
  });

  return (
    <>
      {slot && createPortal(<>
        <FyFilter list={fyList} total={all.length} sel={fySel} setSel={setFySel} />
        <input className="sb-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search bill, vendor invoice, vendor, PO, order…" aria-label="Search purchase bills" />
        <div className="sb-tools">
          <span className="sb-picked">{sel ? <>Selected: <b>{sel.vendorBillNo || sel.billNo}</b> · {sel.partyName}</> : 'Click a bill to select'}</span>
          <button type="button" className="sb-tbtn" disabled={!list.length} onClick={printAll}><Svg name="file" size={13} />Print List</button>
          <button type="button" className="sb-tbtn" disabled={!sel || !pdfOf(sel) || busy === 'pdf'} onClick={() => openPdf(sel)}><Svg name="eye" size={13} />{busy === 'pdf' ? 'Opening…' : 'View Invoice'}</button>
          <button type="button" className="sb-tbtn" disabled={!sel || !['draft', 'rejected'].includes(sel.status) || busy === 'send'} onClick={() => send(sel)}><Svg name="check" size={13} />Send for Approval</button>
          {canApproveBill && <button type="button" className="sb-tbtn" disabled={!sel || sel.status !== 'pending' || busy === 'approve'} title={sel && sel.status !== 'pending' ? 'Only a bill pending approval can be approved' : 'Approve this bill'} onClick={() => approve(sel)} style={{ color: '#067647', borderColor: '#16A34A' }}><Svg name="check" size={13} />{busy === 'approve' ? 'Approving…' : 'Approve'}</button>}
          <button type="button" className="sb-tbtn" disabled={!sel} onClick={() => onEdit(sel)}><Svg name="settings" size={13} />Edit</button>
          <button type="button" className="sb-tbtn del" disabled={!sel || locked(sel)} title={locked(sel) ? 'An approved bill cannot be deleted here' : 'Delete this bill'} onClick={() => setAskDel(sel)}><Svg name="x" size={13} />Delete</button>
        </div>
      </>, slot)}
      {askDel && (
        <div className="sb-ask" role="alertdialog" aria-label="Confirm delete">
          <span><b>Delete purchase bill — vendor invoice {askDel.vendorBillNo || askDel.billNo}</b> ( {askDel.partyName || '—'}, ₹ {money(askDel.grandTotal)})? This cannot be undone.</span>
          <button type="button" className="sb-abtn" onClick={() => setAskDel(null)} disabled={busy === 'del'}>Keep</button>
          <button type="button" className="sb-abtn danger" onClick={() => doDelete(askDel)} disabled={busy === 'del'}>{busy === 'del' ? 'Deleting…' : 'Yes, delete'}</button>
        </div>
      )}
      <div className="sb-kpi">
        <div className="sb-k"><small>Bills</small><b>{list.length}</b></div>
        <div className="sb-k"><small>Taxable</small><b>₹ {BIG.format(sum('subTotal'))}</b></div>
        <div className="sb-k"><small>GST</small><b>₹ {BIG.format(sum('totalGST'))}</b></div>
        <div className="sb-k ok"><small>Bill Amount</small><b>₹ {BIG.format(sum('grandTotal'))}</b></div>
      </div>
      <div className="sb-list">
        <table className="sb-t px">
          <colgroup>{BCOLS.map(([h, w]) => <col key={h} style={{ width: w }} />)}</colgroup>
          <thead><tr>{BCOLS.map(([h, , a]) => <th key={h} className={a || ''}>{h}</th>)}</tr></thead>
          {bills === null ? <tbody><tr><td colSpan={BCOLS.length} className="sb-empty">Loading…</td></tr></tbody>
            : !list.length ? <tbody><tr><td colSpan={BCOLS.length} className="sb-empty">{q ? `No bill matches “${q}”.` : 'No purchase bills in this year.'}</td></tr></tbody> : null}
          {bills !== null && list.map(b => {
            const sos = sosOf(b), st = STATUS[b.status] || STATUS.draft, a = pdfOf(b);
            const lines = (b.items || []).filter(li => n(li.qty) > 0 && !(li.unit === 'LOT' && li.itemIdx == null));
            return (
              <tbody key={b.billId} className={`og${selId === b.billId ? ' sel' : ''}`} onClick={() => setSelId(b.billId)} onDoubleClick={() => { setSelId(b.billId); onEdit(b); }} title="Click to select · double-click to edit">
                <tr>
                  <td className="nw">{fdate(b.billDate)}</td><td className="bno">{dash(b.vendorBillNo)}</td><td className="cl">{dash(b.partyName)}</td>
                  <td className="no">{posOf(b).map(x => <div key={x}>{x}</div>)}</td><td className="no">{sos.length ? sos.map(o => <div key={o.orderId}>{o.orderNo}</div>) : '—'}</td><td>{dash(sos.map(o => o.customerName).filter(Boolean).join(', '))}</td><td>{lines.length ? lines.map((li, k) => <div key={k} className="gl">{li.description}</div>) : <span className="mut">—</span>}</td>
                  <td className="r">{lines.map((li, k) => <div key={k} className="gl">{num(li.qty)}{li.unit ? <span className="mut"> {li.unit}</span> : null}</div>)}</td>
                  <td className="r">{money(b.subTotal)}</td><td className="r">{money(b.totalGST)}</td><td className="r"><b>{money(b.grandTotal)}</b></td>
                  <td className="c"><span className="px-st" style={{ background: st[1] }} title={st[2]}>{st[0]}</span></td>
                  <td className="c">{a ? <button type="button" className="sb-pdfb" title={`View ${a.name || a.fileName}`} onClick={e => { e.stopPropagation(); openPdf(b); }} onDoubleClick={e => e.stopPropagation()}><Svg name="file" size={12} /></button> : <span className="mut">—</span>}</td>
                </tr>
              </tbody>
            );
          })}
          {list.length > 0 && <tfoot><tr><td colSpan={8}>Total ({list.length} bills)</td><td className="r">{money(sum('subTotal'))}</td><td className="r">{money(sum('totalGST'))}</td><td className="r">{money(sum('grandTotal'))}</td><td colSpan={2} /></tr></tfoot>}
        </table>
      </div>
    </>
  );
}

/* ── Purchase Pending: per PO product — received vs billed ── */
const PCOLS = [['Order No.', '7.6%'], ['Client', '10%'], ['Vendor', '10.4%'], ['PO No.', '8.6%'], ['PO Date', '5.6%'], ['Product', '28.2%'], ['PO Qty', '4%', 'r'],
  ['Received (GRN)', '3.8%', 'r'], ['Billed', '3.4%', 'r'], ['Left to receive', '3.8%', 'r'], ['Left to bill', '3.6%', 'r'], ['Status', '11%', 'c']];
const VIEWS = [['open', 'Pending (anything left)'], ['bp', 'Material received — bill pending'], ['mp', 'Bill received — material pending'], ['all', 'All POs']];
export function lineTag(l) {
  if (l.billPending > 0) return <span className="px-tag bp">Bill pending · {num(l.billPending)}</span>;
  if (l.matPending > 0) return <span className="px-tag mp">Material pending · {num(l.matPending)}</span>;
  if (l.toBill <= 0 && l.toReceive <= 0) return <span className="px-tag ok">Received &amp; billed</span>;
  if (l.received <= 0 && l.billed <= 0) return <span className="px-tag no">Nothing yet</span>;
  return <span className="px-tag no">Part received &amp; billed</span>;
}
function PendingList({ pos, soMap, bills, grns, loading, slot, company, user, onBill, onGrn }) {
  const [fySel, setFySel] = useState(() => [fyOf(new Date())]);
  const [view, setView] = useState('open');
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState(null);
  useClearSel(selId, setSelId, '.sb-t tbody.og, .sb-tools');
  const all = useMemo(() => pos.map(po => ({ po, so: soMap[String(po.linkedSalesOrderId)], lines: poStatusOf(po, bills, grns) }))
    .sort((a, b) => String(b.po.poDate || '').localeCompare(String(a.po.poDate || '')) || n(b.po.orderId) - n(a.po.orderId)), [pos, soMap, bills, grns]);
  const fyList = useMemo(() => fyCounts(all, r => r.po.poDate), [all]);
  const rows = useMemo(() => {
    const w = q.toLowerCase().split(/\s+/).filter(Boolean);
    const keep = r => view === 'all' || r.lines.some(l => (view === 'open' ? l.toBill > 0 || l.toReceive > 0 : view === 'bp' ? l.billPending > 0 : l.matPending > 0));
    return all.filter(r => (!fySel.length || fySel.includes(fyOf(r.po.poDate))) && keep(r)
      && (!w.length || w.every(x => `${r.po.poNo || ''} ${r.po.vendorName || ''} ${r.so?.orderNo || ''} ${r.so?.customerName || ''} ${r.lines.map(l => l.name).join(' ')}`.toLowerCase().includes(x))));
  }, [all, fySel, view, q]);
  const sel = rows.find(r => String(r.po.orderId) === selId) || null;
  const cnt = k => rows.reduce((s, r) => s + r.lines.filter(l => l[k] > 0).length, 0);
  const tagText = l => (l.billPending > 0 ? `Bill pending · ${num(l.billPending)}` : l.matPending > 0 ? `Material pending · ${num(l.matPending)}` : l.toBill <= 0 && l.toReceive <= 0 ? 'Received & billed' : l.received <= 0 && l.billed <= 0 ? 'Nothing yet' : 'Part received & billed');
  const printAll = () => printList({
    title: 'Purchase Pending', company, user,
    filter: [fySel.length ? [...fySel].sort().reverse().map(fyLabel).join(', ') : 'All years', VIEWS.find(v => v[0] === view)?.[1], q.trim() && `Search: ${q.trim()}`].filter(Boolean).join('  |  '),
    cols: [['Order No.', '', '8.5%'], ['Client', '', '11%'], ['Vendor', '', '11%'], ['PO No.', '', '10%'], ['PO Date', 'c', '6.5%'], ['Product', '', '18%'], ['PO Qty', 'r', '5.5%'], ['Received', 'r', '6%'], ['Billed', 'r', '5.5%'], ['Left to receive', 'r', '6%'], ['Left to bill', 'r', '5.5%'], ['Status', '', '10%']],
    rows: rows.flatMap(r => r.lines.map((l, i) => [i ? '' : esc(r.so?.orderNo || ''), i ? '' : esc(r.so?.customerName || ''), i ? '' : esc(r.po.vendorName || ''), i ? '' : esc(r.po.poNo || ''), i ? '' : fdate(r.po.poDate),
      esc(l.name), `${num(l.qty)} ${esc(l.unit)}`, num(l.received), num(l.billed), num(l.toReceive), `<b>${num(l.toBill)}</b>`, esc(tagText(l))])),
  });

  return (
    <>
      {slot && createPortal(<>
        <FyFilter list={fyList} total={all.length} sel={fySel} setSel={setFySel} />
        <select className="px-sel" value={view} onChange={e => setView(e.target.value)} aria-label="Show">{VIEWS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <input className="sb-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search PO, vendor, order, client, product…" aria-label="Search" />
        <div className="sb-tools">
          <span className="sb-picked">{sel ? <>Selected: <b>{sel.po.poNo || sel.po.orderId}</b></> : 'Click a PO to select'}</span>
          <button type="button" className="sb-tbtn" disabled={!rows.length} onClick={printAll}><Svg name="file" size={13} />Print</button>
          <button type="button" className="sb-tbtn" disabled={!sel} onClick={() => onGrn(sel.po)}><Svg name="box" size={13} />Make GRN</button>
          <button type="button" className="sb-tbtn" disabled={!sel} onClick={() => onBill(sel.po)}><Svg name="file" size={13} />Make Bill</button>
        </div>
      </>, slot)}
      <div className="sb-kpi">
        <div className="sb-k"><small>POs</small><b>{rows.length}</b></div>
        <div className="sb-k"><small>Products left to bill</small><b>{cnt('toBill')}</b></div>
        <div className="sb-k"><small>Received — bill pending</small><b style={{ color: '#B54708' }}>{cnt('billPending')}</b></div>
        <div className="sb-k"><small>Billed — material pending</small><b style={{ color: '#3538CD' }}>{cnt('matPending')}</b></div>
      </div>
      <div className="sb-list">
        <table className="sb-t px">
          <colgroup>{PCOLS.map(([h, w]) => <col key={h} style={{ width: w }} />)}</colgroup>
          <thead><tr>{PCOLS.map(([h, , a]) => <th key={h} className={a || ''}>{h}</th>)}</tr></thead>
          {loading ? <tbody><tr><td colSpan={PCOLS.length} className="sb-empty">Loading…</td></tr></tbody>
            : !rows.length ? <tbody><tr><td colSpan={PCOLS.length} className="sb-empty">{q ? `Nothing matches “${q}”.` : 'Nothing pending here.'}</td></tr></tbody> : null}
          {!loading && rows.map(r => {
            const id = String(r.po.orderId), lines = r.lines.length ? r.lines : [null], span = lines.length;
            return (
              <tbody key={id} className={`og${selId === id ? ' sel' : ''}`} onClick={() => setSelId(id)} onDoubleClick={() => onBill(r.po)} title="Click to select · double-click to make the bill">
                {lines.map((l, i) => (
                  <tr key={i}>
                    {i === 0 && <>
                      <td rowSpan={span} className="no">{dash(r.so?.orderNo)}</td><td rowSpan={span}>{dash(r.so?.customerName)}</td>
                      <td rowSpan={span} className="cl">{dash(r.po.vendorName)}</td><td rowSpan={span} className="no">{r.po.poNo || r.po.orderId}</td>
                      <td rowSpan={span} className="nw">{fdate(r.po.poDate)}</td>
                    </>}
                    {l ? <>
                      <td>{l.name}</td><td className="r">{num(l.qty)} <span className="mut">{l.unit}</span></td>
                      <td className="r">{l.received ? num(l.received) : <span className="mut">0</span>}</td><td className="r">{l.billed ? num(l.billed) : <span className="mut">0</span>}</td>
                      <td className={`r ${l.toReceive > 0 ? 'pend' : 'done'}`}>{l.toReceive > 0 ? num(l.toReceive) : '✓'}</td>
                      <td className={`r ${l.toBill > 0 ? 'pend' : 'done'}`}>{l.toBill > 0 ? num(l.toBill) : '✓'}</td>
                      <td className="c">{lineTag(l)}</td>
                    </> : <td colSpan={7} className="c mut">No products on this PO</td>}
                  </tr>
                ))}
              </tbody>
            );
          })}
        </table>
      </div>
    </>
  );
}
