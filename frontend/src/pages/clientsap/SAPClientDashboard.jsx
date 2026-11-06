import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/permissions';
import { useStaffNames } from '../../hooks/useStaffNames';
import ApproverPickerModal from '../../components/ApproverPicker';

/* ═══════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════ */
const STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh',
  'Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka',
  'Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram',
  'Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana',
  'Tripura','Uttar Pradesh','Uttarakhand','West Bengal',
  'Andaman and Nicobar Islands','Chandigarh','Dadra and Nagar Haveli and Daman and Diu',
  'Delhi','Jammu and Kashmir','Ladakh','Lakshadweep','Puducherry',
];

const INDUSTRY_TYPES = [
  'Agriculture','Automobile','Banking & Finance','Construction','Consulting',
  'Defense','Education','Energy & Power','FMCG','Healthcare','Hospitality',
  'Information Technology','Infrastructure','Insurance','Logistics',
  'Manufacturing','Media & Entertainment','Mining','Pharmaceuticals',
  'Real Estate','Retail','Telecom','Textile','Trading','Others',
];

const STATE_GST_MAP = {
  1:'Jammu and Kashmir',2:'Himachal Pradesh',3:'Punjab',4:'Chandigarh',
  5:'Uttarakhand',6:'Haryana',7:'Delhi',8:'Rajasthan',9:'Uttar Pradesh',
  10:'Bihar',11:'Sikkim',12:'Arunachal Pradesh',13:'Nagaland',14:'Manipur',
  15:'Mizoram',16:'Tripura',17:'Meghalaya',18:'Assam',19:'West Bengal',
  20:'Jharkhand',21:'Odisha',22:'Chhattisgarh',23:'Madhya Pradesh',
  24:'Gujarat',26:'Dadra and Nagar Haveli and Daman and Diu',27:'Maharashtra',
  28:'Andhra Pradesh',29:'Karnataka',30:'Goa',31:'Lakshadweep',32:'Kerala',
  33:'Tamil Nadu',34:'Puducherry',35:'Andaman and Nicobar Islands',36:'Telangana',38:'Ladakh',
};

/* ═══════════════════════════════════════════════════
   VALIDATORS
═══════════════════════════════════════════════════ */
const validators = {
  pan:    v => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v),
  gst:    v => /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v),
  mobile: v => /^[6-9]\d{9}$/.test(v),
  email:  v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  pin:    v => /^[1-9][0-9]{5}$/.test(v),
  ifsc:   v => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v),
};

/* ═══════════════════════════════════════════════════
   DESIGN TOKENS
═══════════════════════════════════════════════════ */
const F  = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const P  = '#2563EB';
const BG = '#F5F7FA';
/* the CLIENTS brand nav bar keeps its own steel-blue identity, independent of the form's accent colour above */
const NAVBAR_BG = '#3A6186';
const NAVBAR_BD = '#2A4D6E';

/* ═══════════════════════════════════════════════════
   INIT STATE
═══════════════════════════════════════════════════ */
const INIT = {
  clientName: '', clientCode: '',
  businessType: '', industryType: '', pan: '', gst: '', cin: '', msme: '',
  contactPerson: '', mobile: '', altMobile: '', email: '', website: '', landline: '',
  billingAddr: '', shippingAddr: '', state: '', city: '', pincode: '', country: 'India',
  gstRegistered: true, gstType: 'Regular', tdsApplicable: false,
  bankName: '', accountHolder: '', accountNo: '', ifsc: '', branch: '', upi: '',
  paymentTerms: '30 Days', creditLimit: '', paymentModes: [], currency: 'INR',
  category: 'Regular', salesPerson: '', remarks: '',
  status: 'pending',
};

/* ── Toast ── */
function Toast({ type, msg, onClose }) {
  React.useEffect(() => { const t = setTimeout(onClose, 5000); return () => clearTimeout(t); }, [onClose]);
  const ok = type === 'success';
  return (
    <div style={{
      position: 'fixed', top: 20, right: 24, zIndex: 9999,
      background: ok ? '#ecfdf5' : '#fef2f2',
      border: `1px solid ${ok ? '#a7f3d0' : '#fecaca'}`,
      borderLeft: `4px solid ${ok ? '#10b981' : '#ef4444'}`,
      borderRadius: 10, padding: '14px 18px', minWidth: 320,
      display: 'flex', alignItems: 'center', gap: 10,
      boxShadow: '0 8px 24px rgba(0,0,0,0.12)', fontFamily: F,
    }}>
      <span style={{ fontSize: 18 }}>{ok ? '✅' : '❌'}</span>
      <span style={{ fontSize: 13, color: ok ? '#065f46' : '#991b1b', fontWeight: 600, flex: 1 }}>{msg}</span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#94a3b8' }}>×</button>
    </div>
  );
}

/* ── Toggle ── */
function Toggle({ id, checked, onChange }) {
  return (
    <label htmlFor={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
      <div style={{ position: 'relative', width: 44, height: 24, background: checked ? P : '#CBD5E1', borderRadius: 12, transition: 'background 0.2s', flexShrink: 0 }}>
        <input id={id} type="checkbox" checked={checked} onChange={onChange} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
        <div style={{ position: 'absolute', top: 4, left: checked ? 24 : 4, width: 16, height: 16, background: '#fff', borderRadius: '50%', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
      </div>
      <span style={{ fontSize: 13, color: checked ? P : '#94a3b8', fontWeight: checked ? 600 : 400, fontFamily: F }}>{checked ? 'Yes' : 'No'}</span>
    </label>
  );
}

/* ── MultiCheck pills ── */
function MultiCheck({ options, selected, onChange, error }) {
  const toggle = opt => onChange(selected.includes(opt) ? selected.filter(x => x !== opt) : [...selected, opt]);
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {options.map(opt => {
          const on = selected.includes(opt);
          return (
            <button key={opt} type="button" onClick={() => toggle(opt)} style={{
              padding: '4px 12px', borderRadius: 20, cursor: 'pointer', fontFamily: F,
              border: `1.5px solid ${on ? P : '#D1D5DB'}`,
              background: on ? '#EFF6FF' : '#fff',
              color: on ? P : '#64748b',
              fontSize: 12, fontWeight: on ? 700 : 500, transition: 'all 0.12s',
            }}>{opt}</button>
          );
        })}
      </div>
      {error && <div style={{ fontSize: 11, color: '#EF4444', fontFamily: F, marginTop: 5, fontWeight: 600 }}>{error}</div>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════ */
export default function ClientMasterDashboard() {
  const { clientId } = useParams();
  const navigate      = useNavigate();
  const { pathname }  = useLocation();
  const isEdit        = !!clientId;
  const SALES_PERSONS = useStaffNames();

  const { selectedCompany } = useCompany();
  const { user } = useAuth();
  const [form, setForm]       = useState(INIT);
  const [errs, setErrs]       = useState({});
  const [toast, setToast]     = useState(null);
  const [gstWarn, setGstWarn] = useState('');
  const [idLoading, setIdLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(isEdit);
  const [documents, setDocuments] = useState([{ id: 1, name: '', file: null }]);
  const [importing, setImporting]     = useState(false);
  const [importResult, setImportResult] = useState(null);
  const xlInputRef = useRef(null);
  const xmlInputRef = useRef(null);
  const [xmlImporting, setXmlImporting] = useState(false);

  /* Pull Name / GSTIN / Address / City / State / Pincode out of a Tally
     "Voucher" XML export and pre-fill the Client form — the user still
     reviews and fills in anything Tally doesn't carry (phone, email, etc.)
     before saving. */
  const parseTallyClientXml = (xmlText) => {
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('Not a valid XML file');
    const voucher = doc.getElementsByTagName('VOUCHER')[0];
    if (!voucher) throw new Error('No <VOUCHER> found in this XML — is it a Tally voucher export?');
    // getElementsByTagName (not querySelector) — Tally tag names contain literal
    // dots (e.g. BASICBUYERADDRESS.LIST), which CSS selector syntax can't parse.
    const txt = tag => voucher.getElementsByTagName(tag)[0]?.textContent?.trim() || '';
    const listLines = (listTag, itemTag) => {
      const list = voucher.getElementsByTagName(listTag)[0];
      if (!list) return [];
      return Array.from(list.getElementsByTagName(itemTag)).map(n => n.textContent.trim()).filter(Boolean);
    };

    const name  = txt('BASICBUYERNAME') || txt('PARTYNAME');
    const gstin = txt('PARTYGSTIN');
    const state = txt('STATENAME');
    const pincode = txt('PARTYPINCODE');
    let addrLines = listLines('BASICBUYERADDRESS.LIST', 'BASICBUYERADDRESS');
    if (!addrLines.length) addrLines = listLines('ADDRESS.LIST', 'ADDRESS');

    // The last address line is often the city/locality — but only treat it
    // as one if it's not just repeating the state name.
    let city = '';
    if (addrLines.length > 1) {
      const last = addrLines[addrLines.length - 1];
      if (last.toLowerCase() !== state.toLowerCase()) {
        city = last;
        addrLines = addrLines.slice(0, -1);
      }
    }

    return { name, gstin, state, pincode, city, address: addrLines.join(', ') };
  };

  // Tally commonly exports XML/JSON as UTF-16 (with a BOM), not UTF-8 —
  // file.text() always assumes UTF-8 and would silently mangle those into
  // unparseable garbage, so sniff the BOM and decode with the right charset.
  const readFileAsText = async (file) => {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let encoding = 'utf-8';
    if (bytes[0] === 0xFF && bytes[1] === 0xFE) encoding = 'utf-16le';
    else if (bytes[0] === 0xFE && bytes[1] === 0xFF) encoding = 'utf-16be';
    return new TextDecoder(encoding).decode(buf);
  };

  /* Same fields as the XML importer, but for Tally's JSON export format
     (lowercase keys, e.g. { tallymessage: [{ basicbuyername, partygstin, ... }] }). */
  const parseTallyClientJson = (jsonText) => {
    const data = JSON.parse(jsonText);
    const msg = (Array.isArray(data.tallymessage) ? data.tallymessage[0] : null) || data;
    if (!msg || typeof msg !== 'object') throw new Error('Not a valid Tally JSON export');

    const name    = msg.basicbuyername || msg.partyname || '';
    const gstin   = msg.partygstin || '';
    const state   = msg.statename || '';
    const pincode = msg.partypincode || '';
    const pickAddr = (arr) => Array.isArray(arr) ? arr.filter(x => typeof x === 'string') : [];
    let addrLines = pickAddr(msg.basicbuyeraddress);
    if (!addrLines.length) addrLines = pickAddr(msg.address);

    // Tally JSON often runs city and pincode together on the last address
    // line, e.g. "Chennai-600009" — split that out rather than treating the
    // whole thing as the city.
    let city = '';
    if (addrLines.length) {
      const last = addrLines[addrLines.length - 1];
      const m = last.match(/^(.*?)[\s-]*(\d{6})$/);
      if (m && m[1].trim()) { city = m[1].trim(); addrLines = addrLines.slice(0, -1); }
      else if (last.toLowerCase() !== state.toLowerCase()) { city = last; addrLines = addrLines.slice(0, -1); }
    }

    return { name, gstin, state, pincode, city, address: addrLines.join(', ') };
  };

  /* ── Best-effort PDF import ──
     PDFs carry no structured tags, so this reads the visible text (via
     pdf.js, loaded on demand) and pattern-matches it. It's noticeably less
     reliable than XML/JSON — always review the filled fields before saving. */
  const ensurePdfJsLoaded = () => new Promise((resolve, reject) => {
    if (window.pdfjsLib) { resolve(window.pdfjsLib); return; }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve(window.pdfjsLib);
    };
    script.onerror = () => reject(new Error('Could not load the PDF reader library'));
    document.head.appendChild(script);
  });

  // Groups pdf.js text items back into lines by Y-position (pdf.js otherwise
  // hands back a flat list of text fragments with no line breaks).
  const extractPdfLines = async (file) => {
    const pdfjsLib = await ensurePdfJsLoaded();
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const lines = [];
    let cur = '';
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      let lastY = null;
      content.items.forEach(it => {
        const y = it.transform[5];
        if (lastY !== null && Math.abs(y - lastY) > 2) { lines.push(cur.trim()); cur = ''; }
        cur += it.str + ' ';
        lastY = y;
      });
      if (cur.trim()) { lines.push(cur.trim()); cur = ''; }
    }
    return lines.filter(Boolean);
  };

  const parseTallyClientPdfLines = (lines) => {
    const buyerMarker = lines.findIndex(l => /Buyer\s*\(Bill\s*to\)|Bill\s*To|Client\s*Details/i.test(l));
    const stopMarker  = (from) => lines.findIndex((l, i) =>
      i > from && /Voucher\s*No|Order\s*Description|Tax\s*Identity|ERP\s*No|Consignee/i.test(l));
    const start = buyerMarker >= 0 ? buyerMarker + 1 : 0;
    const stop  = buyerMarker >= 0 ? (stopMarker(buyerMarker) > 0 ? stopMarker(buyerMarker) : start + 6) : lines.length;
    const block = lines.slice(start, stop);

    let state = '', pincode = '', gstin = '', city = '';
    const addrLines = [];
    let name = '';
    block.forEach(line => {
      const stateM = line.match(/State\s*Name\s*:?\s*([A-Za-z][A-Za-z .]*?)(?:,|\s+Code\b|$)/i);
      const gstinM = line.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]\b/);
      // A line ending in a bare 6-digit pincode, e.g. "Chennai-600009" or
      // "Chennai 600009" — whatever precedes it is usually the city.
      const pinM   = line.match(/^(.*?)[\s-]*(\d{6})\b\s*$/);
      if (stateM) { state = stateM[1].trim(); return; }
      if (gstinM && !gstin) { gstin = gstinM[0]; return; }
      if (!name) { name = line.trim(); return; }
      if (pinM) {
        pincode = pinM[2];
        if (pinM[1].trim() && !city) city = pinM[1].trim();
        return;
      }
      addrLines.push(line.trim());
    });

    return { name, gstin, state, pincode, city, address: addrLines.join(', ') };
  };

  const handleClientFileImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    setXmlImporting(true);
    try {
      let p;
      if (ext === 'xml') {
        p = parseTallyClientXml(await readFileAsText(file));
      } else if (ext === 'json') {
        p = parseTallyClientJson(await readFileAsText(file));
      } else if (ext === 'pdf') {
        p = parseTallyClientPdfLines(await extractPdfLines(file));
      } else {
        throw new Error('Unsupported file type — please use .xml, .json or .pdf');
      }
      const filled = [];
      if (p.name)    { set('clientName', p.name);       filled.push('Name'); }
      if (p.gstin)   { set('gst', p.gstin.toUpperCase());filled.push('GSTIN'); }
      if (p.address) { set('billingAddr', p.address);   filled.push('Address'); }
      if (p.city)    { set('city', p.city);              filled.push('City'); }
      if (p.state)   { set('state', p.state);            filled.push('State'); }
      if (p.pincode) { set('pincode', p.pincode);         filled.push('Pincode'); }
      if (!filled.length) {
        setToast({ type: 'error', msg: `Could not find any client details in this ${ext.toUpperCase()}.` });
      } else {
        const caveat = ext === 'pdf' ? ' PDF import is best-effort — please double-check these carefully.' : '';
        setToast({ type: 'success', msg: `Imported from ${ext.toUpperCase()}: ${filled.join(', ')}. Review and fill in anything missing (contact, mobile, email, etc.), then save.${caveat}` });
      }
    } catch (err) {
      setToast({ type: 'error', msg: `${ext.toUpperCase()} import failed: ` + err.message });
    } finally { setXmlImporting(false); }
  };

  const downloadSample = async () => {
    try {
      const res = await axios.get('/api/clients/sample-excel', {
        params: { companyId: selectedCompany?.companyId },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([res.data], { type: res.headers['content-type'] }));
      const a = document.createElement('a'); a.href = url;
      a.download = 'Client_Import_Template.xlsx';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setToast({ type: 'error', msg: 'Download failed: ' + err.message });
    }
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (!selectedCompany) { setToast({ type: 'error', msg: 'Select a company first.' }); return; }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('companyId', selectedCompany.companyId);
    setImporting(true);
    try {
      const res = await axios.post('/api/clients/import-excel', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setImportResult(res.data);
    } catch (err) {
      setToast({ type: 'error', msg: 'Import failed: ' + (err.response?.data?.error || err.message) });
    } finally { setImporting(false); }
  };

  const fetchNextId = useCallback(async () => {
    if (!selectedCompany || isEdit) return;
    setIdLoading(true);
    try {
      const res = await axios.get(`/api/clients/next-id?companyId=${selectedCompany.companyId}`);
      setForm(f => ({ ...f, clientCode: String(res.data.nextId) }));
    } catch {
      setForm(f => ({ ...f, clientCode: '100001' }));
    } finally { setIdLoading(false); }
  }, [selectedCompany, isEdit]);

  useEffect(() => { fetchNextId(); }, [fetchNextId]);

  /* Load existing client data in edit mode */
  useEffect(() => {
    if (!isEdit) return;
    setLoadingData(true);
    axios.get(`/api/clients/${clientId}?companyId=${selectedCompany?.companyId || ''}`)
      .then(res => {
        const c   = res.data;
        const cp0 = (c.contactPersons || [])[0] || {};
        setForm(f => ({
          ...f,
          clientCode:    String(c.clientId || clientId),
          clientName:    c.companyName || c.clientName || '',
          businessType:  c.businessType  || '',
          industryType:  c.industryType  || '',
          pan:           c.pan           || '',
          gst:           c.gstin         || c.gst || '',
          cin:           c.cin           || '',
          msme:          c.msme          || '',
          contactPerson: cp0.name        || c.contactPerson || '',
          mobile:        cp0.mobileNumber|| c.mobile       || '',
          altMobile:     cp0.altMobile   || c.altMobile    || '',
          email:         cp0.email       || c.email        || '',
          website:       c.website       || '',
          landline:      c.landline      || '',
          billingAddr:   c.address       || c.billingAddr  || '',
          shippingAddr:  c.shippingAddr  || '',
          state:         c.state         || '',
          city:          c.city          || '',
          pincode:       c.pincode       || '',
          country:       c.country       || 'India',
          gstRegistered: c.gstRegistered !== undefined ? c.gstRegistered : true,
          gstType:       c.gstType       || 'Regular',
          tdsApplicable: c.tdsApplicable || false,
          bankName:      c.bankName      || '',
          accountHolder: c.accountHolder || '',
          accountNo:     c.accountNo     || '',
          ifsc:          c.ifsc          || '',
          branch:        c.branch        || '',
          upi:           c.upi           || '',
          paymentTerms:  c.paymentTerms  || '30 Days',
          creditLimit:   c.creditLimit   || '',
          paymentModes:  c.paymentModes  || [],
          currency:      c.currency      || 'INR',
          category:      c.category      || 'Regular',
          salesPerson:   c.salesPerson   || '',
          remarks:       c.remarks       || '',
          status:        ['approved','pending','rejected','draft'].includes(c.status) ? c.status : 'pending',    // old Tally imports saved "active" → go for approval
        }));
        setDocuments(
          (c.documents || []).length > 0
            ? (c.documents).map(d => ({ id: Math.random(), name: d.name || '', file: null, fileName: d.fileName || null }))
            : [{ id: 1, name: '', file: null }]
        );
      })
      .catch(err => setToast({ type: 'error', msg: 'Failed to load client: ' + err.message }))
      .finally(() => setLoadingData(false));
  }, [clientId, isEdit, selectedCompany]);

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }));
    setErrs(e => ({ ...e, [k]: '' }));
    if (k === 'gst' && v.length === 15) {
      const code = parseInt(v.slice(0, 2), 10);
      const pan  = v.slice(2, 12);                      // chars 3-12 of GST = PAN
      const updates = { gst: v };
      if (STATE_GST_MAP[code]) updates.state = STATE_GST_MAP[code];
      if (pan) updates.pan = pan;
      setForm(f => ({ ...f, ...updates }));
      const msgs = [];
      if (STATE_GST_MAP[code]) msgs.push(`State: ${STATE_GST_MAP[code]}`);
      if (pan) msgs.push(`PAN: ${pan}`);
      if (msgs.length) {
        setGstWarn(`Auto-filled — ${msgs.join(', ')}`);
        setTimeout(() => setGstWarn(''), 4000);
      }
    }
  };

  const validateAll = () => {
    const e = {};
    if (!form.clientName.trim())     e.clientName    = 'Client Name is required';
    if (form.pan && !validators.pan(form.pan))   e.pan  = 'Invalid PAN (e.g. ABCDE1234F)';
    if (form.gst && !validators.gst(form.gst))   e.gst  = 'Invalid GST (15-char format)';
    if (form.mobile && !validators.mobile(form.mobile)) e.mobile = 'Invalid mobile (10 digits, starts 6-9)';
    if (form.altMobile && !validators.mobile(form.altMobile)) e.altMobile = 'Invalid mobile number';
    if (form.email && !validators.email(form.email)) e.email = 'Invalid email address';
    if (!form.billingAddr.trim())    e.billingAddr    = 'Billing Address is required';
    if (!form.state)                 e.state          = 'State is required';
    if (form.pincode && !validators.pin(form.pincode)) e.pincode = 'Invalid pincode';
    if (form.ifsc && !validators.ifsc(form.ifsc))    e.ifsc    = 'Invalid IFSC (e.g. SBIN0001234)';
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const [saving, setSaving] = useState(false);
  const [showApproverPicker, setShowApproverPicker] = useState(false);

  /* statusOverride = 'approved' for "Save & Approve" (users with Client approve rights) */
  const handleSave = async (approverId, statusOverride) => {
    const status = statusOverride || form.status || (isEdit ? 'approved' : 'pending');
    if (!validateAll()) {
      setToast({ type: 'error', msg: 'Please fix the highlighted errors before saving.' });
      return;
    }
    if (!selectedCompany) {
      setToast({ type: 'error', msg: 'No company selected. Please select a company first.' });
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      const s = (v) => (v === undefined || v === null) ? '' : String(v);
      fd.append('approverId',     s(approverId));
      fd.append('companyId',      s(selectedCompany.companyId));
      fd.append('clientName',     s(form.clientName));
      fd.append('businessType',   s(form.businessType));
      fd.append('industryType',   s(form.industryType));
      fd.append('pan',            s(form.pan));
      fd.append('gst',            s(form.gst));
      fd.append('gstType',        s(form.gstType));
      fd.append('gstRegistered',  s(form.gstRegistered));
      fd.append('cin',            s(form.cin));
      fd.append('msme',           s(form.msme));
      fd.append('tdsApplicable',  s(form.tdsApplicable));
      fd.append('contactPerson',  s(form.contactPerson));
      fd.append('mobile',         s(form.mobile));
      fd.append('altMobile',      s(form.altMobile));
      fd.append('email',          s(form.email));
      fd.append('website',        s(form.website));
      fd.append('landline',       s(form.landline));
      fd.append('billingAddr',    s(form.billingAddr));
      fd.append('shippingAddr',   s(form.shippingAddr));
      fd.append('state',          s(form.state));
      fd.append('city',           s(form.city));
      fd.append('pincode',        s(form.pincode));
      fd.append('country',        s(form.country));
      fd.append('bankName',       s(form.bankName));
      fd.append('accountHolder',  s(form.accountHolder));
      fd.append('accountNo',      s(form.accountNo));
      fd.append('ifsc',           s(form.ifsc));
      fd.append('branch',         s(form.branch));
      fd.append('upi',            s(form.upi));
      fd.append('paymentTerms',   s(form.paymentTerms));
      fd.append('creditLimit',    s(form.creditLimit));
      fd.append('currency',       s(form.currency));
      fd.append('category',       s(form.category));
      fd.append('salesPerson',    s(form.salesPerson));
      fd.append('remarks',        s(form.remarks));
      fd.append('status',         status);
      fd.append('paymentModes',   JSON.stringify(form.paymentModes || []));

      // Document metadata + files
      const docMeta = documents.filter(d => d.name).map(d => ({ name: d.name }));
      fd.append('documentsJson', JSON.stringify(docMeta));
      documents.forEach(doc => { if (doc.file) fd.append('documents', doc.file); });

      if (isEdit) {
        await axios.put(`/api/clients/${clientId}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        setToast({ type: 'success', msg: `Client "${form.clientName}" (${clientId}) updated successfully!` });
        setTimeout(() => navigate('/client/view'), 1800);
      } else {
        const res = await axios.post('/api/clients', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        setToast({ type: 'success', msg: `Client "${form.clientName}" (${res.data.clientId}) saved successfully!` });
        setTimeout(() => handleReset(), 1800);
      }
    } catch (err) {
      setToast({ type: 'error', msg: 'Save failed: ' + (err.response?.data?.error || err.message) });
    } finally { setSaving(false); }
  };

  const handleReset = () => { setForm({ ...INIT }); setErrs({}); setDocuments([{ id: 1, name: '', file: null }]); fetchNextId(); };

  /* Ctrl+S saves (opens the approver picker for a new client, as the Save button does) */
  const saveKeyRef = useRef(null);
  saveKeyRef.current = () => { if (saving) return; if (isEdit) handleSave(); else setShowApproverPicker(true); };
  useEffect(() => {
    const h = e => { if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); saveKeyRef.current && saveKeyRef.current(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  /* ── focus / blur helpers ── */
  const onFocus = e => { e.target.style.borderColor = P; };
  const onBlur  = (err) => e => { e.target.style.borderColor = err ? '#EF4444' : '#9CA3AF'; };

  /* ── SO-style input / select styles ── */
  const ri = (err=false) => ({
    height:28, padding:'0 8px', border:`1px solid ${err?'#EF4444':'#9CA3AF'}`, borderRadius:4,
    fontSize:12, fontFamily:F, color:'#111827', background:err?'#FFF5F5':'#fff',
    outline:'none', width:'100%', boxSizing:'border-box',
  });
  const rs = (err=false) => ({
    height:28, padding:'0 8px', border:`1px solid ${err?'#EF4444':'#9CA3AF'}`, borderRadius:4,
    fontSize:12, fontFamily:F, color:'#111827', background:'#fff',
    outline:'none', cursor:'pointer', width:'100%', boxSizing:'border-box',
  });


  if (loadingData) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300, flexDirection:'column', gap:12, fontFamily:F }}>
        <div style={{ width:36, height:36, border:'3px solid #E5E5E5', borderTopColor:P, borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
        <div style={{ fontSize:13, color:'#64748b' }}>Loading client data…</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ fontFamily:F, background:BG, height:'100%', display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <style>{`.csap-input::placeholder{color:#9CA3AF}.csap-search::placeholder{color:rgba(255,255,255,0.45)}`}</style>
      {toast && <Toast type={toast.type} msg={toast.msg} onClose={() => setToast(null)} />}

      {/* ══ CLIENTS nav bar — same as client/view ══ */}
      <div style={{ flexShrink:0, height:40, background:NAVBAR_BG, borderBottom:`2px solid ${NAVBAR_BD}`,
        display:'flex', alignItems:'stretch', overflow:'hidden', fontFamily:F }}>
        <div style={{ display:'flex', alignItems:'center', padding:'0 12px 0 10px',
          fontSize:11, fontWeight:800, color:'#fff', textTransform:'uppercase',
          letterSpacing:'0.8px', whiteSpace:'nowrap',
          borderRight:'2px solid rgba(255,255,255,0.18)', flexShrink:0 }}>
          CLIENTS
        </div>
        <button onClick={() => navigate('/client-sap')}
          style={{ display:'flex', alignItems:'center', padding:'0 14px', height:26, alignSelf:'center',
            fontSize:11.5, fontWeight:700, color:'#fff', background:'#059669',
            border:'1px solid rgba(255,255,255,0.3)', boxShadow:'0 2px 6px rgba(0,0,0,0.2)',
            cursor:'pointer', whiteSpace:'nowrap', flexShrink:0,
            margin:'0 6px', borderRadius:6 }}
          onMouseEnter={e => { e.currentTarget.style.background='#047857'; }}
          onMouseLeave={e => { e.currentTarget.style.background='#059669'; }}>
          + Create Client
        </button>
        {[
          { label:'👥 View Clients', path:'/client/view' },
          { label:'⏳ Pending',      path:'/client/pending' },
          { label:'🧾 Tally',        path:'/client/tally' },
        ].map(tab => {
          const isAct = pathname === tab.path;
          return (
            <button key={tab.path} onClick={() => navigate(tab.path)}
              style={{ display:'flex', alignItems:'center', padding:'0 12px', height:26, alignSelf:'center',
                fontSize:11.5, fontWeight: isAct ? 700 : 600, cursor:'pointer',
                whiteSpace:'nowrap', flexShrink:0, fontFamily:F,
                color: isAct ? '#fff' : 'rgba(255,255,255,0.85)',
                background: isAct ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.07)',
                border:`1px solid ${isAct?'rgba(255,255,255,0.55)':'rgba(255,255,255,0.22)'}`,
                boxShadow: isAct?'0 2px 6px rgba(0,0,0,0.22)':'0 1px 2px rgba(0,0,0,0.12)',
                borderRadius:6, margin:'0 4px' }}
              onMouseEnter={e => { if (!isAct) { e.currentTarget.style.background='rgba(255,255,255,0.14)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.55)'; } }}
              onMouseLeave={e => { if (!isAct) { e.currentTarget.style.background='rgba(255,255,255,0.07)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.22)'; } }}>
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Import Result Modal ── */}
      {importResult && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:9998, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'#fff', borderRadius:12, padding:28, maxWidth:560, width:'90%', maxHeight:'80vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.25)', fontFamily:F }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
              <h3 style={{ margin:0, fontSize:16, color:'#1E293B' }}>Import Results</h3>
              <button onClick={() => setImportResult(null)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#94a3b8' }}>×</button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:16 }}>
              {[
                { l:'Total Rows', v:importResult.total,    c:'#1E293B', bg:'#F1F5F9', bc:'#D1D5DB' },
                { l:'Imported',   v:importResult.imported, c:'#059669', bg:'#ECFDF5', bc:'#A7F3D0' },
                { l:'Failed',     v:importResult.failed,   c:'#DC2626', bg:'#FEF2F2', bc:'#FECACA' },
              ].map(s => (
                <div key={s.l} style={{ padding:'10px 14px', background:s.bg, borderRadius:8, border:`1px solid ${s.bc}`, textAlign:'center' }}>
                  <div style={{ fontSize:24, fontWeight:700, color:s.c }}>{s.v}</div>
                  <div style={{ fontSize:11, color:'#64748b', marginTop:2 }}>{s.l}</div>
                </div>
              ))}
            </div>
            {importResult.imported > 0 && (
              <div style={{ padding:'8px 12px', background:'#ECFDF5', borderRadius:6, marginBottom:12, fontSize:12, color:'#065f46', fontWeight:600 }}>
                ✅ {importResult.imported} client(s) created and sent for approval. Check the <strong>Pending</strong> tab to approve them.
              </div>
            )}
            {importResult.errors?.length > 0 && (
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:'#DC2626', marginBottom:6 }}>Failed Rows:</div>
                <div style={{ maxHeight:200, overflowY:'auto', border:'1px solid #FECACA', borderRadius:6 }}>
                  {importResult.errors.map((e, i) => (
                    <div key={i} style={{ padding:'5px 10px', fontSize:11.5, borderBottom:'1px solid #FEE2E2', color:'#7F1D1D', background: i%2===0?'#FFF5F5':'#FEF2F2' }}>
                      <span style={{ fontWeight:700 }}>Row {e.row}:</span> {e.error}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <button onClick={() => setImportResult(null)} style={{ marginTop:16, width:'100%', padding:'8px 0', background:'#2563EB', color:'#fff', border:'none', borderRadius:6, cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:F }}>Close</button>
          </div>
        </div>
      )}

      {/* ── Excel Import Toolbar (create mode only) ── */}
      {!isEdit && (
        <div style={{ flexShrink:0, background:'#EFF6FF', borderBottom:'1px solid #BFDBFE', padding:'6px 14px', display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:11.5, color:'#1D4ED8', fontFamily:F, fontWeight:500, flex:1 }}>
            📊 Bulk import clients from Excel — download the sample template, fill it in, then upload.
          </span>
          <button type="button" onClick={downloadSample} style={{ height:27, padding:'0 12px', borderRadius:5, cursor:'pointer', background:'#fff', border:'1px solid #93C5FD', color:'#1D4ED8', fontSize:11.5, fontWeight:600, fontFamily:F, display:'flex', alignItems:'center', gap:4 }}>
            📥 Download Sample
          </button>
          <button type="button" onClick={() => xlInputRef.current?.click()} disabled={importing} style={{ height:27, padding:'0 12px', borderRadius:5, cursor:importing?'not-allowed':'pointer', background:importing?'#93C5FD':'#2563EB', border:'none', color:'#fff', fontSize:11.5, fontWeight:600, fontFamily:F, display:'flex', alignItems:'center', gap:4, opacity:importing?0.7:1 }}>
            {importing ? '⏳ Importing…' : '📤 Import Excel'}
          </button>
          <input type="file" ref={xlInputRef} accept=".xlsx,.xls" style={{ display:'none' }} onChange={handleImportFile} />
        </div>
      )}

      {/* ── Tally XML Import (create mode only) — pre-fills this form for review ── */}
      {!isEdit && (
        <div style={{ flexShrink:0, background:'#F0FDF4', borderBottom:'1px solid #A7F3D0', padding:'6px 14px', display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:11.5, color:'#047857', fontFamily:F, fontWeight:500, flex:1 }}>
            🧾 Import Name / GSTIN / Address / City / State / Pincode from a Tally voucher (XML / JSON / PDF) — review and fill in anything missing before saving.
          </span>
          <button type="button" onClick={() => xmlInputRef.current?.click()} disabled={xmlImporting} style={{ height:27, padding:'0 12px', borderRadius:5, cursor:xmlImporting?'not-allowed':'pointer', background:xmlImporting?'#6EE7B7':'#059669', border:'none', color:'#fff', fontSize:11.5, fontWeight:600, fontFamily:F, display:'flex', alignItems:'center', gap:4, opacity:xmlImporting?0.7:1 }}>
            {xmlImporting ? '⏳ Importing…' : '📥 Import from Tally File'}
          </button>
          <input type="file" ref={xmlInputRef} accept=".xml,.json,.pdf" style={{ display:'none' }} onChange={handleClientFileImport} />
        </div>
      )}

      {/* ══ Ledger form — laid out like Tally's Ledger Creation screen ══ */}
      <style>{`.tl-row{display:flex;align-items:center;min-height:30px;padding:2px 0}
        .tl-row.top{align-items:flex-start}
        .tl-lbl{width:150px;flex-shrink:0;font-size:12.5px;color:#1F2937;padding-right:6px}
        .tl-colon{width:14px;flex-shrink:0;color:#6B7280;text-align:center}
        .tl-val{flex:1;min-width:0;display:flex;align-items:center;gap:6px}
        .tl-sec{font-size:12px;font-weight:800;color:#1E3A5F;text-decoration:underline;text-underline-offset:3px;margin:14px 0 6px}
        .tl-sec:first-child{margin-top:0}`}</style>
      <div style={{ flex:1, overflowY:'auto', background:BG, padding:'12px 14px' }}>
        <div style={{ background:'#fff', border:'1px solid #CBD5E1', borderRadius:8, boxShadow:'0 1px 3px rgba(0,0,0,0.05)' }}>
          {/* title strip */}
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 14px', background:'#E8F0F8', borderBottom:'1px solid #CBD5E1', borderRadius:'8px 8px 0 0' }}>
            <span style={{ fontSize:13, fontWeight:800, color:'#1E3A5F' }}>{isEdit ? 'Ledger Alteration' : 'Ledger Creation'}</span>
            <span style={{ fontSize:11.5, color:'#475467' }}>Under: <b>Sundry Debtors</b> (Client)</span>
            <span style={{ flex:1 }} />
            <span style={{ fontSize:11, color:'#667085' }}>Ctrl+S to save · fields marked <span style={{ color:'#DC2626' }}>*</span> are required</span>
          </div>

          {/* name + client id */}
          <div style={{ padding:'12px 16px 10px', borderBottom:'1px solid #E5E7EB', display:'flex', gap:18, alignItems:'flex-end', flexWrap:'wrap' }}>
            <div style={{ flex:'1 1 420px' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#475467', marginBottom:4 }}>Name <span style={{ color:'#DC2626' }}>*</span></div>
              <input className="csap-input" autoFocus={!isEdit} value={form.clientName} onChange={e=>set('clientName',e.target.value)} placeholder="Ledger / client name, as in Tally"
                style={{ ...ri(!!errs.clientName), height:36, fontSize:15, fontWeight:800 }} onFocus={onFocus} onBlur={onBlur(errs.clientName)} />
              {errs.clientName && <div style={{ color:'#DC2626', fontSize:11, marginTop:2 }}>{errs.clientName}</div>}
            </div>
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:'#475467', marginBottom:4 }}>Client ID (alias)</div>
              <div style={{ display:'flex', gap:4 }}>
                <input readOnly value={idLoading?'Loading…':form.clientCode} style={{ ...ri(), height:36, color:P, fontWeight:800, background:'#F8FAFF', width:120 }} />
                {!isEdit && <button type="button" title="Next free ID" onClick={fetchNextId} style={{ height:36, width:32, borderRadius:4, border:'1px solid #D1D5DB', background:'#EFF6FF', color:P, cursor:'pointer', fontSize:14 }}>↻</button>}
              </div>
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)' }}>
            {/* ── LEFT: ledger / credit / bank ── */}
            <div style={{ padding:'12px 16px', borderRight:'1px solid #E5E7EB' }}>
              <div className="tl-sec">Ledger</div>
              <div className="tl-row"><span className="tl-lbl">Under</span><span className="tl-colon">:</span><span className="tl-val"><b style={{ fontSize:12.5 }}>Sundry Debtors</b></span></div>
              <div className="tl-row"><span className="tl-lbl">Business type</span><span className="tl-colon">:</span><span className="tl-val">
                <select style={rs(!!errs.businessType)} value={form.businessType} onChange={e=>set('businessType',e.target.value)} onFocus={onFocus} onBlur={onBlur(errs.businessType)}>
                  <option value="">— Select —</option>
                  {['Proprietorship','Partnership','Private Limited','Public Limited','LLP','Government','Individual','Trust / NGO','HUF'].map(o=><option key={o} value={o}>{o}</option>)}
                </select></span></div>
              <div className="tl-row"><span className="tl-lbl">Industry</span><span className="tl-colon">:</span><span className="tl-val">
                <select style={rs()} value={form.industryType} onChange={e=>set('industryType',e.target.value)} onFocus={onFocus} onBlur={onBlur()}>
                  <option value="">— Select —</option>{INDUSTRY_TYPES.map(o=><option key={o} value={o}>{o}</option>)}
                </select></span></div>
              <div className="tl-row"><span className="tl-lbl">Category</span><span className="tl-colon">:</span><span className="tl-val">
                {[{v:'Regular',c:'#2563EB',bg:'#EFF6FF'},{v:'VIP',c:'#D97706',bg:'#FEF3C7'},{v:'Blacklisted',c:'#DC2626',bg:'#FEF2F2'}].map(o=>(
                  <button key={o.v} type="button" onClick={()=>set('category',o.v)} style={{ padding:'3px 10px', borderRadius:4, border:`1px solid ${form.category===o.v?o.c:'#D1D5DB'}`,
                    background:form.category===o.v?o.bg:'#fff', color:form.category===o.v?o.c:'#6B7280', fontSize:11.5, fontWeight:form.category===o.v?700:400, cursor:'pointer', fontFamily:F }}>{o.v}</button>
                ))}</span></div>
              <div className="tl-row"><span className="tl-lbl">Sales person</span><span className="tl-colon">:</span><span className="tl-val">
                <select style={rs()} value={form.salesPerson} onChange={e=>set('salesPerson',e.target.value)} onFocus={onFocus} onBlur={onBlur()}>
                  <option value="">— Assign —</option>{SALES_PERSONS.map(o=><option key={o} value={o}>{o}</option>)}
                </select></span></div>

              <div className="tl-sec">Credit Details</div>
              <div className="tl-row"><span className="tl-lbl">Default credit period</span><span className="tl-colon">:</span><span className="tl-val">
                <select style={rs()} value={form.paymentTerms} onChange={e=>set('paymentTerms',e.target.value)} onFocus={onFocus} onBlur={onBlur()}>
                  {['Advance','7 Days','15 Days','30 Days','45 Days','60 Days','90 Days','On Delivery'].map(o=><option key={o} value={o}>{o}</option>)}
                </select></span></div>
              <div className="tl-row"><span className="tl-lbl">Credit limit</span><span className="tl-colon">:</span><span className="tl-val">
                <input style={ri()} value={form.creditLimit} onChange={e=>set('creditLimit',e.target.value.replace(/\D/g,''))} placeholder="0" onFocus={onFocus} onBlur={onBlur()} />
                <select style={{ ...rs(), width:80 }} value={form.currency} onChange={e=>set('currency',e.target.value)}>{['INR','USD','EUR','GBP','AED'].map(o=><option key={o} value={o}>{o}</option>)}</select>
              </span></div>
              <div className="tl-row top"><span className="tl-lbl">Payment modes</span><span className="tl-colon">:</span><span className="tl-val">
                <MultiCheck options={['NEFT','RTGS','IMPS','Cheque','Cash','UPI','DD','Credit Card']} selected={form.paymentModes} onChange={v=>set('paymentModes',v)} error={errs.paymentModes}/>
              </span></div>

              <div className="tl-sec">Bank Details</div>
              <div className="tl-row"><span className="tl-lbl">Bank name</span><span className="tl-colon">:</span><span className="tl-val">
                <select style={rs()} value={form.bankName} onChange={e=>set('bankName',e.target.value)} onFocus={onFocus} onBlur={onBlur()}>
                  <option value="">— Select Bank —</option>
                  {['State Bank of India','HDFC Bank','ICICI Bank','Axis Bank','Punjab National Bank','Bank of Baroda','Canara Bank','Union Bank of India','Kotak Mahindra Bank','IndusInd Bank','Yes Bank','IDBI Bank','Federal Bank','South Indian Bank','Other'].map(o=><option key={o} value={o}>{o}</option>)}
                </select></span></div>
              <div className="tl-row"><span className="tl-lbl">A/c holder's name</span><span className="tl-colon">:</span><span className="tl-val"><input style={ri()} value={form.accountHolder} onChange={e=>set('accountHolder',e.target.value)} onFocus={onFocus} onBlur={onBlur()} /></span></div>
              <div className="tl-row"><span className="tl-lbl">A/c no.</span><span className="tl-colon">:</span><span className="tl-val"><input style={ri()} value={form.accountNo} onChange={e=>set('accountNo',e.target.value.replace(/\D/g,''))} onFocus={onFocus} onBlur={onBlur()} /></span></div>
              <div className="tl-row"><span className="tl-lbl">IFS code</span><span className="tl-colon">:</span><span className="tl-val">
                <input style={ri(!!errs.ifsc)} value={form.ifsc} maxLength={11} onChange={e=>set('ifsc',e.target.value.toUpperCase())} placeholder="SBIN0001234" onFocus={onFocus} onBlur={onBlur(errs.ifsc)} />
                {form.ifsc.length===11&&validators.ifsc(form.ifsc)&&<span style={{ fontSize:11, color:'#10b981', fontWeight:700, whiteSpace:'nowrap' }}>✓ Valid</span>}
              </span></div>
              <div className="tl-row"><span className="tl-lbl">Branch</span><span className="tl-colon">:</span><span className="tl-val"><input style={ri()} value={form.branch} onChange={e=>set('branch',e.target.value)} onFocus={onFocus} onBlur={onBlur()} /></span></div>
              <div className="tl-row"><span className="tl-lbl">UPI ID</span><span className="tl-colon">:</span><span className="tl-val"><input style={ri()} value={form.upi} onChange={e=>set('upi',e.target.value)} placeholder="name@bank" onFocus={onFocus} onBlur={onBlur()} /></span></div>

              <div className="tl-sec">Documents</div>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {documents.map((doc,idx)=>(
                  <div key={doc.id} style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <span style={{ fontSize:11, color:'#94a3b8', width:16 }}>{idx+1}.</span>
                    <input value={doc.name} placeholder="Document name" onChange={e=>setDocuments(d=>d.map(x=>x.id===doc.id?{...x,name:e.target.value}:x))} style={{ ...ri(), flex:1 }} />
                    <input type="file" onChange={e=>setDocuments(d=>d.map(x=>x.id===doc.id?{...x,file:e.target.files[0]}:x))} style={{ fontSize:10.5, fontFamily:F, flex:1 }} accept=".pdf,.jpg,.png,.doc,.docx" />
                    {documents.length>1&&<button type="button" onClick={()=>setDocuments(d=>d.filter(x=>x.id!==doc.id))} style={{ padding:'2px 7px', background:'#fef2f2', border:'1px solid #fecaca', color:'#dc2626', borderRadius:4, cursor:'pointer', fontSize:11 }}>✕</button>}
                  </div>
                ))}
                <button type="button" onClick={()=>setDocuments(d=>[...d,{id:Math.max(...d.map(x=>x.id))+1,name:'',file:null}])}
                  style={{ alignSelf:'flex-start', padding:'4px 12px', borderRadius:6, cursor:'pointer', background:'#faf5ff', border:'1.5px dashed #ddd6fe', color:'#7c3aed', fontSize:11.5, fontWeight:600, fontFamily:F }}>+ Add document</button>
              </div>
            </div>

            {/* ── RIGHT: mailing / tax registration / contact — Tally's right-hand panel ── */}
            <div style={{ padding:'12px 16px' }}>
              <div className="tl-sec">Mailing Details</div>
              <div className="tl-row"><span className="tl-lbl">Name</span><span className="tl-colon">:</span><span className="tl-val"><b style={{ fontSize:12.5 }}>{form.clientName || <span style={{ color:'#9CA3AF', fontWeight:400 }}>same as ledger name</span>}</b></span></div>
              <div className="tl-row top"><span className="tl-lbl">Address <span style={{ color:'#DC2626' }}>*</span></span><span className="tl-colon">:</span><span className="tl-val">
                <textarea className="csap-input" value={form.billingAddr} onChange={e=>set('billingAddr',e.target.value)} rows={3} placeholder="Line 1&#10;Line 2&#10;Line 3"
                  style={{ ...ri(!!errs.billingAddr), height:'auto', minHeight:66, padding:'5px 8px', resize:'vertical', lineHeight:1.45 }} onFocus={onFocus} onBlur={onBlur(errs.billingAddr)} />
              </span></div>
              <div className="tl-row"><span className="tl-lbl">City</span><span className="tl-colon">:</span><span className="tl-val"><input style={ri(!!errs.city)} value={form.city} onChange={e=>set('city',e.target.value)} placeholder="Town / city" onFocus={onFocus} onBlur={onBlur(errs.city)} /></span></div>
              <div className="tl-row"><span className="tl-lbl">State <span style={{ color:'#DC2626' }}>*</span></span><span className="tl-colon">:</span><span className="tl-val">
                <select style={rs(!!errs.state)} value={form.state} onChange={e=>set('state',e.target.value)} onFocus={onFocus} onBlur={onBlur(errs.state)}>
                  <option value="">— Select State —</option>{STATES.map(s=><option key={s} value={s}>{s}</option>)}
                </select></span></div>
              <div className="tl-row"><span className="tl-lbl">Country</span><span className="tl-colon">:</span><span className="tl-val"><input style={ri()} value={form.country} onChange={e=>set('country',e.target.value)} onFocus={onFocus} onBlur={onBlur()} /></span></div>
              <div className="tl-row"><span className="tl-lbl">Pincode</span><span className="tl-colon">:</span><span className="tl-val"><input style={{ ...ri(!!errs.pincode), width:140 }} value={form.pincode} maxLength={6} onChange={e=>set('pincode',e.target.value.replace(/\D/g,''))} placeholder="6 digits" onFocus={onFocus} onBlur={onBlur(errs.pincode)} />
                {errs.pincode && <span style={{ color:'#DC2626', fontSize:11 }}>{errs.pincode}</span>}</span></div>

              <div className="tl-sec">Tax Registration Details</div>
              <div className="tl-row"><span className="tl-lbl">PAN / IT no.</span><span className="tl-colon">:</span><span className="tl-val"><input style={ri(!!errs.pan)} value={form.pan} maxLength={10} onChange={e=>set('pan',e.target.value.toUpperCase())} placeholder="ABCDE1234F" onFocus={onFocus} onBlur={onBlur(errs.pan)} />
                {errs.pan && <span style={{ color:'#DC2626', fontSize:11, whiteSpace:'nowrap' }}>Invalid</span>}</span></div>
              <div className="tl-row"><span className="tl-lbl">Registration type</span><span className="tl-colon">:</span><span className="tl-val" style={{ flexWrap:'wrap' }}>
                {['Regular','Composition','Unregistered','Consumer','SEZ'].map(t=>(
                  <button key={t} type="button" onClick={()=>{ set('gstType',t); set('gstRegistered', t !== 'Unregistered' && t !== 'Consumer'); }} style={{ padding:'3px 9px', borderRadius:4, border:`1px solid ${form.gstType===t?P:'#D1D5DB'}`,
                    background:form.gstType===t?'#DBEAFE':'#fff', color:form.gstType===t?P:'#6B7280', fontSize:11.5, fontWeight:form.gstType===t?700:400, cursor:'pointer', fontFamily:F }}>{t}</button>
                ))}</span></div>
              <div className="tl-row"><span className="tl-lbl">GSTIN / UIN</span><span className="tl-colon">:</span><span className="tl-val" style={{ flexDirection:'column', alignItems:'stretch' }}>
                <input style={{ ...ri(!!errs.gst), fontFamily:'monospace', letterSpacing:'0.5px' }} value={form.gst} maxLength={15} onChange={e=>set('gst',e.target.value.toUpperCase())} placeholder="22AAAAA0000A1Z5 — fills State & PAN" onFocus={onFocus} onBlur={onBlur(errs.gst)} />
                {gstWarn && <span style={{ fontSize:11, color:'#10b981', fontWeight:600 }}>✓ {gstWarn}</span>}
                {errs.gst && <span style={{ color:'#DC2626', fontSize:11 }}>{errs.gst}</span>}
              </span></div>
              <div className="tl-row"><span className="tl-lbl">CIN</span><span className="tl-colon">:</span><span className="tl-val"><input style={ri()} value={form.cin} onChange={e=>set('cin',e.target.value.toUpperCase())} placeholder="U74999MH2020PTC123456" onFocus={onFocus} onBlur={onBlur()} /></span></div>
              <div className="tl-row"><span className="tl-lbl">MSME / Udyam</span><span className="tl-colon">:</span><span className="tl-val"><input style={ri()} value={form.msme} onChange={e=>set('msme',e.target.value.toUpperCase())} placeholder="UDYAM-XX-00-0000000" onFocus={onFocus} onBlur={onBlur()} /></span></div>
              <div className="tl-row"><span className="tl-lbl">TDS applicable</span><span className="tl-colon">:</span><span className="tl-val"><Toggle id="tdsT" checked={form.tdsApplicable} onChange={e=>set('tdsApplicable',e.target.checked)}/></span></div>

              <div className="tl-sec">Contact Details</div>
              <div className="tl-row"><span className="tl-lbl">Contact person</span><span className="tl-colon">:</span><span className="tl-val"><input style={ri(!!errs.contactPerson)} value={form.contactPerson} onChange={e=>set('contactPerson',e.target.value)} placeholder="Full name" onFocus={onFocus} onBlur={onBlur(errs.contactPerson)} /></span></div>
              <div className="tl-row"><span className="tl-lbl">Mobile no.</span><span className="tl-colon">:</span><span className="tl-val"><input style={ri(!!errs.mobile)} value={form.mobile} maxLength={10} onChange={e=>set('mobile',e.target.value.replace(/\D/g,''))} placeholder="10 digits" onFocus={onFocus} onBlur={onBlur(errs.mobile)} />
                <input style={ri(!!errs.altMobile)} value={form.altMobile} maxLength={10} onChange={e=>set('altMobile',e.target.value.replace(/\D/g,''))} placeholder="Alternate" onFocus={onFocus} onBlur={onBlur(errs.altMobile)} />
                {(errs.mobile||errs.altMobile) && <span style={{ color:'#DC2626', fontSize:11, whiteSpace:'nowrap' }}>Invalid</span>}</span></div>
              <div className="tl-row"><span className="tl-lbl">Phone (landline)</span><span className="tl-colon">:</span><span className="tl-val"><input style={ri()} value={form.landline} onChange={e=>set('landline',e.target.value)} placeholder="STD + number" onFocus={onFocus} onBlur={onBlur()} /></span></div>
              <div className="tl-row"><span className="tl-lbl">E-mail</span><span className="tl-colon">:</span><span className="tl-val"><input type="email" style={ri(!!errs.email)} value={form.email} onChange={e=>set('email',e.target.value)} placeholder="name@company.com" onFocus={onFocus} onBlur={onBlur(errs.email)} /></span></div>
              <div className="tl-row"><span className="tl-lbl">Website</span><span className="tl-colon">:</span><span className="tl-val"><input style={ri()} value={form.website} onChange={e=>set('website',e.target.value)} placeholder="https://" onFocus={onFocus} onBlur={onBlur()} /></span></div>

              <div className="tl-sec" style={{ display:'flex', alignItems:'center', gap:10 }}>Shipping Address
                <button type="button" onClick={()=>set('shippingAddr',form.billingAddr)} style={{ textDecoration:'none', padding:'1px 9px', borderRadius:4, border:'1px solid #D1D5DB', background:'#EFF6FF', color:P, cursor:'pointer', fontSize:11, fontWeight:600, fontFamily:F }}>📋 Same as mailing</button></div>
              <textarea className="csap-input" value={form.shippingAddr} onChange={e=>set('shippingAddr',e.target.value)} rows={2} placeholder="Leave blank if same as mailing address"
                style={{ ...ri(), height:'auto', minHeight:50, padding:'5px 8px', resize:'vertical' }} onFocus={onFocus} onBlur={onBlur()} />

              <div className="tl-sec">Notes</div>
              <textarea className="csap-input" value={form.remarks} onChange={e=>set('remarks',e.target.value)} rows={2} placeholder="Internal notes about this client"
                style={{ ...ri(), height:'auto', minHeight:50, padding:'5px 8px', resize:'vertical' }} onFocus={onFocus} onBlur={onBlur()} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer (sticky, dark navy — matches Vendor Create) ── */}
      <div style={{
        flexShrink:0, padding:'10px 20px', background:'#1E293B', borderTop:'1px solid #334155',
        display:'flex', alignItems:'center', justifyContent:'space-between',
      }}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:11.5,color:'#94A3B8',fontFamily:F}}>
            {Object.keys(errs).some(k=>errs[k]) ? <span style={{color:'#FCA5A5',fontWeight:700}}>Fix the fields marked in red</span> : <>Required: <strong style={{color:'#E2E8F0'}}>Name, Address, State</strong> · Ctrl+S to save</>}
          </span>
        </div>
        <div style={{display:'flex',gap:8}}>
          {isEdit
            ? <button type="button" onClick={() => navigate('/client/view')} style={{height:32,padding:'0 14px',borderRadius:6,cursor:'pointer',background:'transparent',border:'1px solid #475569',color:'#94A3B8',fontSize:11.5,fontWeight:600,fontFamily:F}}>← Back to List</button>
            : <button type="button" onClick={handleReset} style={{height:32,padding:'0 14px',borderRadius:6,cursor:'pointer',background:'transparent',border:'1px solid #475569',color:'#94A3B8',fontSize:11.5,fontWeight:600,fontFamily:F}}>Reset</button>
          }
          {!isEdit && <button type="button" onClick={()=>setToast({type:'success',msg:'Draft saved!'})} style={{height:32,padding:'0 16px',borderRadius:6,cursor:'pointer',background:'#F59E0B',border:'none',color:'#fff',fontSize:11.5,fontWeight:700,fontFamily:F}}>💾 Save Draft</button>}
          <button type="button" onClick={()=> isEdit ? handleSave() : setShowApproverPicker(true)} disabled={saving} style={{height:32,padding:'0 18px',borderRadius:6,cursor:saving?'not-allowed':'pointer',background:'#2563EB',border:'none',color:'#fff',fontSize:11.5,fontWeight:700,fontFamily:F,opacity:saving?0.6:1}}>{saving?'⏳ Saving…': isEdit ? '✅ Update Client' : '✅ Save Client'}</button>
          {can(user,'client','approve') && form.status !== 'approved' && (
            <button type="button" onClick={()=>handleSave('', 'approved')} disabled={saving} style={{height:32,padding:'0 18px',borderRadius:6,cursor:saving?'not-allowed':'pointer',background:'#16A34A',border:'none',color:'#fff',fontSize:11.5,fontWeight:700,fontFamily:F,opacity:saving?0.6:1}}>✓ Save &amp; Approve</button>
          )}
          {showApproverPicker && (
            <ApproverPickerModal module="client" recordLabel={`Client ${form.clientName||''}`}
              onConfirm={(approverId)=>{ setShowApproverPicker(false); handleSave(approverId); }}
              onCancel={()=>setShowApproverPicker(false)} />
          )}
        </div>
      </div>
    </div>
  );
}
