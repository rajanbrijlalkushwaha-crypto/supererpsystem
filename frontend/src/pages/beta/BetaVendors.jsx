/* Purchase Order → Vendor (beta): Create Vendor | Vendor | Pending | Reject.
 * Same look as the Client page. A vendor has two addresses: Bill From (its own address, on its bills)
 * and Dispatch From (where it sends the goods from — often the same). Fetch from GST fills the form. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Svg } from '../../components/ui/Icon';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import { printVendor } from './BetaVendorPrint';
import GstFetch, { STATES } from './BetaGstFetch';
import { BANKS } from './bankList';
import { CSS, CF_CSS, STATUS, DOC_TYPES, MAX_MB, REG_TYPES, NO_GSTIN, blankContact, fileSize, dash, TEAL } from './BetaClients';

const TABS = [
  { key: 'create',   label: 'Create Vendor' },
  { key: 'list',     label: 'Vendor' },
  { key: 'pending',  label: 'Pending' },
  { key: 'rejected', label: 'Reject' },
];
const BUSINESS_TYPES = ['Proprietorship', 'Partnership', 'Pvt Ltd', 'Public Ltd', 'LLP', 'Government', 'Individual', 'Trust', 'Other'];
/* GST portal "Constitution of Business" → our business type */
const businessOf = c => {
  const t = String(c || '').toLowerCase();
  if (/private\s+limited/.test(t)) return 'Pvt Ltd';
  if (/public\s+limited/.test(t)) return 'Public Ltd';
  if (/limited\s+liability/.test(t)) return 'LLP';
  if (/proprietor/.test(t)) return 'Proprietorship';
  if (/partnership/.test(t)) return 'Partnership';
  if (/government|local\s+authority|statutory/.test(t)) return 'Government';
  if (/trust|society/.test(t)) return 'Trust';
  return '';
};

/* [header, width] */
const COLS = [
  ['Vendor ID', '5.5%'], ['Vendor Name', '19%'], ['GSTIN', '10%'], ['Bill From', '21%'], ['City', '7%'], ['State', '7%'],
  ['Contact Name', '8%'], ['Number', '7%'], ['Email', '13%'], ['Status', '2.5%'],
];
/* thin black vertical lines between columns (like the Order list) */
const VL_CSS = `
.bc-t.vl th { border-right:1px solid rgba(255,255,255,.25); }
.bc-t.vl td { border-right:1px solid #000; }
.bc-t.vl th:last-child, .bc-t.vl td:last-child { border-right:none; }
.bc-t tbody tr.sel td { background:#D5EBEE !important; }
.vd-pr { align-self:center; display:inline-flex; align-items:center; gap:6px; height:27px; margin-left:8px; padding:0 12px; border:1px solid #03444f; border-radius:5px; background:#fff; color:#03444f; cursor:pointer; font:600 12px inherit; font-family:inherit; white-space:nowrap; }
.vd-pr:hover:not(:disabled) { background:#03444f; color:#fff; }
.vd-pr:disabled { opacity:.45; cursor:default; }
.vd-pk { align-self:center; margin-left:auto; padding-right:6px; font-size:12px; color:#667085; white-space:nowrap; }
.vd-pk b { color:#03444f; }
`;
const dispatchText = v => {
  if (v.dispatchSame !== false || !v.dispatchFrom) return 'Same as Bill From';
  const d = v.dispatchFrom;
  return [d.address, d.city, d.state, d.pincode].filter(Boolean).join(', ') || 'Same as Bill From';
};

export default function BetaVendors() {
  const { selectedCompany } = useCompany() || {};
  const companyId = selectedCompany?.companyId;
  const navigate = useNavigate();
  const { search } = useLocation();
  const tab = TABS.some(t => t.key === new URLSearchParams(search).get('tab')) ? new URLSearchParams(search).get('tab') : 'list';

  const [vendors, setVendors] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);   // vendor open in the edit form
  const [selId, setSelId] = useState(null);       // vendor picked for printing
  const { user } = useAuth() || {};
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!companyId) return;
    setVendors(null); setErr('');
    axios.get('/api/vendors', { params: { companyId } })
      .then(r => setVendors(Array.isArray(r.data) ? r.data : []))
      .catch(e => { setVendors([]); setErr(e.response?.data?.error || 'Could not load vendors.'); });
  }, [companyId, reload]);

  const groups = useMemo(() => {
    const all = (vendors || []).slice().sort((a, b) => Number(b.vendorId) - Number(a.vendorId));
    return { list: all.filter(v => v.status !== 'rejected'), pending: all.filter(v => v.status === 'pending'), rejected: all.filter(v => v.status === 'rejected') };
  }, [vendors]);
  const go = k => { setEditing(null); navigate(`/beta/vendor?tab=${k}`); };
  const rows = useMemo(() => {
    const list = groups[tab] || [];
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return list;
    return list.filter(v => {
      const hay = [v.vendorId, v.vendorName, v.alias, v.gstin, v.address, v.city, v.state, v.pincode, v.contactPerson, v.mobile, v.email,
        dispatchText(v), ...(v.contactPersons || []).flatMap(p => [p.name, p.mobileNumber, p.email]), (STATUS[v.status] || STATUS.draft).label]
        .filter(x => x != null && x !== '').join(' ').toLowerCase();
      return words.every(w => hay.includes(w));
    });
  }, [groups, tab, q]);

  const sel = rows.find(v => String(v.vendorId) === selId) || null;
  // print the full saved record (the list may carry a slimmer copy)
  const print = async v => {
    let full = v;
    try { const r = await axios.get(`/api/vendors/${v.vendorId}`, { params: { companyId } }); if (r.data && r.data.vendorId) full = r.data; } catch { /* print what the list has */ }
    printVendor({ v: full, company: selectedCompany, user });
  };

  /* the edit form needs the full saved record */
  const openEdit = async v => {
    try { const r = await axios.get(`/api/vendors/${v.vendorId}`, { params: { companyId } }); setEditing(r.data || v); }
    catch { setEditing(v); }
  };

  return (
    <div className="bc">
      <style>{CSS + VL_CSS}</style>
      <div className="bc-tabs" role="tablist">
        {TABS.map((t, i) => (
          <React.Fragment key={t.key}>
            {i === 1 && <span className="bc-sep" />}
            <button type="button" role="tab" aria-selected={tab === t.key && !editing} className={`bc-tab${tab === t.key && !editing ? ' on' : ''}`} onClick={() => go(t.key)}>
              {t.label}
              {vendors && t.key !== 'create' && (
                <span className={`n${t.key === 'pending' && groups.pending.length && tab !== 'pending' ? ' warn' : ''}`}>{groups[t.key].length}</span>
              )}
            </button>
          </React.Fragment>
        ))}
        {tab !== 'create' && !editing && (
          <div className="bc-search">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search vendor, GSTIN, city, mobile…" aria-label="Search vendors" />
            {q && <button type="button" onClick={() => setQ('')} aria-label="Clear search">×</button>}
          </div>
        )}
        {tab !== 'create' && !editing && <>
          <span className="vd-pk">{sel ? <>Selected: <b>{sel.vendorName}</b></> : 'Click a vendor to select'}</span>
          <button type="button" className="vd-pr" disabled={!sel} onClick={() => print(sel)} title="Print the vendor registration details"><Svg name="file" size={13} />Print</button>
        </>}
      </div>

      {err && <div className="bc-err">{err}</div>}

      {editing ? (
        <CreateVendor key={`edit-${editing.vendorId}`} companyId={companyId} editVendor={editing}
          onSaved={() => setReload(n => n + 1)} onClose={() => setEditing(null)} />
      ) : tab === 'create' ? (
        <CreateVendor companyId={companyId} onSaved={() => setReload(n => n + 1)} />
      ) : (
        <div className="bc-wrap">
          <table className="bc-t vl">
            <colgroup>{COLS.map(([label, w]) => <col key={label} style={{ width: w }} />)}</colgroup>
            <thead>
              <tr>{COLS.map(([label]) => <th key={label} title={label} className={label.length > 12 ? 'wrap' : label === 'Status' ? 'ctr' : undefined}>{label === 'Status' ? 'St.' : label}</th>)}</tr>
            </thead>
            <tbody>
              {vendors === null ? (
                <tr><td colSpan={COLS.length} className="bc-msg">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={COLS.length} className="bc-msg">{q ? `No vendor matches “${q}”.` : <>No {tab === 'list' ? 'vendors' : tab === 'pending' ? 'pending vendors' : 'rejected vendors'}.</>}</td></tr>
              ) : rows.map(v => {
                const ct = v.contactPersons?.[0] || {};
                const st = STATUS[v.status] || STATUS.draft;
                return (
                  <tr key={v.vendorId} className={selId === String(v.vendorId) ? 'sel' : undefined} onClick={() => setSelId(String(v.vendorId))} onDoubleClick={() => openEdit(v)} title="Click to select · double-click to open">
                    <td className="id">{v.vendorId}</td>
                    <td title={v.vendorName || ''}>{dash(v.vendorName)}</td>
                    <td className="mono">{dash(v.gstin)}</td>
                    <td title={v.address || ''}>{dash(v.address)}</td>
                    <td title={v.city || ''}>{dash(v.city)}</td>
                    <td title={v.state || ''}>{dash(v.state)}</td>
                    <td title={ct.name || v.contactPerson || ''}>{dash(ct.name || v.contactPerson)}</td>
                    <td>{dash(ct.mobileNumber || v.mobile)}</td>
                    <td title={ct.email || v.email || ''}>{dash(ct.email || v.email)}</td>
                    <td className="ctr"><span className="bc-badge" style={{ background: st.bg }} title={st.label}>{st.short}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Create / edit vendor ── */
const EMPTY_ADDR = { address: '', city: '', state: '', pincode: '', country: 'India' };
const EMPTY = {
  vendorName: '', alias: '', businessType: '', msme: '',
  regType: 'Regular', gstin: '', pan: '', tds: 'No',
  ...EMPTY_ADDR, dispatchSame: true, dispatch: { ...EMPTY_ADDR },
  bankName: '', accountHolder: '', accountNo: '', ifsc: '', branch: '', upi: '',
};
const BANK = ['bankName', 'accountHolder', 'accountNo', 'ifsc', 'branch', 'upi'];
const isCheque = d => /cancel+ed\s*cheque/i.test(`${d.type || ''} ${d.name || ''}`);
const yes = x => x === true || x === 'true' || x === 'Yes';
const fromVendor = v => ({
  vendorName: v.vendorName || '', alias: v.alias || '', businessType: v.businessType || '', msme: v.msme || '',
  regType: REG_TYPES.includes(v.gstType) ? v.gstType : 'Regular', gstin: v.gstin || v.gst || '', pan: v.pan || '', tds: yes(v.tdsApplicable) ? 'Yes' : 'No',
  address: v.address || v.billingAddr || '', city: v.city || '', state: v.state || '', pincode: String(v.pincode || ''), country: v.country || 'India',
  dispatchSame: v.dispatchSame !== false || !v.dispatchFrom,
  dispatch: { ...EMPTY_ADDR, ...(v.dispatchFrom || {}) },
  ...Object.fromEntries(BANK.map(k => [k, String(v[k] || '')])),
});
const contactsFrom = v => {
  const list = (v.contactPersons || []).filter(p => p && (p.name || p.mobileNumber || p.email))
    .map(p => ({ ...blankContact(), name: p.name || '', designation: p.designation || '', mobile: p.mobileNumber || '', email: p.email || '' }));
  if (!list.length && (v.contactPerson || v.mobile || v.email)) list.push({ ...blankContact(), name: v.contactPerson || '', mobile: v.mobile || '', email: v.email || '' });
  return list.length ? list : [blankContact()];
};
/* fields of a saved vendor this form does not show (payment terms, credit limit …) — sent back unchanged on save */
const KEEP = ['industryType', 'cin', 'altMobile', 'website', 'landline', 'shippingAddr',
  'paymentTerms', 'creditLimit', 'currency', 'category', 'purchasePerson', 'remarks'];

const VF_CSS = `
.vf-same { display:inline-flex; align-items:center; gap:7px; padding:3px 10px; border-radius:2px; background:#fff; color:${TEAL}; font-size:12px; font-weight:600; cursor:pointer; user-select:none; }
.vf-same input { width:15px; height:15px; margin:0; accent-color:${TEAL}; cursor:pointer; }
.vf-copy { padding:14px; font-size:12.5px; color:#475467; line-height:1.55; background:#FAFCFC; min-height:100%; }
.vf-copy b { display:block; margin-bottom:4px; font-size:11px; color:#667085; text-transform:uppercase; letter-spacing:.05em; }
.vf-copy .mut { color:#98A2B3; }
.cf-2.vf-addr > .cf-card { display:flex; flex-direction:column; }
.cf-ch .t small { color:rgba(255,255,255,.78); }
.vf-ifsc { display:flex; gap:4px; }
.vf-ifsc input { flex:1; min-width:0; }
.vf-isb { flex-shrink:0; width:32px; height:30px; display:grid; place-items:center; border:1px solid ${TEAL}; border-radius:2px; background:${TEAL}; color:#fff; cursor:pointer; }
.vf-isb:hover:not(:disabled) { background:#025763; }
.vf-ib-back { position:fixed; inset:0; z-index:1500; background:rgba(2,24,28,.45); display:flex; align-items:center; justify-content:center; padding:16px; }
.vf-ib { width:100%; max-width:440px; background:#fff; border-radius:4px; overflow:hidden; box-shadow:0 20px 60px rgba(0,0,0,.35); font-size:12.5px; }
.vf-ib-hd { display:flex; align-items:center; padding:9px 14px; background:${TEAL}; color:#fff; font-size:13.5px; font-weight:700; }
.vf-ib-hd button { margin-left:auto; border:0; background:none; color:#fff; font-size:20px; line-height:1; cursor:pointer; }
.vf-ib-bd { padding:12px 14px; }
.vf-ib-row { display:flex; gap:8px; }
.vf-ib-row input { flex:1; min-width:0; height:36px; padding:0 10px; border:1px solid #C9D7DA; border-radius:2px; outline:none; font:600 14px ui-monospace, Consolas, monospace; letter-spacing:.8px; }
.vf-ib-row input:focus { border-color:${TEAL}; box-shadow:0 0 0 3px rgba(3,68,79,.12); }
.vf-ib-row button { display:inline-flex; align-items:center; gap:6px; height:36px; padding:0 16px; border:0; border-radius:2px; background:${TEAL}; color:#fff; cursor:pointer; font-weight:700; font-family:inherit; }
.vf-ib-row button:disabled { opacity:.5; cursor:default; }
.vf-ib-err { margin-top:10px; padding:8px 10px; background:#FDECEC; border:1px solid #F5C2C0; color:#B42318; }
.vf-ib-help { margin-top:10px; color:#667085; }
.vf-ib-t { width:100%; margin-top:12px; border-collapse:collapse; }
.vf-ib-t th { width:90px; padding:5px 8px; background:#F4F8F8; border:1px solid #DCE6E8; text-align:left; font-weight:600; color:#344054; vertical-align:top; }
.vf-ib-t td { padding:5px 8px; border:1px solid #DCE6E8; color:#101828; }
.vf-ib-ok { margin-top:8px; color:#1E7B34; font-weight:600; }
.vf-ib-ft { display:flex; justify-content:flex-end; padding:9px 14px; border-top:1px solid #DCE6E8; background:#FAFCFC; }
.vf-ib-ft button { height:32px; padding:0 18px; border:1px solid #C9D7DA; border-radius:2px; background:#fff; color:#344054; cursor:pointer; font-weight:600; font-family:inherit; }
.vf-chq { display:flex; align-items:center; flex-wrap:wrap; gap:8px; }
.vf-chip { display:inline-flex; align-items:center; gap:8px; max-width:100%; height:30px; padding:0 4px 0 10px; border:1px solid #C9D7DA; border-radius:2px; background:#F7FAFA; font-size:12px; }
.vf-chip.new { background:#ECFDF3; border-color:#ABEFC6; }
.vf-chip b { font-weight:600; color:#101828; max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.vf-chip small { color:#667085; font-size:11px; }
.vf-chip button { width:24px; height:24px; border:0; background:none; cursor:pointer; color:#98A2B3; font-size:16px; }
.vf-chip button:hover { color:#D92D20; }
.vf-up { display:inline-flex; align-items:center; gap:5px; height:30px; padding:0 12px; border:1px solid ${TEAL}; border-radius:2px; background:#fff; color:${TEAL}; cursor:pointer; font:600 12px inherit; font-family:inherit; }
.vf-up:hover:not(:disabled) { background:${TEAL}; color:#fff; }
`;

function CreateVendor({ companyId, onSaved, editVendor, onClose }) {
  const isEdit = !!editVendor;
  const [v, setV] = useState(() => (isEdit ? fromVendor(editVendor) : EMPTY));
  const [contacts, setContacts] = useState(() => (isEdit ? contactsFrom(editVendor) : [blankContact()]));
  const [files, setFiles] = useState([]);
  const [oldDocs, setOldDocs] = useState(() => (isEdit ? (editVendor.documents || []).filter(Boolean) : []));
  const [nextId, setNextId] = useState('');
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [over, setOver] = useState(false);
  const fileRef = useRef(null);
  const chequeRef = useRef(null);
  /* IFSC search: the branch details come from ifsc.bankifsccode.com (through the server) and fill the bank name + branch */
  const [ifscBox, setIfscBox] = useState(null);   // { code, busy, err, data }
  const lookupIfsc = async code => {
    const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(c)) { setIfscBox(o => ({ ...o, err: 'An IFSC code has 11 characters, e.g. SBIN0001234.' })); return; }
    setIfscBox(o => ({ ...o, busy: true, err: '', data: null }));
    try {
      const { data } = await axios.get(`/api/bank-ifsc/${c}`);
      setIfscBox(o => (o ? { ...o, busy: false, data } : o));
      setV(o => ({ ...o, ifsc: data.ifsc, bankName: data.bank, branch: data.branch }));
      setErrs(o => ({ ...o, ifsc: undefined })); setMsg(null);
    } catch (e) { setIfscBox(o => (o ? { ...o, busy: false, err: e.response?.data?.error || 'Could not look up this IFSC.' } : o)); }
  };
  useEffect(() => {
    if (!ifscBox) return undefined;
    const k = e => { if (e.key === 'Escape') setIfscBox(null); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [ifscBox]);
  const addCheque = f => {
    if (!f) return;
    if (f.size > MAX_MB * 1048576) { setMsg({ ok: false, text: `Too large (over ${MAX_MB} MB): ${f.name}` }); return; }
    setFiles(xs => [...xs.filter(x => !isCheque(x)), { key: Math.random().toString(36).slice(2), file: f, type: 'Cancelled Cheque' }]);
    setMsg(null);
  };

  const loadNextId = () => axios.get('/api/vendors/next-id', { params: { companyId } }).then(r => {
    setNextId(String(r.data?.nextId || ''));
  }).catch(() => setNextId(''));
  useEffect(() => { if (!isEdit && companyId) loadNextId(); }, [companyId]);   // eslint-disable-line react-hooks/exhaustive-deps

  const clean = (k, val) => {
    if (k === 'gstin') return val.toUpperCase().replace(/\s/g, '').slice(0, 15);
    if (k === 'pan') return val.toUpperCase().replace(/\s/g, '').slice(0, 10);
    if (k === 'pincode') return val.replace(/\D/g, '').slice(0, 6);
    if (k === 'mobile') return val.replace(/[^\d+]/g, '').slice(0, 13);
    if (k === 'msme') return val.toUpperCase().slice(0, 25);
    if (k === 'ifsc') return val.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11);
    if (k === 'accountNo') return val.replace(/[^0-9A-Za-z]/g, '').toUpperCase().slice(0, 20);
    if (k === 'upi') return val.replace(/\s/g, '').slice(0, 60);
    return val;
  };
  const set = k => e => {
    const val = clean(k, e.target.value);
    setV(o => {
      const n = { ...o, [k]: val };
      if (k === 'gstin' && (!o.pan || o.pan === o.gstin.slice(2, 12))) n.pan = val.length >= 12 ? val.slice(2, 12) : '';
      if (k === 'regType' && NO_GSTIN.includes(val)) n.gstin = '';
      return n;
    });
    setErrs(o => ({ ...o, [k]: undefined })); setMsg(null);
  };
  const setD = k => e => {
    const val = clean(k, e.target.value);
    setV(o => ({ ...o, dispatch: { ...o.dispatch, [k]: val } }));
    setErrs(o => ({ ...o, [`d${k}`]: undefined })); setMsg(null);
  };
  const setC = (i, k) => e => {
    const val = clean(k, e.target.value);
    setContacts(cs => cs.map((c, j) => (j === i ? { ...c, [k]: val } : c)));
    setErrs(o => ({ ...o, [`c${i}${k}`]: undefined })); setMsg(null);
  };
  const addFiles = list => {
    const ok = [], tooBig = [];
    [...(list || [])].forEach(f => (f.size > MAX_MB * 1048576 ? tooBig.push(f.name) : ok.push({ key: Math.random().toString(36).slice(2), file: f, type: '' })));
    if (ok.length) setFiles(fs_ => [...fs_, ...ok]);
    setMsg(tooBig.length ? { ok: false, text: `Too large (over ${MAX_MB} MB): ${tooBig.join(', ')}` } : null);
  };

  /* Fetch from GST → Import */
  const gstImport = (g, a) => {
    setV(o => ({
      ...o, gstin: g.gstin, vendorName: g.legalName || o.vendorName,
      alias: g.tradeName && g.tradeName.toLowerCase() !== String(g.legalName || '').toLowerCase() ? g.tradeName : o.alias,
      regType: /composition/i.test(g.taxpayerType || '') ? 'Composition' : 'Regular',
      businessType: businessOf(g.constitution) || o.businessType,
      pan: g.gstin.slice(2, 12),
      address: a.address || o.address, city: a.city || o.city, state: a.state || o.state, pincode: a.pincode || o.pincode, country: 'India',
    }));
    setErrs({}); setMsg({ ok: true, text: `Details of ${g.gstin} imported from the GST portal into Bill From — check them and save.` });
  };

  const check = () => {
    const e = {};
    if (!v.vendorName.trim()) e.vendorName = 'Enter the vendor name';
    if (v.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(v.gstin)) e.gstin = '15 characters, e.g. 24AAAFE1234K1Z5';
    if (v.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v.pan)) e.pan = '10 characters, e.g. AAAFE1234K';
    if (v.gstin && v.pan && v.gstin.length === 15 && v.gstin.slice(2, 12) !== v.pan) e.pan = 'PAN does not match the GSTIN';
    if (v.pincode && v.pincode.length !== 6) e.pincode = 'Pincode must be 6 digits';
    if (v.ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(v.ifsc)) e.ifsc = '11 characters, e.g. SBIN0001234';
    if (v.accountNo && (v.accountNo.length < 6 || v.accountNo.length > 20)) e.accountNo = 'Enter the full account number';
    if (v.upi && !/^[\w.-]+@[\w.-]+$/.test(v.upi)) e.upi = 'e.g. name@bank';
    if (!v.dispatchSame) {
      if (!v.dispatch.address.trim() && !v.dispatch.city.trim()) e.daddress = 'Enter the dispatch address, or tick Same as Bill From';
      if (v.dispatch.pincode && v.dispatch.pincode.length !== 6) e.dpincode = 'Pincode must be 6 digits';
    }
    contacts.forEach((c, i) => {
      if (c.mobile && c.mobile.replace(/\D/g, '').length < 10) e[`c${i}mobile`] = 'Enter a 10-digit number';
      if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) e[`c${i}email`] = 'Enter a valid email';
      if (!c.name.trim() && (c.designation || c.mobile || c.email)) e[`c${i}name`] = 'Enter the name';
    });
    files.forEach((f, i) => { if (!f.type) e[`f${i}`] = 'Choose document type'; });
    setErrs(e);
    return !Object.keys(e).length;
  };
  const reset = () => { setV(EMPTY); setContacts([blankContact()]); setFiles([]); setErrs({}); };

  const save = async status => {
    if (!check()) { setMsg({ ok: false, text: 'Please correct the fields marked in red.' }); return; }
    setBusy(true); setMsg(null);
    try {
      const fd = new FormData();
      const add = (k, x) => fd.append(k, x == null ? '' : x);
      // what this form does not show stays as it is
      if (isEdit) {
        KEEP.forEach(k => add(k, editVendor[k]));
        add('paymentModes', JSON.stringify(Array.isArray(editVendor.paymentModes) ? editVendor.paymentModes : []));
      }
      const people = contacts.filter(c => c.name.trim()).map(c => ({ name: c.name.trim(), designation: c.designation.trim(), mobileNumber: c.mobile, email: c.email.trim() }));
      const first = people[0] || {};
      add('companyId', companyId);
      add('vendorName', v.vendorName.trim());
      add('alias', v.alias.trim());
      // the vendor code is the vendor id (kept in the record for the older screens): '' on create → the server sets the id
      add('vendorCode', isEdit ? (editVendor.vendorCode || String(editVendor.vendorId)) : '');
      add('businessType', v.businessType);
      add('msme', v.msme.trim());
      add('gstType', v.regType);
      add('gstin', v.gstin);
      add('gstRegistered', NO_GSTIN.includes(v.regType) ? 'false' : 'true');
      add('pan', v.pan);
      add('tdsApplicable', v.tds === 'Yes' ? 'true' : 'false');
      add('tcsApplicable', v.tds === 'Yes' ? 'true' : 'false');
      add('address', v.address.trim());
      add('city', v.city.trim());
      add('state', v.state);
      add('pincode', v.pincode);
      add('country', v.country.trim() || 'India');
      add('dispatchSame', v.dispatchSame ? 'true' : 'false');
      add('dispatchFrom', JSON.stringify(v.dispatchSame ? null : { ...v.dispatch, address: v.dispatch.address.trim(), city: v.dispatch.city.trim(), country: v.dispatch.country.trim() || 'India' }));
      add('contactPersons', JSON.stringify(people));
      add('contactPerson', first.name || (isEdit ? editVendor.contactPerson : ''));
      add('mobile', first.mobileNumber || (isEdit ? editVendor.mobile : ''));
      add('email', first.email || (isEdit ? editVendor.email : ''));
      BANK.forEach(k => add(k, v[k].trim()));
      if (status) add('status', status);   // edit: not sent → the server keeps the current status
      if (isEdit) {
        add('documents', JSON.stringify(oldDocs));
        add('fileNames', JSON.stringify(files.map(f => f.type)));
        files.forEach(f => fd.append('newFiles', f.file));
        await axios.put(`/api/vendors/${editVendor.vendorId}`, fd, { params: { companyId }, headers: { 'Content-Type': 'multipart/form-data' } });
        setFiles([]);
        setMsg({ ok: true, text: `Vendor ${editVendor.vendorId} updated.` });
        onSaved();
      } else {
        add('documents', JSON.stringify(files.map(f => ({ name: f.type, type: f.type, originalName: f.file.name }))));
        files.forEach(f => fd.append('documents', f.file));
        const r = await axios.post('/api/vendors', fd, { params: { companyId }, headers: { 'Content-Type': 'multipart/form-data' } });
        setMsg({ ok: true, text: `Vendor ${r.data?.vendorId || ''} saved ${status === 'pending' ? 'and sent for approval' : 'as draft'}.` });
        reset(); loadNextId(); onSaved();
      }
    } catch (e) {
      setMsg({ ok: false, text: e.response?.data?.error || 'Could not save the vendor. Try again.' });
    } finally { setBusy(false); }
  };

  const inp = (k, { className = '', ...props } = {}) => <input id={`vf-${k}`} value={v[k]} onChange={set(k)} disabled={busy} {...props} className={`${className}${errs[k] ? ' bad' : ''}`} />;
  const dinp = (k, props = {}) => <input id={`vf-d${k}`} value={v.dispatch[k]} onChange={setD(k)} disabled={busy} {...props} className={errs[`d${k}`] ? 'bad' : ''} />;
  const err = k => errs[k] && <span className="cf-err">{errs[k]}</span>;
  const filled = contacts.filter(c => c.name.trim()).length;
  const head = (icon, title, sub, extra) => (
    <div className="cf-ch">
      <span className="ico"><Svg name={icon} size={16} /></span>
      <span className="t"><b>{title}</b>{sub && <small>{sub}</small>}</span>
      {extra}
    </div>
  );
  const noGst = NO_GSTIN.includes(v.regType);
  const billLine = [v.address, v.city, v.state, v.pincode].filter(Boolean).join(', ');

  return (
    <div className="cf">
      <style>{CF_CSS + VF_CSS}</style>
      {ifscBox && (
        <div className="vf-ib-back" onMouseDown={e => { if (e.target === e.currentTarget) setIfscBox(null); }}>
          <form className="vf-ib" role="dialog" aria-modal="true" aria-labelledby="vf-ib-t" onSubmit={e => { e.preventDefault(); lookupIfsc(ifscBox.code); }}>
            <div className="vf-ib-hd"><span id="vf-ib-t">Search IFSC</span><button type="button" onClick={() => setIfscBox(null)} aria-label="Close">×</button></div>
            <div className="vf-ib-bd">
              <div className="vf-ib-row">
                <input autoFocus className="mono" value={ifscBox.code || ''} maxLength={11} placeholder="SBIN0001234" aria-label="IFSC code" disabled={ifscBox.busy}
                  onChange={e => setIfscBox({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11) })} />
                <button type="submit" disabled={ifscBox.busy || (ifscBox.code || '').length !== 11}><Svg name="search" size={14} />{ifscBox.busy ? 'Searching…' : 'Search'}</button>
              </div>
              {ifscBox.err && <div className="vf-ib-err">{ifscBox.err}</div>}
              {ifscBox.data && (
                <>
                  <table className="vf-ib-t"><tbody>
                    {[['Bank', ifscBox.data.bank], ['Branch', ifscBox.data.branch], ['Address', ifscBox.data.address], ['District', ifscBox.data.district],
                      ['State', ifscBox.data.state], ['MICR', ifscBox.data.micr], ['Contact', ifscBox.data.contact]]
                      .filter(([, x]) => x).map(([k, x]) => <tr key={k}><th>{k}</th><td>{x}</td></tr>)}
                  </tbody></table>
                  <div className="vf-ib-ok">Bank name, branch and IFSC are filled in the form.</div>
                </>
              )}
              {!ifscBox.data && !ifscBox.err && !ifscBox.busy && <div className="vf-ib-help">Type the 11-character IFSC from the cheque — the bank name and branch fill in.</div>}
            </div>
            <div className="vf-ib-ft"><button type="button" onClick={() => setIfscBox(null)}>{ifscBox.data ? 'Done' : 'Close'}</button></div>
          </form>
        </div>
      )}
      <div className="cf-in">
        <div className="cf-hero">
          <span className="ic"><Svg name="cart" size={16} /></span>
          <h1>{isEdit ? 'Edit Vendor' : 'Create Vendor'}</h1>
          <span className="grow" />
          {!noGst && <GstFetch companyId={companyId} gstin={v.gstin} disabled={busy} onImport={gstImport} title="Fill the vendor from the GST portal"
            fills="Import fills Vendor Name, Alias (trade name), Business Type, Registration Type, PAN and the Bill From address. Nothing is saved until you save the vendor." />}
          <span className="cf-pill">{isEdit ? (STATUS[editVendor.status] || STATUS.draft).label : 'New'}</span>
          <div className="cf-chip"><small>Vendor ID</small><b>{isEdit ? editVendor.vendorId : (nextId || 'Auto')}</b></div>
        </div>

        {msg && <div className={`cf-msg ${msg.ok ? 'ok' : 'err'}`} role="status">{msg.text}</div>}

        {/* vendor | tax */}
        <div className="cf-2">
          <div className="cf-card">
            {head('user', 'Vendor Details')}
            <table className="cf-kv"><tbody>
              <tr><th>Vendor Name <i>*</i></th><td colSpan={3}>{inp('vendorName', { placeholder: 'Vendor / company name', autoFocus: true })}{err('vendorName')}</td></tr>
              <tr><th>Alias</th><td colSpan={3}>{inp('alias', { placeholder: 'Trade name' })}</td></tr>
              <tr><th>Business Type</th><td>
                <select id="vf-businessType" value={v.businessType} onChange={set('businessType')} disabled={busy}><option value="">Select</option>{BUSINESS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>
              </td><th>MSME / Udyam No.</th><td>{inp('msme', { placeholder: 'UDYAM-GJ-01-0000000', className: 'mono' })}</td></tr>
            </tbody></table>
          </div>

          <div className="cf-card">
            {head('shield', 'Tax Registration')}
            <table className="cf-kv"><tbody>
              <tr><th>Registration Type</th><td>
                <select id="vf-regType" value={v.regType} onChange={set('regType')} disabled={busy}>{REG_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>
              </td><th>Is TDS Deductable</th><td>
                <div className="cf-seg" role="radiogroup" aria-label="Is TDS deductable">
                  {['No', 'Yes'].map(o => (
                    <button key={o} type="button" role="radio" aria-checked={v.tds === o} className={v.tds === o ? 'on' : ''} disabled={busy}
                      onClick={() => set('tds')({ target: { value: o } })}>{o}</button>
                  ))}
                </div>
              </td></tr>
              <tr><th>GSTIN / UIN</th><td>{inp('gstin', { placeholder: noGst ? 'Not needed' : '24AAAFE1234K1Z5', className: 'mono', disabled: busy || noGst })}{err('gstin')}</td>
                <th>PAN / IT No.</th><td>{inp('pan', { placeholder: 'AAAFE1234K', className: 'mono' })}{err('pan')}</td></tr>
              <tr><td colSpan={4} className="cf-note">{noGst ? `GSTIN is not applicable for ${v.regType}.` : 'PAN fills in from the GSTIN (characters 3 – 12).'}</td></tr>
            </tbody></table>
          </div>
        </div>

        {/* Bill From | Dispatch From */}
        <div className="cf-2 vf-addr">
          <div className="cf-card">
            {head('file', 'Bill From', 'The vendor’s address — on its bills')}
            <table className="cf-kv"><tbody>
              <tr><th>Address</th><td colSpan={3}><textarea id="vf-address" value={v.address} onChange={set('address')} disabled={busy} placeholder="Building, street, area" rows={2} /></td></tr>
              <tr><th>City</th><td>{inp('city')}</td><th>Pincode</th><td>{inp('pincode', { inputMode: 'numeric' })}{err('pincode')}</td></tr>
              <tr><th>State</th><td>
                <select id="vf-state" value={v.state} onChange={set('state')} disabled={busy}><option value="">Select state</option>{STATES.map(s => <option key={s} value={s}>{s}</option>)}</select>
              </td><th>Country</th><td>{inp('country')}</td></tr>
            </tbody></table>
          </div>

          <div className="cf-card">
            {head('box', 'Dispatch From', 'Where the goods are sent from', <>
              <span className="grow" />
              <label className="vf-same"><input type="checkbox" checked={v.dispatchSame} disabled={busy}
                onChange={e => { const on = e.target.checked; setV(o => ({ ...o, dispatchSame: on })); setErrs(o => ({ ...o, daddress: undefined, dpincode: undefined })); }} />Same as Bill From</label>
            </>)}
            {v.dispatchSame ? (
              <div className="vf-copy"><b>Same as Bill From</b>{billLine || <span className="mut">Fill the Bill From address.</span>}</div>
            ) : (
              <table className="cf-kv"><tbody>
                <tr><th>Address</th><td colSpan={3}><textarea id="vf-daddress" value={v.dispatch.address} onChange={setD('address')} disabled={busy} placeholder="Godown / factory / site" rows={2} className={errs.daddress ? 'bad' : ''} />{err('daddress')}</td></tr>
                <tr><th>City</th><td>{dinp('city')}</td><th>Pincode</th><td>{dinp('pincode', { inputMode: 'numeric' })}{err('dpincode')}</td></tr>
                <tr><th>State</th><td>
                  <select id="vf-dstate" value={v.dispatch.state} onChange={setD('state')} disabled={busy}><option value="">Select state</option>{STATES.map(s => <option key={s} value={s}>{s}</option>)}</select>
                </td><th>Country</th><td>{dinp('country')}</td></tr>
              </tbody></table>
            )}
          </div>
        </div>

        {/* bank | documents */}
        <div className="cf-2">
        <div className="cf-card">
          {head('wallet', 'Bank Details')}
          <table className="cf-kv"><tbody>
            <tr><th>Bank Name</th><td>{inp('bankName', { placeholder: 'e.g. State Bank of India', list: 'vf-banks', autoComplete: 'off' })}
              <datalist id="vf-banks">{BANKS.map(b => <option key={b} value={b} />)}</datalist></td><th>Account Holder</th><td>{inp('accountHolder', { placeholder: v.vendorName.trim() || 'Name on the account' })}</td></tr>
            <tr><th>Account No.</th><td>{inp('accountNo', { className: 'mono', inputMode: 'numeric' })}{err('accountNo')}</td><th>IFSC Code</th><td>
              <div className="vf-ifsc">{inp('ifsc', { className: 'mono', placeholder: 'SBIN0001234' })}
                <button type="button" className="vf-isb" disabled={busy} title="Search this IFSC — fills the bank name and branch" aria-label="Search IFSC"
                  onClick={() => { setIfscBox({ code: v.ifsc }); if (/^[A-Z]{4}0[A-Z0-9]{6}$/.test(v.ifsc)) lookupIfsc(v.ifsc); }}><Svg name="search" size={14} /></button></div>
              {err('ifsc')}</td></tr>
            <tr><th>Branch</th><td>{inp('branch')}</td><th>UPI ID</th><td>{inp('upi', { placeholder: 'name@bank' })}{err('upi')}</td></tr>
            <tr><th>Cancelled Cheque</th><td colSpan={3}>
              {(() => {
                const fresh = files.find(isCheque);
                const saved = oldDocs.filter(isCheque);
                return (
                  <div className="vf-chq">
                    {fresh ? (
                      <span className="vf-chip new"><b>{fresh.file.name}</b><small>{fileSize(fresh.file.size)} · new</small>
                        <button type="button" aria-label="Remove the cheque" title="Remove" onClick={() => setFiles(xs => xs.filter(x => !isCheque(x)))}>×</button></span>
                    ) : saved.map((d, i) => (
                      <span className="vf-chip" key={(d.fileName || d.name || '') + i}><b>{d.fileName || d.name}</b><small>Saved</small>
                        <button type="button" aria-label="Remove the saved cheque" title="Remove from this vendor" onClick={() => setOldDocs(xs => xs.filter(x => x !== d))}>×</button></span>
                    ))}
                    <button type="button" className="vf-up" disabled={busy} onClick={() => chequeRef.current?.click()}>
                      <Svg name="plus" size={13} stroke={2.2} />{fresh || saved.length ? 'Replace' : 'Upload cheque'}</button>
                    <input ref={chequeRef} type="file" hidden accept=".pdf,.jpg,.jpeg,.png"
                      onChange={e => { addCheque(e.target.files?.[0]); e.target.value = ''; }} />
                  </div>
                );
              })()}
            </td></tr>
          </tbody></table>
        </div>

        <div className="cf-card">
          {(() => { const n = oldDocs.filter(d => !isCheque(d)).length + files.filter(f => !isCheque(f)).length;
            return head('file', 'Documents', null, n ? <><span className="grow" /><span className="cnt">{n} file{n > 1 ? 's' : ''}</span></> : null); })()}
          <div className={`cf-drop${over ? ' over' : ''}`} role="button" tabIndex={0}
            onClick={() => fileRef.current?.click()} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click(); } }}
            onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={e => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}>
            <b><Svg name="plus" size={14} stroke={2.2} /> Drag files here or <u>browse</u></b>
            <small>GST certificate, PAN, MSME certificate… PDF, image, Word or Excel — up to {MAX_MB} MB each</small>
            <input ref={fileRef} type="file" multiple hidden accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
              onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
          </div>
          {(oldDocs.some(d => !isCheque(d)) || files.some(f => !isCheque(f))) && (
            <div className="cf-files">
              {oldDocs.map((d, i) => (isCheque(d) ? null : (
                <div className="cf-file" key={(d.fileName || d.name || '') + i}>
                  <span className="ext" style={{ background: '#E1EFF0', color: TEAL }}>{String(d.fileName || d.name || 'file').split('.').pop().slice(0, 4)}</span>
                  <span className="nm"><b title={d.fileName || d.name}>{d.name || d.fileName || 'Document'}</b><small>Saved</small></span>
                  <span />
                  <button type="button" className="cf-rm" title="Remove from this vendor" aria-label={`Remove ${d.name || 'document'}`} onClick={() => setOldDocs(xs => xs.filter((_, j) => j !== i))}>×</button>
                </div>
              )))}
              {files.map((f, i) => (isCheque(f) ? null : (
                <div className="cf-file" key={f.key}>
                  <span className="ext">{(f.file.name.split('.').pop() || 'file').slice(0, 4)}</span>
                  <span className="nm"><b title={f.file.name}>{f.file.name}</b><small>{fileSize(f.file.size)}</small></span>
                  <span>
                    <select value={f.type} disabled={busy} className={errs[`f${i}`] ? 'bad' : ''} aria-label={`Type of ${f.file.name}`}
                      onChange={e => { const t = e.target.value; setFiles(xs => xs.map((x, j) => (j === i ? { ...x, type: t } : x))); setErrs(o => ({ ...o, [`f${i}`]: undefined })); }}>
                      <option value="">Document type…</option>
                      {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    {err(`f${i}`)}
                  </span>
                  <button type="button" className="cf-rm" title="Remove file" aria-label={`Remove ${f.file.name}`} onClick={() => setFiles(xs => xs.filter((_, j) => j !== i))}>×</button>
                </div>
              )))}
            </div>
          )}
        </div>

        </div>

        {/* contacts */}
        <div className="cf-card">
          {head('users', 'Contact Persons', null, <>
            {filled > 0 && <span className="cnt">{filled} added</span>}
            <span className="grow" />
            <button type="button" className="cf-add" disabled={busy} onClick={() => setContacts(cs => [...cs, blankContact()])}>+ Add contact</button>
          </>)}
          <table className="cf-ct">
            <thead><tr><th>#</th><th>Contact Name</th><th>Designation</th><th>Number</th><th>Email</th><th /></tr></thead>
            <tbody>
              {contacts.map((c, i) => (
                <tr key={c.key}>
                  <td className="sn">{i + 1}</td>
                  <td><input value={c.name} onChange={setC(i, 'name')} disabled={busy} placeholder="Full name" className={errs[`c${i}name`] ? 'bad' : ''} aria-label={`Contact ${i + 1} name`} />{err(`c${i}name`)}</td>
                  <td><input value={c.designation} onChange={setC(i, 'designation')} disabled={busy} placeholder="e.g. Sales Manager" aria-label={`Contact ${i + 1} designation`} /></td>
                  <td><input value={c.mobile} onChange={setC(i, 'mobile')} disabled={busy} inputMode="tel" placeholder="10-digit mobile" className={errs[`c${i}mobile`] ? 'bad' : ''} aria-label={`Contact ${i + 1} number`} />{err(`c${i}mobile`)}</td>
                  <td><input value={c.email} onChange={setC(i, 'email')} disabled={busy} type="email" placeholder="name@company.com" className={errs[`c${i}email`] ? 'bad' : ''} aria-label={`Contact ${i + 1} email`} />{err(`c${i}email`)}</td>
                  <td>{contacts.length > 1 && <button type="button" className="cf-rm" title="Remove contact" aria-label={`Remove contact ${i + 1}`} onClick={() => setContacts(cs => cs.filter((_, j) => j !== i))}>×</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="cf-bar">
        <span className="info">{v.vendorName.trim() ? <>{isEdit ? 'Vendor' : 'New vendor'}: <b style={{ color: '#101828' }}>{v.vendorName.trim()}</b>{v.gstin ? ` · ${v.gstin}` : ''}{v.city ? ` · ${v.city}` : ''}</> : 'Fill in the vendor details'}</span>
        {isEdit ? <>
          <button type="button" className="cf-b ghost" disabled={busy} onClick={onClose}>Back to list</button>
          <button type="button" className="cf-b pri" disabled={busy} onClick={() => save(null)}>{busy ? 'Saving…' : 'Save Changes'}</button>
        </> : <>
          <button type="button" className="cf-b ghost" disabled={busy} onClick={() => { reset(); setMsg(null); }}>Clear</button>
          <button type="button" className="cf-b draft" disabled={busy} onClick={() => save('draft')}>Save Draft</button>
          <button type="button" className="cf-b pri" disabled={busy} onClick={() => save('pending')}>{busy ? 'Saving…' : 'Submit for Approval'}</button>
        </>}
      </div>
    </div>
  );
}
