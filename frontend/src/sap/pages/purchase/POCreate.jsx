/**
 * SAP MODE — Create Purchase Order
 * Shows MRP balance to pre-fill order quantities
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSAP } from '../../context/SAPContext';
import { Panel, Btn, PageHeader, FormRow, Input, Select, Textarea, ErrorBox, C, fmt } from '../../components/SAPShared';

const BLANK_ITEM = { itemName: '', unit: 'NOS', orderedQty: 0, unitPrice: 0, taxPct: 18 };

export default function POCreate() {
  const { api, projects, addNotification } = useSAP();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [form,    setForm]    = useState({ projectId: params.get('projectId') || '', vendorName: '', vendorId: '', orderDate: new Date().toISOString().slice(0,10), deliveryDate: '', paymentTerms: 'Net 30', notes: '' });
  const [items,   setItems]   = useState([{ ...BLANK_ITEM }]);
  const [mrp,     setMrp]     = useState([]);
  const [vendors, setVendors] = useState([]);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [violations, setViolations] = useState([]);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    api('/api/vendors').then(r => setVendors(r.data || [])).catch(() => {});
  }, [api]);

  /* Load MRP balance when project changes */
  const loadMrp = useCallback(async (pid) => {
    if (!pid) return setMrp([]);
    try {
      const r = await api(`/api/sap/mrp/${pid}/balance`);
      setMrp(r.data || []);
    } catch { setMrp([]); }
  }, [api]);

  useEffect(() => { loadMrp(form.projectId); }, [form.projectId, loadMrp]);

  const setItem  = (i, k, v) => setItems(p => p.map((r, ri) => ri === i ? { ...r, [k]: v } : r));
  const addItem  = () => setItems(p => [...p, { ...BLANK_ITEM }]);
  const delItem  = (i) => setItems(p => p.filter((_, ri) => ri !== i));

  /* Fill from MRP balance */
  const fillFromMrp = (m) => {
    setItems(p => {
      const exists = p.find(x => x.itemName === m.itemName);
      if (exists) return p.map(x => x.itemName === m.itemName ? { ...x, unit: m.unit, orderedQty: Math.max(0, m.balanceToOrder) } : x);
      return [...p.filter(x => x.itemName), { itemName: m.itemName, unit: m.unit || 'NOS', orderedQty: Math.max(0, m.balanceToOrder), unitPrice: 0, taxPct: 18 }];
    });
  };

  const subtotal   = items.reduce((s, it) => s + (parseFloat(it.orderedQty)||0)*(parseFloat(it.unitPrice)||0), 0);
  const taxTotal   = items.reduce((s, it) => { const sub=(parseFloat(it.orderedQty)||0)*(parseFloat(it.unitPrice)||0); return s+sub*(parseFloat(it.taxPct)||0)/100; }, 0);
  const grandTotal = subtotal + taxTotal;

  const submit = async () => {
    if (!form.projectId)  return setError('Project is required');
    if (!form.vendorName) return setError('Vendor is required');
    if (items.filter(i => i.itemName.trim()).length === 0) return setError('At least one item required');
    setSaving(true); setError(''); setViolations([]);
    try {
      const body = { ...form, items: items.filter(i => i.itemName.trim()) };
      const res  = await api('/api/sap/purchase-orders', { method: 'POST', data: body });
      if (res.data.violations?.length > 0) {
        setViolations(res.data.violations);
        setSaving(false);
        return;
      }
      addNotification(`PO ${res.data.poNumber} created`);
      navigate(`/sap/projects/${form.projectId}`);
    } catch(e) { setError(e.response?.data?.error || e.message); }
    setSaving(false);
  };

  const pendingMrp = mrp.filter(m => m.balanceToOrder > 0);

  return (
    <div style={{ fontFamily: C.font, color: C.text }}>
      <PageHeader
        title="Create Purchase Order"
        sub="Raise PO against project material plan"
        action={
          <>
            <Btn variant="secondary" onClick={() => navigate('/sap/purchase-orders')}>Cancel</Btn>
            <Btn onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Create PO'}</Btn>
          </>
        }
      />

      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <ErrorBox msg={error} />

        {violations.length > 0 && (
          <div style={{ background: '#EF444415', border: '1px solid #EF4444', borderRadius: 3, padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#EF4444', marginBottom: 6 }}>Over-purchase violations — cannot create PO:</div>
            {violations.map((v, i) => (
              <div key={i} style={{ fontSize: 12, color: C.text, marginBottom: 3 }}>
                • <strong>{v.itemName}</strong>: ordered {v.orderedQty} but only {v.balanceRemaining} remaining to order (required {v.requiredQty}, already ordered {v.alreadyOrdered})
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Panel title="PO Details">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                <FormRow label="Project" required half>
                  <Select value={form.projectId} onChange={e => set('projectId', e.target.value)}
                    options={[{ value: '', label: '— Select Project —' }, ...projects.map(p => ({ value: p.projectId, label: `${p.projectId} — ${p.projectName}` }))]} />
                </FormRow>
                <FormRow label="Vendor" required half>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Input value={form.vendorName} onChange={e => set('vendorName', e.target.value)} placeholder="Type or select…" />
                    {vendors.length > 0 && (
                      <select onChange={e => { const v = vendors.find(x => x.vendorId === e.target.value); if(v) { set('vendorName', v.vendorName); set('vendorId', v.vendorId); } }}
                        style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 2, padding: '5px', fontSize: 12, color: C.text, fontFamily: C.font }}>
                        <option value="">Pick</option>
                        {vendors.map(v => <option key={v.vendorId} value={v.vendorId}>{v.vendorName}</option>)}
                      </select>
                    )}
                  </div>
                </FormRow>
                <FormRow label="Order Date" half>
                  <Input type="date" value={form.orderDate} onChange={e => set('orderDate', e.target.value)} />
                </FormRow>
                <FormRow label="Expected Delivery" half>
                  <Input type="date" value={form.deliveryDate} onChange={e => set('deliveryDate', e.target.value)} />
                </FormRow>
                <FormRow label="Payment Terms" half>
                  <Select value={form.paymentTerms} onChange={e => set('paymentTerms', e.target.value)}
                    options={['Net 30', 'Net 45', 'Net 60', 'Advance', '50% Advance', 'Against Delivery']} />
                </FormRow>
                <FormRow label="Notes">
                  <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} />
                </FormRow>
              </div>
            </Panel>

            <Panel title="Line Items" action={<Btn small onClick={addItem}>+ Add Item</Btn>}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr style={{ background: C.surface2 }}>
                  {['Item Name','Unit','Qty','Unit Price','Tax %','Line Total',''].map((h,i) => (
                    <th key={i} style={{ padding: '5px 8px', textAlign: i >= 2 ? 'right' : 'left', color: C.muted, fontWeight: 600, fontSize: 11, borderBottom: `1px solid ${C.border}` }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {items.map((it, i) => {
                    const sub = (parseFloat(it.orderedQty)||0)*(parseFloat(it.unitPrice)||0);
                    const tax = sub*(parseFloat(it.taxPct)||0)/100;
                    return (
                      <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ padding: '4px 6px', minWidth: 160 }}><Input value={it.itemName} onChange={e => setItem(i,'itemName',e.target.value)} placeholder="Item name" /></td>
                        <td style={{ padding: '4px 6px', width: 70 }}><Input value={it.unit} onChange={e => setItem(i,'unit',e.target.value)} /></td>
                        <td style={{ padding: '4px 6px', width: 80 }}><Input type="number" value={it.orderedQty} onChange={e => setItem(i,'orderedQty',e.target.value)} min="0" /></td>
                        <td style={{ padding: '4px 6px', width: 100 }}><Input type="number" value={it.unitPrice} onChange={e => setItem(i,'unitPrice',e.target.value)} min="0" /></td>
                        <td style={{ padding: '4px 6px', width: 70 }}><Input type="number" value={it.taxPct} onChange={e => setItem(i,'taxPct',e.target.value)} min="0" /></td>
                        <td style={{ padding: '4px 8px', textAlign: 'right', color: C.white, fontWeight: 700, whiteSpace: 'nowrap' }}>{fmt(sub+tax)}</td>
                        <td style={{ padding: '4px 6px' }}><Btn small variant="danger" onClick={() => delItem(i)}>✕</Btn></td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: `2px solid ${C.border}` }}>
                    <td colSpan={5} style={{ padding: '6px 8px', textAlign: 'right', color: C.muted, fontWeight: 600 }}>Grand Total</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: C.green, fontWeight: 700, fontSize: 14 }}>{fmt(grandTotal)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </Panel>
          </div>

          {/* MRP Balance panel */}
          {form.projectId && (
            <Panel title="MRP Balance" style={{ height: 'fit-content' }}>
              {pendingMrp.length === 0
                ? <div style={{ fontSize: 12, color: C.muted }}>No pending materials to order.</div>
                : pendingMrp.map((m, i) => (
                  <div key={i} style={{ borderBottom: `1px solid ${C.border}`, padding: '6px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 12, color: C.white, fontWeight: 600 }}>{m.itemName}</div>
                      <div style={{ fontSize: 11, color: C.muted }}>{m.unit} — Balance: <span style={{ color: C.yellow }}>{m.balanceToOrder}</span></div>
                    </div>
                    <Btn small variant="secondary" onClick={() => fillFromMrp(m)}>Fill</Btn>
                  </div>
                ))
              }
            </Panel>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Btn variant="secondary" onClick={() => navigate('/sap/purchase-orders')}>Cancel</Btn>
          <Btn onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Create Purchase Order'}</Btn>
        </div>
      </div>
    </div>
  );
}
