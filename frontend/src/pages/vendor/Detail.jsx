import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';

const F      = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const HDR    = '#2F6FED';
const BD     = '#E5EAF2';
const TAB_BG = '#F5F7FB';

const css = {
  card: {
    background: '#fff', border: `1px solid ${BD}`, borderRadius: 10,
    padding: 0, marginBottom: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden',
  },
  secHead: {
    fontSize: '11px', fontWeight: 700, color: '#fff', textTransform: 'uppercase',
    letterSpacing: '0.7px', background: HDR, padding: '6px 14px', margin: 0,
  },
  fr:  { display: 'flex', alignItems: 'center', minHeight: 28, borderBottom: `1px solid #EEF0F2`, padding: '3px 10px 3px 4px' },
  lbl: { fontSize: 12, fontWeight: 700, color: '#4A5568', fontFamily: F, minWidth: 150, maxWidth: 150, textAlign: 'right', paddingRight: 12, flexShrink: 0 },
  val: { fontSize: 12, fontFamily: F, color: '#1A202C', flex: 1 },
};

const TABS = [
  { id: 'basic',   label: 'Basic Information' },
  { id: 'contact', label: 'Contact Details' },
  { id: 'address', label: 'Address Details' },
  { id: 'tax',     label: 'Tax & Compliance' },
  { id: 'bank',    label: 'Banking Details' },
  { id: 'payment', label: 'Payment & Terms' },
  { id: 'extra',   label: 'Additional Details' },
];

const STATUS_STYLE = {
  approved: { background: '#D1FAE5', color: '#065F46', border: '1px solid #6EE7B7' },
  pending:  { background: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D' },
  draft:    { background: '#F1F5F9', color: '#475569', border: '1px solid #CBD5E1' },
  rejected: { background: '#FEE2E2', color: '#991B1B', border: '1px solid #FCA5A5' },
};

function FRow({ label, value, mono, highlight }) {
  return (
    <div style={css.fr}>
      <label style={css.lbl}>{label}</label>
      <div style={{
        ...css.val,
        fontFamily: mono ? "'Courier New', monospace" : F,
        fontWeight: mono ? 700 : 400,
        background: highlight ? '#FFFBEB' : 'transparent',
        padding: highlight ? '1px 6px' : '0',
        borderRadius: highlight ? 2 : 0,
        letterSpacing: mono ? '0.5px' : 'normal',
      }}>
        {value || <span style={{ color: '#CBD5E1' }}>—</span>}
      </div>
    </div>
  );
}

function InfoPill({ label, value, color }) {
  return (
    <div style={{ padding: '8px 10px', background: '#fff', border: `1px solid ${BD}`, borderRadius: 6 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 3, fontFamily: F }}>{label}</div>
      <div style={{ fontSize: 12, color: color || '#1A202C', fontWeight: color ? 700 : 500, fontFamily: F, wordBreak: 'break-all' }}>{value || '—'}</div>
    </div>
  );
}

const VendorDetail = () => {
  const { vendorId }        = useParams();
  const navigate            = useNavigate();
  const { selectedCompany } = useCompany();

  const [activeTab, setActiveTab] = useState('basic');
  const [loading,   setLoading]   = useState(true);
  const [approving, setApproving] = useState(false);
  const [msg,       setMsg]       = useState(null);
  const [v,         setV]         = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const companyId = selectedCompany?.companyId || '';
        const res = await axios.get(`/api/vendors/${vendorId}?companyId=${companyId}`);
        setV(res.data);
      } catch (err) {
        setMsg({ type: 'error', text: 'Error loading vendor: ' + err.message });
      } finally {
        setLoading(false);
      }
    })();
  }, [vendorId, selectedCompany]);

  const handleApprove = async () => {
    if (!window.confirm('Approve this vendor?')) return;
    setApproving(true);
    try {
      const companyId = selectedCompany?.companyId || '';
      const fd = new FormData();
      const fields = { companyId, vendorName: v.vendorName, vendorCode: String(v.vendorId),
        businessType: v.businessType, industryType: v.industryType, pan: v.pan, gstin: v.gstin,
        gstType: v.gstType || 'Regular', cin: v.cin, msme: v.msme, address: v.address,
        shippingAddr: v.shippingAddr, city: v.city, state: v.state, pincode: v.pincode,
        country: v.country || 'India', gstRegistered: v.gstRegistered !== undefined ? v.gstRegistered : true,
        tdsApplicable: v.tdsApplicable || false, tcsApplicable: v.tcsApplicable || false,
        bankName: v.bankName, accountHolder: v.accountHolder, accountNo: v.accountNo,
        ifsc: v.ifsc, branch: v.branch, upi: v.upi, paymentTerms: v.paymentTerms,
        creditLimit: v.creditLimit, currency: v.currency || 'INR', category: v.category || 'Regular',
        purchasePerson: v.purchasePerson, remarks: v.remarks, website: v.website,
        landline: v.landline, mobile: v.mobile, email: v.email, altMobile: v.altMobile, status: 'approved',
      };
      Object.entries(fields).forEach(([k, val]) => { if (val !== undefined && val !== null) fd.append(k, val); });
      fd.append('contactPersons', JSON.stringify(v.contactPersons || []));
      fd.append('documents',      JSON.stringify(v.documents || []));
      fd.append('paymentModes',   JSON.stringify(Array.isArray(v.paymentModes) ? v.paymentModes : []));

      await axios.put(`/api/vendors/${vendorId}?companyId=${companyId}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setMsg({ type: 'success', text: `Vendor ${vendorId} approved successfully!` });
      setV(prev => ({ ...prev, status: 'approved' }));
      setTimeout(() => navigate('/vendor/pending'), 1800);
    } catch (err) {
      setMsg({ type: 'error', text: 'Approval failed: ' + (err.response?.data?.error || err.message) });
    } finally {
      setApproving(false);
    }
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontFamily: F, color: '#64748B', fontSize: 13 }}>
      Loading vendor data…
    </div>
  );
  if (!v) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontFamily: F, color: '#C53030', fontSize: 13 }}>
      Vendor not found.
    </div>
  );

  const cp0    = (v.contactPersons || [])[0] || {};
  const tabIdx = TABS.findIndex(t => t.id === activeTab);
  const st     = v.status || 'draft';
  const badge  = STATUS_STYLE[st] || STATUS_STYLE.draft;

  return (
    <div style={{ fontFamily: F, color: '#1A202C', display: 'flex', flexDirection: 'column', height: '100%', background: '#EBF0F5' }}>

      {/* ── Page Header ── */}
      <div style={{
        background: HDR, padding: '7px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: `2px solid ${BD}`, flexShrink: 0,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              Vendor Review — {vendorId}
            </div>
            <span style={{ ...badge, fontSize: 10, fontWeight: 700, padding: '2px 10px', borderRadius: 10, textTransform: 'capitalize' }}>
              {st}
            </span>
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', marginTop: 1, fontFamily: F }}>
            {v.vendorName} {v.businessType ? `· ${v.businessType}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => navigate('/vendor/pending')} style={{
            height: 28, padding: '0 14px', background: 'rgba(255,255,255,0.12)',
            border: `1px solid rgba(255,255,255,0.25)`, color: '#fff',
            borderRadius: 2, cursor: 'pointer', fontSize: 12, fontFamily: F, fontWeight: 600,
          }}>← Pending List</button>
          <button onClick={() => navigate(`/vendor/edit/${vendorId}`)} style={{
            height: 28, padding: '0 14px', background: '#fff',
            border: `1px solid ${BD}`, color: HDR,
            borderRadius: 2, cursor: 'pointer', fontSize: 12, fontFamily: F, fontWeight: 700,
          }}>✏ Edit</button>
          {v.status !== 'approved' && (
            <button onClick={handleApprove} disabled={approving} style={{
              height: 28, padding: '0 16px', background: '#16A34A',
              border: '1px solid #15803D', color: '#fff',
              borderRadius: 2, cursor: approving ? 'not-allowed' : 'pointer',
              fontSize: 12, fontFamily: F, fontWeight: 700, opacity: approving ? 0.7 : 1,
            }}>
              {approving ? 'Approving…' : '✓ Approve Vendor'}
            </button>
          )}
          {v.status === 'approved' && (
            <div style={{ height: 28, padding: '0 14px', background: '#D1FAE5', border: '1px solid #6EE7B7', color: '#065F46', borderRadius: 2, fontSize: 12, fontFamily: F, fontWeight: 700, display: 'flex', alignItems: 'center' }}>
              ✓ Approved
            </div>
          )}
        </div>
      </div>

      {/* ── Status Message ── */}
      {msg && (
        <div style={{
          margin: '8px 10px 0', padding: '6px 12px', borderRadius: 2, fontSize: 12, fontFamily: F,
          background: msg.type === 'error' ? '#FEE2E2' : '#D1FAE5',
          border: `1px solid ${msg.type === 'error' ? '#FCA5A5' : '#6EE7B7'}`,
          color: msg.type === 'error' ? '#991B1B' : '#065F46',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
        </div>
      )}

      {/* ── Tab Bar ── */}
      <div style={{
        background: TAB_BG, borderBottom: `1px solid ${BD}`,
        display: 'flex', flexWrap: 'nowrap', overflowX: 'auto',
        padding: '4px 8px 0', gap: 2, flexShrink: 0,
      }}>
        {TABS.map(t => {
          const active = activeTab === t.id;
          return (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              fontFamily: F, fontSize: 12, fontWeight: active ? 700 : 400,
              color: active ? HDR : '#4A5568',
              background: active ? '#fff' : 'transparent',
              border: active ? `1px solid ${BD}` : '1px solid transparent',
              borderBottom: active ? '1px solid #fff' : 'none',
              marginBottom: active ? -1 : 0, padding: '5px 14px',
              cursor: 'pointer', whiteSpace: 'nowrap',
              borderRadius: '3px 3px 0 0',
              position: 'relative', zIndex: active ? 1 : 0, flexShrink: 0,
              transition: 'color 0.12s',
            }}>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── Content Area ── */}
      <div style={{ background: '#EBF0F5', border: `1px solid ${BD}`, borderTop: 'none', padding: '10px', flex: 1, overflowY: 'auto' }}>

        {/* ══ TAB 1: Basic Information ══ */}
        {activeTab === 'basic' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={css.card}>
              <div style={css.secHead}>Vendor Identity</div>
              <FRow label="Vendor Name"   value={v.vendorName} />
              <FRow label="Vendor ID"     value={String(v.vendorId)} mono highlight />
              <FRow label="Business Type" value={v.businessType} />
              <FRow label="Industry Type" value={v.industryType} />
            </div>
            <div style={css.card}>
              <div style={css.secHead}>Tax Identity</div>
              <FRow label="PAN Number"   value={v.pan}   mono />
              <FRow label="GST Number"   value={v.gstin} mono />
              <FRow label="CIN Number"   value={v.cin}   mono />
              <FRow label="MSME / Udyam" value={v.msme} />
            </div>
          </div>
        )}

        {/* ══ TAB 2: Contact Details ══ */}
        {activeTab === 'contact' && (
          <div style={{ maxWidth: 640 }}>
            <div style={css.card}>
              <div style={css.secHead}>Contact Information</div>
              <FRow label="Contact Person"  value={cp0.name         || v.contactPerson} />
              <FRow label="Mobile Number"   value={cp0.mobileNumber || v.mobile}        mono />
              <FRow label="Alternate Mobile" value={cp0.altMobile   || v.altMobile}     mono />
              <FRow label="Email ID"        value={cp0.email        || v.email} />
              <FRow label="Landline"        value={cp0.landline     || v.landline} />
              <FRow label="Website"         value={v.website} />
            </div>
          </div>
        )}

        {/* ══ TAB 3: Address Details ══ */}
        {activeTab === 'address' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={css.card}>
              <div style={css.secHead}>Billing Address</div>
              <FRow label="Address"  value={v.address || v.billingAddr} />
              <FRow label="State"    value={v.state} />
              <FRow label="City"     value={v.city} />
              <FRow label="Pincode"  value={v.pincode} mono />
              <FRow label="Country"  value={v.country || 'India'} />
            </div>
            <div style={css.card}>
              <div style={css.secHead}>Shipping / Delivery Address</div>
              <FRow label="Address" value={v.shippingAddr || '(Same as billing)'} />
            </div>
          </div>
        )}

        {/* ══ TAB 4: Tax & Compliance ══ */}
        {activeTab === 'tax' && (
          <div style={{ maxWidth: 640 }}>
            <div style={css.card}>
              <div style={css.secHead}>GST & Compliance</div>
              <FRow label="GST Registered" value={v.gstRegistered ? '✓ Yes' : 'No'} />
              <FRow label="GST Type"       value={v.gstType} />
              <FRow label="TDS Applicable" value={v.tdsApplicable ? '✓ Yes' : 'No'} />
            </div>
            {(v.documents || []).length > 0 && (
              <div style={css.card}>
                <div style={css.secHead}>Documents</div>
                {(v.documents || []).map((d, i) => (
                  <div key={i} style={css.fr}>
                    <label style={css.lbl}>Document {i + 1}</label>
                    <div style={css.val}>{d.name || d.fileName || '—'}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══ TAB 5: Banking Details ══ */}
        {activeTab === 'bank' && (
          <div style={{ maxWidth: 640 }}>
            <div style={css.card}>
              <div style={css.secHead}>Bank Account Information</div>
              <FRow label="Bank Name"      value={v.bankName} />
              <FRow label="Account Holder" value={v.accountHolder} />
              <FRow label="Account Number" value={v.accountNo || v.bankAccount} mono />
              <FRow label="IFSC Code"      value={v.ifsc || v.bankIfsc}         mono />
              <FRow label="Branch Name"    value={v.branch || v.bankBranch} />
              <FRow label="UPI ID"         value={v.upi} />
            </div>
            <div style={{ padding: '8px 12px', background: '#FFFBEB', border: `1px solid #FCD34D`, borderLeft: `3px solid #F59E0B`, fontSize: 12, color: '#92400E', display: 'flex', gap: 8, alignItems: 'center', fontFamily: F }}>
              <span>⚠️</span><span>Verify all bank details carefully before approving this vendor.</span>
            </div>
          </div>
        )}

        {/* ══ TAB 6: Payment & Terms ══ */}
        {activeTab === 'payment' && (
          <div style={{ maxWidth: 640 }}>
            <div style={css.card}>
              <div style={css.secHead}>Payment Configuration</div>
              <FRow label="Payment Terms" value={v.paymentTerms} />
              <FRow label="Currency"      value={v.currency} />
              <FRow label="Credit Limit"  value={v.creditLimit ? `₹ ${Number(v.creditLimit).toLocaleString('en-IN')}` : ''} />
              <div style={css.fr}>
                <label style={css.lbl}>Payment Modes</label>
                <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 4, padding: '3px 0' }}>
                  {(Array.isArray(v.paymentModes) ? v.paymentModes : []).length === 0
                    ? <span style={{ color: '#CBD5E1', fontSize: 12, fontFamily: F }}>—</span>
                    : (Array.isArray(v.paymentModes) ? v.paymentModes : []).map(m => (
                        <span key={m} style={{ padding: '2px 9px', background: '#D6E4F0', border: `1px solid ${BD}`, color: HDR, borderRadius: 10, fontSize: 11, fontWeight: 700, fontFamily: F }}>{m}</span>
                      ))
                  }
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ TAB 7: Additional Details ══ */}
        {activeTab === 'extra' && (
          <div style={{ maxWidth: 640 }}>
            <div style={css.card}>
              <div style={css.secHead}>Classification & Assignment</div>
              <FRow label="Vendor Category" value={v.category} />
              <FRow label="Purchase Person" value={v.purchasePerson} />
              <FRow label="Remarks"         value={v.remarks} />
            </div>
            <div style={css.card}>
              <div style={css.secHead}>Quick Review</div>
              <div style={{ padding: '8px 10px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {[
                  ['Vendor Name',  v.vendorName],
                  ['Vendor Code',  String(v.vendorId)],
                  ['Business',     v.businessType],
                  ['Mobile',       cp0.mobileNumber || v.mobile],
                  ['GST',          v.gstin],
                  ['State',        v.state],
                  ['Pay Terms',    v.paymentTerms],
                  ['Category',     v.category],
                  ['GST Type',     v.gstType],
                ].map(([label, val]) => (
                  <InfoPill key={label} label={label} value={val} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '6px 12px', background: TAB_BG, borderTop: `1px solid ${BD}`, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#5A6475', fontFamily: F }}>
            Step {tabIdx + 1} of {TABS.length} — <strong>{TABS[tabIdx]?.label}</strong>
          </span>
          {tabIdx > 0 && (
            <button type="button" onClick={() => setActiveTab(TABS[tabIdx - 1].id)}
              style={{ padding: '3px 12px', background: '#fff', border: `1px solid ${BD}`, color: HDR, borderRadius: 2, cursor: 'pointer', fontSize: 12, fontFamily: F, fontWeight: 600 }}>
              ◀ Prev
            </button>
          )}
          {tabIdx < TABS.length - 1 && (
            <button type="button" onClick={() => setActiveTab(TABS[tabIdx + 1].id)}
              style={{ padding: '3px 12px', background: '#fff', border: `1px solid ${BD}`, color: HDR, borderRadius: 2, cursor: 'pointer', fontSize: 12, fontFamily: F, fontWeight: 600 }}>
              Next ▶
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button type="button" onClick={() => navigate('/vendor/pending')} style={{
            padding: '3px 14px', background: '#fff', border: `1px solid ${BD}`, color: '#4A5568',
            borderRadius: 2, cursor: 'pointer', fontSize: 12, fontFamily: F,
          }}>← Pending List</button>
          <button type="button" onClick={() => navigate(`/vendor/edit/${vendorId}`)} style={{
            padding: '3px 14px', background: '#fff', border: `1px solid ${HDR}`, color: HDR,
            borderRadius: 2, cursor: 'pointer', fontSize: 12, fontFamily: F, fontWeight: 700,
          }}>✏ Edit</button>
          {v.status !== 'approved' && (
            <button type="button" onClick={handleApprove} disabled={approving} style={{
              padding: '3px 16px', background: '#16A34A', border: '1px solid #15803D', color: '#fff',
              borderRadius: 2, cursor: approving ? 'not-allowed' : 'pointer',
              fontSize: 12, fontFamily: F, fontWeight: 700, opacity: approving ? 0.7 : 1,
            }}>
              {approving ? 'Approving…' : '✓ Approve Vendor'}
            </button>
          )}
          {v.status === 'approved' && (
            <div style={{ padding: '3px 14px', background: '#D1FAE5', border: '1px solid #6EE7B7', color: '#065F46', borderRadius: 2, fontSize: 12, fontFamily: F, fontWeight: 700 }}>
              ✓ Already Approved
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VendorDetail;
