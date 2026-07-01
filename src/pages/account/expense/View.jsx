import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../../../context/CompanyContext';

const F   = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const P   = '#2F6FED';
const BD  = '#E5EAF2';
const fmt = n => (parseFloat(n)||0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
const fmtD = d => { if (!d) return '—'; const dt = new Date(d); return isNaN(dt) ? d : `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`; };

const STATUS_COLOR = {
  approved: { bg:'#d8f0d8', color:'#005500', border:'#a5d6a7' },
  pending:  { bg:'#fff3e0', color:'#b06000', border:'#ffcc80' },
  rejected: { bg:'#fbe9e7', color:'#b71c1c', border:'#ef9a9a' },
  draft:    { bg:'#f0f0f0', color:'#555',    border:'#ccc'    },
};

const DetailRow = ({ exp }) => {
  const items = exp.items || [];
  return (
    <tr>
      <td colSpan={9} style={{ background:'#F7FAFF', borderBottom:`1px solid ${BD}`, padding:0 }}>
        <div style={{ padding:'10px 24px 12px' }}>
          <div style={{ display:'flex', gap:24, marginBottom:8, fontSize:11, color:'#555', flexWrap:'wrap' }}>
            {exp.projectName && <span><b>Project:</b> {exp.projectName}</span>}
            {exp.vendorName  && <span><b>Vendor:</b> {exp.vendorName}</span>}
            {exp.invoiceNo   && <span><b>Invoice No:</b> {exp.invoiceNo}</span>}
            {exp.voucherNo   && <span><b>Voucher No:</b> {exp.voucherNo}</span>}
            {exp.notes       && <span><b>Notes:</b> {exp.notes}</span>}
          </div>
          {items.length > 0 && (
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
              <thead>
                <tr style={{ background:'#E3EAFF' }}>
                  {['#','Product','Description','Qty','Rate (₹)','GST %','Amount (₹)'].map((h,i) => (
                    <th key={i} style={{ padding:'4px 8px', textAlign:i>=3?'right':'left', fontWeight:700, fontSize:10, color:'#1a3c6e' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((it,i) => {
                  const base = (parseFloat(it.qty)||0)*(parseFloat(it.rate)||0);
                  const tax  = base*(parseFloat(it.gstPercent)||0)/100;
                  return (
                    <tr key={i} style={{ background:i%2===0?'#fff':'#f5f8ff' }}>
                      <td style={{ padding:'3px 8px', color:'#aaa' }}>{i+1}</td>
                      <td style={{ padding:'3px 8px', fontWeight:600 }}>{it.productName||it.itemName||'—'}</td>
                      <td style={{ padding:'3px 8px', color:'#555' }}>{it.description||'—'}</td>
                      <td style={{ padding:'3px 8px', textAlign:'right' }}>{it.qty||0}</td>
                      <td style={{ padding:'3px 8px', textAlign:'right' }}>₹{fmt(it.rate)}</td>
                      <td style={{ padding:'3px 8px', textAlign:'right' }}>{it.gstPercent||0}%</td>
                      <td style={{ padding:'3px 8px', textAlign:'right', fontWeight:600, color:P }}>₹{fmt(base+tax)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background:'#E3EAFF', fontWeight:700 }}>
                  <td colSpan={6} style={{ padding:'4px 8px', textAlign:'right', fontSize:11 }}>Grand Total:</td>
                  <td style={{ padding:'4px 8px', textAlign:'right', color:P, fontSize:12 }}>
                    ₹{fmt(exp.grandTotal || items.reduce((s,it)=>{ const b=(parseFloat(it.qty)||0)*(parseFloat(it.rate)||0); return s+b+b*(parseFloat(it.gstPercent)||0)/100; },0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </td>
    </tr>
  );
};

export default function ViewExpenses() {
  const { selectedCompany } = useCompany();
  const cid      = selectedCompany?.companyId;
  const navigate = useNavigate();

  const [expenses,   setExpenses]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [msg,        setMsg]        = useState('');
  const [activeTab,  setActiveTab]  = useState('all');
  const [search,     setSearch]     = useState('');
  const [expanded,   setExpanded]   = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const load = useCallback(async () => {
    if (!cid) return;
    setLoading(true);
    try {
      const { data } = await axios.get(`/api/accounts/expenses?companyId=${cid}`);
      setExpenses(data);
    } catch (e) { setMsg('Error: ' + e.message); }
    setLoading(false);
  }, [cid]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (exp) => {
    if (!window.confirm(`Delete Expense EXP-${exp.expenseId}?\nThis cannot be undone.`)) return;
    setDeletingId(exp.expenseId);
    try {
      await axios.delete(`/api/accounts/expenses/${exp.expenseId}?companyId=${cid}`);
      setMsg('Expense deleted.'); load();
    } catch (e) { setMsg('Error: ' + (e.response?.data?.error || e.message)); }
    setDeletingId(null);
    setTimeout(() => setMsg(''), 3000);
  };

  const handleApprove = async (exp) => {
    try {
      await axios.put(`/api/accounts/expenses/${exp.expenseId}?companyId=${cid}`, { ...exp, status:'approved' });
      setMsg('Approved.'); load();
    } catch (e) { setMsg('Error: ' + e.message); }
    setTimeout(() => setMsg(''), 3000);
  };

  const filtered = expenses.filter(e => {
    if (activeTab !== 'all' && e.status !== activeTab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (e.projectName||'').toLowerCase().includes(q)
          || (e.vendorName||'').toLowerCase().includes(q)
          || (e.invoiceNo||'').toLowerCase().includes(q)
          || String(e.expenseId).includes(q);
    }
    return true;
  });

  const totalAmt = filtered.reduce((s,e)=>s+(parseFloat(e.grandTotal||e.totalAmount)||0),0);
  const cnt = {
    all:      expenses.length,
    pending:  expenses.filter(e=>e.status==='pending').length,
    approved: expenses.filter(e=>e.status==='approved').length,
  };

  const tab = (key, icon, label) => (
    <button onClick={() => setActiveTab(key)}
      style={{ height:32, padding:'0 14px', border:`1px solid ${activeTab===key?P:BD}`,
        borderRadius:5, cursor:'pointer', fontFamily:F, fontSize:12, fontWeight:600,
        background: activeTab===key ? P : '#fff', color: activeTab===key ? '#fff' : '#444' }}>
      {icon} {label} ({cnt[key]||0})
    </button>
  );

  const inpStyle = { height:32, padding:'0 10px', border:`1px solid ${BD}`, borderRadius:6, fontSize:12, fontFamily:F, outline:'none', background:'#fff' };

  return (
    <div style={{ fontFamily:F, fontSize:12, padding:8 }}>
      <div style={{ background:P, color:'#fff', padding:'6px 12px', borderRadius:'6px 6px 0 0',
        display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
        <span style={{ fontWeight:700, fontSize:14 }}>🧾 Expense Vouchers</span>
        <div style={{ display:'flex', gap:6 }}>
          <button onClick={() => navigate('/account/expense/create')}
            style={{ height:30, padding:'0 14px', background:'rgba(255,255,255,0.18)', border:'1px solid rgba(255,255,255,0.3)',
              color:'#fff', borderRadius:5, cursor:'pointer', fontSize:12, fontWeight:700 }}>
            + New Expense
          </button>
          <button onClick={load}
            style={{ height:30, padding:'0 12px', background:'rgba(255,255,255,0.12)', border:'1px solid rgba(255,255,255,0.25)',
              color:'#fff', borderRadius:5, cursor:'pointer', fontSize:12 }}>↻</button>
        </div>
      </div>

      {msg && (
        <div style={{ padding:'5px 10px', marginBottom:6, borderRadius:5, fontSize:11,
          background:msg.startsWith('Error')?'#ffe0e0':'#e8f5e9',
          border:`1px solid ${msg.startsWith('Error')?'#cc4444':'#66bb6a'}`,
          color:msg.startsWith('Error')?'#880000':'#1b5e20' }}>{msg}</div>
      )}

      <div style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:7, padding:'8px 12px',
        marginBottom:8, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
        {tab('all','📋','All')}
        {tab('pending','⏳','Pending')}
        {tab('approved','✅','Approved')}
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Project, vendor, invoice…"
          style={{ ...inpStyle, width:200, marginLeft:8 }} />
        <span style={{ marginLeft:'auto', fontSize:11, color:'#666', fontWeight:600 }}>
          {filtered.length} entries &nbsp;|&nbsp; <strong style={{ color:P }}>₹{fmt(totalAmt)}</strong>
        </span>
      </div>

      <div style={{ display:'flex', gap:8, marginBottom:8 }}>
        {[
          { label:'Total Expenses',  val:`₹${fmt(expenses.reduce((s,e)=>s+(parseFloat(e.grandTotal||e.totalAmount)||0),0))}`, color:P,        bg:'#EEF4FF', border:BD },
          { label:'Pending Amount',  val:`₹${fmt(expenses.filter(e=>e.status==='pending').reduce((s,e)=>s+(parseFloat(e.grandTotal||e.totalAmount)||0),0))}`, color:'#b06000', bg:'#fff8f0', border:'#ffcc80' },
          { label:'Approved Amount', val:`₹${fmt(expenses.filter(e=>e.status==='approved').reduce((s,e)=>s+(parseFloat(e.grandTotal||e.totalAmount)||0),0))}`, color:'#1b5e20', bg:'#f0fff4', border:'#a5d6a7' },
        ].map(c => (
          <div key={c.label} style={{ flex:1, background:c.bg, border:`1px solid ${c.border}`, borderRadius:7, padding:'6px 12px', textAlign:'center' }}>
            <div style={{ fontSize:10, color:'#666', marginBottom:2 }}>{c.label}</div>
            <div style={{ fontSize:14, fontWeight:700, color:c.color }}>{c.val}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ padding:40, textAlign:'center', color:'#888' }}>Loading expenses…</div>
      ) : (
        <div style={{ border:`1px solid ${BD}`, borderRadius:8, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
            <thead>
              <tr style={{ background:P }}>
                {['#','ID','Date','Project','Vendor','Invoice No.','Grand Total','Status','Actions'].map((h,i) => (
                  <th key={i} style={{ padding:'5px 8px', color:'#fff', fontWeight:700, fontSize:10,
                    textAlign:[6].includes(i)?'right':'left', whiteSpace:'nowrap', borderRight:'1px solid rgba(255,255,255,0.15)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={9} style={{ padding:30, textAlign:'center', color:'#888', fontStyle:'italic' }}>No expenses found</td></tr>
              )}
              {filtered.map((e, i) => {
                const sc = STATUS_COLOR[e.status] || STATUS_COLOR.draft;
                const isExp = expanded === e.expenseId;
                const rowBg = i%2===0 ? '#fff' : '#f9fbff';
                return (
                  <React.Fragment key={e.expenseId}>
                    <tr style={{ background: isExp ? '#EEF4FF' : rowBg, cursor:'pointer' }}
                      onMouseEnter={ev => ev.currentTarget.style.background='#EEF4FF'}
                      onMouseLeave={ev => ev.currentTarget.style.background = isExp ? '#EEF4FF' : rowBg}
                      onClick={() => setExpanded(isExp ? null : e.expenseId)}>
                      <td style={{ padding:'4px 8px', color:'#aaa', borderBottom:'1px solid #eee' }}>
                        <span style={{ fontSize:9, marginRight:3 }}>{isExp?'▼':'▶'}</span>{i+1}
                      </td>
                      <td style={{ padding:'4px 8px', borderBottom:'1px solid #eee', fontFamily:'monospace', fontSize:10, color:'#555' }}>EXP-{e.expenseId}</td>
                      <td style={{ padding:'4px 8px', borderBottom:'1px solid #eee', fontWeight:600 }}>{fmtD(e.date)}</td>
                      <td style={{ padding:'4px 8px', borderBottom:'1px solid #eee', fontWeight:600 }}>{e.projectName||'—'}</td>
                      <td style={{ padding:'4px 8px', borderBottom:'1px solid #eee' }}>{e.vendorName||'—'}</td>
                      <td style={{ padding:'4px 8px', borderBottom:'1px solid #eee', fontFamily:'monospace', fontSize:10 }}>{e.invoiceNo||e.voucherNo||'—'}</td>
                      <td style={{ padding:'4px 8px', borderBottom:'1px solid #eee', textAlign:'right', fontWeight:700, color:P, fontSize:12 }}>
                        ₹{fmt(e.grandTotal||e.totalAmount||0)}
                      </td>
                      <td style={{ padding:'4px 8px', borderBottom:'1px solid #eee' }}>
                        <span style={{ fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:4,
                          background:sc.bg, color:sc.color, border:`1px solid ${sc.border}` }}>
                          {e.status||'draft'}
                        </span>
                      </td>
                      <td style={{ padding:'4px 8px', borderBottom:'1px solid #eee' }} onClick={ev=>ev.stopPropagation()}>
                        <div style={{ display:'flex', gap:4 }}>
                          <button onClick={() => navigate(`/account/expense/edit/${e.expenseId}`)}
                            style={{ height:24, padding:'0 8px', fontSize:10, fontWeight:700, cursor:'pointer',
                              background:'#EEF4FF', border:`1px solid ${BD}`, color:P, borderRadius:4, fontFamily:F }}>✏️ Edit</button>
                          {e.status==='pending' && (
                            <button onClick={() => handleApprove(e)}
                              style={{ height:24, padding:'0 8px', fontSize:10, fontWeight:700, cursor:'pointer',
                                background:'#e8f5e9', border:'1px solid #a5d6a7', color:'#1b5e20', borderRadius:4, fontFamily:F }}>✅</button>
                          )}
                          <button onClick={() => handleDelete(e)} disabled={deletingId===e.expenseId}
                            style={{ height:24, padding:'0 8px', fontSize:10, fontWeight:700, cursor:'pointer',
                              background:'#fff3f3', border:'1px solid #ffb3b3', color:'#cc0000', borderRadius:4, fontFamily:F,
                              opacity:deletingId===e.expenseId?0.5:1 }}>
                            {deletingId===e.expenseId?'…':'🗑'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExp && <DetailRow exp={e} />}
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background:'#F0F4FF', fontWeight:700 }}>
                <td colSpan={6} style={{ padding:'5px 8px', textAlign:'right', fontSize:11 }}>Total ({filtered.length}):</td>
                <td style={{ padding:'5px 8px', textAlign:'right', color:P, fontSize:13 }}>₹{fmt(totalAmt)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
