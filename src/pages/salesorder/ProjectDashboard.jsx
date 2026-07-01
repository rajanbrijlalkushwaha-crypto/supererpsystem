import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';

/* ═══════════════════════════════════
   COLOR PALETTE
═══════════════════════════════════ */
const C = {
  shell:    '#2F6FED',
  accent:   '#0070F2',
  bg:       '#F0F2F5',
  white:    '#ffffff',
  text:     '#32363A',
  muted:    '#6A6D70',
  border:   '#E5E5E5',

  // Section colors
  blue:     { bg:'#EBF4FF', border:'#0070F2', text:'#003D8F' },
  green:    { bg:'#EAFBEA', border:'#188918', text:'#145214' },
  orange:   { bg:'#FFF5EB', border:'#E67E00', text:'#7A3B00' },
  purple:   { bg:'#F5EEFF', border:'#6B3FA0', text:'#3D1A6E' },
  red:      { bg:'#FEF0F0', border:'#BB0000', text:'#7A0000' },

  // Status colors
  draft:    { bg:'#F0F0F0', text:'#555', border:'#bbb' },
  approved: { bg:'#E8F5E9', text:'#1B5E20', border:'#4CAF50' },
  inprog:   { bg:'#E3F2FD', text:'#0D47A1', border:'#1E88E5' },
  completed:{ bg:'#E8F5E9', text:'#1B5E20', border:'#43A047' },
  pending:  { bg:'#FFF8E1', text:'#5D4037', border:'#FFC107' },
  rejected: { bg:'#FEF0F0', text:'#7A0000', border:'#BB0000' },
};

/* ═══════════════════════════════════
   HELPERS
═══════════════════════════════════ */
function statusColor(s='draft') {
  const m = { draft:C.draft, approved:C.approved, 'in-progress':C.inprog, 'in progress':C.inprog, completed:C.completed, pending:C.pending, rejected:C.rejected };
  return m[(s||'').toLowerCase()] || C.draft;
}

function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }); } catch { return d; }
}

function fmtMoney(n) {
  return '₹' + (parseFloat(n)||0).toLocaleString('en-IN', { minimumFractionDigits:0, maximumFractionDigits:0 });
}

/* ═══════════════════════════════════
   SUB-COMPONENTS
═══════════════════════════════════ */

// Collapsible Section wrapper
function Section({ title, icon, theme, count, defaultOpen=true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{
      marginBottom: 14,
      border: `1.5px solid ${theme.border}`,
      borderRadius: 8,
      background: C.white,
      overflow: 'hidden',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    }}>
      <div
        onClick={() => setOpen(o=>!o)}
        style={{
          display:'flex', alignItems:'center', gap:10,
          padding:'10px 16px',
          background: theme.bg,
          cursor:'pointer',
          userSelect:'none',
          borderBottom: open ? `1.5px solid ${theme.border}` : 'none',
        }}
      >
        <span style={{ fontSize:18 }}>{icon}</span>
        <span style={{ fontWeight:700, fontSize:13, color:theme.text, flex:1 }}>{title}</span>
        {count !== undefined && (
          <span style={{ fontSize:11, fontWeight:700, background:theme.border, color:'#fff', borderRadius:12, padding:'2px 9px' }}>
            {count}
          </span>
        )}
        <span style={{ fontSize:14, color:theme.text, transition:'transform 0.2s', transform: open?'rotate(90deg)':'rotate(0deg)' }}>›</span>
      </div>
      {open && <div style={{ padding:'14px 16px' }}>{children}</div>}
    </div>
  );
}

// Summary card
function Card({ icon, label, value, subtext, color, textColor }) {
  return (
    <div style={{
      background: color,
      border: `1.5px solid ${textColor}30`,
      borderRadius: 8,
      padding: '14px 16px',
      minWidth: 0,
      boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
        <span style={{ fontSize:22 }}>{icon}</span>
        <span style={{ fontSize:11, fontWeight:600, color:textColor, textTransform:'uppercase', letterSpacing:'0.5px' }}>{label}</span>
      </div>
      <div style={{ fontSize:26, fontWeight:800, color:textColor, lineHeight:1 }}>{value}</div>
      {subtext && <div style={{ fontSize:10, color:textColor+'99', marginTop:3 }}>{subtext}</div>}
    </div>
  );
}

// Badge
function Badge({ label, color, bg, border }) {
  return (
    <span style={{
      display:'inline-block', padding:'2px 9px', borderRadius:12,
      fontSize:11, fontWeight:700,
      background: bg, color: color,
      border: `1px solid ${border}`,
    }}>{label}</span>
  );
}

// Status badge for tasks
function TaskStatusBadge({ status }) {
  const m = {
    'Pending':     { bg:'#F0F0F0',  color:'#555',    border:'#bbb' },
    'In Progress': { bg:'#E3F2FD',  color:'#0D47A1', border:'#1E88E5' },
    'Completed':   { bg:'#E8F5E9',  color:'#1B5E20', border:'#43A047' },
  };
  const s = m[status] || m['Pending'];
  return <Badge label={status} bg={s.bg} color={s.color} border={s.border} />;
}

// Priority dot
function PriorityDot({ priority }) {
  const m = { Low:'#43A047', Medium:'#1E88E5', High:'#FB8C00', Critical:'#E53935' };
  return <span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%', background:m[priority]||'#aaa', marginRight:5 }} title={priority} />;
}

/* ═══════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════ */
const ProjectDashboard = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.companyId;

  const [order,   setOrder]   = useState(null);
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    if (!orderId) return;
    setLoading(true);
    Promise.all([
      axios.get(`/api/sales-orders/${orderId}`, { params: { companyId } }),
      axios.get(`/api/sales-orders/${orderId}/material-balance`, { params: { companyId } })
        .catch(() => ({ data: null }))
    ]).then(([r1, r2]) => {
      setOrder(r1.data);
      setBalance(r2.data);
    }).catch(err => {
      setError('Failed to load project: ' + (err.response?.data?.error || err.message));
    }).finally(() => setLoading(false));
  }, [orderId, companyId]);

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'50vh', color:C.muted, fontSize:14 }}>
      <span style={{ marginRight:8, fontSize:20 }}>⏳</span> Loading project dashboard…
    </div>
  );

  if (error) return (
    <div style={{ margin:24, padding:16, background:'#FEF0F0', border:'1px solid #BB0000', borderRadius:6, color:'#BB0000', fontSize:13 }}>
      {error}
    </div>
  );

  if (!order) return null;

  /* ── Derived data ─────────────────────── */
  const status   = (order.status || 'draft').toLowerCase();
  const sColor   = statusColor(status);
  const soNo     = order.orderNo || order.soNo || `SO-${orderId}`;
  const projName = order.projectName || order.projectTitle || order.notes?.split('\n')[0] || 'Project';
  const client   = order.clientName || '—';

  const lineItems   = order.items || [];
  const matItems    = order.materialPlanningItems || [];
  const scopeItems  = order.scopeItems || [];
  const bomItems    = order.bomItems || [];
  const tasks       = order.tasks || [];

  const grandTotal  = order.grandTotal
    || lineItems.reduce((s,it) => {
         const amt = (parseFloat(it.qty)||parseFloat(it.quantity)||0) * (parseFloat(it.rate)||0);
         return s + amt + amt*(parseFloat(it.gstPercent)||0)/100;
       }, 0);

  // Purchase stats from balance API
  const balItems    = (balance?.items || []);
  const totalMat    = matItems.length || balItems.length;
  const purchasedCount = balItems.filter(it => it.balanceQty <= 0).length;
  const pendingCount   = balItems.filter(it => it.balanceQty > 0).length;

  // Task progress
  const doneTasks = tasks.filter(t => t.status === 'Completed').length;
  const taskPct   = tasks.length ? Math.round((doneTasks/tasks.length)*100) : 0;

  // Overall progress: blend purchase + task
  const matPct  = totalMat ? Math.round((purchasedCount/totalMat)*100) : 0;
  const overallPct = tasks.length ? Math.round((matPct + taskPct)/2) : matPct;

  /* ── Scope type icon map ─── */
  const scopeIcon = { 'Supply':'📦','Add-on Material':'🔩','Installation':'🔧','Transportation':'🚛','Civil Work':'🏗️','Other':'📋' };

  return (
    <div style={{ fontFamily:"'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background:C.bg, minHeight:'100vh', paddingBottom:80 }}>

      {/* ══════════════════════════════════
          STICKY HEADER
      ══════════════════════════════════ */}
      <div style={{
        background: C.shell,
        padding: '12px 20px',
        position:'sticky', top:0, zIndex:100,
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
          <button
            onClick={() => navigate('/sales-order/view')}
            style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', borderRadius:4, padding:'4px 10px', cursor:'pointer', fontSize:13, fontFamily:'inherit' }}
          >
            ← Back
          </button>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
              <span style={{ color:'#A8C4E0', fontSize:12, fontWeight:600 }}>PROJECT DASHBOARD</span>
              <span style={{ color:'#A8C4E0', fontSize:12 }}>›</span>
              <span style={{ color:'#fff', fontSize:14, fontWeight:700 }}>{soNo}</span>
              {projName && projName !== 'Project' && (
                <>
                  <span style={{ color:'#A8C4E0', fontSize:12 }}>›</span>
                  <span style={{ color:'#E0ECFF', fontSize:13, fontWeight:600, maxWidth:260, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{projName}</span>
                </>
              )}
            </div>
            <div style={{ color:'#A8C4E0', fontSize:11, marginTop:2 }}>
              👤 {client}
              {order.orderDate && <span style={{ marginLeft:12 }}>📅 {fmtDate(order.orderDate)}</span>}
              {order.deliveryDate && <span style={{ marginLeft:12 }}>🚚 Due {fmtDate(order.deliveryDate)}</span>}
            </div>
          </div>
          {/* Status badge */}
          <span style={{
            padding:'4px 14px', borderRadius:20, fontSize:12, fontWeight:700,
            background: sColor.bg, color: sColor.text, border:`1.5px solid ${sColor.border}`,
            textTransform:'capitalize',
          }}>
            {order.status || 'Draft'}
          </span>
          {/* Action buttons */}
          <button
            onClick={() => navigate(`/sales-order/edit/${orderId}`)}
            style={{ background:'#0070F2', border:'none', color:'#fff', borderRadius:4, padding:'6px 14px', cursor:'pointer', fontSize:12, fontWeight:700, fontFamily:'inherit' }}
          >
            ✏️ Edit
          </button>
        </div>

        {/* Progress bar */}
        {totalMat > 0 && (
          <div style={{ marginTop:10 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
              <span style={{ fontSize:10, color:'#A8C4E0', fontWeight:600 }}>OVERALL PROGRESS</span>
              <span style={{ fontSize:11, color:'#fff', fontWeight:700 }}>{overallPct}%</span>
            </div>
            <div style={{ height:6, background:'rgba(255,255,255,0.2)', borderRadius:3, overflow:'hidden' }}>
              <div style={{
                height:'100%', width:`${overallPct}%`,
                background: overallPct >= 100 ? '#43A047' : overallPct >= 60 ? '#1E88E5' : '#FFC107',
                borderRadius:3, transition:'width 0.6s ease',
              }} />
            </div>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════
          CONTENT
      ══════════════════════════════════ */}
      <div style={{ padding:'16px 16px 0', maxWidth:1200, margin:'0 auto' }}>

        {/* ── Summary Cards ─────────────── */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:16 }}>
          <Card
            icon="📋" label="Total Items" value={totalMat || lineItems.length}
            subtext={lineItems.length ? `${lineItems.length} line item(s)` : undefined}
            color="#EBF4FF" textColor="#003D8F"
          />
          <Card
            icon="✅" label="Purchased" value={purchasedCount}
            subtext={totalMat ? `${Math.round(purchasedCount/totalMat*100)||0}% complete` : undefined}
            color="#EAFBEA" textColor="#145214"
          />
          <Card
            icon="⏳" label="Pending" value={pendingCount}
            subtext={pendingCount > 0 ? 'Needs PO' : 'All covered'}
            color={pendingCount > 0 ? '#FFF5EB' : '#EAFBEA'}
            textColor={pendingCount > 0 ? '#7A3B00' : '#145214'}
          />
          <Card
            icon="💰" label="Project Value" value={fmtMoney(grandTotal)}
            subtext={order.orderDate ? `Dated ${fmtDate(order.orderDate)}` : undefined}
            color="#F5EEFF" textColor="#3D1A6E"
          />
        </div>

        {/* ── SECTION 1: Scope ──────────── */}
        <Section title="Scope / Project Breakdown" icon="🎯" theme={C.blue} count={scopeItems.length}>
          {scopeItems.length === 0 ? (
            <EmptyState msg="No scope items defined" />
          ) : (
            <div style={{ display:'flex', flexWrap:'wrap', gap:10 }}>
              {scopeItems.map((sc, i) => (
                <div key={i} style={{
                  background: C.blue.bg, border:`1px solid ${C.blue.border}`,
                  borderRadius:8, padding:'10px 14px', minWidth:180, maxWidth:300, flex:'1 0 auto',
                }}>
                  <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:5 }}>
                    <span style={{ fontSize:16 }}>{scopeIcon[sc.scopeType] || '📋'}</span>
                    <span style={{ fontSize:12, fontWeight:700, color:C.blue.text }}>{sc.scopeType}</span>
                  </div>
                  {sc.description && (
                    <div style={{ fontSize:12, color:C.text, marginBottom:4 }}>{sc.description}</div>
                  )}
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    {sc.qty && <Badge label={`Qty: ${sc.qty} ${sc.unit||''}`} bg={C.blue.bg} color={C.blue.text} border={C.blue.border} />}
                    {sc.warehouse && <Badge label={sc.warehouse} bg="#fff" color={C.muted} border={C.border} />}
                  </div>
                  {sc.remarks && <div style={{ fontSize:11, color:C.muted, marginTop:4, fontStyle:'italic' }}>{sc.remarks}</div>}
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ── SECTION 2: Material Planning ─ */}
        <Section title="Material Planning (BOM)" icon="🏗️" theme={C.green} count={matItems.length}>
          {matItems.length === 0 ? (
            <EmptyState msg="No material plan defined" />
          ) : (
            (() => {
              const groups = [...new Set(matItems.map(m => m.unitGroup || 'General'))];
              return groups.map(grp => (
                <div key={grp} style={{ marginBottom:16 }}>
                  <div style={{
                    fontSize:11, fontWeight:700, color:C.green.text,
                    textTransform:'uppercase', letterSpacing:'0.5px',
                    borderBottom:`2px solid ${C.green.border}`, paddingBottom:4, marginBottom:8,
                  }}>
                    🏢 {grp}
                  </div>
                  <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                      <thead>
                        <tr style={{ background:C.shell }}>
                          {['#','Item Name','Type','Required Qty','Unit','BOM Lines'].map(h => (
                            <th key={h} style={{ padding:'6px 10px', color:'#fff', fontWeight:600, fontSize:11, textAlign:'left', whiteSpace:'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {matItems.filter(m=>(m.unitGroup||'General')===grp).map((m,i) => (
                          <React.Fragment key={i}>
                            <tr style={{ background: i%2===0?'#fff':'#F9FAFB', borderBottom:`1px solid ${C.border}` }}>
                              <td style={{ padding:'6px 10px', color:C.muted }}>{i+1}</td>
                              <td style={{ padding:'6px 10px', fontWeight:600, color:C.text }}>{m.itemName}</td>
                              <td style={{ padding:'6px 10px' }}>
                                <Badge
                                  label={m.itemType || 'Purchase'}
                                  bg={m.itemType==='Manufactured'?'#F5EEFF':'#FFF5EB'}
                                  color={m.itemType==='Manufactured'?'#3D1A6E':'#7A3B00'}
                                  border={m.itemType==='Manufactured'?'#6B3FA0':'#E67E00'}
                                />
                              </td>
                              <td style={{ padding:'6px 10px', textAlign:'right', fontWeight:600 }}>{m.requiredQty}</td>
                              <td style={{ padding:'6px 10px', color:C.muted }}>{m.unit}</td>
                              <td style={{ padding:'6px 10px', color:C.muted, fontSize:11 }}>
                                {(m.bomLines||[]).length > 0 ? `${m.bomLines.length} raw material(s)` : '—'}
                              </td>
                            </tr>
                            {(m.bomLines||[]).length > 0 && (
                              <tr style={{ background:'#F5EEFF' }}>
                                <td colSpan={6} style={{ padding:'4px 10px 8px 30px' }}>
                                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                                    {m.bomLines.map((bl,j) => (
                                      <span key={j} style={{
                                        display:'inline-flex', alignItems:'center', gap:4,
                                        background:'#fff', border:'1px solid #6B3FA0',
                                        borderRadius:6, padding:'2px 8px', fontSize:11,
                                      }}>
                                        <span style={{ color:'#6B3FA0' }}>🔩</span>
                                        <span style={{ fontWeight:600 }}>{bl.rawMaterial}</span>
                                        <span style={{ color:C.muted }}>× {bl.qty} {bl.unit}</span>
                                      </span>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ));
            })()
          )}
        </Section>

        {/* ── SECTION 3: Purchase Status ─── */}
        <Section title="Purchase Status" icon="🛒" theme={C.orange} count={balItems.length}>
          {balItems.length === 0 ? (
            <EmptyState msg="No purchase data available. Link this SO to a Purchase Order to see status." />
          ) : (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr style={{ background:C.shell }}>
                    {['#','Item Name','Type','Required Qty','Purchased Qty','Balance','Status'].map(h => (
                      <th key={h} style={{ padding:'7px 10px', color:'#fff', fontWeight:600, fontSize:11, textAlign:'left', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {balItems.map((it, i) => {
                    const done = it.balanceQty <= 0;
                    const over = it.overPurchased;
                    return (
                      <tr key={i} style={{
                        background: done ? '#F0FBF0' : over ? '#FFF5EB' : '#FFF8F8',
                        borderBottom:`1px solid ${C.border}`,
                      }}>
                        <td style={{ padding:'7px 10px', color:C.muted }}>{i+1}</td>
                        <td style={{ padding:'7px 10px', fontWeight:600 }}>{it.itemName}</td>
                        <td style={{ padding:'7px 10px' }}>
                          {it.itemType && (
                            <Badge
                              label={it.itemType}
                              bg={it.itemType==='Manufactured'?'#F5EEFF':'#FFF5EB'}
                              color={it.itemType==='Manufactured'?'#3D1A6E':'#7A3B00'}
                              border={it.itemType==='Manufactured'?'#6B3FA0':'#E67E00'}
                            />
                          )}
                        </td>
                        <td style={{ padding:'7px 10px', textAlign:'right' }}>{it.requiredQty} {it.unit}</td>
                        <td style={{ padding:'7px 10px', textAlign:'right', color: done?'#145214':'#32363A', fontWeight:600 }}>
                          {it.purchasedQty} {it.unit}
                        </td>
                        <td style={{ padding:'7px 10px', textAlign:'right', fontWeight:700, color: done?'#145214': over?'#7A3B00':'#BB0000' }}>
                          {over ? `+${Math.abs(it.balanceQty)}` : it.balanceQty} {it.unit}
                        </td>
                        <td style={{ padding:'7px 10px' }}>
                          {done
                            ? <Badge label="✓ Purchased" bg="#E8F5E9" color="#1B5E20" border="#4CAF50" />
                            : over
                              ? <Badge label="⚠ Over" bg="#FFF5EB" color="#7A3B00" border="#E67E00" />
                              : <Badge label="⏳ Pending" bg="#FEF0F0" color="#7A0000" border="#BB0000" />
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ marginTop:10, display:'flex', gap:10, flexWrap:'wrap' }}>
                <div style={{ fontSize:11, color:C.muted }}>
                  ✅ <strong style={{ color:'#1B5E20' }}>{purchasedCount}</strong> fully purchased
                </div>
                <div style={{ fontSize:11, color:C.muted }}>
                  ⏳ <strong style={{ color:'#BB0000' }}>{pendingCount}</strong> pending
                </div>
              </div>
            </div>
          )}
        </Section>

        {/* ── SECTION 4: Tasks ─────────── */}
        <Section title="Task / Execution Tracking" icon="📌" theme={C.purple} count={tasks.length}>
          {tasks.length === 0 ? (
            <EmptyState msg="No tasks defined" />
          ) : (
            <>
              {/* Task progress bar */}
              {tasks.length > 0 && (
                <div style={{ marginBottom:14 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                    <span style={{ fontSize:11, fontWeight:600, color:C.purple.text }}>Task Completion</span>
                    <span style={{ fontSize:12, fontWeight:700, color:C.purple.text }}>{doneTasks}/{tasks.length} ({taskPct}%)</span>
                  </div>
                  <div style={{ height:8, background:'#E0D0F5', borderRadius:4, overflow:'hidden' }}>
                    <div style={{
                      height:'100%', width:`${taskPct}%`,
                      background: taskPct===100?'#43A047':'#6B3FA0',
                      borderRadius:4, transition:'width 0.6s ease',
                    }} />
                  </div>
                </div>
              )}

              {/* Task cards */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))', gap:10 }}>
                {tasks.map((t, i) => (
                  <div key={i} style={{
                    background:'#fff',
                    border:`1.5px solid ${t.status==='Completed'?'#4CAF50':t.status==='In Progress'?'#1E88E5':'#ccc'}`,
                    borderRadius:8, padding:'12px 14px',
                    borderLeft:`4px solid ${t.status==='Completed'?'#4CAF50':t.status==='In Progress'?'#1E88E5':t.status==='Pending'?'#ccc':'#ccc'}`,
                  }}>
                    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8, marginBottom:6 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:C.text, lineHeight:1.3 }}>
                        <PriorityDot priority={t.priority} />
                        {t.taskName}
                      </div>
                      <TaskStatusBadge status={t.status} />
                    </div>
                    {t.assignedTo && (
                      <div style={{ fontSize:11, color:C.muted, marginBottom:3 }}>
                        👤 {t.assignedTo}
                      </div>
                    )}
                    {t.linkedScope && (
                      <div style={{ fontSize:11, color:C.purple.text, marginBottom:3 }}>
                        🔗 {t.linkedScope}
                      </div>
                    )}
                    {(t.startDate || t.endDate) && (
                      <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>
                        {t.startDate && <>📅 {fmtDate(t.startDate)}</>}
                        {t.startDate && t.endDate && <> → </>}
                        {t.endDate && fmtDate(t.endDate)}
                      </div>
                    )}
                    {t.remarks && (
                      <div style={{ fontSize:11, color:C.muted, marginTop:4, fontStyle:'italic', borderTop:`1px solid ${C.border}`, paddingTop:4 }}>
                        {t.remarks}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </Section>

        {/* ── BOM Section (if has BOM items) ── */}
        {bomItems.length > 0 && (
          <Section title="Bill of Materials (Formal BOM)" icon="🔧" theme={C.purple} count={bomItems.length} defaultOpen={false}>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr style={{ background:C.shell }}>
                    {['#','Item Code','Item Name','Qty','Unit','Warehouse','Linked Scope'].map(h => (
                      <th key={h} style={{ padding:'6px 10px', color:'#fff', fontWeight:600, fontSize:11, textAlign:'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bomItems.map((b, i) => (
                    <tr key={i} style={{ background:i%2===0?'#fff':'#F9FAFB', borderBottom:`1px solid ${C.border}` }}>
                      <td style={{ padding:'6px 10px', color:C.muted }}>{i+1}</td>
                      <td style={{ padding:'6px 10px', color:C.muted }}>{b.itemCode||'—'}</td>
                      <td style={{ padding:'6px 10px', fontWeight:600 }}>{b.itemName}</td>
                      <td style={{ padding:'6px 10px', textAlign:'right' }}>{b.qty}</td>
                      <td style={{ padding:'6px 10px', color:C.muted }}>{b.unit}</td>
                      <td style={{ padding:'6px 10px', color:C.muted }}>{b.warehouse}</td>
                      <td style={{ padding:'6px 10px', color:C.purple.text }}>{b.linkedScope||'—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

      </div>{/* end content */}

      {/* ══════════════════════════════════
          FIXED BOTTOM ACTION BAR
      ══════════════════════════════════ */}
      <div style={{
        position:'fixed', bottom:0, left:0, right:0, zIndex:200,
        background:'#fff', borderTop:`2px solid ${C.border}`,
        padding:'10px 20px',
        display:'flex', alignItems:'center', gap:12, flexWrap:'wrap',
        boxShadow:'0 -3px 12px rgba(0,0,0,0.1)',
      }}>
        <span style={{ fontSize:11, color:C.muted, fontWeight:600, marginRight:4 }}>QUICK ACTIONS:</span>
        <button
          onClick={() => navigate(`/purchase-order/create?soId=${orderId}`)}
          style={{ padding:'8px 18px', background:'#E67E00', border:'none', color:'#fff', borderRadius:6, cursor:'pointer', fontSize:12, fontWeight:700, fontFamily:'inherit' }}
        >
          🛒 Create Purchase Order
        </button>
        <button
          onClick={() => navigate(`/sales-order/edit/${orderId}?tab=tasks`)}
          style={{ padding:'8px 18px', background:'#6B3FA0', border:'none', color:'#fff', borderRadius:6, cursor:'pointer', fontSize:12, fontWeight:700, fontFamily:'inherit' }}
        >
          📌 Manage Tasks
        </button>
        <button
          onClick={() => navigate(`/sales-order/edit/${orderId}?tab=matplan`)}
          style={{ padding:'8px 18px', background:'#188918', border:'none', color:'#fff', borderRadius:6, cursor:'pointer', fontSize:12, fontWeight:700, fontFamily:'inherit' }}
        >
          🏗️ Edit Material Plan
        </button>
        <button
          onClick={() => navigate(`/sales-order/edit/${orderId}`)}
          style={{ padding:'8px 18px', background:C.accent, border:'none', color:'#fff', borderRadius:6, cursor:'pointer', fontSize:12, fontWeight:700, fontFamily:'inherit' }}
        >
          ✏️ Edit Order
        </button>
        <div style={{ marginLeft:'auto', fontSize:12, fontWeight:700, color:C.purple.text }}>
          {soNo} · {client}
        </div>
      </div>
    </div>
  );
};

/* ── Empty state helper ── */
function EmptyState({ msg }) {
  return (
    <div style={{ textAlign:'center', padding:'20px 0', color:'#9EA7B0', fontSize:12 }}>
      <div style={{ fontSize:28, marginBottom:6 }}>📭</div>
      {msg}
    </div>
  );
}

export default ProjectDashboard;
