import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { printVendorDetails } from '../../utils/printVendor';
import ActivityDrawer from '../../components/ActivityDrawer';

const F      = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const HDR    = '#104f4f';
const BD     = '#E5EAF2';
const TAB_BG = '#F5F7FB';
const getFY = d => { if(!d) return null; const dt=new Date(d); if(isNaN(dt)) return null; const y=dt.getFullYear(),m=dt.getMonth()+1,s=m>=4?y:y-1; return `${String(s).slice(2)}-${String(s+1).slice(2)}`; };
const fmtD2 = d => { if(!d) return '—'; const dt=new Date(d); return isNaN(dt)?d:`${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`; };

const STATUS_STYLE = {
  approved: { background: '#D1FAE5', color: '#065F46', border: '1px solid #6EE7B7' },
  pending:  { background: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D' },
  draft:    { background: '#F1F5F9', color: '#475569', border: '1px solid #CBD5E1' },
};

/* ── Vendor Detail Modal ── */
const VendorDetailModal = ({ vendor, company, onClose, onEdit }) => {
  if (!vendor) return null;
  const contact = vendor.contactPersons?.[0] || {};
  const st    = vendor.status || 'draft';
  const badge = STATUS_STYLE[st] || STATUS_STYLE.draft;

  const Field = ({ label, value }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
      <span style={{ fontSize: 12, color: '#1E293B', fontWeight: 500 }}>{value || '—'}</span>
    </div>
  );

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(2px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: 12, width: 620, maxHeight: '85vh',
        overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        display: 'flex', flexDirection: 'column', fontFamily: F,
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #104f4f, #0b3d3d)',
          padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{vendor.vendorName || 'Vendor Detail'}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
              ID: {vendor.vendorId} &nbsp;|&nbsp;
              <span style={{ ...badge, padding: '1px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700 }}>{st}</span>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
            color: '#fff', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', fontSize: 14,
          }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: 20, flex: 1 }}>
          {/* Core Info */}
          <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${BD}` }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: HDR, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 10 }}>Business Info</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px' }}>
              <Field label="Vendor Name"    value={vendor.vendorName} />
              <Field label="Business Type"  value={vendor.businessType} />
              <Field label="GSTIN"          value={vendor.gstin} />
              <Field label="PAN"            value={vendor.pan} />
              <Field label="Opening Balance" value={vendor.openingBalance ? `₹${Number(vendor.openingBalance).toLocaleString('en-IN')}` : null} />
              <Field label="Credit Period"  value={vendor.creditPeriod ? `${vendor.creditPeriod} days` : null} />
            </div>
          </div>

          {/* Address */}
          <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${BD}` }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: HDR, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 10 }}>Address</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px' }}>
              <Field label="Address Line 1" value={vendor.addressLine1} />
              <Field label="Address Line 2" value={vendor.addressLine2} />
              <Field label="City"           value={vendor.city} />
              <Field label="State"          value={vendor.state} />
              <Field label="Pincode"        value={vendor.pincode} />
              <Field label="Country"        value={vendor.country} />
            </div>
          </div>

          {/* Contact */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: HDR, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 10 }}>Contact</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px' }}>
              <Field label="Contact Person" value={contact.name || vendor.contactPerson} />
              <Field label="Designation"    value={contact.designation} />
              <Field label="Mobile"         value={contact.mobileNumber || vendor.mobile} />
              <Field label="Email"          value={contact.email || vendor.email} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px', borderTop: `1px solid ${BD}`, background: TAB_BG,
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          <button onClick={onClose} style={{
            padding: '6px 16px', fontSize: 12, fontFamily: F, fontWeight: 600,
            background: '#fff', border: `1px solid ${BD}`, color: '#475569',
            borderRadius: 6, cursor: 'pointer',
          }}>Close</button>
          <button onClick={() => printVendorDetails(vendor, company)} style={{
            padding: '6px 16px', fontSize: 12, fontFamily: F, fontWeight: 600,
            background: '#F0FDF4', border: '1px solid #86EFAC', color: '#104f4f',
            borderRadius: 6, cursor: 'pointer',
          }}>🖨 Print</button>
          <button onClick={onEdit} style={{
            padding: '6px 16px', fontSize: 12, fontFamily: F, fontWeight: 600,
            background: HDR, border: 'none', color: '#fff',
            borderRadius: 6, cursor: 'pointer',
          }}>✏ Edit Vendor</button>
        </div>
      </div>
    </div>
  );
};

/* ── Main Component ── */
const ViewVendors = () => {
  const [vendors,    setVendors]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [message,    setMessage]    = useState('');
  const [search,     setSearch]     = useState('');
  const [sortCol,    setSortCol]    = useState('vendorId');
  const [sortDir,    setSortDir]    = useState('asc');
  const [selected,   setSelected]   = useState(new Set());
  const [viewVendor, setViewVendor] = useState(null);
  const [deleting,   setDeleting]   = useState(false);
  const [hoveredId,  setHoveredId]  = useState(null);
  const [activityRec, setActivityRec] = useState(null);
  const [fy,         setFy]         = useState('all');
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();

  useEffect(() => { fetchVendors(); }, [selectedCompany]);

  const fetchVendors = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`/api/vendors?companyId=${selectedCompany?.companyId || ''}`);
      setVendors(res.data);
      setSelected(new Set());
    } catch (err) {
      setMessage('Error fetching vendors: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (vendorId) => {
    if (!window.confirm('Delete this vendor? This action cannot be undone.')) return;
    try {
      await axios.delete(`/api/vendors/${vendorId}?companyId=${selectedCompany?.companyId || ''}`);
      setMessage('Vendor deleted successfully.');
      fetchVendors();
    } catch (err) {
      setMessage('Error deleting vendor: ' + err.message);
    }
  };

  const handleDeleteSelected = async () => {
    if (!window.confirm(`Delete ${selected.size} selected vendor${selected.size > 1 ? 's' : ''}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await Promise.all([...selected].map(id =>
        axios.delete(`/api/vendors/${id}?companyId=${selectedCompany?.companyId || ''}`)
      ));
      setMessage(`${selected.size} vendor${selected.size > 1 ? 's' : ''} deleted.`);
      fetchVendors();
    } catch (err) {
      setMessage('Error deleting vendors: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(v => v.vendorId)));
  };

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  const fyList = useMemo(() => {
    const set = new Set();
    vendors.forEach(v => { const f = getFY(v.createdAt); if (f) set.add(f); });
    return Array.from(set).sort().reverse();
  }, [vendors]);

  const filtered = vendors
    .filter(v => {
      const q = search.toLowerCase();
      const matchQ = (
        String(v.vendorId).includes(q) ||
        (v.vendorName || '').toLowerCase().includes(q) ||
        (v.gstin || '').toLowerCase().includes(q) ||
        (v.city || '').toLowerCase().includes(q) ||
        (v.state || '').toLowerCase().includes(q) ||
        (v.contactPerson || v.contactPersons?.[0]?.name || '').toLowerCase().includes(q)
      );
      const matchFY = fy === 'all' || getFY(v.createdAt) === fy;
      return matchQ && matchFY;
    })
    .sort((a, b) => {
      const va = String(a[sortCol] || '').toLowerCase();
      const vb = String(b[sortCol] || '').toLowerCase();
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    });

  const SortTh = ({ col, children, style = {} }) => (
    <th onClick={() => toggleSort(col)} style={{
      padding: '7px 10px', fontSize: 11, fontWeight: 700, color: '#fff',
      background: sortCol === col ? '#0b3d3d' : HDR,
      textAlign: 'left', cursor: 'pointer', whiteSpace: 'nowrap',
      borderRight: `1px solid rgba(255,255,255,0.12)`, userSelect: 'none',
      fontFamily: F, ...style,
    }}>
      {children} {sortCol === col ? (sortDir === 'asc' ? '▲' : '▼') : <span style={{ opacity: 0.3 }}>⇅</span>}
    </th>
  );

  const allSelected = filtered.length > 0 && selected.size === filtered.length;
  const selCount = selected.size;
  const selOne = selCount === 1 ? vendors.find(v => v.vendorId === [...selected][0]) : null;

  return (
    <div style={{ fontFamily: F, display: 'flex', flexDirection: 'column', height: '100%', background: '#EBF0F5' }}>

      {/* Modal */}
      {viewVendor && (
        <VendorDetailModal
          vendor={viewVendor}
          company={selectedCompany}
          onClose={() => setViewVendor(null)}
          onEdit={() => { navigate(`/vendor/edit/${viewVendor.vendorId}`); setViewVendor(null); }}
        />
      )}

      {/* ── Page Header ── */}
      <div style={{
        background: HDR, padding: '8px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: `2px solid ${BD}`, flexShrink: 0, flexWrap: 'wrap', gap: 6,
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
            Vendor Master
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', marginTop: 1 }}>
            {vendors.length} vendor{vendors.length !== 1 ? 's' : ''} registered
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>

          {/* ── Selection Action Bar (appears at top when rows are selected) ── */}
          {selCount > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.35)',
              borderRadius: 8, padding: '4px 10px',
              animation: 'fadeIn 0.15s ease',
            }}>
              <span style={{ fontSize: 11, color: '#fff', fontWeight: 800, marginRight: 4 }}>
                {selCount} selected
              </span>

              {selOne && (
                <>
                  <button onClick={() => setViewVendor(selOne)} style={{
                    padding: '3px 10px', fontSize: 11, fontFamily: F, fontWeight: 700,
                    background: '#EEF4FF', border: '1px solid #BFDBFE', color: '#104f4f',
                    borderRadius: 5, cursor: 'pointer',
                  }}>👁 View</button>
                  <button onClick={() => navigate(`/vendor/edit/${selOne.vendorId}`)} style={{
                    padding: '3px 10px', fontSize: 11, fontFamily: F, fontWeight: 700,
                    background: '#ECFDF5', border: '1px solid #6EE7B7', color: '#065F46',
                    borderRadius: 5, cursor: 'pointer',
                  }}>✏ Edit</button>
                  <button onClick={() => printVendorDetails(selOne, selectedCompany)} style={{
                    padding: '3px 10px', fontSize: 11, fontFamily: F, fontWeight: 700,
                    background: '#F0FDF4', border: '1px solid #86EFAC', color: '#104f4f',
                    borderRadius: 5, cursor: 'pointer',
                  }}>🖨 Print</button>
                </>
              )}

              <button onClick={handleDeleteSelected} disabled={deleting} style={{
                padding: '3px 10px', fontSize: 11, fontFamily: F, fontWeight: 700,
                background: '#FEE2E2', border: '1px solid #FCA5A5', color: '#991B1B',
                borderRadius: 5, cursor: 'pointer',
              }}>🗑 Delete{selCount > 1 ? ` (${selCount})` : ''}</button>

              <button onClick={() => setSelected(new Set())} style={{
                background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)',
                cursor: 'pointer', fontSize: 15, padding: '0 2px', lineHeight: 1,
              }}>✕</button>
            </div>
          )}

          {/* FY Filter */}
          {fyList.length > 0 && (
            <div style={{ display:'flex', gap:4, alignItems:'center' }}>
              {['all', ...fyList].map(f => (
                <button key={f} onClick={() => setFy(f)}
                  style={{ height:26, padding:'0 9px', borderRadius:6, border:`1px solid ${fy===f ? '#fff' : 'rgba(255,255,255,0.3)'}`, background: fy===f ? '#fff' : 'rgba(255,255,255,0.12)', color: fy===f ? HDR : '#fff', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:F, whiteSpace:'nowrap' }}>
                  {f === 'all' ? 'All FY' : `FY ${f}`}
                </button>
              ))}
            </div>
          )}

          {/* Search */}
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>🔍</span>
            <input
              type="text" value={search} placeholder="Search vendors, GSTIN…"
              onChange={e => setSearch(e.target.value)}
              style={{
                height: 28, padding: '0 28px 0 28px', background: 'rgba(255,255,255,0.12)',
                border: `1px solid rgba(255,255,255,0.25)`, borderRadius: 6,
                color: '#fff', fontSize: 12, fontFamily: F, outline: 'none', width: 200,
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

          <button onClick={() => navigate('/vendor/pending')} style={{
            height: 28, padding: '0 14px', background: '#FEF3C7', border: '1px solid #FCD34D',
            color: '#92400E', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontFamily: F, fontWeight: 700,
          }}>⏳ Pending</button>
          <button onClick={() => navigate('/vendor/create')} style={{
            height: 28, padding: '0 14px', background: '#12B76A', border: '1px solid #059669',
            color: '#fff', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontFamily: F, fontWeight: 700,
          }}>+ New Vendor</button>
          <button onClick={fetchVendors} title="Refresh" style={{
            height: 28, width: 28, background: 'rgba(255,255,255,0.12)', border: `1px solid rgba(255,255,255,0.25)`,
            color: '#fff', borderRadius: 6, cursor: 'pointer', fontSize: 14,
          }}>↻</button>
        </div>
      </div>

      {/* ── Message ── */}
      {message && (
        <div style={{
          margin: '8px 10px 0', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontFamily: F,
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
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748B', fontSize: 13, fontFamily: F }}>Loading vendors…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748B', fontSize: 13, fontFamily: F }}>
            {search ? `No vendors match "${search}"` : 'No vendors found. Create your first vendor.'}
          </div>
        ) : (
          <div style={{ background: '#fff', border: `1px solid ${BD}`, borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: F }}>
              <thead>
                <tr>
                  <th style={{ padding: '7px 10px', background: HDR, width: 36, textAlign: 'center', borderRight: `1px solid rgba(255,255,255,0.12)` }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      style={{ cursor: 'pointer', accentColor: '#fff' }}
                    />
                  </th>
                  <SortTh col="vendorId">Vendor ID</SortTh>
                  <SortTh col="vendorName">Vendor Name</SortTh>
                  <SortTh col="businessType">Type</SortTh>
                  <SortTh col="gstin">GSTIN</SortTh>
                  <SortTh col="city">City</SortTh>
                  <SortTh col="state">State</SortTh>
                  <th style={{ padding: '7px 10px', fontSize: 11, fontWeight: 700, color: '#fff', background: HDR, textAlign: 'left', borderRight: `1px solid rgba(255,255,255,0.12)`, fontFamily: F }}>Contact</th>
                  <SortTh col="createdAt">Reg. Date</SortTh>
                  <SortTh col="status">Status</SortTh>
                </tr>
              </thead>
              <tbody>
                {filtered.map((v, i) => {
                  const contact    = v.contactPersons?.[0] || {};
                  const st         = v.status || 'draft';
                  const badge      = STATUS_STYLE[st] || STATUS_STYLE.draft;
                  const isSelected = selected.has(v.vendorId);
                  const isHovered  = hoveredId === v.vendorId;
                  const rowBg      = isSelected ? '#EEF4FF' : isHovered ? '#EBF0F5' : (i % 2 === 0 ? '#fff' : '#F8FAFC');

                  return (
                    <tr
                      key={v.vendorId}
                      style={{ background: rowBg, borderBottom: `1px solid #EEF0F2`, cursor: 'pointer', transition: 'background 0.1s' }}
                      onClick={() => setActivityRec(v)}
                      onDoubleClick={() => setViewVendor(v)}
                      onMouseEnter={() => setHoveredId(v.vendorId)}
                      onMouseLeave={() => setHoveredId(null)}
                    >
                      {/* Checkbox */}
                      <td style={{ padding: '6px 10px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(v.vendorId)}
                          style={{ cursor: 'pointer', accentColor: HDR }}
                        />
                      </td>
                      <td style={{ padding: '6px 10px', fontWeight: 700, color: HDR, whiteSpace: 'nowrap' }}>{v.vendorId}</td>
                      <td style={{ padding: '6px 10px', fontWeight: 600, color: '#1E293B' }}>{v.vendorName || '—'}</td>
                      <td style={{ padding: '6px 10px', color: '#475569' }}>{v.businessType || '—'}</td>
                      <td style={{ padding: '6px 10px', color: '#374151', fontWeight: 500, fontFamily: 'monospace', fontSize: 11 }}>
                        {v.gstin || <span style={{ color: '#CBD5E1' }}>—</span>}
                      </td>
                      <td style={{ padding: '6px 10px', color: '#475569' }}>{v.city || '—'}</td>
                      <td style={{ padding: '6px 10px', color: '#475569' }}>{v.state || '—'}</td>
                      <td style={{ padding: '6px 10px', color: '#475569' }}>
                        <div>{contact.name || v.contactPerson || '—'}</div>
                        <div style={{ fontSize: 10, color: '#94A3B8' }}>{contact.mobileNumber || v.mobile || ''}</div>
                      </td>
                      <td style={{ padding: '6px 10px', color: '#475569', fontSize: 11, whiteSpace: 'nowrap' }}>{fmtD2(v.createdAt)}</td>
                      <td style={{ padding: '6px 10px' }}>
                        <span style={{ ...badge, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap', textTransform: 'capitalize' }}>
                          {st}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{
              padding: '6px 12px', background: TAB_BG, borderTop: `1px solid ${BD}`,
              fontSize: 11, color: '#5A6475', fontFamily: F,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span>Showing {filtered.length} of {vendors.length} vendors</span>
              {selCount > 0
                ? <span style={{ color: HDR, fontWeight: 700 }}>{selCount} vendor{selCount > 1 ? 's' : ''} selected — use action bar above</span>
                : <span style={{ color: '#94A3B8' }}>Click to select · Double-click to view</span>
              }
            </div>
          </div>
        )}
      </div>

      <ActivityDrawer record={activityRec} recordType="vendor" onClose={() => setActivityRec(null)} />
    </div>
  );
};

export default ViewVendors;
