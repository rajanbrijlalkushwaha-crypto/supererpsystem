import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/permissions';

const F      = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const HDR    = '#104f4f';
const BD     = '#E5EAF2';
const TAB_BG = '#F5F7FB';

const PendingVendors = () => {
  const { user } = useAuth();
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [search,  setSearch]  = useState('');
  const [busy,    setBusy]    = useState({});
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();

  useEffect(() => { fetchVendors(); }, [selectedCompany]);

  const fetchVendors = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`/api/vendors?companyId=${selectedCompany?.companyId || ''}`);
      setVendors(res.data.filter(v => v.status === 'pending'));
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (vendorId) => {
    if (!window.confirm('Approve this vendor?')) return;
    setBusy(b => ({ ...b, [vendorId]: 'approving' }));
    try {
      const companyId = selectedCompany?.companyId || '';
      const res = await axios.get(`/api/vendors/${vendorId}?companyId=${companyId}`);
      const v = res.data;
      const fd = new FormData();
      const fields = ['vendorName','businessType','industryType','pan','gstin','gstType','cin','msme',
        'address','shippingAddr','city','state','pincode','country','gstRegistered','tcsApplicable',
        'bankName','accountHolder','accountNo','ifsc','branch','upi',
        'paymentTerms','creditLimit','currency','category','purchasePerson','remarks','website','landline'];
      fields.forEach(k => { if (v[k] !== undefined && v[k] !== null) fd.append(k, v[k]); });
      fd.append('status', 'approved');
      fd.append('contactPersons', JSON.stringify(v.contactPersons || []));
      fd.append('documents', JSON.stringify(v.documents || []));
      await axios.put(`/api/vendors/${vendorId}?companyId=${companyId}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setMessage(`✓ Vendor ${vendorId} approved successfully.`);
      fetchVendors();
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setBusy(b => { const n = { ...b }; delete n[vendorId]; return n; });
    }
  };

  const handleReject = async (vendorId) => {
    if (!window.confirm('Reject and delete this vendor submission?')) return;
    setBusy(b => ({ ...b, [vendorId]: 'rejecting' }));
    try {
      await axios.delete(`/api/vendors/${vendorId}?companyId=${selectedCompany?.companyId || ''}`);
      setMessage(`Vendor ${vendorId} rejected and removed.`);
      fetchVendors();
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setBusy(b => { const n = { ...b }; delete n[vendorId]; return n; });
    }
  };

  const filtered = vendors.filter(v => {
    const q = search.toLowerCase();
    return (
      String(v.vendorId).includes(q) ||
      (v.vendorName || '').toLowerCase().includes(q) ||
      (v.businessType || '').toLowerCase().includes(q) ||
      (v.contactPerson || v.contactPersons?.[0]?.name || '').toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ fontFamily: F, display: 'flex', flexDirection: 'column', height: '100%', background: '#EBF0F5' }}>

      {/* ── Page Header ── */}
      <div style={{
        background: HDR, padding: '8px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: `2px solid ${BD}`, flexShrink: 0,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              Vendor Approval Queue
            </div>
            {vendors.length > 0 && (
              <span style={{ background: '#F59E0B', color: '#fff', fontSize: 10, fontWeight: 800, padding: '1px 8px', borderRadius: 10 }}>
                {vendors.length} pending
              </span>
            )}
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', marginTop: 1 }}>
            Review and approve vendor registrations
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>🔍</span>
            <input
              type="text" value={search} placeholder="Search…"
              onChange={e => setSearch(e.target.value)}
              style={{
                height: 28, padding: '0 10px 0 28px', background: 'rgba(255,255,255,0.12)',
                border: `1px solid rgba(255,255,255,0.25)`, borderRadius: 2,
                color: '#fff', fontSize: 12, fontFamily: F, outline: 'none', width: 180,
              }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{
                position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)',
                cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1,
              }}>✕</button>
            )}
          </div>
          <button onClick={() => navigate('/vendor/view')} style={{
            height: 28, padding: '0 14px', background: 'rgba(255,255,255,0.12)', border: `1px solid rgba(255,255,255,0.25)`,
            color: '#fff', borderRadius: 2, cursor: 'pointer', fontSize: 12, fontFamily: F, fontWeight: 600,
          }}>← All Vendors</button>
          <button onClick={fetchVendors} title="Refresh" style={{
            height: 28, width: 28, background: 'rgba(255,255,255,0.12)', border: `1px solid rgba(255,255,255,0.25)`,
            color: '#fff', borderRadius: 2, cursor: 'pointer', fontSize: 14,
          }}>↻</button>
        </div>
      </div>

      {/* ── Message ── */}
      {message && (
        <div style={{
          margin: '8px 10px 0', padding: '6px 12px', borderRadius: 2, fontSize: 12, fontFamily: F,
          background: message.includes('Error') ? '#FEE2E2' : '#D1FAE5',
          border: `1px solid ${message.includes('Error') ? '#FCA5A5' : '#6EE7B7'}`,
          color: message.includes('Error') ? '#991B1B' : '#065F46',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>{message}</span>
          <button onClick={() => setMessage('')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
        </div>
      )}

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748B', fontSize: 13, fontFamily: F }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748B', fontSize: 13, fontFamily: F }}>
            {search ? `No vendors match "${search}"` : (
              <div>
                <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                <div style={{ fontWeight: 700 }}>All clear!</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>No vendors pending approval.</div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ background: '#fff', border: `1px solid ${BD}`, borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: F }}>
              <thead>
                <tr>
                  {['Vendor ID','Vendor Name','Business Type','Contact Person','Mobile','GST No.','Actions'].map(h => (
                    <th key={h} style={{
                      padding: '7px 10px', fontSize: 11, fontWeight: 700, color: '#fff',
                      background: HDR, textAlign: h === 'Actions' ? 'center' : 'left',
                      borderRight: `1px solid rgba(255,255,255,0.12)`, fontFamily: F,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((v, i) => {
                  const contact = v.contactPersons?.[0] || {};
                  const isBusy = !!busy[v.vendorId];
                  return (
                    <tr key={v.vendorId}
                      style={{ background: i % 2 === 0 ? '#fff' : '#F8FAFC', borderBottom: `1px solid #EEF0F2` }}
                      onMouseEnter={e => e.currentTarget.style.background = '#EBF0F5'}
                      onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#F8FAFC'}
                    >
                      <td style={{ padding: '7px 10px', fontWeight: 700, color: HDR, whiteSpace: 'nowrap' }}>
                        <span onClick={() => navigate(`/vendor/detail/${v.vendorId}`)}
                          style={{ cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted' }}>
                          {v.vendorId}
                        </span>
                      </td>
                      <td style={{ padding: '7px 10px', fontWeight: 600, color: '#1E293B' }}>
                        <span onClick={() => navigate(`/vendor/detail/${v.vendorId}`)}
                          style={{ cursor: 'pointer', color: HDR }}>
                          {v.vendorName || '—'}
                        </span>
                      </td>
                      <td style={{ padding: '7px 10px', color: '#475569' }}>{v.businessType || '—'}</td>
                      <td style={{ padding: '7px 10px', color: '#475569' }}>{contact.name || v.contactPerson || '—'}</td>
                      <td style={{ padding: '7px 10px', color: '#475569' }}>{contact.mobileNumber || v.mobile || '—'}</td>
                      <td style={{ padding: '7px 10px', color: '#475569', fontFamily: 'monospace', fontSize: 11 }}>{v.gstin || '—'}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: 4 }}>
                          {can(user,'vendor','approve') && <button onClick={() => handleApprove(v.vendorId)} disabled={isBusy} style={{
                            padding: '3px 12px', fontSize: 11, fontFamily: F, fontWeight: 700,
                            background: '#D1FAE5', border: '1px solid #6EE7B7', color: '#065F46',
                            borderRadius: 2, cursor: isBusy ? 'not-allowed' : 'pointer', opacity: isBusy ? 0.6 : 1,
                          }}>
                            {busy[v.vendorId] === 'approving' ? '…' : '✓ Approve'}
                          </button>}
                          <button onClick={() => navigate(`/vendor/edit/${v.vendorId}`)} disabled={isBusy} style={{
                            padding: '3px 10px', fontSize: 11, fontFamily: F, fontWeight: 600,
                            background: '#EBF0F5', border: `1px solid ${BD}`, color: HDR,
                            borderRadius: 2, cursor: 'pointer',
                          }}>✏ Edit</button>
                          {can(user,'vendor','approve') && <button onClick={() => handleReject(v.vendorId)} disabled={isBusy} style={{
                            padding: '3px 10px', fontSize: 11, fontFamily: F, fontWeight: 600,
                            background: '#FEE2E2', border: '1px solid #FCA5A5', color: '#991B1B',
                            borderRadius: 2, cursor: isBusy ? 'not-allowed' : 'pointer', opacity: isBusy ? 0.6 : 1,
                          }}>
                            {busy[v.vendorId] === 'rejecting' ? '…' : '✕ Reject'}
                          </button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{
              padding: '6px 12px', background: TAB_BG, borderTop: `1px solid ${BD}`,
              fontSize: 11, color: '#5A6475', fontFamily: F,
            }}>
              {filtered.length} of {vendors.length} pending vendor{vendors.length !== 1 ? 's' : ''} shown
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PendingVendors;
