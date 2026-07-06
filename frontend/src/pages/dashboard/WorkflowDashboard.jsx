import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';

const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const fmtINR = n => {
  const v = parseFloat(n) || 0;
  if (v >= 10000000) return `₹${(v/10000000).toFixed(2)} Cr`;
  if (v >= 100000)   return `₹${(v/100000).toFixed(2)} L`;
  if (v >= 1000)     return `₹${(v/1000).toFixed(1)} K`;
  return `₹${v.toFixed(0)}`;
};

/* ── Workflow phases data ── */
const PHASES = [
  {
    no: '1st', label: 'ORDER RECEIPT & DOCUMENTATION', color: '#166534', light: '#dcfce7',
    border: '#16a34a', accent: '#15803d', textOnDark: '#fff',
    steps: [
      { no:1, icon:'📋', title:'Receive Order\nfrom Client',   desc:'Check all details, scope & terms',                                  path:'/client/view' },
      { no:2, icon:'📁', title:'Create Jobcode\n& Save',       desc:'Create and save in Project Folder',                                  path:'/project/list' },
      { no:3, icon:'🖥ï¸', title:'Entry in Tally\n& Local Portal', desc:'Make entry in Tally and Local Portal',                           path:'/tally/import' },
      { no:4, icon:'📄', title:'Save PDF in\nProject Folder',  desc:'Save PDF with Seal & Sign of Authorized Person',                    path:'/project/list' },
      { no:5, icon:'📐', title:'Specs Drawing &\nScope of Work', desc:'Create or find specs drawing, add all add-on items & scope of work', path:'/sales-order/create' },
      { no:6, icon:'✅', title:'Client\nApproval',             desc:'Get approval from client',                                           path:'/sales-order/pending' },
      { no:7, icon:'💰', title:'Payment\nTerms',               desc:'Govt: No Advance. Private: Raise Proforma Invoice & Get Payment',   path:'/sales-order/view' },
    ],
  },
  {
    no: '2nd', label: 'PURCHASE ORDER PROCESS', color: '#104f4f', light: '#dbeafe',
    border: '#2563eb', accent: '#1d4ed8', textOnDark: '#fff',
    steps: [
      { no:1, icon:'📝', title:'Create Purchase\nOrder (PO)',         desc:'Create PO with Specs Diagram, Scope of Work & all Add-on Items to different Vendors', path:'/purchase-order/create' },
      { no:2, icon:'💳', title:'Release Advance\nPayment',            desc:'Release advance payment to vendor as per terms',                                        path:'/account/payment/create' },
      { no:3, icon:'📦', title:'Material Ready\nat Vendor',           desc:'Vendor prepares material as per approved specs',                                         path:'/purchase-order/tracking' },
      { no:4, icon:'🔍', title:'Inspection /\nClient Approval',       desc:'Get photos from vendor or Raise Inspection Call to Client to inspect material',          path:'/purchase-order/pending' },
      { no:5, icon:'✅', title:'Client Approval\nfor Dispatch',       desc:'Get approval from client for dispatch',                                                   path:'/purchase-order/view' },
      { no:6, icon:'🚚', title:'Dispatch from\nVendor',               desc:'Material dispatched to our office / site',                                               path:'/delivery-challan/view' },
    ],
  },
  {
    no: '3rd', label: 'PURCHASE SETTLEMENT', color: '#7c2d12', light: '#ffedd5',
    border: '#ea580c', accent: '#c2410c', textOnDark: '#fff',
    steps: [
      { no:1, icon:'🏦', title:'Release Balance\nPayment (Excl. GST)', desc:'Release balance payment to vendor (excluding GST) upon delivery & documents', path:'/account/payment/create' },
      { no:2, icon:'🧾', title:'Get Bill from\nVendor',               desc:'Vendor provides bill (with GST)',                                              path:'/purchase-bill' },
      { no:3, icon:'📊', title:'GST\nFiling',                         desc:'File GST as per government norms',                                             path:'/gst/compliance' },
      { no:4, icon:'🏛ï¸', title:'Remit GST after\nTDS Deduction',      desc:'Remit GST amount after TDS deduction (if applicable) to Government',           path:'/account/journal/view' },
    ],
  },
  {
    no: '4th', label: 'SALES, DISPATCH & PAYMENT COLLECTION', color: '#4c1d95', light: '#ede9fe',
    border: '#7c3aed', accent: '#6d28d9', textOnDark: '#fff',
    steps: [
      { no:1, icon:'📑', title:'Prepare Sales\nDocuments',       desc:'Sales Bill, ASN, Delivery Challan, Warranty Certificate, Bank Guarantee, Other Docs', path:'/sales-bill' },
      { no:2, icon:'🚛', title:'Dispatch Material\nto Site',     desc:'Dispatch material along with all documents',                                          path:'/delivery-challan/view' },
      { no:3, icon:'🔧', title:'Installation of\nAdd-on Items',  desc:'At site installation of add-on items (AC, TV, etc.) if supplied',                    path:'/manufacturing/job-sheets' },
      { no:4, icon:'🤝', title:'Client\nAcceptance',             desc:'Client verifies & accepts the material & installation (if applicable)',               path:'/project/list' },
      { no:5, icon:'📬', title:'Raise Invoice &\nFollow Up',     desc:'Raise final invoice and follow up for payment on due date',                           path:'/sales-bill' },
      { no:6, icon:'💵', title:'Payment Received\nafter TDS',    desc:'Receive payment after TDS & other deductions (if applicable)',                        path:'/account/receipt/create' },
    ],
    final: true,
  },
];

/* ── Quick links for sidebar-style shortcuts ── */
const QUICK = [
  { icon:'📋', label:'New Sales Order',    path:'/sales-order/create',      color:'#16a34a' },
  { icon:'📝', label:'New Purchase Order', path:'/purchase-order/create',   color:'#2563eb' },
  { icon:'🧾', label:'Sales Bill',         path:'/sales-bill',              color:'#7c3aed' },
  { icon:'📦', label:'PO Tracking',        path:'/purchase-order/tracking', color:'#d97706' },
  { icon:'🚚', label:'Delivery Challan',   path:'/delivery-challan/view',   color:'#0891b2' },
  { icon:'💰', label:'Record Payment',     path:'/account/payment/create',  color:'#dc2626' },
  { icon:'💵', label:'Record Receipt',     path:'/account/receipt/create',  color:'#059669' },
  { icon:'📊', label:'GST Compliance',     path:'/gst/compliance',          color:'#b45309' },
  { icon:'📁', label:'Projects',           path:'/project/list',            color:'#6d28d9' },
  { icon:'👥', label:'Clients',            path:'/client/view',             color:'#0f766e' },
];

/* ── Step card ── */
function StepCard({ step, color, border, light, onClick, isLast, final }) {
  const [hover, setHover] = useState(false);
  return (
    <div style={{ display:'flex', alignItems:'flex-start', gap:0 }}>
      <div onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{ cursor:'pointer', width:120, minHeight:140, background: hover ? color : '#fff',
          border:`2px solid ${border}`, borderRadius:10, padding:'10px 8px',
          display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center',
          transition:'all 0.18s', boxShadow: hover?`0 6px 18px ${border}55`:'0 1px 4px rgba(0,0,0,0.08)',
          transform: hover?'translateY(-3px)':'none', position:'relative', flexShrink:0 }}>
        {/* step number badge */}
        <div style={{ position:'absolute', top:-10, left:-10, width:24, height:24, borderRadius:'50%',
          background: color, color:'#fff', fontSize:11, fontWeight:800,
          display:'flex', alignItems:'center', justifyContent:'center', border:'2px solid #fff',
          boxShadow:'0 2px 6px rgba(0,0,0,0.2)' }}>{step.no}</div>
        <div style={{ fontSize:26, marginBottom:4, marginTop:4 }}>{step.icon}</div>
        <div style={{ fontSize:10.5, fontWeight:800, color: hover?'#fff':color,
          lineHeight:1.4, whiteSpace:'pre-line' }}>{step.title}</div>
        <div style={{ fontSize:9, color: hover?'rgba(255,255,255,0.85)':'#6B7280',
          marginTop:4, lineHeight:1.4 }}>{step.desc}</div>
        {hover && <div style={{ position:'absolute', bottom:4, right:4, fontSize:8, color:'rgba(255,255,255,0.7)' }}>Click →</div>}
      </div>
      {!isLast && (
        <div style={{ display:'flex', alignItems:'center', paddingTop:55, paddingLeft:2, paddingRight:2 }}>
          <div style={{ fontSize:18, color:border, fontWeight:900 }}>→</div>
        </div>
      )}
      {final && isLast && (
        <div style={{ display:'flex', alignItems:'center', paddingTop:55, paddingLeft:2, paddingRight:2 }}>
          <div style={{ fontSize:18, color:border, fontWeight:900 }}>→</div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════ MAIN ══════════════════════ */
export default function WorkflowDashboard() {
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;

  const [stats, setStats] = useState({ orders:0, pos:0, pendingPayment:0, salesTotal:0 });

  const load = useCallback(async () => {
    if (!cid) return;
    try {
      const [soR, poR] = await Promise.all([
        axios.get(`/api/sales-orders?companyId=${cid}`).catch(()=>({data:[]})),
        axios.get(`/api/purchase-orders?companyId=${cid}`).catch(()=>({data:[]})),
      ]);
      const sos = soR.data || [];
      const pos = poR.data || [];
      setStats({
        orders: sos.length,
        pos:    pos.length,
        pendingPayment: pos.filter(p=>p.status==='pending').length,
        salesTotal: sos.reduce((s,o)=>s+(parseFloat(o.grandTotal)||0), 0),
      });
    } catch {}
  }, [cid]);

  useEffect(() => { load(); }, [load]);

  const today = new Date().toLocaleDateString('en-IN', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });

  return (
    <div style={{ background:'#F0F4F8', minHeight:'100%', fontFamily:F, overflowX:'hidden' }}>

      {/* ── Top bar ── */}
      <div style={{ background:'linear-gradient(135deg,#104f4f 0%,#133d80 60%,#1d4ed8 100%)',
        padding:'14px 24px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ fontSize:18, fontWeight:900, color:'#fff', letterSpacing:'-0.3px' }}>
            {selectedCompany?.companyName || 'Epsilon Enterprise'}
          </div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.65)', marginTop:2 }}>{today}</div>
        </div>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap', justifyContent:'flex-end' }}>
          {[
            { label:'Sales Orders', value:stats.orders, color:'#34d399' },
            { label:'Purchase Orders', value:stats.pos, color:'#60a5fa' },
            { label:'Pending POs', value:stats.pendingPayment, color:'#fbbf24' },
            { label:'Sales Value', value:fmtINR(stats.salesTotal), color:'#a78bfa' },
          ].map(k => (
            <div key={k.label} style={{ textAlign:'center', padding:'6px 14px', background:'rgba(255,255,255,0.1)',
              borderRadius:8, border:'1px solid rgba(255,255,255,0.15)' }}>
              <div style={{ fontSize:16, fontWeight:800, color:k.color }}>{k.value}</div>
              <div style={{ fontSize:9.5, color:'rgba(255,255,255,0.65)', marginTop:2 }}>{k.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Quick access shortcuts ── */}
      <div style={{ background:'#fff', padding:'10px 24px', borderBottom:'1px solid #E5EAF2',
        display:'flex', gap:8, overflowX:'auto', flexWrap:'nowrap' }}>
        <span style={{ fontSize:11, fontWeight:700, color:'#6B7280', alignSelf:'center', whiteSpace:'nowrap', marginRight:4 }}>Quick Access:</span>
        {QUICK.map(q => (
          <button key={q.path+q.label} onClick={() => navigate(q.path)}
            style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 12px',
              background:'#F8FAFF', border:`1px solid ${q.color}40`, borderRadius:20,
              cursor:'pointer', fontSize:11, fontWeight:600, color:q.color,
              whiteSpace:'nowrap', flexShrink:0, transition:'all 0.15s',
              fontFamily:F }}
            onMouseEnter={e=>{ e.currentTarget.style.background=q.color; e.currentTarget.style.color='#fff'; }}
            onMouseLeave={e=>{ e.currentTarget.style.background='#F8FAFF'; e.currentTarget.style.color=q.color; }}>
            {q.icon} {q.label}
          </button>
        ))}
      </div>

      {/* ── Workflow chart ── */}
      <div style={{ padding:'16px 20px' }}>

        {/* Chart header */}
        <div style={{ background:'linear-gradient(135deg,#104f4f,#133d80)', borderRadius:'12px 12px 0 0',
          padding:'14px 24px', textAlign:'center', marginBottom:0 }}>
          <div style={{ fontSize:17, fontWeight:900, color:'#fff', letterSpacing:'1px', textTransform:'uppercase' }}>
            Complete Workflow Chart – From Order to Payment
          </div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.75)', marginTop:4 }}>
            👤 Role: Admin &nbsp;|&nbsp; Responsibility: Manage Entire Process – From Order to Payment Collection
          </div>
        </div>

        {/* Phases */}
        {PHASES.map((phase, pi) => (
          <div key={pi} style={{ background:'#fff', borderLeft:`1px solid #E5EAF2`,
            borderRight:`1px solid #E5EAF2`,
            borderBottom: pi===PHASES.length-1 ? `1px solid #E5EAF2` : 'none',
            borderRadius: pi===PHASES.length-1 ? '0 0 12px 12px' : '0',
            marginBottom: 0 }}>
            {/* Phase header */}
            <div style={{ background:phase.color, padding:'8px 20px', display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:28, height:28, borderRadius:'50%', background:'rgba(255,255,255,0.25)',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:11, fontWeight:900, color:'#fff', flexShrink:0 }}>
                {phase.no.replace('st','').replace('nd','').replace('rd','').replace('th','')}
              </div>
              <div style={{ fontSize:12, fontWeight:800, color:'#fff', letterSpacing:'0.5px' }}>
                {phase.no} PHASE – {phase.label}
              </div>
            </div>

            {/* Phase steps */}
            <div style={{ padding:'16px 20px 14px', display:'flex', alignItems:'flex-start',
              overflowX:'auto', gap:0, background:phase.light+'50' }}>
              {phase.steps.map((step, si) => (
                <StepCard key={si}
                  step={step}
                  color={phase.color}
                  border={phase.border}
                  light={phase.light}
                  isLast={si === phase.steps.length - 1}
                  final={phase.final}
                  onClick={() => navigate(step.path)}
                />
              ))}
              {/* Final "PROCESS COMPLETED" badge for phase 4 */}
              {phase.final && (
                <div style={{ display:'flex', alignItems:'center', paddingTop:45 }}>
                  <div style={{ width:90, height:90, borderRadius:10, background:'#16a34a',
                    display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                    border:'3px solid #15803d', boxShadow:'0 4px 16px #16a34a55', flexShrink:0 }}>
                    <div style={{ fontSize:22 }}>✅</div>
                    <div style={{ fontSize:9, fontWeight:900, color:'#fff', textAlign:'center', lineHeight:1.3, marginTop:4 }}>
                      PROCESS<br/>COMPLETED<br/>SUCCESSFULLY
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Quick Summary Flow */}
        <div style={{ marginTop:14, background:'#fff', border:'1px solid #E5EAF2',
          borderRadius:12, padding:'14px 20px' }}>
          <div style={{ fontSize:12, fontWeight:800, color:'#1E293B', marginBottom:12,
            textAlign:'center', letterSpacing:'0.5px' }}>QUICK SUMMARY FLOW</div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:0, flexWrap:'wrap' }}>
            {[
              { icon:'📋', label:'Order Received\n& Documentation',  color:'#16a34a', path:'/sales-order/create' },
              { icon:'🛒', label:'Purchase Order\nProcess',          color:'#2563eb', path:'/purchase-order/create' },
              { icon:'💳', label:'Purchase\nSettlement',            color:'#ea580c', path:'/purchase-bill' },
              { icon:'🚛', label:'Sales, Dispatch\n& Installation',  color:'#7c3aed', path:'/sales-bill' },
              { icon:'🏦', label:'Payment\nCollection',             color:'#0891b2', path:'/account/receipt/create' },
              { icon:'✅', label:'Process\nCompleted',              color:'#16a34a', path:'/dashboard' },
            ].map((item, i, arr) => (
              <React.Fragment key={i}>
                <div onClick={()=>navigate(item.path)}
                  style={{ display:'flex', flexDirection:'column', alignItems:'center', cursor:'pointer',
                    padding:'8px 12px', borderRadius:8, border:`2px solid ${item.color}30`,
                    background:`${item.color}08`, minWidth:90, transition:'all 0.15s' }}
                  onMouseEnter={e=>e.currentTarget.style.background=`${item.color}20`}
                  onMouseLeave={e=>e.currentTarget.style.background=`${item.color}08`}>
                  <div style={{ width:44, height:44, borderRadius:'50%', background:item.color,
                    display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, marginBottom:5 }}>
                    {item.icon}
                  </div>
                  <div style={{ fontSize:9.5, fontWeight:700, color:'#374151', textAlign:'center',
                    lineHeight:1.4, whiteSpace:'pre-line' }}>{item.label}</div>
                </div>
                {i < arr.length-1 && (
                  <div style={{ fontSize:20, color:'#9CA3AF', padding:'0 4px', alignSelf:'center' }}>→</div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Key Notes */}
        <div style={{ marginTop:12, background:'#fff', border:'1px solid #E5EAF2',
          borderRadius:12, padding:'14px 20px' }}>
          <div style={{ fontSize:12, fontWeight:800, color:'#1E293B', marginBottom:10 }}>🔑 Key Notes</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))', gap:'6px 20px' }}>
            {[
              'Maintain all documents in Project Folder',
              'Always take approvals in writing',
              'Follow payment terms strictly',
              'Ensure timely GST filing & compliance',
              'Maintain good communication with client & vendor',
              'Keep record of all payments & deductions',
            ].map((note, i) => (
              <div key={i} style={{ display:'flex', gap:6, alignItems:'flex-start', fontSize:11, color:'#374151' }}>
                <span style={{ color:'#16a34a', fontWeight:800, flexShrink:0 }}>✓</span>
                <span>{note}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom tip */}
        <div style={{ marginTop:10, padding:'10px 18px', background:'#FFFBEB', borderRadius:8,
          border:'1px solid #FCD34D', display:'flex', gap:10, alignItems:'center' }}>
          <span style={{ fontSize:18 }}>💡</span>
          <span style={{ fontSize:11, color:'#78350f', lineHeight:1.5 }}>
            Follow this workflow step-by-step to ensure smooth operations, proper documentation,
            timely payments and happy clients. Click any step to navigate to the relevant module.
          </span>
        </div>

      </div>
    </div>
  );
}
