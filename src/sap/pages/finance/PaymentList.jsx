/**
 * F110 — Automatic Payment Transactions
 * SAP FI — Finance & Controlling
 */
import React, { useState, useEffect } from 'react';
import { useSAP } from '../../context/SAPContext';
import { Panel, Table, Btn, PageHeader, FormRow, Input, Select, Textarea, ErrorBox, C, fmt, fmtDate } from '../../components/SAPShared';

export default function PaymentList() {
  const { api, projects, addNotification } = useSAP();
  const [list,    setList]    = useState([]);
  const [invList, setInvList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm,setShow]    = useState(false);
  const [form,    setForm]    = useState({ projectId: '', clientName: '', invId: '', amount: '', paymentMode: 'NEFT', paymentDate: new Date().toISOString().slice(0,10), reference: '', notes: '' });
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  const load = () => {
    api('/api/sap/finance/payments').then(r => { setList(r.data || []); setLoading(false); }).catch(() => setLoading(false));
    api('/api/sap/finance/invoices').then(r => setInvList(r.data || [])).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    if (form.projectId) {
      const proj = projects.find(p => p.projectId === form.projectId);
      if (proj) set('clientName', proj.clientName || '');
    }
  }, [form.projectId, projects]);

  const projInvoices = invList.filter(i => i.projectId === form.projectId && i.balanceAmount > 0);

  const submit = async () => {
    if (!form.projectId) return setError('Project required');
    if (!form.amount || parseFloat(form.amount) <= 0) return setError('Amount required');
    setSaving(true); setError('');
    try {
      await api('/api/sap/finance/payment', { method: 'POST', data: { ...form, amount: parseFloat(form.amount) } });
      addNotification('Payment recorded');
      load();
      setShow(false);
      setForm({ projectId: '', clientName: '', invId: '', amount: '', paymentMode: 'NEFT', paymentDate: new Date().toISOString().slice(0,10), reference: '', notes: '' });
    } catch(e) { setError(e.response?.data?.error || e.message); }
    setSaving(false);
  };

  return (
    <div style={{ fontFamily: C.font, color: C.text }}>
      <PageHeader
        tcode="F110"
        title="Payment Transactions — Outgoing / Incoming"
        sub="FI — Finance & Controlling"
        action={
          <div style={{ display: 'flex', gap: 4 }}>
            <Btn variant="secondary" onClick={load} small>↻ Refresh</Btn>
            <Btn onClick={() => setShow(p => !p)} small>{showForm ? '✕ Cancel' : '+ Record Payment'}</Btn>
          </div>
        }
      />

      {showForm && (
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}` }}>
          <ErrorBox msg={error} />
          <Panel title="Record Payment">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <FormRow label="Project" required half>
                <Select value={form.projectId} onChange={e => set('projectId', e.target.value)}
                  options={[{ value: '', label: '— Select —' }, ...projects.map(p => ({ value: p.projectId, label: `${p.projectId} — ${p.projectName}` }))]} />
              </FormRow>
              <FormRow label="Client Name" half>
                <Input value={form.clientName} onChange={e => set('clientName', e.target.value)} />
              </FormRow>
              <FormRow label="Against Invoice (optional)" half>
                <Select value={form.invId} onChange={e => { set('invId', e.target.value); const inv = projInvoices.find(i => i.invId === e.target.value); if(inv) set('amount', inv.balanceAmount); }}
                  options={[{ value: '', label: '— None —' }, ...projInvoices.map(i => ({ value: i.invId, label: `${i.invNumber} — Balance: ${fmt(i.balanceAmount)}` }))]} />
              </FormRow>
              <FormRow label="Amount (₹)" required half>
                <Input type="number" value={form.amount} onChange={e => set('amount', e.target.value)} min="0" />
              </FormRow>
              <FormRow label="Payment Mode" half>
                <Select value={form.paymentMode} onChange={e => set('paymentMode', e.target.value)}
                  options={['NEFT', 'RTGS', 'Cheque', 'Cash', 'UPI', 'IMPS']} />
              </FormRow>
              <FormRow label="Payment Date" half>
                <Input type="date" value={form.paymentDate} onChange={e => set('paymentDate', e.target.value)} />
              </FormRow>
              <FormRow label="Reference / UTR" half>
                <Input value={form.reference} onChange={e => set('reference', e.target.value)} placeholder="UTR / Cheque No." />
              </FormRow>
              <FormRow label="Notes">
                <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} />
              </FormRow>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <Btn onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Record Payment'}</Btn>
            </div>
          </Panel>
        </div>
      )}

      <div style={{ padding: '12px 20px' }}>
        <Panel>
          <Table
            cols={[
              { label: 'Pay ID',     key: 'payId' },
              { label: 'Project',    key: 'projectId' },
              { label: 'Client',     key: 'clientName' },
              { label: 'Amount',     render: r => <span style={{ color: C.green, fontWeight: 700 }}>{fmt(r.amount)}</span>, right: true },
              { label: 'Mode',       key: 'paymentMode', muted: true },
              { label: 'Date',       render: r => fmtDate(r.paymentDate), muted: true },
              { label: 'Reference',  key: 'reference', muted: true },
            ]}
            rows={list}
            emptyMsg={loading ? 'Loading…' : 'No payments recorded'}
          />
        </Panel>
      </div>
    </div>
  );
}
