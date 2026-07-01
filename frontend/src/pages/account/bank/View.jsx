import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../../../context/CompanyContext';

const P  = '#104f4f';
const PD = '#0b3d3d';
const BG = '#F5F7FB';
const BD = '#E5EAF2';
const F  = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const fmt = n => (parseFloat(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

const ViewBanks = () => {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  useEffect(() => { if (cid) fetchData(); }, [cid]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`/api/accounts/banks?companyId=${cid}`);
      setRecords(res.data);
    } catch (e) { setMessage('Error: ' + e.message); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this bank account?')) return;
    try {
      await axios.delete(`/api/accounts/banks/${id}?companyId=${cid}`);
      fetchData();
    } catch (e) { setMessage('Error: ' + e.message); }
  };

  const totalBalance = records.reduce((s, r) => s + (parseFloat(r.currentBalance) || 0), 0);

  const th = { padding:'9px 12px', background:P, color:'#fff', fontSize:11, fontWeight:700,
    textAlign:'left', border:`1px solid ${PD}`, whiteSpace:'nowrap', fontFamily:F, letterSpacing:'0.3px' };
  const td = { padding:'10px 12px', fontSize:12, fontFamily:F, border:`1px solid ${BD}`, verticalAlign:'middle' };

  return (
    <div style={{ background:BG, minHeight:'100%', fontFamily:F }}>

      {/* Header */}
      <div style={{ background:P, padding:'14px 20px',
        display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.6px' }}>
            Finance
          </div>
          <div style={{ fontSize:15, fontWeight:800, color:'#fff', letterSpacing:'-0.2px' }}>
            Bank Accounts
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={fetchData}
            style={{ height:32, padding:'0 14px', fontSize:12, fontFamily:F, cursor:'pointer',
              background:'rgba(255,255,255,0.12)', color:'#fff',
              border:'1px solid rgba(255,255,255,0.25)', borderRadius:6, fontWeight:600 }}>
            ↻ Refresh
          </button>
          <button onClick={() => navigate('/account/bank/create')}
            style={{ height:32, padding:'0 16px', fontSize:12, fontFamily:F, cursor:'pointer',
              background:'#fff', color:P, border:'none', borderRadius:6, fontWeight:800 }}>
            + Add Bank
          </button>
        </div>
      </div>

      {/* Total balance strip */}
      <div style={{ background:'#fff', borderBottom:`1px solid ${BD}`, padding:'12px 20px',
        display:'flex', alignItems:'center', gap:24 }}>
        <div>
          <div style={{ fontSize:11, color:'#6B7280', fontWeight:600, marginBottom:2 }}>Total Balance</div>
          <div style={{ fontSize:22, fontWeight:800, color: totalBalance >= 0 ? '#059669' : '#DC2626' }}>
            ₹{fmt(totalBalance)}
          </div>
        </div>
        <div style={{ width:1, height:36, background:BD }} />
        <div>
          <div style={{ fontSize:11, color:'#6B7280', fontWeight:600, marginBottom:2 }}>Accounts</div>
          <div style={{ fontSize:22, fontWeight:800, color:P }}>{records.length}</div>
        </div>
        <div style={{ width:1, height:36, background:BD }} />
        <div>
          <div style={{ fontSize:11, color:'#6B7280', fontWeight:600, marginBottom:2 }}>Active</div>
          <div style={{ fontSize:22, fontWeight:800, color:'#059669' }}>{records.filter(r => r.status === 'active').length}</div>
        </div>
      </div>

      {message && (
        <div style={{ margin:'10px 16px 0', padding:'8px 14px', fontSize:12, fontFamily:F,
          background:'#FEF2F2', color:'#DC2626', border:'1px solid #FECACA', borderRadius:6 }}>
          {message}
          <button onClick={() => setMessage('')}
            style={{ float:'right', background:'none', border:'none', cursor:'pointer', fontSize:14, color:'#DC2626' }}>✕</button>
        </div>
      )}

      <div style={{ padding:'12px 16px' }}>
        {loading ? (
          <div style={{ textAlign:'center', padding:'60px 0', color:'#9CA3AF', fontSize:14, fontFamily:F }}>
            Loading bank accounts…
          </div>
        ) : records.length === 0 ? (
          <div style={{ textAlign:'center', padding:'60px 20px', background:'#fff',
            borderRadius:8, border:`1px solid ${BD}`, color:'#9CA3AF' }}>
            <div style={{ fontSize:48, marginBottom:12 }}>🏦</div>
            <div style={{ fontSize:14, fontWeight:600, marginBottom:8 }}>No bank accounts found</div>
            <button onClick={() => navigate('/account/bank/create')}
              style={{ padding:'8px 20px', background:P, color:'#fff', border:'none',
                borderRadius:7, cursor:'pointer', fontSize:13, fontFamily:F, fontWeight:700 }}>
              + Add Bank Account
            </button>
          </div>
        ) : (
          <div style={{ background:'#fff', borderRadius:8, border:`1px solid ${BD}`,
            boxShadow:'0 1px 3px rgba(0,0,0,0.06)', overflow:'hidden' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, fontFamily:F }}>
              <thead>
                <tr>
                  <th style={th}>ID</th>
                  <th style={th}>Bank Name</th>
                  <th style={th}>Account Holder</th>
                  <th style={th}>Account No.</th>
                  <th style={th}>IFSC</th>
                  <th style={th}>Type</th>
                  <th style={{ ...th, textAlign:'right' }}>Opening (₹)</th>
                  <th style={{ ...th, textAlign:'right' }}>Current Balance (₹)</th>
                  <th style={{ ...th, textAlign:'center' }}>Status</th>
                  <th style={{ ...th, textAlign:'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => {
                  const bal = parseFloat(r.currentBalance) || 0;
                  return (
                    <tr key={r.bankId}
                      style={{ background: i%2===0 ? '#fff' : '#FAFBFC', transition:'background 0.12s' }}
                      onMouseEnter={e => e.currentTarget.style.background='#EEF4FF'}
                      onMouseLeave={e => e.currentTarget.style.background = i%2===0?'#fff':'#FAFBFC'}>
                      <td style={{ ...td, color:'#9CA3AF', fontSize:11 }}>{r.bankId}</td>
                      <td style={{ ...td, fontWeight:700, color:'#111827' }}>{r.bankName}</td>
                      <td style={{ ...td, color:'#374151' }}>{r.accountHolder || '—'}</td>
                      <td style={{ ...td, fontFamily:'monospace', fontWeight:600, color:P, letterSpacing:'0.5px' }}>{r.accountNumber}</td>
                      <td style={{ ...td, fontFamily:'monospace', fontSize:11, color:'#6B7280' }}>{r.ifscCode || '—'}</td>
                      <td style={td}>
                        <span style={{ fontSize:11, padding:'2px 9px', borderRadius:20,
                          background:'#EFF6FF', color:'#104f4f', fontWeight:700, border:'1px solid #BFDBFE' }}>
                          {r.accountType}
                        </span>
                      </td>
                      <td style={{ ...td, textAlign:'right', color:'#6B7280' }}>₹{fmt(r.openingBalance)}</td>
                      <td style={{ ...td, textAlign:'right', fontWeight:800,
                        color: bal >= 0 ? '#059669' : '#DC2626', fontSize:13 }}>
                        ₹{fmt(bal)}
                      </td>
                      <td style={{ ...td, textAlign:'center' }}>
                        <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px',
                          borderRadius:20, fontSize:11, fontWeight:700,
                          background: r.status==='active' ? '#ECFDF5' : '#FEF2F2',
                          color: r.status==='active' ? '#059669' : '#DC2626',
                          border:`1px solid ${r.status==='active' ? '#A7F3D0' : '#FECACA'}` }}>
                          <span style={{ width:5, height:5, borderRadius:'50%',
                            background: r.status==='active' ? '#059669' : '#DC2626' }} />
                          {r.status}
                        </span>
                      </td>
                      <td style={{ ...td, textAlign:'center' }}>
                        <button onClick={() => handleDelete(r.bankId)}
                          style={{ padding:'4px 12px', fontSize:11, cursor:'pointer', fontFamily:F, fontWeight:600,
                            background:'#FEF2F2', color:'#DC2626', border:'1px solid #FECACA', borderRadius:5 }}>
                          🗑️ Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background:'#F0F4FF' }}>
                  <td colSpan={7} style={{ padding:'10px 12px', textAlign:'right', fontWeight:700, color:'#374151',
                    border:`1px solid ${BD}`, fontSize:12 }}>
                    Total Balance ({records.length} account{records.length!==1?'s':''}):
                  </td>
                  <td style={{ padding:'10px 12px', textAlign:'right', fontWeight:800, fontSize:14,
                    color: totalBalance>=0 ? '#059669' : '#DC2626', border:`1px solid ${BD}` }}>
                    ₹{fmt(totalBalance)}
                  </td>
                  <td colSpan={2} style={{ border:`1px solid ${BD}` }} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ViewBanks;
