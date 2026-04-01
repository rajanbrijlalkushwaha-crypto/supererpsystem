/**
 * VF03 — Display Billing Document / Customer Invoices
 * SAP FI — Finance & Controlling
 */
import React, { useState, useEffect } from 'react';
import { useSAP } from '../../context/SAPContext';
import { Panel, Table, Badge, Btn, PageHeader, FormRow, Input, Select, Textarea, ErrorBox, C, fmt, fmtDate } from '../../components/SAPShared';

const BLANK_ITEM = { description: '', qty: 1, unitPrice: 0, taxPct: 18 };

export default function InvoiceList() {
  const { api, projects, addNotification } = useSAP();
  const [list,   setList]   = useState([]);
  const [loading,setLoading]= useState(true);
  const [showForm,setShow]  = useState(false);
  const [form,   setForm]   = useState({ projectId: '', clientName: '', invoiceDate: new Date().toISOString().slice(0,10), dueDate: '', notes: '' });
  const [items,  setItems]  = useState([{ ...BLANK_ITEM }]);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const load = () => {
    api('/api/sap/finance/invoices').then(r => { setList(r.data || []); setLoading(false); }).catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    if (form.projectId) {
      const proj = projects.find(p => p.projectId === form.projectId);
      if (proj) set('clientName', proj.clientName || '');
    }
  }, [form.projectId, projects]);

  const setItem = (i, k, v) => setItems(p => p.map((r, ri) => ri === i ? { ...r, [k]: v } : r));
  const addItem = () => setItems(p => [...p, { ...BLANK_ITEM }]);
  const delItem = (i) => setItems(p => p.filter((_, ri) => ri !== i));

  const subtotal   = items.reduce((s, it) => s + (parseFloat(it.qty)||0)*(parseFloat(it.unitPrice)||0), 0);
  const taxTotal   = items.reduce((s, it) => { const sub=(parseFloat(it.qty)||0)*(parseFloat(it.unitPrice)||0); return s+sub*(parseFloat(it.taxPct)||0)/100; }, 0);
  const grandTotal = subtotal + taxTotal;

  const submit = async () => {
    if (!form.projectId)   return setError('Project required');
    if (!form.clientName)  return setError('Client required');
    setSaving(true); setError('');
    try {
      await api('/api/sap/finance/invoice', { method: 'POST', data: { ...form, items } });
      addNotification('Invoice created');
      load();
      setShow(false);
      setForm({ projectId: '', clientName: '', invoiceDate: new Date().toISOString().slice(0,10), dueDate: '', notes: '' });
      setItems([{ ...BLANK_ITEM }]);
    } catch(e) { setError(e.response?.data?.error || e.message); }
    setSaving(false);
  };

  return (
    <div style={{ fontFamily: C.font, color: C.text }}>
      <PageHeader
        tcode="VF03"
        title="Customer Invoices — Billing Documents"
        sub="FI — Finance & Controlling"
        action={
          <div style={{ display: 'flex', gap: 4 }}>
            <Btn variant="secondary" onClick={load} small>↻ Refresh</Btn>
            <Btn onClick={() => setShow(p => !p)} small>{showForm ? '✕ Cancel' : '+ New Invoice'}</Btn>
          </div>
        }
      />

      {showForm && (
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}` }}>
          <ErrorBox msg={error} />
          <Panel title="Create Invoice">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
              <FormRow label="Project" required half>
                <Select value={form.projectId} onChange={e => set('projectId', e.target.value)}
                  options={[{ value: '', label: '— Select —' }, ...projects.map(p => ({ value: p.projectId, label: `${p.projectId} — ${p.projectName}` }))]} />
              </FormRow>
              <FormRow label="Client Name" required half>
                <Input value={form.clientName} onChange={e => set('clientName', e.target.value)} />
              </FormRow>
              <FormRow label="Invoice Date" half>
                <Input type="date" value={form.invoiceDate} onChange={e => set('invoiceDate', e.target.value)} />
              </FormRow>
              <FormRow label="Due Date" half>
                <Input type="date" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} />
              </FormRow>
              <FormRow label="Notes">
                <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} />
              </FormRow>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase' }}>Line Items</span>
              <Btn small onClick={addItem}>+ Add</Btn>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr style={{ background: C.surface2 }}>
                {['Description','Qty','Unit Price','Tax %','Line Total',''].map((h,i) => (
                  <th key={i} style={{ padding: '4px 6px', textAlign: i >= 1 ? 'right' : 'left', color: C.muted, fontWeight: 600, fontSize: 10, borderBottom: `1px solid ${C.border}` }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {items.map((it, i) => {
                  const sub = (parseFloat(it.qty)||0)*(parseFloat(it.unitPrice)||0);
                  const tax = sub*(parseFloat(it.taxPct)||0)/100;
                  return (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: '3px 5px' }}><Input value={it.description} onChange={e => setItem(i,'description',e.target.value)} placeholder="Description" /></td>
                      <td style={{ padding: '3px 5px', width: 70 }}><Input type="number" value={it.qty} onChange={e => setItem(i,'qty',e.target.value)} /></td>
                      <td style={{ padding: '3px 5px', width: 100 }}><Input type="number" value={it.unitPrice} onChange={e => setItem(i,'unitPrice',e.target.value)} /></td>
                      <td style={{ padding: '3px 5px', width: 60 }}><Input type="number" value={it.taxPct} onChange={e => setItem(i,'taxPct',e.target.value)} /></td>
                      <td style={{ padding: '3px 8px', textAlign: 'right', color: C.white, fontWeight: 700 }}>{fmt(sub+tax)}</td>
                      <td style={{ padding: '3px 5px' }}><Btn small variant="danger" onClick={() => delItem(i)}>✕</Btn></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
              <div style={{ fontSize: 12, color: C.muted }}>
                Subtotal: {fmt(subtotal)} | Tax: {fmt(taxTotal)} | <strong style={{ color: C.green }}>Grand Total: {fmt(grandTotal)}</strong>
              </div>
              <Btn onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Create Invoice'}</Btn>
            </div>
          </Panel>
        </div>
      )}

      <div style={{ padding: '12px 20px' }}>
        <Panel>
          <Table
            cols={[
              { label: 'Invoice #',  key: 'invNumber' },
              { label: 'Project',    key: 'projectId' },
              { label: 'Client',     key: 'clientName' },
              { label: 'Date',       render: r => fmtDate(r.invoiceDate), muted: true },
              { label: 'Due',        render: r => fmtDate(r.dueDate),     muted: true },
              { label: 'Amount',     render: r => fmt(r.grandTotal),  right: true },
              { label: 'Paid',       render: r => fmt(r.paidAmount),  right: true },
              { label: 'Balance',    render: r => <span style={{ color: r.balanceAmount > 0 ? C.red : C.green }}>{fmt(r.balanceAmount)}</span>, right: true },
              { label: 'Status',     render: r => <Badge status={r.status} /> },
            ]}
            rows={list}
            emptyMsg={loading ? 'Loading…' : 'No invoices'}
          />
        </Panel>
      </div>
    </div>
  );
}
