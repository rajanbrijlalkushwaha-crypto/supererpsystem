/**
 * Purchase Order Module — unified Create / View / Pending
 * Side-nav tabs mirror SalesOrderModule pattern.
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import axios from 'axios';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/permissions';
import { printPurchaseOrder, buildPurchaseOrderHtml } from '../../utils/printPurchaseOrder';
import PageLoader from '../../components/PageLoader';
import ApproverPickerModal from '../../components/ApproverPicker';
import { withPrintFont } from '../../utils/printFont';

/* ── colour / font constants ── */
const N = '#104f4f';
const ND = '#0b3d3d';
const W = '#ffffff';
const B = '#D1D5DB';
const R = '#DC2626';
const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

/* ── helpers ── */
const api  = (url, cfg={}) => axios({ url, ...cfg });
const fmt  = n => `₹${(Number(n)||0).toFixed(2)}`;
const today= () => new Date().toISOString().slice(0,10);
const uid  = () => Date.now() + Math.random();

const SCOPE_DEFAULTS = ['Air Conditioning (AC)','Electrical Work','Civil Work','Transport / Logistics',
  'Installation & Commissioning','Loading / Unloading','Documentation','Procurement','Testing & Inspection','Training','Other'];
const fmtD = d => { if(!d) return '—'; const dt=new Date(d); return isNaN(dt)?d:`${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`; };

/* Financial year: April-March, returns "YY-YY" e.g. "26-27" */
const getFY = (dateStr) => {
  const d=dateStr?new Date(dateStr):new Date(); const m=d.getMonth()+1; const y=d.getFullYear();
  const s=m>=4?y:y-1; return `${String(s).slice(2)}-${String(s+1).slice(2)}`;
};
const makePoNo = (id,dateStr) => `${getFY(dateStr)}/${id}`;

const fmtNR = n => Number(n||0).toFixed(2);
const fmtDR = d => { if(!d) return '—'; const dt=new Date(d); return isNaN(dt)?d:dt.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}); };
const printReport = (title, subtitle, cols, rows, totalRow) => {
  const today2 = new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
  const rHtml = rows.map(r=>`<tr>${r.map(c=>`<td>${c??'—'}</td>`).join('')}</tr>`).join('');
  const tHtml = totalRow?`<tr class="tot">${totalRow.map(c=>`<td>${c??''}</td>`).join('')}</tr>`:'';
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Times New Roman',Times,serif;font-size:10.5pt;color:#000;background:#fff;}
.pg{padding:10mm 14mm;}h1{font-size:17pt;font-weight:bold;text-align:center;margin-bottom:3px;}
.sub{font-size:10pt;text-align:center;color:#555;margin-bottom:10px;border-bottom:1px solid #aaa;padding-bottom:5px;}
table{width:100%;border-collapse:collapse;margin-top:6px;}
th{background:#1a2a3a;color:#fff;padding:5px 8px;font-size:9.5pt;font-weight:bold;text-align:left;border:1px solid #444;white-space:nowrap;}
td{padding:4px 8px;font-size:9.5pt;border:1px solid #ccc;vertical-align:top;}
tr:nth-child(even) td{background:#f7f7f7;}
.tot td{font-weight:bold;background:#ddd;border-top:2px solid #555;}
.foot{margin-top:8px;font-size:8.5pt;color:#666;text-align:right;}
@media print{@page{margin:10mm;size:A4 landscape;}.pg{padding:0;}}</style>
</head><body><div class="pg">
<h1>${title}</h1>
<div class="sub">${subtitle} &nbsp;·&nbsp; ${rows.length} records &nbsp;·&nbsp; Generated: ${today2}</div>
<table><thead><tr>${cols.map(c=>`<th>${c}</th>`).join('')}</tr></thead>
<tbody>${rHtml}${tHtml}</tbody></table>
<div class="foot">Printed: ${today2}</div>
</div><script>window.onload=()=>setTimeout(()=>window.print(),400);<\/script>
</body></html>`;
  const w=window.open('','_blank','width=1100,height=750,scrollbars=yes');
  if(!w){alert('Allow pop-ups to print.');return;}
  w.document.write(withPrintFont(html)); w.document.close();
};

/* calc row */
const calcRow = it => {
  const base=(parseFloat(it.qty)||0)*(parseFloat(it.rate)||0);
  const disc=it.discountType==='%'?base*(parseFloat(it.discount)||0)/100:(parseFloat(it.discount)||0);
  const tax=base-disc;
  const gst=tax*(parseFloat(it.gstPercent)||0)/100;
  return {base,disc,tax,gst,total:tax+gst};
};

/* ═══════════════════════════ PRIMITIVES ═══════════════════════════ */
function Btn({children,onClick,v='def',disabled,type,small}){
  const s={
    def:{bg:'#d8d8d8',border:'1px solid #888',color:'#000'},
    pri:{bg:N,border:`1px solid #1a3050`,color:W,fw:700},
    dan:{bg:R,border:`1px solid #991100`,color:W,fw:700},
    suc:{bg:'#006620',border:`1px solid #004410`,color:W,fw:700},
    war:{bg:'#b06000',border:`1px solid #7a4000`,color:W,fw:700},
  }[v]||{};
  return(
    <button type={type||'button'} onClick={onClick} disabled={disabled}
      style={{background:s.bg,border:s.border,color:s.color||'#000',
        padding:small?'0 7px':'1px 12px',height:small?20:22,
        fontSize:small?10:11,fontFamily:F,fontWeight:s.fw||400,
        cursor:disabled?'default':'pointer',borderRadius:0,
        whiteSpace:'nowrap',opacity:disabled?0.5:1}}>
      {children}
    </button>
  );
}

function Inp({value,onChange,type='text',placeholder,readOnly,disabled,style,onKeyDown,onBlur:onBlurExtra}){
  return(
    <input type={type} value={value??''} onChange={onChange}
      placeholder={placeholder} readOnly={readOnly} disabled={disabled} onKeyDown={onKeyDown}
      style={{height:28,padding:'0 8px',border:`1px solid #9CA3AF`,borderRadius:4,
        fontSize:12,fontFamily:F,color:'#111827',
        background:readOnly?'#F9FAFB':disabled?'#F3F4F6':W,
        outline:'none',width:'100%',boxSizing:'border-box',...style}}
      onFocus={e=>{ if(!readOnly&&!disabled){e.target.style.borderColor=N;e.target.style.boxShadow='0 0 0 2px rgba(37,99,235,0.15)';} }}
      onBlur={e=>{ e.target.style.borderColor='#9CA3AF';e.target.style.boxShadow='none'; if(onBlurExtra) onBlurExtra(e); }}
    />
  );
}

/* DD-MM-YYYY text input that stores/emits YYYY-MM-DD */
function DateInp({value,onChange,style}){
  const toDisp=iso=>{
    if(!iso) return '';
    const [y,m,d]=(iso||'').split('-');
    return(d&&m&&y&&y.length===4)?`${d}-${m}-${y}`:'';
  };
  const [raw,setRaw]=useState(toDisp(value));
  useEffect(()=>{ setRaw(toDisp(value)); },[value]);

  const handleChange=e=>{
    let v=e.target.value.replace(/[^0-9\-]/g,'');
    /* auto-insert dashes after DD and MM */
    const digits=v.replace(/-/g,'');
    if(digits.length<=2) v=digits;
    else if(digits.length<=4) v=digits.slice(0,2)+'-'+digits.slice(2);
    else v=digits.slice(0,2)+'-'+digits.slice(2,4)+'-'+digits.slice(4,8);
    setRaw(v);
    /* emit ISO only when full 8 digits entered */
    if(digits.length===8){
      const iso=`${digits.slice(4,8)}-${digits.slice(2,4)}-${digits.slice(0,2)}`;
      const d=new Date(iso);
      if(!isNaN(d.getTime())) onChange({target:{value:iso}});
    } else if(digits.length===0){
      onChange({target:{value:''}});
    }
  };
  const handleBlur=e=>{
    const digits=raw.replace(/-/g,'');
    if(digits.length===8){
      const iso=`${digits.slice(4,8)}-${digits.slice(2,4)}-${digits.slice(0,2)}`;
      const d=new Date(iso);
      if(!isNaN(d.getTime())){
        setRaw(toDisp(iso));
        onChange({target:{value:iso}});
        return;
      }
    }
    /* invalid or empty — reset display to current value */
    setRaw(toDisp(value));
    e.target.style.borderColor='#9CA3AF'; e.target.style.boxShadow='none';
  };
  return(
    <input type="text" value={raw} onChange={handleChange} onBlur={handleBlur}
      placeholder="DD-MM-YYYY" maxLength={10}
      style={{height:28,padding:'0 8px',border:'1px solid #9CA3AF',borderRadius:4,
        fontSize:12,fontFamily:F,color:'#111827',background:W,
        outline:'none',width:'100%',boxSizing:'border-box',...style}}
      onFocus={e=>{e.target.style.borderColor=N;e.target.style.boxShadow='0 0 0 2px rgba(37,99,235,0.15)';}}
    />
  );
}

function Sel({value,onChange,options=[],disabled,style}){
  return(
    <select value={value} onChange={onChange} disabled={disabled}
      style={{height:28,padding:'0 8px',border:`1px solid #9CA3AF`,borderRadius:4,
        fontSize:12,fontFamily:F,color:'#111827',
        background:disabled?'#F3F4F6':W,
        outline:'none',width:'100%',boxSizing:'border-box',cursor:'pointer',...style}}
      onFocus={e=>{ e.target.style.borderColor=N;e.target.style.boxShadow='0 0 0 2px rgba(37,99,235,0.15)'; }}
      onBlur={e=>{ e.target.style.borderColor='#9CA3AF';e.target.style.boxShadow='none'; }}>
      {options.map((o,i)=><option key={i} value={o.value??o}>{o.label??o}</option>)}
    </select>
  );
}

function Txt({value,onChange,placeholder,rows=3}){
  return(
    <textarea value={value??''} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={rows}
      style={{width:'100%',padding:'5px 8px',border:'1px solid #9CA3AF',borderRadius:4,
        fontSize:12,fontFamily:F,color:'#111827',background:W,
        resize:'vertical',outline:'none',boxSizing:'border-box',lineHeight:1.5}}
      onFocus={e=>{ e.target.style.borderColor=N;e.target.style.boxShadow='0 0 0 2px rgba(37,99,235,0.15)'; }}
      onBlur={e=>{ e.target.style.borderColor='#9CA3AF';e.target.style.boxShadow='none'; }}
    />
  );
}

function FR({label,children,w=130,req}){
  return(
    <div style={{display:'flex',alignItems:'center',minHeight:30,
      borderBottom:'1px solid #CBD5E1',padding:'2px 6px',background:W}}>
      <label style={{fontSize:11.5,fontWeight:700,color:'#000000',minWidth:w,maxWidth:w,
        padding:'0 8px 0 0',textAlign:'left',flexShrink:0}}>
        {label}{req&&<span style={{color:R,marginLeft:2}}>*</span>}
      </label>
      <div style={{flex:1,display:'flex',gap:4,alignItems:'center'}}>{children}</div>
    </div>
  );
}

function PH({title}){
  return(
    <div style={{background:'#F1F5F9',color:'#1E293B',fontSize:12,fontWeight:700,
      padding:'6px 12px',letterSpacing:0.2,borderBottom:`1px solid ${B}`}}>
      {title}
    </div>
  );
}

/* badge — solid colour circle + single letter, same convention as Sales Order */
const BC={
  draft:    {bg:'#94a3b8',letter:'D',label:'Draft'},
  pending:  {bg:'#f59e0b',letter:'P',label:'Pending'},
  approved: {bg:'#16a34a',letter:'A',label:'Approved'},
  rejected: {bg:'#ef4444',letter:'C',label:'Rejected'},
  cancelled:{bg:'#ef4444',letter:'C',label:'Cancelled'},
};
function Badge({s}){
  const c=BC[s?.toLowerCase()]||BC.draft;
  return(
    <span title={c.label} style={{display:'inline-flex',alignItems:'center',justifyContent:'center',
      width:22,height:22,borderRadius:'50%',background:c.bg,color:'#fff',
      fontSize:11,fontWeight:800,flexShrink:0,lineHeight:1,fontFamily:F}}>{c.letter}</span>
  );
}

/* ═══════════════════════════ INNER TABS ═══════════════════════════ */
const INNER_TABS=[
  {id:'order-details', label:'Order Details',    icon:'📋'},
  {id:'items',         label:'Item Details',     icon:'📦'},
  {id:'charges',       label:'Charges & Pricing',icon:'💰'},
  {id:'delivery',      label:'Delivery',         icon:'🚚'},
  {id:'payment',       label:'Payment Terms',    icon:'💳'},
  {id:'notes',         label:'Notes & Terms',    icon:'📝'},
  {id:'scope',         label:'Scope of Work',    icon:'🎯'},
  {id:'attachments',   label:'Attachments',      icon:'📎'},
];

function SectionTabBar({active,onChange}){
  return(
    <div className="soft-tabs" style={{background:'#F8FAFC',borderBottom:`2px solid ${B}`,
      display:'flex',flexWrap:'nowrap',padding:'0 2px',flexShrink:0}}>
      {INNER_TABS.map((t)=>{
        const a=active===t.id;
        return(
          <button key={t.id} onClick={()=>onChange(t.id)}
            style={{fontFamily:F,fontSize:11,fontWeight:a?700:500,
              color:a?N:'#111827',
              background:a?'#DBEAFE':'transparent',
              border:'none',
              borderBottom:a?`2px solid ${N}`:'2px solid transparent',
              marginBottom:-2,height:32,padding:'0 8px',
              cursor:'pointer',whiteSpace:'nowrap',flex:1,
              display:'flex',alignItems:'center',justifyContent:'center',gap:3,
              transition:'all 0.12s'}}
            onMouseEnter={e=>{ if(!a){e.currentTarget.style.background='#EFF6FF';e.currentTarget.style.color=ND;} }}
            onMouseLeave={e=>{ if(!a){e.currentTarget.style.background='transparent';e.currentTarget.style.color='#111827';} }}>
            <span style={{fontSize:12}}>{t.icon}</span>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/* ═══════════════════════ SO ITEM PICKER MODAL ═══════════════════════ */
function SOItemPicker({soId,companyId,onImport,onClose,currentItems=[]}){
  const [loading,setLoading]=useState(true);
  const [importing,setImporting]=useState(false);
  const [balance,setBalance]=useState(null);
  const [sel,setSel]=useState({});       // itemName → qty
  const [selFiles,setSelFiles]=useState({}); // fileName → true/false

  useEffect(()=>{
    api(`/api/sales-orders/${soId}/material-balance?companyId=${companyId}`)
      .then(r=>{
        const adjusted={...r.data,items:(r.data.items||[]).map(it=>{
          const alreadyAdded=currentItems
            .filter(poi=>(poi.itemName||'').toLowerCase().trim()===(it.itemName||'').toLowerCase().trim())
            .reduce((sum,poi)=>sum+(parseFloat(poi.qty)||0),0);
          return {...it,balanceQty:Math.max(0,it.balanceQty-alreadyAdded)};
        })};
        setBalance(adjusted);
        const init={};
        adjusted.items.forEach(it=>{ if(it.balanceQty>0) init[it.itemName]=it.balanceQty; });
        setSel(init);
        // pre-select all spec files
        const fInit={};
        (adjusted.specFiles||[]).forEach(f=>{ fInit[f.fileName]=true; });
        setSelFiles(fInit);
      })
      .catch(()=>setBalance({items:[],specFiles:[]}))
      .finally(()=>setLoading(false));
  },[soId,companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const items=balance?.items||[];
  const specFiles=balance?.specFiles||[];

  const selectAll =()=>{ const s={}; items.forEach(it=>{ s[it.itemName]=parseFloat(it.qty)||0; }); setSel(s); };
  const selectBal =()=>{ const s={}; items.forEach(it=>{ if(it.balanceQty>0) s[it.itemName]=it.balanceQty; }); setSel(s); };
  const clearAll  =()=>setSel({});
  const toggleFile=(fn,v)=>setSelFiles(s=>({...s,[fn]:v}));
  const allFileSel=specFiles.length>0&&specFiles.every(f=>selFiles[f.fileName]);
  const toggleAllFiles=()=>{ const v=!allFileSel; const s={}; specFiles.forEach(f=>{s[f.fileName]=v;}); setSelFiles(s); };

  const fileIco=t=>({'pdf':'📄','doc':'📝','docx':'📝','xls':'📊','xlsx':'📊','txt':'📃'}[t]||'📎');

  const doImport=async()=>{
    setImporting(true);
    /* 1. item rows */
    const rows=items.filter(it=>sel[it.itemName]>0).map(it=>({
      _id:uid(), itemCode:it.itemCode||'', itemName:it.itemName,
      description:it.specs||'',
      hsnCode:it.hsnCode||'', qty:parseFloat(sel[it.itemName])||0,
      unit:it.unit||'NOS', rate:'', discount:0, discountType:'%', gstPercent:18,
    }));

    /* 2. fetch selected spec files as File blobs */
    const chosenFiles=specFiles.filter(f=>selFiles[f.fileName]);
    const attRows=[];
    await Promise.all(chosenFiles.map(async f=>{
      try{
        const res=await fetch(`/api/sales-orders/${soId}/spec-file/${encodeURIComponent(f.fileName)}?companyId=${companyId}`);
        if(!res.ok) return;
        const blob=await res.blob();
        const file=new File([blob], f.fileName, {type:blob.type});
        attRows.push({_id:uid(), file, name:f.name||f.fileName, usedFor:'Spec from SO#'+soId, size:blob.size});
      }catch{}
    }));

    onImport(rows, attRows);
    setImporting(false);
  };

  const itemSelCount=Object.values(sel).filter(q=>q>0).length;
  const fileSelCount=Object.values(selFiles).filter(Boolean).length;
  const canImport=itemSelCount>0||fileSelCount>0;

  return(
    <div onClick={e=>{if(e.target===e.currentTarget)onClose()}}
      style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:9000,
        display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{background:W,borderRadius:0,width:'100%',maxWidth:900,
        maxHeight:'90vh',display:'flex',flexDirection:'column',
        boxShadow:'0 8px 40px rgba(0,0,0,0.3)'}}>

        {/* header */}
        <div style={{background:N,color:W,padding:'8px 14px',display:'flex',
          justifyContent:'space-between',alignItems:'center',flexShrink:0}}>
          <span style={{fontSize:13,fontWeight:700,fontFamily:F}}>
            Import from SO #{soId}
            {balance?.customerName&&<span style={{fontWeight:400,marginLeft:8,fontSize:11,opacity:0.8}}>— {balance.customerName}</span>}
          </span>
          <button onClick={onClose} style={{background:'none',border:'none',color:W,fontSize:18,cursor:'pointer',lineHeight:1}}>✕</button>
        </div>

        <div style={{flex:1,overflowY:'auto'}}>
          {loading?(
            <PageLoader overlay={false} text="Loading orders…"/>
          ):(
            <>
              {/* ── ITEMS SECTION ── */}
              <div style={{borderBottom:'2px solid #dde'}}>
                <div style={{padding:'6px 10px',background:'#f0f4ff',borderBottom:'1px solid #dde',
                  display:'flex',gap:6,alignItems:'center'}}>
                  <span style={{fontSize:11,fontWeight:700,fontFamily:F,color:N}}>📦 Items ({items.length})</span>
                  <Btn small onClick={selectAll}>Select All</Btn>
                  <Btn small onClick={selectBal} v="pri">Balance Only</Btn>
                  <Btn small onClick={clearAll} v="dan">Clear</Btn>
                  <span style={{marginLeft:'auto',fontSize:11,color:'#555',fontFamily:F}}>{itemSelCount} selected</span>
                </div>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,fontFamily:F}}>
                  <thead>
                    <tr style={{background:'#e8f0fb'}}>
                      {['#','Item Name','Specs','HSN','SO Qty','PO\'d','Balance','✓','Qty'].map((h,i)=>(
                        <th key={i} style={{padding:'4px 7px',color:'#104f4f',fontWeight:700,fontSize:10,
                          textAlign:(i>=4&&i<=6)?'right':'left',borderRight:'1px solid #c8d8f0',whiteSpace:'nowrap'}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.length===0&&(
                      <tr><td colSpan={9} style={{padding:12,textAlign:'center',color:'#aaa',fontStyle:'italic'}}>No items in this SO</td></tr>
                    )}
                    {items.map((it,i)=>(
                      <tr key={i} style={{background:i%2===0?W:'#f5f8fc'}}>
                        <td style={{padding:'3px 7px',border:'1px solid #e0e0e0',color:'#888',width:24}}>{i+1}</td>
                        <td style={{padding:'3px 7px',border:'1px solid #e0e0e0',fontWeight:600,minWidth:120}}>
                          <div style={{display:'flex',alignItems:'center',gap:4,flexWrap:'wrap'}}>
                            {it.itemName}
                            {it.isAddon&&<span style={{fontSize:9,padding:'1px 4px',background:'#fff3e0',color:'#b45309',border:'1px solid #fbbf24',borderRadius:2,fontWeight:700,whiteSpace:'nowrap'}}>Add-on</span>}
                          </div>
                          {it.itemCode&&<div style={{fontSize:9,color:'#888'}}>{it.itemCode}</div>}
                          {it.itemType&&!it.isAddon&&<div style={{fontSize:9,color:'#888'}}>{it.itemType}</div>}
                        </td>
                        <td style={{padding:'3px 7px',border:'1px solid #e0e0e0',maxWidth:200,fontSize:10,color:'#444'}}>
                          {it.specs?<span style={{whiteSpace:'pre-wrap'}}>{it.specs}</span>:<span style={{color:'#ccc'}}>—</span>}
                          {it.bom&&it.bom.length>0&&<div style={{fontSize:9,color:'#777',marginTop:2}}>BOM: {it.bom.map(b=>b.itemName+' ×'+b.qty).join(', ')}</div>}
                        </td>
                        <td style={{padding:'3px 7px',border:'1px solid #e0e0e0',width:60,color:'#555'}}>{it.hsnCode||'—'}</td>
                        <td style={{padding:'3px 7px',border:'1px solid #e0e0e0',textAlign:'right',width:55}}>{it.qty||0}<br/><span style={{fontSize:9,color:'#888'}}>{it.unit}</span></td>
                        <td style={{padding:'3px 7px',border:'1px solid #e0e0e0',textAlign:'right',color:'#0055aa',width:45}}>{it.purchasedQty||0}</td>
                        <td style={{padding:'3px 7px',border:'1px solid #e0e0e0',textAlign:'right',width:50,
                          color:it.balanceQty>0?'#006620':it.overPurchased?R:'#888',fontWeight:700}}>{it.balanceQty||0}</td>
                        <td style={{padding:'3px 7px',border:'1px solid #e0e0e0',textAlign:'center',width:28}}>
                          <input type="checkbox" checked={!!(sel[it.itemName]>0)}
                            onChange={e=>setSel(s=>({...s,[it.itemName]:e.target.checked?(it.balanceQty>0?it.balanceQty:1):0}))}/>
                        </td>
                        <td style={{padding:'2px 4px',border:'1px solid #e0e0e0',width:75}}>
                          <Inp type="number" value={sel[it.itemName]||''}
                            onChange={e=>setSel(s=>({...s,[it.itemName]:parseFloat(e.target.value)||0}))}
                            style={{width:65}}/>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ── SPEC FILES SECTION ── */}
              <div>
                <div style={{padding:'6px 10px',background:'#fff8e8',borderBottom:'1px solid #f0d080',
                  display:'flex',gap:8,alignItems:'center'}}>
                  <span style={{fontSize:11,fontWeight:700,fontFamily:F,color:'#7a4a00'}}>📐 Specification Files ({specFiles.length})</span>
                  {specFiles.length>0&&(
                    <label style={{display:'flex',alignItems:'center',gap:4,fontSize:11,fontFamily:F,cursor:'pointer',color:'#555'}}>
                      <input type="checkbox" checked={allFileSel} onChange={toggleAllFiles}/>
                      {allFileSel?'Deselect All':'Select All'}
                    </label>
                  )}
                  <span style={{marginLeft:'auto',fontSize:11,color:'#888',fontFamily:F}}>{fileSelCount} selected</span>
                </div>
                {specFiles.length===0?(
                  <div style={{padding:'14px 16px',textAlign:'center',color:'#aaa',fontStyle:'italic',fontSize:11,fontFamily:F}}>
                    No specification files attached to this SO
                  </div>
                ):(
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,fontFamily:F}}>
                    <thead>
                      <tr style={{background:'#fef3c7'}}>
                        <th style={{padding:'4px 8px',fontWeight:700,fontSize:10,color:'#7a4a00',borderRight:'1px solid #f0d080',width:28}}>✓</th>
                        <th style={{padding:'4px 8px',fontWeight:700,fontSize:10,color:'#7a4a00',borderRight:'1px solid #f0d080',width:30}}></th>
                        <th style={{padding:'4px 8px',fontWeight:700,fontSize:10,color:'#7a4a00',borderRight:'1px solid #f0d080'}}>Label / Description</th>
                        <th style={{padding:'4px 8px',fontWeight:700,fontSize:10,color:'#7a4a00'}}>File Name</th>
                      </tr>
                    </thead>
                    <tbody>
                      {specFiles.map((f,i)=>(
                        <tr key={i} style={{background:i%2===0?W:'#fffbf0',cursor:'pointer'}}
                          onClick={()=>toggleFile(f.fileName,!selFiles[f.fileName])}>
                          <td style={{padding:'4px 8px',border:'1px solid #f0e0a0',textAlign:'center'}}>
                            <input type="checkbox" checked={!!selFiles[f.fileName]}
                              onClick={e=>e.stopPropagation()}
                              onChange={e=>toggleFile(f.fileName,e.target.checked)}/>
                          </td>
                          <td style={{padding:'4px 8px',border:'1px solid #f0e0a0',textAlign:'center',fontSize:18}}>{fileIco(f.fileType)}</td>
                          <td style={{padding:'4px 8px',border:'1px solid #f0e0a0',fontWeight:600}}>{f.name||f.fileName}</td>
                          <td style={{padding:'4px 8px',border:'1px solid #f0e0a0',color:'#555',fontSize:10}}>{f.fileName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>

        {/* footer */}
        <div style={{padding:'8px 12px',borderTop:'2px solid #ddd',
          display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0,background:'#f8f8f8'}}>
          <span style={{fontSize:11,fontFamily:F,color:'#555'}}>
            {itemSelCount>0&&`${itemSelCount} item${itemSelCount>1?'s':''}`}
            {itemSelCount>0&&fileSelCount>0&&' + '}
            {fileSelCount>0&&`${fileSelCount} spec file${fileSelCount>1?'s':''}`}
            {!canImport&&'Nothing selected'}
          </span>
          <div style={{display:'flex',gap:8}}>
            <Btn onClick={onClose}>Cancel</Btn>
            <Btn v="pri" onClick={doImport} disabled={!canImport||importing}>
              {importing?'Importing…':'📦 Import Selected'}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════ VENDOR BILLS SECTION ═══════════════════════ */
function VendorBillsSection({order,companyId}){
  const { user } = useAuth();
  const [bills,setBills]=useState(order.vendorBills||[]);
  const [acting,setActing]=useState(null); // billId being actioned

  useEffect(()=>{
    api(`/api/purchase-orders/${order.orderId}/vendor-bills?companyId=${companyId}`)
      .then(r=>{ if(Array.isArray(r.data)) setBills(r.data); })
      .catch(()=>{});
  },[order.orderId,companyId]);// eslint-disable-line react-hooks/exhaustive-deps

  const approve=async(b)=>{
    if(!window.confirm(`Approve bill ${b.invoiceNo}?`)) return;
    setActing(b.billId);
    try{
      const r=await api(`/api/purchase-orders/${order.orderId}/vendor-bills/${b.billId}`,{method:'PUT',data:{status:'approved',companyId}});
      setBills(p=>p.map(x=>x.billId===b.billId?r.data.bill:x));
    }catch(e){alert('Error: '+e.message);}
    setActing(null);
  };
  const reject=async(b)=>{
    const reason=window.prompt('Reason for rejection (optional):','');
    if(reason===null) return;
    setActing(b.billId);
    try{
      const r=await api(`/api/purchase-orders/${order.orderId}/vendor-bills/${b.billId}`,{method:'PUT',data:{status:'rejected',adminRemarks:reason,companyId}});
      setBills(p=>p.map(x=>x.billId===b.billId?r.data.bill:x));
    }catch(e){alert('Error: '+e.message);}
    setActing(null);
  };

  if(!bills.length) return(
    <div style={{marginTop:8}}>
      <PH title="Vendor Bills (0)"/>
      <div style={{padding:'8px 0',fontSize:11,color:'#888',fontFamily:F,fontStyle:'italic'}}>No bills submitted by vendor yet.</div>
    </div>
  );

  const fmt2=n=>`₹${Number(n||0).toFixed(2)}`;
  const fmtD2=d=>{ if(!d) return '—'; const s=String(d).slice(0,10); const [y,m,dy]=s.split('-'); return `${dy}-${m}-${y}`; };

  return(
    <div style={{marginTop:8}}>
      <PH title={`Vendor Bills (${bills.length})`}/>
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {bills.map((b,i)=>{
          const statusColor={approved:{bg:'#ECFDF5',color:'#059669'},rejected:{bg:'#FEF2F2',color:'#DC2626'},submitted:{bg:'#F5F3FF',color:'#7C3AED'}}[b.status]||{bg:'#F1F5F9',color:'#64748B'};
          return(
            <div key={b.billId||i} style={{border:'1px solid #e0e0e0',borderRadius:4,overflow:'hidden'}}>
              {/* Bill header */}
              <div style={{background:'#F8FAFC',borderBottom:'1px solid #e0e0e0',padding:'6px 10px',display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                <span style={{fontSize:12,fontWeight:700,color:N,fontFamily:F}}>🧾 Invoice #{b.invoiceNo}</span>
                <span style={{fontSize:10,color:'#555',fontFamily:F}}>Date: {fmtD2(b.invoiceDate)}</span>
                <span style={{padding:'1px 7px',fontSize:10,fontWeight:700,background:statusColor.bg,color:statusColor.color,borderRadius:10,border:`1px solid ${statusColor.color}`,fontFamily:F}}>{b.status||'submitted'}</span>
                {b.uploadedBy==='vendor'&&<span style={{padding:'1px 7px',fontSize:10,fontWeight:600,background:'#FFFBEB',color:'#92400E',border:'1px solid #FCD34D',borderRadius:10,fontFamily:F}}>Uploaded by Vendor</span>}
                <span style={{marginLeft:'auto',fontSize:12,fontWeight:800,color:'#059669',fontFamily:F}}>{fmt2(b.totalAmount)}</span>
              </div>
              {/* Bill items */}
              {(b.billItems||[]).length>0&&(
                <div style={{overflowX:'auto'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,fontFamily:F}}>
                    <thead>
                      <tr style={{background:'#EFF6FF'}}>
                        {['Item','Billed Qty','Rate','GST%','Amount'].map(h=>(
                          <th key={h} style={{padding:'3px 8px',color:N,fontWeight:700,textAlign:h==='Item'?'left':'right',borderBottom:'1px solid #e0e0e0',whiteSpace:'nowrap'}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {b.billItems.map((bi,j)=>{
                        const net=bi.billedQty*bi.rate; const gst=net*bi.gstPercent/100;
                        return(
                          <tr key={j} style={{background:j%2===0?W:'#f9f9f9'}}>
                            <td style={{padding:'3px 8px',border:'1px solid #eeeeee',fontWeight:600}}>{bi.itemName}</td>
                            <td style={{padding:'3px 8px',border:'1px solid #eeeeee',textAlign:'right'}}>{bi.billedQty} {bi.unit}</td>
                            <td style={{padding:'3px 8px',border:'1px solid #eeeeee',textAlign:'right'}}>{fmt2(bi.rate)}</td>
                            <td style={{padding:'3px 8px',border:'1px solid #eeeeee',textAlign:'right'}}>{bi.gstPercent}%</td>
                            <td style={{padding:'3px 8px',border:'1px solid #eeeeee',textAlign:'right',fontWeight:700,color:N}}>{fmt2(net+gst)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {/* Footer: remarks + actions */}
              <div style={{padding:'6px 10px',display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',borderTop:'1px solid #eeeeee',background:W}}>
                <div style={{flex:1,fontSize:11,color:'#555',fontFamily:F}}>
                  {b.description&&<div>📝 {b.description}</div>}
                  {b.notes&&<div style={{marginBottom:2}}>💬 {b.notes}</div>}
                  Net: {fmt2(b.netAmount)} · GST: {fmt2(b.gstAmount)} · <strong>Total: {fmt2(b.totalAmount)}</strong>
                  {b.adminRemarks&&<span style={{color:'#DC2626'}}> · Admin: {b.adminRemarks}</span>}
                  {b.reviewedAt&&<span style={{color:'#888'}}> · Reviewed: {fmtD2(b.reviewedAt?.slice(0,10))}</span>}
                </div>
                {b.fileName&&(
                  <a href={`/api/purchase-orders/${order.orderId}/vendor-bill-file/${encodeURIComponent(b.fileName)}?companyId=${companyId}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{padding:'3px 10px',background:'#EFF6FF',color:N,border:'1px solid #BFDBFE',borderRadius:4,fontSize:11,fontWeight:600,textDecoration:'none',fontFamily:F}}>
                    ⬇ PDF
                  </a>
                )}
                {b.status!=='approved'&&b.status!=='rejected'&&can(user,'purchaseBill','approve')&&(
                  <>
                    <Btn small v="suc" onClick={()=>approve(b)} disabled={acting===b.billId}>✔ Approve</Btn>
                    <Btn small v="dan" onClick={()=>reject(b)} disabled={acting===b.billId}>✕ Reject</Btn>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════ PO VIEW MODAL ═══════════════════════ */
function POModal({order,onClose,onApprove,onReject,onEdit,onPrint,onEmail,companyId,soMap}){
  const o=order||{};
  const items=o.items||[];
  const atts=o.attachments||o.documents||[];
  const charges=o.charges||[];

  const subTotal=items.reduce((s,it)=>{const r=calcRow(it);return s+r.tax;},0);
  const totalGST=items.reduce((s,it)=>{const r=calcRow(it);return s+r.gst;},0);
  const chgAmt=charges.reduce((s,c)=>s+(parseFloat(c.amount)||0),0);
  const freight=parseFloat(o.freightCharges)||0;
  const packing=parseFloat(o.packingCharges)||0;
  const disc=parseFloat(o.overallDiscount)||0;
  const ro=parseFloat(o.roundOff)||0;
  const grand=parseFloat(o.grandTotal)||(subTotal+totalGST+chgAmt+freight+packing-disc+ro);

  const row=(lbl,val)=>(val?
    <div style={{display:'flex',gap:6,padding:'3px 0',borderBottom:'1px solid #f0f0f0',fontSize:12,fontFamily:F}}>
      <span style={{color:'#666',minWidth:140,flexShrink:0}}>{lbl}</span>
      <span style={{fontWeight:600}}>{val}</span>
    </div>:null);

  return(
    <div onClick={e=>{if(e.target===e.currentTarget)onClose()}}
      style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:5000,
        display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{background:W,width:'100%',maxWidth:900,maxHeight:'90vh',
        display:'flex',flexDirection:'column',boxShadow:'0 8px 40px rgba(0,0,0,0.3)'}}>

        {/* header */}
        <div style={{background:N,color:W,padding:'10px 16px',
          display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0}}>
          <div>
            <div style={{fontSize:10,opacity:0.7,letterSpacing:1,fontFamily:F}}>PURCHASE ORDER</div>
            <div style={{fontSize:15,fontWeight:700,fontFamily:F,display:'flex',gap:10,alignItems:'center'}}>
              {o.poNo||o.orderId}
              <Badge s={o.status}/>
            </div>
          </div>
          <button onClick={onClose} style={{background:'rgba(255,255,255,0.15)',border:'none',
            color:W,width:30,height:30,cursor:'pointer',fontSize:17,display:'flex',
            alignItems:'center',justifyContent:'center'}}>✕</button>
        </div>

        {/* total banner */}
        <div style={{background:'#f0f4ff',borderBottom:'1px solid #dde3ec',
          padding:'8px 16px',display:'flex',gap:20,alignItems:'center'}}>
          <div style={{fontSize:20,fontWeight:700,color:N,fontFamily:F}}>{fmt(grand)}</div>
          <div style={{fontSize:11,color:'#666',fontFamily:F}}>{items.length} items</div>
          {o.linkedSalesOrderId&&(
            <div style={{fontSize:11,background:'#d8f0d8',color:'#005500',
              padding:'2px 8px',border:'1px solid #44aa44',fontFamily:F,fontWeight:700}}>
              {soMap?.[String(o.linkedSalesOrderId)]?.orderNo || ('SO #'+o.linkedSalesOrderId)}
            </div>
          )}
        </div>

        {/* body */}
        <div style={{flex:1,overflowY:'auto',padding:'14px 18px'}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:12}}>
            <div>
              <PH title="Order Details"/>
              {row('PO Number', o.poNo||String(o.orderId))}
              {row('PO Date', fmtD(o.poDate||o.orderDate))}
              {row('PO Type', o.poType)}
              {row('Purchase Person', o.purchasePerson)}
              {row('Linked SO', o.linkedSalesOrderId?(soMap?.[String(o.linkedSalesOrderId)]?.orderNo||('SO #'+o.linkedSalesOrderId)):null)}
              {row('Delivery Date', fmtD(o.deliveryDate))}
              {row('Incoterms', o.incoterms)}
              {row('Vendor Ref', o.vendorRef)}
              {row('Enquiry Ref', o.enquiryRef)}
              {row('Quotation Ref', o.quotationRef)}
            </div>
            <div>
              <PH title="Vendor"/>
              {row('Vendor Name', o.vendorName)}
              {row('Vendor Code', o.vendorCode)}
              {row('GSTIN', o.vendorGstin)}
              {row('State', o.vendorState)}
              {row('Contact', o.contactPerson)}
              {row('Mobile', o.mobile)}
              {row('Email', o.email)}
              <PH title="Payment"/>
              {row('Payment Terms', o.paymentTerms)}
              {row('Payment Mode', o.paymentMode)}
              {row('Due Date', fmtD(o.dueDate))}
            </div>
          </div>

          {/* items table */}
          {items.length>0&&(
            <>
              <PH title={`Items (${items.length})`}/>
              <div style={{overflowX:'auto',marginBottom:10}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,fontFamily:F}}>
                  <thead>
                    <tr style={{background:N}}>
                      {['#','Item Name','HSN','Qty','Unit','Rate','Disc','GST%','Amount'].map((h,i)=>(
                        <th key={i} style={{padding:'5px 7px',color:W,fontWeight:700,fontSize:10,
                          textAlign:['Rate','Amount'].includes(h)?'right':'center',
                          borderRight:'1px solid #4a6a7a'}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it,i)=>{
                      const r=calcRow(it);
                      return(
                        <tr key={i} style={{background:i%2===0?W:'#f5f8fc'}}>
                          <td style={{padding:'3px 6px',border:'1px solid #e0e0e0',textAlign:'center',color:'#888'}}>{i+1}</td>
                          <td style={{padding:'3px 6px',border:'1px solid #e0e0e0',fontWeight:600}}>{it.itemName||'—'}</td>
                          <td style={{padding:'3px 6px',border:'1px solid #e0e0e0',fontFamily:'monospace'}}>{it.hsnCode||'—'}</td>
                          <td style={{padding:'3px 6px',border:'1px solid #e0e0e0',textAlign:'center'}}>{it.qty||0}</td>
                          <td style={{padding:'3px 6px',border:'1px solid #e0e0e0',textAlign:'center'}}>{it.unit||'NOS'}</td>
                          <td style={{padding:'3px 6px',border:'1px solid #e0e0e0',textAlign:'right'}}>{fmt(it.rate)}</td>
                          <td style={{padding:'3px 6px',border:'1px solid #e0e0e0',textAlign:'center',color:R}}>{it.discount?`${it.discount}${it.discountType||'%'}`:'—'}</td>
                          <td style={{padding:'3px 6px',border:'1px solid #e0e0e0',textAlign:'center'}}>{it.gstPercent||0}%</td>
                          <td style={{padding:'3px 6px',border:'1px solid #e0e0e0',textAlign:'right',fontWeight:700}}>{fmt(r.total)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{display:'flex',justifyContent:'flex-end',marginBottom:12}}>
                <div style={{minWidth:240,border:'1px solid #ddd',padding:8,background:'#f8faff',fontFamily:F,fontSize:11}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}><span>Sub Total</span><span>{fmt(subTotal)}</span></div>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}><span>Total GST</span><span>{fmt(totalGST)}</span></div>
                  {freight>0&&<div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}><span>Freight</span><span>{fmt(freight)}</span></div>}
                  {packing>0&&<div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}><span>Packing</span><span>{fmt(packing)}</span></div>}
                  {disc>0&&<div style={{display:'flex',justifyContent:'space-between',marginBottom:3,color:R}}><span>Discount</span><span>– {fmt(disc)}</span></div>}
                  <div style={{display:'flex',justifyContent:'space-between',borderTop:'2px solid '+N,
                    paddingTop:4,marginTop:4,fontWeight:700,fontSize:13}}>
                    <span>Grand Total</span><span style={{color:N}}>{fmt(grand)}</span>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* scope of work */}
          {(o.scopeItems?.length>0)&&(
            <>
              <PH title={`Scope of Work (${o.scopeItems.length} items)`}/>
              <div style={{marginBottom:10,border:'1px solid #CBD5E1',borderRadius:4,overflow:'hidden'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,fontFamily:F}}>
                  <thead>
                    <tr style={{background:'#104f4f'}}>
                      {['#','Scope Item / Activity','Client','Our Scope','Vendor','Remarks'].map((h,i)=>(
                        <th key={i} style={{padding:'5px 8px',color:'#fff',fontWeight:700,fontSize:10,
                          textAlign:[2,3,4].includes(i)?'center':'left',borderRight:'1px solid #2a5a8a'}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {o.scopeItems.map((s,i)=>(
                      <tr key={i} style={{background:i%2===0?'#fff':'#F8FAFC'}}>
                        <td style={{padding:'4px 7px',border:'1px solid #e0e0e0',width:28,textAlign:'center',color:'#888'}}>{i+1}</td>
                        <td style={{padding:'4px 7px',border:'1px solid #e0e0e0',fontWeight:500}}>{s.item}</td>
                        <td style={{padding:'4px 7px',border:'1px solid #e0e0e0',width:70,textAlign:'center'}}>
                          {s.clientScope?<span style={{color:'#1a5c1a',fontWeight:900,fontSize:14}}>✔</span>:<span style={{color:'#ccc'}}>—</span>}
                        </td>
                        <td style={{padding:'4px 7px',border:'1px solid #e0e0e0',width:80,textAlign:'center'}}>
                          {s.ourScope?<span style={{color:'#1a3a6b',fontWeight:900,fontSize:14}}>✔</span>:<span style={{color:'#ccc'}}>—</span>}
                        </td>
                        <td style={{padding:'4px 7px',border:'1px solid #e0e0e0',width:70,textAlign:'center'}}>
                          {s.vendorScope?<span style={{color:'#7c2d12',fontWeight:900,fontSize:14}}>✔</span>:<span style={{color:'#ccc'}}>—</span>}
                        </td>
                        <td style={{padding:'4px 7px',border:'1px solid #e0e0e0',color:'#555'}}>{s.remarks||'—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* attachments */}
          {atts.length>0&&(
            <>
              <PH title={`Attachments (${atts.length})`}/>
              <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                {atts.map((a,i)=>(
                  <a key={i} href={`/api/purchase-orders/${o.orderId}/download/${encodeURIComponent(a.fileName)}?companyId=${companyId}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{display:'flex',alignItems:'center',gap:6,padding:'4px 10px',
                      background:'#f0f4ff',border:'1px solid #c0d0e8',
                      fontSize:11,fontFamily:F,color:N,textDecoration:'none',fontWeight:600}}>
                    📎 {a.name||a.fileName}
                  </a>
                ))}
              </div>
            </>
          )}

          {/* ── Vendor Bills ── */}
          <VendorBillsSection order={o} companyId={companyId}/>
        </div>

        {/* footer */}
        <div style={{borderTop:'2px solid #e0e0e0',padding:'8px 14px',
          display:'flex',justifyContent:'space-between',alignItems:'center',
          flexShrink:0,background:'#f8f8f8'}}>
          <div style={{display:'flex',gap:6}}>
            <Btn onClick={onEdit}>✏ï¸ Edit</Btn>
            <Btn onClick={onPrint}>🖨ï¸ Print</Btn>
            {onReject&&o.status!=='approved'&&<Btn v="dan" onClick={onReject}>✕ Reject</Btn>}
          </div>
          <div style={{display:'flex',gap:6}}>
            <Btn onClick={onClose}>Close</Btn>
            {onApprove&&['pending','draft'].includes(String(o.status||'').toLowerCase())&&<Btn v="suc" onClick={onApprove}>✔ Approve PO</Btn>}
            <Btn v="pri" onClick={onEmail}>📧 Send Email</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════ EMAIL PO MODAL ═══════════════════════ */
function EmailPOModal({order,companyId,company,onClose}){
  const o=order||{};
  const poNo=o.poNo||o.voucherNumber||o.orderId||'';
  const atts=(o.attachments||o.documents||[]).filter(a=>a.fileName);

  const defaultMsg=`Please find attached the Purchase Order ${poNo} for your reference.

Kindly acknowledge receipt of this PO and confirm the delivery schedule as per the agreed terms.

Key Details:
• PO Number    : ${poNo}
• Delivery By  : ${o.deliveryDate?new Date(o.deliveryDate).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'—'}
• Payment Terms: ${o.paymentTerms||'—'}

Please do not hesitate to contact us if you have any questions.

Thank you for your cooperation.`;

  const [to,setTo]=useState(o.email||'');
  const [cc,setCc]=useState('');
  const [bcc,setBcc]=useState('');
  const [subject,setSubject]=useState(`Purchase Order ${poNo} — Approved`);
  const [msg,setMsg]=useState(defaultMsg);
  const [selAtts,setSelAtts]=useState(()=>{const s={}; atts.forEach(a=>{s[a.fileName]=true;}); return s;});
  const [sending,setSending]=useState(false);

  // Auto-fill vendor email from vendor master if not already set in PO
  useEffect(()=>{
    if(to) return; // already filled
    const vid=o.vendorCode||o.vendorId||o.vendorId;
    if(!vid||!companyId) return;
    fetch(`/api/vendors/${vid}?companyId=${companyId}`)
      .then(r=>r.ok?r.json():null)
      .then(v=>{ if(v?.email) setTo(v.email); })
      .catch(()=>{});
  },[]);// eslint-disable-line react-hooks/exhaustive-deps
  const [result,setResult]=useState(null); // {ok,msg} | {err}

  const toggleAtt=(fn,v)=>setSelAtts(s=>({...s,[fn]:v}));

  const send=async()=>{
    if(!to.trim()){setResult({err:'Recipient email (To) is required.'});return;}
    setSending(true); setResult(null);
    try{
      // Generate PO HTML client-side (same as print, no attachments section)
      let poHtml='';
      try{
        const built=await buildPurchaseOrderHtml(o, company||{}, {skipAttachments:true});
        // Embed the brand font so the server-rendered PDF matches the printed copy.
        poHtml=built.html?withPrintFont(built.html):'';
      }catch(he){console.warn('PO HTML build failed:',he);}

      const r=await fetch(`/api/purchase-orders/${o.orderId}/send-email`,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          companyId, to:to.trim(), cc:cc.trim()||undefined,
          bcc:bcc.trim()||undefined, subject, message:msg,
          attachFileNames:atts.filter(a=>selAtts[a.fileName]).map(a=>a.fileName),
          poHtml,
        }),
      });
      const data=await r.json();
      if(data.ok) setResult({ok:true,msg:data.message||'Email sent successfully!'});
      else setResult({err:data.error||'Failed to send email.'});
    }catch(e){setResult({err:e.message});}
    setSending(false);
  };

  const inpS={width:'100%',padding:'5px 8px',border:'1px solid #9CA3AF',borderRadius:4,fontSize:12,fontFamily:F,outline:'none',boxSizing:'border-box'};
  const ico=t=>({'pdf':'📄','doc':'📝','docx':'📝','xls':'📊','xlsx':'📊','txt':'📃'}[t]||'📎');

  return(
    <div onClick={e=>{if(e.target===e.currentTarget)onClose()}}
      style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.65)',zIndex:9100,
        display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{background:W,width:'100%',maxWidth:680,maxHeight:'92vh',
        display:'flex',flexDirection:'column',borderRadius:4,
        boxShadow:'0 12px 48px rgba(0,0,0,0.35)',overflow:'hidden'}}>

        {/* Header */}
        <div style={{background:'linear-gradient(135deg,#104f4f 0%,#2563EB 100%)',color:W,
          padding:'14px 18px',display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0}}>
          <div>
            <div style={{fontSize:15,fontWeight:700,fontFamily:F}}>📧 Send Purchase Order</div>
            <div style={{fontSize:11,opacity:0.8,marginTop:2,fontFamily:F}}>{poNo} · {o.vendorName||''}</div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',color:W,fontSize:20,cursor:'pointer',lineHeight:1}}>✕</button>
        </div>

        <div style={{flex:1,overflowY:'auto',padding:18,display:'flex',flexDirection:'column',gap:12}}>

          {/* To / CC / BCC */}
          {[
            {label:'To *',      val:to,  set:setTo,  ph:'vendor@email.com'},
            {label:'CC',        val:cc,  set:setCc,  ph:'optional cc emails, comma-separated'},
            {label:'BCC',       val:bcc, set:setBcc, ph:'optional bcc'},
          ].map(f=>(
            <div key={f.label} style={{display:'flex',alignItems:'center',gap:8}}>
              <label style={{fontSize:11,fontWeight:700,fontFamily:F,minWidth:46,color:'#444'}}>{f.label}</label>
              <input value={f.val} onChange={e=>f.set(e.target.value)} placeholder={f.ph}
                style={{...inpS,flex:1,height:28}}
                onFocus={e=>{e.target.style.borderColor=N;e.target.style.boxShadow='0 0 0 2px rgba(37,99,235,0.15)';}}
                onBlur={e=>{e.target.style.borderColor='#9CA3AF';e.target.style.boxShadow='none';}}/>
            </div>
          ))}

          {/* Subject */}
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <label style={{fontSize:11,fontWeight:700,fontFamily:F,minWidth:46,color:'#444'}}>Subject</label>
            <input value={subject} onChange={e=>setSubject(e.target.value)}
              style={{...inpS,flex:1,height:28}}
              onFocus={e=>{e.target.style.borderColor=N;e.target.style.boxShadow='0 0 0 2px rgba(37,99,235,0.15)';}}
              onBlur={e=>{e.target.style.borderColor='#9CA3AF';e.target.style.boxShadow='none';}}/>
          </div>

          {/* Message */}
          <div>
            <label style={{fontSize:11,fontWeight:700,fontFamily:F,color:'#444',display:'block',marginBottom:4}}>Message Body</label>
            <textarea value={msg} onChange={e=>setMsg(e.target.value)} rows={10}
              style={{...inpS,resize:'vertical',lineHeight:1.6,fontFamily:'monospace',fontSize:11}}
              onFocus={e=>{e.target.style.borderColor=N;e.target.style.boxShadow='0 0 0 2px rgba(37,99,235,0.15)';}}
              onBlur={e=>{e.target.style.borderColor='#9CA3AF';e.target.style.boxShadow='none';}}/>
          </div>

          {/* Attachments */}
          <div style={{border:'1px solid #e0e0e0',borderRadius:4,overflow:'hidden'}}>
            <div style={{background:'#f0f4ff',padding:'6px 10px',fontWeight:700,fontSize:11,fontFamily:F,color:N,
              display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span>📎 Attachments to send ({atts.filter(a=>selAtts[a.fileName]).length} of {atts.length} selected)</span>
              {atts.length>0&&(
                <div style={{display:'flex',gap:6}}>
                  <button onClick={()=>{const s={};atts.forEach(a=>{s[a.fileName]=true;});setSelAtts(s);}}
                    style={{fontSize:10,fontFamily:F,background:N,color:W,border:'none',padding:'1px 7px',borderRadius:3,cursor:'pointer'}}>All</button>
                  <button onClick={()=>setSelAtts({})}
                    style={{fontSize:10,fontFamily:F,background:'#dc2626',color:W,border:'none',padding:'1px 7px',borderRadius:3,cursor:'pointer'}}>None</button>
                </div>
              )}
            </div>
            {atts.length===0?(
              <div style={{padding:'10px 12px',color:'#aaa',fontStyle:'italic',fontSize:11,fontFamily:F}}>No attachments on this PO</div>
            ):(
              <div style={{padding:'6px 0'}}>
                {atts.map((a,i)=>(
                  <label key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'5px 12px',cursor:'pointer',
                    background:i%2===0?W:'#fafbfc',borderBottom:'1px solid #f0f0f0'}}>
                    <input type="checkbox" checked={!!selAtts[a.fileName]} onChange={e=>toggleAtt(a.fileName,e.target.checked)}/>
                    <span style={{fontSize:16}}>{ico((a.fileName||'').split('.').pop())}</span>
                    <span style={{flex:1,fontSize:11,fontFamily:F,fontWeight:600}}>{a.name||a.fileName}</span>
                    <span style={{fontSize:10,color:'#888',fontFamily:F}}>{a.fileName}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Result message */}
          {result&&(
            <div style={{padding:'8px 12px',borderRadius:4,fontFamily:F,fontSize:12,fontWeight:600,
              background:result.ok?'#d1fae5':'#fee2e2',color:result.ok?'#065f46':'#991b1b',
              border:`1px solid ${result.ok?'#6ee7b7':'#fca5a5'}`}}>
              {result.ok?'✓ ':' ⚠ '}{result.ok?result.msg:result.err}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{borderTop:'2px solid #e0e0e0',padding:'10px 16px',display:'flex',
          justifyContent:'flex-end',gap:8,flexShrink:0,background:'#f8f8f8'}}>
          <Btn onClick={onClose}>Cancel</Btn>
          <button onClick={send} disabled={sending}
            style={{height:30,padding:'0 20px',background:sending?'#475569':'linear-gradient(135deg,#104f4f,#2563EB)',
              border:'none',color:W,fontSize:12,fontWeight:700,fontFamily:F,borderRadius:4,cursor:sending?'default':'pointer',
              opacity:sending?0.7:1}}>
            {sending?'Sending…':'📧 Send Email'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════ TAB COMPONENTS ═══════════════════════ */

/* ── Vendor Search Popup (mirrors ClientSearch in SalesOrderModule) ── */
function SOSearch({salesOrders,onSelect,onClose}){
  const [q,setQ]=useState('');
  const ref=useRef(null);
  useEffect(()=>{ref.current?.focus();},[]);
  const filtered=q
    ?salesOrders.filter(s=>
        String(s.orderId||'').includes(q)||
        (s.orderNo||'').toLowerCase().includes(q.toLowerCase())||
        (s.customerName||s.party||'').toLowerCase().includes(q.toLowerCase())
      )
    :salesOrders;
  return(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:9999,
      display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{background:W,border:`2px solid ${N}`,width:600,maxHeight:460,
        display:'flex',flexDirection:'column'}}>
        <div style={{background:N,color:W,padding:'5px 10px',fontSize:12,fontWeight:700,
          display:'flex',justifyContent:'space-between',alignItems:'center',fontFamily:F}}>
          <span>🔍 Sales Order Search</span>
          <button onClick={onClose} style={{background:'none',border:'none',color:W,cursor:'pointer',fontSize:16}}>✕</button>
        </div>
        <div style={{padding:'5px 8px',borderBottom:`1px solid ${B}`,background:'#f5f5f5'}}>
          <input ref={ref} value={q} onChange={e=>setQ(e.target.value)}
            placeholder="Search by SO#, order no, customer name…"
            style={{width:'100%',height:24,padding:'0 6px',border:'1px solid #888',
              borderRadius:0,fontSize:12,fontFamily:F,outline:'none'}}
            onKeyDown={e=>e.key==='Escape'&&onClose()}/>
        </div>
        <div style={{flex:1,overflowY:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,fontFamily:F}}>
            <thead style={{background:N,position:'sticky',top:0}}>
              <tr>
                {['SO #','Order No','Customer','Date','Status'].map((h,i)=>(
                  <th key={i} style={{padding:'4px 8px',color:W,fontWeight:700,textAlign:'left',
                    borderRight:'1px solid #2a5a8a'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length===0
                ?<tr><td colSpan={5} style={{padding:'12px',textAlign:'center',color:'#666',fontFamily:F}}>No sales orders found</td></tr>
                :filtered.map((s,i)=>(
                  <tr key={s.orderId} onClick={()=>onSelect(s)}
                    style={{background:i%2===0?W:'#f5f8fc',cursor:'pointer',borderBottom:'1px solid #e8e8e8'}}
                    onMouseEnter={e=>e.currentTarget.style.background='#d0e4f8'}
                    onMouseLeave={e=>e.currentTarget.style.background=i%2===0?W:'#f5f8fc'}>
                    <td style={{padding:'3px 8px',borderRight:'1px solid #ebebeb',fontWeight:700,color:N}}>SO#{s.orderId}</td>
                    <td style={{padding:'3px 8px',borderRight:'1px solid #ebebeb',color:'#555'}}>{s.orderNo||'—'}</td>
                    <td style={{padding:'3px 8px',borderRight:'1px solid #ebebeb',fontWeight:600}}>{s.customerName||s.party||'—'}</td>
                    <td style={{padding:'3px 8px',borderRight:'1px solid #ebebeb',color:'#777',whiteSpace:'nowrap'}}>{fmtD(s.orderDate||s.date)}</td>
                    <td style={{padding:'3px 8px'}}><span style={{fontSize:10,fontWeight:700,
                      color:s.status==='approved'?'#006620':s.status==='pending'?'#885500':'#555'}}>{s.status||'—'}</span></td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
        <div style={{padding:'3px 8px',background:'#f0f0f0',borderTop:`1px solid ${B}`,
          fontSize:10,color:'#666',fontFamily:F}}>
          {filtered.length} order{filtered.length!==1?'s':''} — Click row to select · ESC to cancel
        </div>
      </div>
    </div>
  );
}

function VendorSearch({vendors,onSelect,onClose}){
  const [q,setQ]=useState('');
  const ref=useRef(null);
  useEffect(()=>{ref.current?.focus();},[]);
  const filtered=q
    ?vendors.filter(v=>
        (v.vendorName||'').toLowerCase().includes(q.toLowerCase())||
        String(v.vendorId||'').includes(q)||
        (v.gstin||'').toLowerCase().includes(q.toLowerCase())||
        (v.city||'').toLowerCase().includes(q.toLowerCase())||
        (v.state||'').toLowerCase().includes(q.toLowerCase())
      )
    :vendors;
  return(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:9999,
      display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{background:W,border:`2px solid ${N}`,width:560,maxHeight:440,
        display:'flex',flexDirection:'column'}}>
        <div style={{background:N,color:W,padding:'5px 10px',fontSize:12,fontWeight:700,
          display:'flex',justifyContent:'space-between',alignItems:'center',fontFamily:F}}>
          <span>🔍 Vendor Search</span>
          <button onClick={onClose} style={{background:'none',border:'none',color:W,cursor:'pointer',fontSize:16}}>✕</button>
        </div>
        <div style={{padding:'5px 8px',borderBottom:`1px solid ${B}`,background:'#f5f5f5'}}>
          <input ref={ref} value={q} onChange={e=>setQ(e.target.value)}
            placeholder="Search by vendor name, GSTIN, city…"
            style={{width:'100%',height:24,padding:'0 6px',border:'1px solid #888',
              borderRadius:0,fontSize:12,fontFamily:F,outline:'none'}}
            onKeyDown={e=>e.key==='Escape'&&onClose()}/>
        </div>
        <div style={{flex:1,overflowY:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,fontFamily:F}}>
            <thead style={{background:N,position:'sticky',top:0}}>
              <tr>
                {['Vendor ID','Vendor Name','City / State','GSTIN'].map((h,i)=>(
                  <th key={i} style={{padding:'4px 8px',color:W,fontWeight:700,textAlign:'left',
                    borderRight:'1px solid #2a5a8a'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length===0
                ?<tr><td colSpan={4} style={{padding:'12px',textAlign:'center',color:'#666',fontFamily:F}}>No vendors found</td></tr>
                :filtered.map((v,i)=>(
                  <tr key={v.vendorId} onClick={()=>onSelect(v)}
                    style={{background:i%2===0?W:'#f5f8fc',cursor:'pointer',borderBottom:'1px solid #e8e8e8'}}
                    onMouseEnter={e=>e.currentTarget.style.background='#d0e4f8'}
                    onMouseLeave={e=>e.currentTarget.style.background=i%2===0?W:'#f5f8fc'}>
                    <td style={{padding:'3px 8px',borderRight:'1px solid #ebebeb',color:'#888'}}>{v.vendorId||'—'}</td>
                    <td style={{padding:'3px 8px',borderRight:'1px solid #ebebeb',fontWeight:700}}>{v.vendorName||'—'}</td>
                    <td style={{padding:'3px 8px',borderRight:'1px solid #ebebeb'}}>{[v.city,v.state].filter(Boolean).join(', ')||'—'}</td>
                    <td style={{padding:'3px 8px',fontFamily:'monospace',fontSize:10}}>{v.gstin||v.gstNumber||'—'}</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
        <div style={{padding:'3px 8px',background:'#f0f0f0',borderTop:`1px solid ${B}`,
          fontSize:10,color:'#666',fontFamily:F}}>
          {filtered.length} vendor{filtered.length!==1?'s':''} — Click row to select · ESC to cancel
        </div>
      </div>
    </div>
  );
}

function TabOrderDetails({form,setF,salesOrders,vendors,openSOPicker,poNumberLoaded,showVendorSearch,setShowVendorSearch,checkDupPoNo,poDupWarn}){
  const [showSOSearch,setShowSOSearch]=useState(false);

  const selectVendor=v=>{
    const cp=(v.contactPersons||[])[0]||{};
    setF('vendorId',String(v.vendorId||''));
    setF('vendorName',v.vendorName||'');
    setF('vendorCode',String(v.vendorId||''));
    setF('vendorGstin',v.gstin||v.gstNumber||'');
    setF('vendorState',v.state||'');
    setF('vendorCity',v.city||'');
    setF('vendorPincode',v.pincode||'');
    setF('vendorAddress',v.address||v.billingAddress||'');
    setF('shipFromAddress',v.address||v.billingAddress||'');
    setF('shipFromCity',v.city||'');
    setF('shipFromState',v.state||'');
    setF('shipFromPincode',v.pincode||'');
    setF('contactPerson',cp.name||v.contactPerson||'');
    setF('mobile',cp.mobileNumber||v.mobile||'');
    setF('email',cp.email||v.email||'');
    setF('contactPerson2',(v.contactPersons||[])[1]?.name||'');
    setF('mobile2',(v.contactPersons||[])[1]?.mobileNumber||'');
    setF('email2',(v.contactPersons||[])[1]?.email||'');
    setF('paymentTerms',v.paymentTerms||form.paymentTerms||'Net 30');
    setF('creditLimit',String(v.creditLimit||''));
    setShowVendorSearch(false);
  };

  const selectSO=s=>{
    setF('linkedSalesOrderId',String(s.orderId));
    setF('linkedSODisplay',`SO#${s.orderId} | ${s.customerName||s.party||'—'}`);
    setShowSOSearch(false);
    setTimeout(()=>openSOPicker(),80);
  };

  const clearSO=()=>{
    setF('linkedSalesOrderId','');
    setF('linkedSODisplay','');
  };

  return(
    <div style={{padding:'12px 14px',display:'flex',flexDirection:'column',gap:12}}>

      {/* SO Search Popup */}
      {showSOSearch&&(
        <SOSearch salesOrders={salesOrders} onSelect={selectSO} onClose={()=>setShowSOSearch(false)}/>
      )}

      {/* Vendor Search Popup */}
      {showVendorSearch&&(
        <VendorSearch vendors={vendors} onSelect={selectVendor} onClose={()=>setShowVendorSearch(false)}/>
      )}

      {/* ── Row 1: Reference Numbers (LEFT) + Vendor Bill From (RIGHT) ── */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>

        {/* LEFT: Order Reference */}
        <div style={{border:`1px solid ${B}`,background:W,borderRadius:8,boxShadow:'0 1px 3px rgba(0,0,0,0.04)',overflow:'hidden'}}>
          <PH title="Order Reference Numbers"/>
          <div style={{padding:'0 6px 6px'}}>
            {/* Linked Sales Order */}
            <div style={{display:'flex',alignItems:'center',minHeight:30,borderBottom:'1px solid #CBD5E1',padding:'2px 6px',background:W}}>
              <label style={{fontSize:11.5,fontWeight:700,color:'#000000',minWidth:120,padding:'0 8px 0 0',textAlign:'left',flexShrink:0}}>
                Sales Order<span style={{color:R,marginLeft:2}}>*</span>
              </label>
              <div style={{flex:1,display:'flex',gap:4,alignItems:'center'}}>
                {form.linkedSalesOrderId
                  ?<span style={{flex:1,fontSize:11,fontWeight:700,color:'#005500',fontFamily:F,
                      background:'#d8f0d8',border:'1px solid #44aa44',padding:'1px 6px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                    ✓ {form.linkedSODisplay}
                  </span>
                  :<span style={{flex:1,fontSize:11,color:'#999',fontFamily:F,fontStyle:'italic'}}>No sales order linked</span>
                }
                <button onClick={()=>setShowSOSearch(true)} title="Search sales order"
                  style={{background:'#d8ecff',color:'#003875',border:'1px solid #88aacc',
                    padding:'0 8px',fontSize:15,cursor:'pointer',height:22,
                    fontFamily:F,fontWeight:700,flexShrink:0}}>
                  🔍
                </button>
                {form.linkedSalesOrderId&&<Btn small v="dan" onClick={clearSO}>✕</Btn>}
                {form.linkedSalesOrderId&&<Btn small v="pri" onClick={openSOPicker}>📦 Items</Btn>}
              </div>
            </div>

            <FR label="ERP Order ID" w={120}>
              <Inp value={form.nextId||''} readOnly style={{width:110,background:'#ffffcc',fontWeight:700}}/>
              <span style={{fontSize:10,color:'#888',fontFamily:F}}>(auto)</span>
            </FR>
            <FR label="PO Number" req w={120}>
              <Inp value={form.poNo} onChange={e=>setF('poNo',e.target.value)}
                onBlur={e=>checkDupPoNo&&checkDupPoNo(e.target.value)}
                placeholder={form.nextId?makePoNo(form.nextId,form.poDate):''}/>
              {!poNumberLoaded&&<span style={{fontSize:10,color:'#888',fontFamily:F,whiteSpace:'nowrap'}}>…</span>}
            </FR>
            {poDupWarn&&<div style={{marginLeft:128,marginTop:-4,marginBottom:4,fontSize:11,color:'#92400E',background:'#FFFBEB',border:'1px solid #FCD34D',borderRadius:4,padding:'2px 8px',fontFamily:F}}>{poDupWarn}</div>}
            <FR label="PO Date" w={120}>
              <DateInp value={form.poDate} onChange={e=>setF('poDate',e.target.value)} style={{width:140}}/>
            </FR>
            <FR label="PO Type" w={120}>
              <Sel value={form.poType} onChange={e=>setF('poType',e.target.value)}
                options={['Standard','Service','AMC','Emergency','Repeat','Blanket']}/>
            </FR>
            <FR label="Quote Ref No." w={120}>
              <Inp value={form.quotationRef} onChange={e=>setF('quotationRef',e.target.value)}/>
            </FR>
            <FR label="Quote Date" w={120}>
              <DateInp value={form.quoteDate||''} onChange={e=>setF('quoteDate',e.target.value)} style={{width:140}}/>
            </FR>
            <FR label="ERO No." w={120}>
              <Inp value={form.eroNo||''} onChange={e=>setF('eroNo',e.target.value)}/>
            </FR>
            <FR label="Enquiry Ref" w={120}>
              <Inp value={form.enquiryRef} onChange={e=>setF('enquiryRef',e.target.value)}/>
            </FR>
            <FR label="Vendor Ref" w={120}>
              <Inp value={form.vendorRef} onChange={e=>setF('vendorRef',e.target.value)}/>
            </FR>
            <FR label="Delivery Date" w={120}>
              <DateInp value={form.deliveryDate} onChange={e=>setF('deliveryDate',e.target.value)} style={{width:140}}/>
            </FR>
            <FR label="Incoterms" w={120}>
              <Inp value={form.incoterms} onChange={e=>setF('incoterms',e.target.value)} style={{width:180}}/>
            </FR>
            <FR label="Purchase Person" w={120}>
              <Inp value={form.purchasePerson} onChange={e=>setF('purchasePerson',e.target.value)}/>
            </FR>
            {/* ── Client info row derived from linked SO ── */}
            {(()=>{
              const so=form.linkedSalesOrderId
                ?salesOrders.find(s=>String(s.orderId)===String(form.linkedSalesOrderId))
                :null;
              if(!so) return null;
              return(
                <div style={{margin:'6px 4px 2px',padding:'6px 8px',background:'#f0f7ff',
                  border:'1px solid #b8d4f0',borderRadius:5}}>
                  <div style={{fontSize:10,fontWeight:700,color:'#104f4f',marginBottom:4,
                    textTransform:'uppercase',letterSpacing:'0.4px'}}>Bill To — Client</div>
                  <div style={{fontSize:12,fontWeight:700,color:'#003070',marginBottom:2}}>{so.customerName||so.party||'—'}</div>
                  {so.customerGstin&&<div style={{fontSize:10,color:'#555',fontFamily:'monospace'}}>GSTIN: {so.customerGstin}</div>}
                  {(so.customerCity||so.customerState)&&
                    <div style={{fontSize:10,color:'#555'}}>{[so.customerCity,so.customerState].filter(Boolean).join(', ')}</div>}
                </div>
              );
            })()}
          </div>
        </div>

        {/* RIGHT: Bill From — Vendor Details (editable) */}
        <div style={{border:`1px solid ${B}`,background:W,borderRadius:8,boxShadow:'0 1px 3px rgba(0,0,0,0.04)',overflow:'hidden'}}>
          <PH title="Bill From — Vendor Details"/>
          <div style={{padding:'0 6px 6px'}}>
            <div style={{display:'flex',alignItems:'center',minHeight:24,borderBottom:'1px solid #ebebeb',padding:'2px 4px'}}>
              <label style={{fontSize:11,fontWeight:700,color:'#333',minWidth:120,padding:'0 8px 0 0',textAlign:'right',flexShrink:0}}>
                Vendor Name<span style={{color:R}}>*</span>
              </label>
              <div style={{flex:1,display:'flex',gap:4,alignItems:'center'}}>
                <Inp value={form.vendorName} onChange={e=>setF('vendorName',e.target.value)}
                  placeholder="Type or click 🔍 to search…" style={{flex:1}}/>
                <button onClick={()=>setShowVendorSearch(true)} title="Search vendor"
                  style={{background:'#d8ecff',color:'#003875',border:'1px solid #88aacc',
                    padding:'0 8px',fontSize:15,cursor:'pointer',height:22,
                    fontFamily:F,fontWeight:700,flexShrink:0}}>
                  🔍
                </button>
              </div>
            </div>
            <FR label="Vendor Code" w={120}><Inp value={form.vendorCode} readOnly style={{width:120,background:'#f0f0f0'}}/></FR>
            <FR label="GSTIN" w={120}><Inp value={form.vendorGstin} onChange={e=>setF('vendorGstin',e.target.value)} style={{width:200,fontFamily:'monospace'}}/></FR>
            <FR label="Address" w={120}><Txt value={form.vendorAddress} onChange={v=>setF('vendorAddress',v)} rows={2}/></FR>
            <FR label="City" w={120}><Inp value={form.vendorCity||''} onChange={e=>setF('vendorCity',e.target.value)} style={{width:150}}/></FR>
            <FR label="State" w={120}><Inp value={form.vendorState} onChange={e=>setF('vendorState',e.target.value)} style={{width:150}}/></FR>
            <FR label="Pincode" w={120}><Inp value={form.vendorPincode||''} onChange={e=>setF('vendorPincode',e.target.value)} style={{width:90}}/></FR>
          </div>
        </div>
      </div>

      {/* ── Row 2: Ship From + Contact POC ── */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        <div style={{border:`1px solid ${B}`,background:W,borderRadius:8,boxShadow:'0 1px 3px rgba(0,0,0,0.04)',overflow:'hidden'}}>
          <PH title="Ship From (Dispatch Address)"/>
          <div style={{padding:'0 6px 6px'}}>
            <FR label="Address" w={120}><Txt value={form.shipFromAddress||''} onChange={v=>setF('shipFromAddress',v)} rows={2}/></FR>
            <FR label="City" w={120}><Inp value={form.shipFromCity||''} onChange={e=>setF('shipFromCity',e.target.value)} style={{width:150}}/></FR>
            <FR label="State" w={120}><Inp value={form.shipFromState||''} onChange={e=>setF('shipFromState',e.target.value)} style={{width:150}}/></FR>
            <FR label="Pincode" w={120}><Inp value={form.shipFromPincode||''} onChange={e=>setF('shipFromPincode',e.target.value)} style={{width:90}}/></FR>
          </div>
        </div>
        <div style={{border:`1px solid ${B}`,background:W,borderRadius:8,boxShadow:'0 1px 3px rgba(0,0,0,0.04)',overflow:'hidden'}}>
          <PH title="Contact Persons (POC)"/>
          <div style={{padding:'0 6px 6px'}}>
            <div style={{padding:'2px 4px',borderBottom:'1px solid #ebebeb',
              fontSize:10,fontWeight:700,color:'#666',fontFamily:F,background:'#fafafa'}}>
              Primary Contact
            </div>
            <FR label="Contact Person" w={120}><Inp value={form.contactPerson} onChange={e=>setF('contactPerson',e.target.value)}/></FR>
            <FR label="Mobile" w={120}><Inp value={form.mobile} onChange={e=>setF('mobile',e.target.value)} style={{width:160}}/></FR>
            <FR label="Email" w={120}><Inp value={form.email} onChange={e=>setF('email',e.target.value)}/></FR>
            <div style={{padding:'2px 4px',borderBottom:'1px solid #ebebeb',borderTop:'1px solid #ebebeb',
              fontSize:10,fontWeight:700,color:'#666',fontFamily:F,background:'#fafafa',marginTop:4}}>
              Secondary Contact
            </div>
            <FR label="Contact Person" w={120}><Inp value={form.contactPerson2||''} onChange={e=>setF('contactPerson2',e.target.value)}/></FR>
            <FR label="Mobile" w={120}><Inp value={form.mobile2||''} onChange={e=>setF('mobile2',e.target.value)} style={{width:160}}/></FR>
            <FR label="Email" w={120}><Inp value={form.email2||''} onChange={e=>setF('email2',e.target.value)}/></FR>
          </div>
        </div>
      </div>
    </div>
  );
}

function TabItems({items,setItems,form,openSOPicker}){
  const newRow=()=>({_id:uid(),itemName:'',description:'',hsnCode:'',qty:1,unit:'NOS',rate:'',discount:0,discountType:'%',gstPercent:18});
  const upd=(id,k,v)=>setItems(p=>p.map(it=>it._id===id?{...it,[k]:v}:it));
  const rem=id=>setItems(p=>p.filter(it=>it._id!==id));
  const add=()=>setItems(p=>[...p,newRow()]);

  const totals=items.reduce((s,it)=>{const r=calcRow(it);return{tax:s.tax+r.tax,gst:s.gst+r.gst,total:s.total+r.total};},{tax:0,gst:0,total:0});

  return(
    <div style={{padding:'4px 0'}}>
      <div style={{display:'flex',gap:6,padding:'4px 6px',background:'#f0f4ff',
        borderBottom:'1px solid #dde',marginBottom:4,alignItems:'center'}}>
        <Btn small v="pri" onClick={add}>ï¼‹ Add Row</Btn>
        {form.linkedSalesOrderId&&(
          <Btn small v="war" onClick={openSOPicker}>📦 Load from SO #{form.linkedSalesOrderId}</Btn>
        )}
        <span style={{marginLeft:'auto',fontSize:11,fontFamily:F,fontWeight:700,color:N}}>
          {items.length} items · Taxable: {fmt(totals.tax)} · GST: {fmt(totals.gst)} · Total: {fmt(totals.total)}
        </span>
      </div>

      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,fontFamily:F,minWidth:1000}}>
          <thead>
            <tr style={{background:N}}>
              {['#','Item Name','Specs / Description','HSN','Qty','Unit','Rate','Disc','GST%','Amount',''].map((h,i)=>(
                <th key={i} style={{padding:'5px 6px',color:W,fontWeight:700,fontSize:10,
                  textAlign:['Rate','Amount'].includes(h)?'right':'center',
                  borderRight:'1px solid #4a6a7a',whiteSpace:'nowrap'}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length===0&&(
              <tr><td colSpan={11} style={{padding:16,textAlign:'center',color:'#888',fontStyle:'italic',fontFamily:F}}>
                No items. Click "ï¼‹ Add Row" or load from SO.
              </td></tr>
            )}
            {items.map((it,i)=>{
              const r=calcRow(it);
              return(
                <tr key={it._id} style={{background:i%2===0?W:'#f5f8fc'}}>
                  <td style={{padding:'2px 5px',border:'1px solid #e0e0e0',textAlign:'center',color:'#888',width:28}}>{i+1}</td>
                  <td style={{padding:'2px 3px',border:'1px solid #e0e0e0',minWidth:120}}>
                    <Inp value={it.itemName} onChange={e=>upd(it._id,'itemName',e.target.value)}/>
                  </td>
                  <td style={{padding:'2px 3px',border:'1px solid #e0e0e0',minWidth:160}}>
                    <textarea
                      value={it.description||''}
                      onChange={e=>upd(it._id,'description',e.target.value)}
                      placeholder="Specs / additional description…"
                      rows={2}
                      style={{width:'100%',padding:'3px 6px',border:'1px solid #9CA3AF',borderRadius:4,
                        fontSize:11,fontFamily:F,resize:'vertical',outline:'none',boxSizing:'border-box',
                        lineHeight:1.4,minHeight:44,background:W}}
                    />
                  </td>
                  <td style={{padding:'2px 3px',border:'1px solid #e0e0e0',width:70}}>
                    <Inp value={it.hsnCode} onChange={e=>upd(it._id,'hsnCode',e.target.value)}/>
                  </td>
                  <td style={{padding:'2px 3px',border:'1px solid #e0e0e0',width:60}}>
                    <Inp type="number" value={it.qty} onChange={e=>upd(it._id,'qty',e.target.value)}/>
                  </td>
                  <td style={{padding:'2px 3px',border:'1px solid #e0e0e0',width:70}}>
                    <Sel value={it.unit} onChange={e=>upd(it._id,'unit',e.target.value)}
                      options={['NOS','Kg','Ltr','Mtr','Box','Pcs','Set','Hr','Sqft','MT','Roll','Pair','Bag']}/>
                  </td>
                  <td style={{padding:'2px 3px',border:'1px solid #e0e0e0',width:80}}>
                    <Inp type="number" value={it.rate} onChange={e=>upd(it._id,'rate',e.target.value)}/>
                  </td>
                  <td style={{padding:'2px 3px',border:'1px solid #e0e0e0',width:65}}>
                    <div style={{display:'flex',gap:2}}>
                      <Inp type="number" value={it.discount} onChange={e=>upd(it._id,'discount',e.target.value)} style={{width:38}}/>
                      <Sel value={it.discountType} onChange={e=>upd(it._id,'discountType',e.target.value)}
                        options={['%','₹']} style={{width:28}}/>
                    </div>
                  </td>
                  <td style={{padding:'2px 3px',border:'1px solid #e0e0e0',width:60}}>
                    <Sel value={it.gstPercent} onChange={e=>upd(it._id,'gstPercent',parseFloat(e.target.value))}
                      options={[0,5,12,18,28].map(g=>({value:g,label:g+'%'}))}/>
                  </td>
                  <td style={{padding:'3px 5px',border:'1px solid #e0e0e0',textAlign:'right',
                    fontWeight:700,color:N,width:86,whiteSpace:'nowrap'}}>
                    {fmt(r.total)}
                  </td>
                  <td style={{padding:'2px 4px',border:'1px solid #e0e0e0',textAlign:'center',width:28}}>
                    <Btn small v="dan" onClick={()=>rem(it._id)}>✕</Btn>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {items.length>0&&(
            <tfoot>
              <tr style={{background:'#eef2f8'}}>
                <td colSpan={9} style={{padding:'4px 8px',fontWeight:700,fontSize:11,fontFamily:F,textAlign:'right',border:'1px solid #e0e0e0'}}>Totals →</td>
                <td style={{padding:'4px 6px',border:'1px solid #e0e0e0',textAlign:'right',fontWeight:700,color:N,fontSize:12}}>{fmt(totals.total)}</td>
                <td style={{border:'1px solid #e0e0e0'}}/>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function TabCharges({form,setF,items,charges,setCharges}){
  const newCharge=()=>({_id:uid(),chargeType:'',amount:0,gstPercent:18});
  const upd=(id,k,v)=>setCharges(p=>p.map(c=>c._id===id?{...c,[k]:v}:c));
  const rem=id=>setCharges(p=>p.filter(c=>c._id!==id));

  const subTotal=items.reduce((s,it)=>{const r=calcRow(it);return s+r.tax;},0);
  const totalGST=items.reduce((s,it)=>{const r=calcRow(it);return s+r.gst;},0);
  const chgAmt=charges.reduce((s,c)=>s+(parseFloat(c.amount)||0),0);
  const chgGST=charges.reduce((s,c)=>{const a=parseFloat(c.amount)||0;return s+a*(parseFloat(c.gstPercent)||0)/100;},0);
  const disc=parseFloat(form.overallDiscount)||0;
  const fc=parseFloat(form.freightCharges)||0;
  const pc=parseFloat(form.packingCharges)||0;
  const ro=parseFloat(form.roundOff)||0;
  const grand=subTotal+totalGST+chgAmt+chgGST+fc+pc-disc+ro;

  return(
    <div style={{padding:'6px 0'}}>
      <PH title="Additional Charges"/>
      <div style={{overflowX:'auto',marginBottom:8}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,fontFamily:F}}>
          <thead>
            <tr style={{background:N}}>
              {['#','Charge Type','Amount (₹)','GST %','Charge Total',''].map((h,i)=>(
                <th key={i} style={{padding:'5px 7px',color:W,fontWeight:700,fontSize:10,textAlign:'center',borderRight:'1px solid #4a6a7a'}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {charges.length===0&&(
              <tr><td colSpan={6} style={{padding:10,textAlign:'center',color:'#888',fontStyle:'italic'}}>No additional charges</td></tr>
            )}
            {charges.map((c,i)=>{
              const a=parseFloat(c.amount)||0;
              const g=parseFloat(c.gstPercent)||0;
              const ct=a+a*g/100;
              return(
                <tr key={c._id} style={{background:i%2===0?W:'#f5f8fc'}}>
                  <td style={{padding:'2px 6px',border:'1px solid #e0e0e0',textAlign:'center',color:'#888',width:28}}>{i+1}</td>
                  <td style={{padding:'2px 3px',border:'1px solid #e0e0e0',minWidth:180}}>
                    <Inp value={c.chargeType} onChange={e=>upd(c._id,'chargeType',e.target.value)} placeholder="e.g. Inspection, Testing…"/>
                  </td>
                  <td style={{padding:'2px 3px',border:'1px solid #e0e0e0',width:100}}>
                    <Inp type="number" value={c.amount} onChange={e=>upd(c._id,'amount',e.target.value)}/>
                  </td>
                  <td style={{padding:'2px 3px',border:'1px solid #e0e0e0',width:70}}>
                    <Sel value={c.gstPercent} onChange={e=>upd(c._id,'gstPercent',e.target.value)}
                      options={[0,5,12,18,28].map(g=>({value:g,label:g+'%'}))}/>
                  </td>
                  <td style={{padding:'3px 6px',border:'1px solid #e0e0e0',textAlign:'right',fontWeight:700,color:N}}>{fmt(ct)}</td>
                  <td style={{padding:'2px 4px',border:'1px solid #e0e0e0',textAlign:'center',width:28}}>
                    <Btn small v="dan" onClick={()=>rem(c._id)}>✕</Btn>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{padding:'4px 6px'}}>
        <Btn small onClick={()=>setCharges(p=>[...p,newCharge()])}>ï¼‹ Add Charge</Btn>
      </div>

      <PH title="Freight / Packing / Discount"/>
      <FR label="Freight Charges" w={160}>
        <Inp type="number" value={form.freightCharges} onChange={e=>setF('freightCharges',e.target.value)} style={{width:100}}/>
      </FR>
      <FR label="Packing Charges" w={160}>
        <Inp type="number" value={form.packingCharges} onChange={e=>setF('packingCharges',e.target.value)} style={{width:100}}/>
      </FR>
      <FR label="Overall Discount (₹)" w={160}>
        <Inp type="number" value={form.overallDiscount} onChange={e=>setF('overallDiscount',e.target.value)} style={{width:100}}/>
      </FR>
      <FR label="Round Off" w={160}>
        <Inp type="number" value={form.roundOff} onChange={e=>setF('roundOff',e.target.value)} style={{width:80}}/>
      </FR>

      {/* Summary */}
      <div style={{display:'flex',justifyContent:'flex-end',marginTop:12,padding:'0 8px'}}>
        <div style={{minWidth:280,border:'2px solid '+N,padding:10,background:'#f8faff',fontFamily:F,fontSize:12}}>
          <div style={{fontWeight:700,borderBottom:'1px solid #ddd',paddingBottom:4,marginBottom:6,color:N,fontSize:11,letterSpacing:0.5}}>ORDER SUMMARY</div>
          {[
            ['Sub Total (excl. GST)', subTotal],
            ['Total GST', totalGST],
            chgAmt>0&&['Additional Charges', chgAmt],
            chgGST>0&&['Charges GST', chgGST],
            fc>0&&['Freight Charges', fc],
            pc>0&&['Packing Charges', pc],
            disc>0&&['Discount', -disc],
            ro!==0&&['Round Off', ro],
          ].filter(Boolean).map(([l,v],i)=>(
            <div key={i} style={{display:'flex',justifyContent:'space-between',marginBottom:3,color:v<0?R:'#333'}}>
              <span>{l}</span><span style={{fontFamily:'monospace'}}>{v<0?'− '+fmt(-v):fmt(v)}</span>
            </div>
          ))}
          <div style={{display:'flex',justifyContent:'space-between',borderTop:'2px solid '+N,
            paddingTop:6,marginTop:6,fontWeight:700,fontSize:14,color:N}}>
            <span>Grand Total</span><span>{fmt(grand)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TabDelivery({form,setF}){
  return(
    <div style={{padding:'6px 0'}}>
      <PH title="Delivery Details"/>
      <FR label="Delivery Address" w={150}>
        <Inp value={form.deliveryAddr} onChange={e=>setF('deliveryAddr',e.target.value)} placeholder="Full delivery address"/>
      </FR>
      <FR label="Shipping Address" w={150}>
        <Inp value={form.shippingAddr} onChange={e=>setF('shippingAddr',e.target.value)} placeholder="If different from delivery"/>
      </FR>
      <FR label="Dispatch Mode" w={150}>
        <Sel value={form.dispatchMode} onChange={e=>setF('dispatchMode',e.target.value)}
          options={['','Road','Rail','Air','Sea','Courier','Hand Delivery']}/>
      </FR>
      <FR label="Transporter" w={150}>
        <Inp value={form.transporterName} onChange={e=>setF('transporterName',e.target.value)}/>
      </FR>
      <FR label="Vehicle / LR No." w={150}>
        <Inp value={form.vehicleNumber} onChange={e=>setF('vehicleNumber',e.target.value)}/>
      </FR>
      <FR label="Instructions" w={150}>
        <Inp value={form.deliveryInstructions} onChange={e=>setF('deliveryInstructions',e.target.value)}/>
      </FR>
    </div>
  );
}

function TabPayment({form,setF}){
  // Auto-calc due date
  useEffect(()=>{
    if(!form.poDate||!form.paymentTerms) return;
    const days=parseInt(form.paymentTerms)||0;
    if(!days) return;
    const d=new Date(form.poDate);
    d.setDate(d.getDate()+days);
    setF('dueDate',d.toISOString().slice(0,10));
  },[form.poDate,form.paymentTerms]); // eslint-disable-line react-hooks/exhaustive-deps

  return(
    <div style={{padding:'6px 0'}}>
      <PH title="Payment Terms"/>
      <FR label="Payment Terms" w={150}>
        <Sel value={form.paymentTerms} onChange={e=>setF('paymentTerms',e.target.value)}
          options={['','Net 15','Net 30','Net 45','Net 60','Advance 100%','50% Advance','COD','LC']}/>
        <Inp value={form.paymentTerms} onChange={e=>setF('paymentTerms',e.target.value)}
          placeholder="or type custom terms" style={{width:180}}/>
      </FR>
      <FR label="Payment Mode" w={150}>
        <Sel value={form.paymentMode} onChange={e=>setF('paymentMode',e.target.value)}
          options={['','NEFT','RTGS','Cheque','Cash','LC','DD']}/>
      </FR>
      <FR label="Due Date" w={150}>
        <DateInp value={form.dueDate} onChange={e=>setF('dueDate',e.target.value)} style={{width:150}}/>
        <span style={{fontSize:10,color:'#888',fontFamily:F}}>(auto from PO date + terms)</span>
      </FR>
      <FR label="Credit Limit (₹)" w={150}>
        <Inp type="number" value={form.creditLimit} onChange={e=>setF('creditLimit',e.target.value)} style={{width:120}}/>
      </FR>
      <FR label="Billing Terms" w={150}>
        <Inp value={form.billingTerms} onChange={e=>setF('billingTerms',e.target.value)}/>
      </FR>
    </div>
  );
}

function TabNotes({form,setF}){
  return(
    <div style={{padding:'6px 0'}}>
      <PH title="Notes & Terms"/>
      <div style={{padding:'6px 8px 4px'}}>
        <label style={{fontSize:11,fontWeight:700,color:'#333',fontFamily:F,display:'block',marginBottom:3}}>Terms & Conditions</label>
        <Txt value={form.termsConditions} onChange={v=>setF('termsConditions',v)} placeholder="Applicable T&C…" rows={4}/>
      </div>
      <div style={{padding:'4px 8px'}}>
        <label style={{fontSize:11,fontWeight:700,color:'#333',fontFamily:F,display:'block',marginBottom:3}}>Internal Notes <span style={{fontWeight:400,color:'#888'}}>(not printed)</span></label>
        <Txt value={form.internalNotes} onChange={v=>setF('internalNotes',v)} placeholder="Internal remarks…" rows={3}/>
      </div>
      <div style={{padding:'4px 8px'}}>
        <label style={{fontSize:11,fontWeight:700,color:'#333',fontFamily:F,display:'block',marginBottom:3}}>Notes to Vendor</label>
        <Txt value={form.vendorNotes} onChange={v=>setF('vendorNotes',v)} placeholder="Visible to vendor…" rows={3}/>
      </div>
    </div>
  );
}

function TabScopeOfWork({scopeItems,setScopeItems,linkedSO}){
  const add  = ()=>setScopeItems(p=>[...p,{_id:uid(),item:'',clientScope:false,ourScope:false,vendorScope:true,remarks:''}]);
  const upd  = (id,k,v)=>setScopeItems(p=>p.map(r=>r._id===id?{...r,[k]:v}:r));
  const del  = (id)=>setScopeItems(p=>p.filter(r=>r._id!==id));
  const quick= (s)=>setScopeItems(p=>[...p,{_id:uid(),item:s,clientScope:false,ourScope:false,vendorScope:true,remarks:''}]);

  return(
    <div style={{padding:'8px 10px'}}>
      {/* info banner */}
      <div style={{margin:'0 0 8px',background:'#EFF6FF',border:'1px solid #BFDBFE',borderRadius:6,padding:'8px 12px',display:'flex',alignItems:'center',gap:8}}>
        <span style={{fontSize:13}}>ℹï¸</span>
        <span style={{fontSize:11,color:'#1E40AF',fontFamily:F}}>
          {linkedSO
            ? `Scope of Work imported from SO #${linkedSO}. You can add/edit rows and mark vendor responsibility.`
            : 'Link a Sales Order to auto-import scope items, or add rows manually.'}
        </span>
      </div>

      {/* header + add */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
        <span style={{fontSize:12,fontWeight:700,color:'#104f4f',fontFamily:F}}>Scope of Work</span>
        <Btn v="suc" onClick={add}>+ Add Row</Btn>
      </div>

      {/* quick-add chips */}
      <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:8,padding:'6px 8px',background:'#f0f7ff',border:'1px solid #cce'}}>
        <span style={{fontSize:10,color:'#555',alignSelf:'center',marginRight:2,fontWeight:700,fontFamily:F}}>Quick Add:</span>
        {SCOPE_DEFAULTS.map((s,i)=>(
          <button key={i} onClick={()=>quick(s)}
            style={{background:'#d8eeff',color:'#003875',border:'1px solid #88aacc',
              padding:'2px 8px',fontSize:10,cursor:'pointer',height:20,fontFamily:F}}>
            {s}
          </button>
        ))}
      </div>

      {/* table */}
      <div style={{border:'1px solid #CBD5E1',borderRadius:4,overflow:'hidden'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,fontFamily:F}}>
          <thead>
            <tr style={{background:'#104f4f'}}>
              {['#','Scope Item / Activity','Client Scope','Our Scope','Vendor Scope','Remarks',''].map((h,i)=>(
                <th key={i} style={{padding:'5px 7px',color:'#fff',fontWeight:700,fontSize:10,
                  textAlign:[2,3,4].includes(i)?'center':'left',
                  borderRight:'1px solid #2a5a8a',whiteSpace:'nowrap'}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scopeItems.length===0?(
              <tr><td colSpan={7} style={{padding:'18px',textAlign:'center',color:'#888',background:'#fafafa',fontSize:11,fontFamily:F}}>
                Link a Sales Order or use Quick Add / + Add Row
              </td></tr>
            ):scopeItems.map((s,i)=>(
              <tr key={s._id} style={{background:i%2===0?'#fff':'#F8FAFC'}}>
                <td style={{padding:'3px 5px',border:'1px solid #e0e0e0',width:28,textAlign:'center',color:'#888'}}>{i+1}</td>
                <td style={{padding:'2px 4px',border:'1px solid #e0e0e0'}}>
                  <Inp value={s.item} onChange={e=>upd(s._id,'item',e.target.value)} placeholder="e.g. AC, Transport, Installation…"/>
                </td>
                <td style={{padding:'2px 4px',border:'1px solid #e0e0e0',width:90,textAlign:'center'}}>
                  <input type="checkbox" checked={!!s.clientScope} onChange={e=>upd(s._id,'clientScope',e.target.checked)}/>
                </td>
                <td style={{padding:'2px 4px',border:'1px solid #e0e0e0',width:90,textAlign:'center'}}>
                  <input type="checkbox" checked={!!s.ourScope} onChange={e=>upd(s._id,'ourScope',e.target.checked)}/>
                </td>
                <td style={{padding:'2px 4px',border:'1px solid #e0e0e0',width:90,textAlign:'center'}}>
                  <input type="checkbox" checked={!!s.vendorScope} onChange={e=>upd(s._id,'vendorScope',e.target.checked)}/>
                </td>
                <td style={{padding:'2px 4px',border:'1px solid #e0e0e0'}}>
                  <Inp value={s.remarks||''} onChange={e=>upd(s._id,'remarks',e.target.value)} placeholder="Notes…"/>
                </td>
                <td style={{padding:'2px 4px',border:'1px solid #e0e0e0',width:30,textAlign:'center'}}>
                  <button onClick={()=>del(s._id)}
                    style={{background:'#ffe0e0',color:'#DC2626',border:'1px solid #cc8888',padding:'0 4px',fontSize:10,cursor:'pointer',height:18}}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TabAttachments({attachments,setAttachments}){
  const fileRef=useRef(null);
  const addFiles=files=>{
    const rows=Array.from(files).map(f=>({_id:uid(),file:f,name:f.name,usedFor:'',size:f.size}));
    setAttachments(p=>[...p,...rows]);
  };
  const upd=(id,k,v)=>setAttachments(p=>p.map(a=>a._id===id?{...a,[k]:v}:a));
  const rem=id=>setAttachments(p=>p.filter(a=>a._id!==id));

  return(
    <div style={{padding:'6px 0'}}>
      <PH title="Attachments"/>
      {/* Drop zone */}
      <div onDrop={e=>{e.preventDefault();addFiles(e.dataTransfer.files);}}
        onDragOver={e=>e.preventDefault()}
        onClick={()=>fileRef.current.click()}
        style={{margin:'6px 8px',padding:'18px',border:'2px dashed #aaa',
          textAlign:'center',cursor:'pointer',background:'#fafbff',
          fontSize:11,fontFamily:F,color:'#666'}}>
        📎 Drop files here or <span style={{color:N,fontWeight:700}}>click to browse</span>
        <input ref={fileRef} type="file" multiple style={{display:'none'}}
          onChange={e=>addFiles(e.target.files)}/>
      </div>

      {attachments.length>0&&(
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,fontFamily:F,marginTop:4}}>
          <thead>
            <tr style={{background:N}}>
              {['#','File Name','Used For','Size',''].map((h,i)=>(
                <th key={i} style={{padding:'4px 7px',color:W,fontWeight:700,fontSize:10,textAlign:'left',borderRight:'1px solid #4a6a7a'}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {attachments.map((a,i)=>(
              <tr key={a._id} style={{background:i%2===0?W:'#f5f8fc'}}>
                <td style={{padding:'3px 6px',border:'1px solid #e0e0e0',color:'#888',textAlign:'center',width:28}}>{i+1}</td>
                <td style={{padding:'3px 6px',border:'1px solid #e0e0e0',fontWeight:600}}>{a.name}</td>
                <td style={{padding:'2px 3px',border:'1px solid #e0e0e0',width:200}}>
                  <Inp value={a.usedFor} onChange={e=>upd(a._id,'usedFor',e.target.value)} placeholder="e.g. Drawing, Quote…"/>
                </td>
                <td style={{padding:'3px 6px',border:'1px solid #e0e0e0',color:'#888',whiteSpace:'nowrap'}}>
                  {a.size?(a.size/1024).toFixed(1)+' KB':'—'}
                </td>
                <td style={{padding:'2px 4px',border:'1px solid #e0e0e0',textAlign:'center',width:28}}>
                  <Btn small v="dan" onClick={()=>rem(a._id)}>✕</Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ═══════════════════════ LIST VIEW (All POs) ═══════════════════════ */
const HDR_BLUE   = '#3A6186';
const HDR_BLUE_D = '#2A4D6E';

function ListAll({companyId,onEdit,selectedCompany}){
  const { user } = useAuth();
  const [orders,setOrders]=useState([]);
  const [salesOrders,setSalesOrders]=useState([]);
  const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState('');
  const [vendorFlt,setVendorFlt]=useState('all');
  const [fy,setFy]=useState('all');
  const [selected,setSelected]=useState(null);
  const [activeRow,setActiveRow]=useState(null);
  const [emailOrder,setEmailOrder]=useState(null);
  const [msg,setMsg]=useState('');

  const load=useCallback(()=>{
    if(!companyId){setLoading(false);return;}
    setLoading(true);
    Promise.all([
      api(`/api/purchase-orders?companyId=${companyId}`),
      api(`/api/sales-orders?companyId=${companyId}`),
    ])
      .then(([pr,sr])=>{setOrders(pr.data||[]); setSalesOrders(sr.data||[]);})
      .catch(()=>{})
      .finally(()=>setLoading(false));
  },[companyId]);

  const soMap=useMemo(()=>{
    const m={}; salesOrders.forEach(s=>{m[String(s.orderId)]=s;}); return m;
  },[salesOrders]);

  useEffect(()=>{load();},[load]);

  /* a just-created/updated PO redirects here with a flash message in nav state */
  const location = useLocation();
  const navigate2 = useNavigate();
  useEffect(() => {
    if (!location.state?.flashMsg) return;
    setMsg(location.state.flashMsg);
    navigate2(location.pathname, { replace:true, state:{} });
    const t = setTimeout(() => setMsg(''), 4000);
    return () => clearTimeout(t);
  }, [location.state?.flashMsg]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete=async id=>{
    if(!window.confirm('Delete this purchase order?')) return;
    try{
      await api(`/api/purchase-orders/${id}?companyId=${companyId}`,{method:'DELETE'});
      setMsg('Order deleted'); load();
    }catch(e){setMsg('Error: '+e.message);}
  };

  const handleApprove=async o=>{
    try{
      const fd=new FormData(); fd.append('status','approved');
      await api(`/api/purchase-orders/${o.orderId}?companyId=${companyId}`,{method:'PUT',data:fd});
      setMsg(`PO ${o.poNo||o.orderId} approved`); setSelected(null); load();
    }catch(e){setMsg('Error: '+e.message);}
  };

  const handleReject=async o=>{
    try{
      const fd=new FormData(); fd.append('status','rejected');
      await api(`/api/purchase-orders/${o.orderId}?companyId=${companyId}`,{method:'PUT',data:fd});
      setMsg(`PO ${o.poNo||o.orderId} rejected`); setSelected(null); load();
    }catch(e){setMsg('Error: '+e.message);}
  };

  const vendorList=useMemo(()=>{
    const set=new Set(orders.map(o=>o.vendorName).filter(Boolean));
    return ['all',...[...set].sort()];
  },[orders]);

  const fyList=useMemo(()=>{
    const set=new Set(orders.map(o=>getFY(o.date||o.poDate||o.createdAt)).filter(Boolean));
    return [...set].sort().reverse();
  },[orders]);

  const q=search.toLowerCase();
  let filtered=vendorFlt==='all'?orders:orders.filter(o=>o.vendorName===vendorFlt);
  if(fy!=='all') filtered=filtered.filter(o=>getFY(o.date||o.poDate||o.createdAt)===fy);
  if(q) filtered=filtered.filter(o=>
    String(o.orderId).includes(q)||
    (o.poNo||'').toLowerCase().includes(q)||
    (o.vendorName||'').toLowerCase().includes(q)||
    String(o.linkedSalesOrderId||'').includes(q)||
    (soMap[String(o.linkedSalesOrderId)]?.customerName||'').toLowerCase().includes(q)||
    (soMap[String(o.linkedSalesOrderId)]?.orderNo||'').toLowerCase().includes(q)||
    (o.status||'').includes(q)
  );

  if(loading) return <div style={{padding:20,textAlign:'center',fontSize:12,fontFamily:F,color:'#666'}}>Loading purchase orders…</div>;

  return(
    <div style={{display:'flex',flexDirection:'column',flex:1,overflow:'hidden'}}>
      {selected&&(
        <POModal order={selected} companyId={companyId} soMap={soMap}
          onClose={()=>setSelected(null)}
          onApprove={can(user,'purchaseOrder','approve') ? ()=>handleApprove(selected) : null}
          onReject={can(user,'purchaseOrder','approve') ? ()=>handleReject(selected) : null}
          onEdit={()=>{setSelected(null);onEdit(selected.orderId);}}
          onPrint={()=>printPurchaseOrder(selected,selectedCompany,user)}
          onEmail={()=>setEmailOrder(selected)}
        />
      )}
      {emailOrder&&(
        <EmailPOModal order={emailOrder} companyId={companyId} company={selectedCompany} onClose={()=>setEmailOrder(null)}/>
      )}
      {/* toolbar */}
      <div style={{background:W,borderBottom:'1px solid #000000',
        padding:'4px 8px',display:'flex',alignItems:'center',gap:8,flexShrink:0,flexWrap:'wrap'}}>
        <span style={{fontSize:11,fontWeight:700,color:HDR_BLUE,fontFamily:F}}>
          {vendorFlt==='all'?'All Purchase Orders':`Vendor: ${vendorFlt}`}
        </span>
        <div style={{display:'flex',alignItems:'center',gap:4,marginLeft:8,flex:1,maxWidth:280,minWidth:140}}>
          <span style={{fontSize:11,fontFamily:F,color:'#666'}}>🔍</span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search PO, vendor, SO…"
            style={{flex:1,height:20,padding:'0 4px',border:'1px solid #888',fontSize:11,fontFamily:F,outline:'none'}}/>
          {search&&<button onClick={()=>setSearch('')} style={{border:'none',background:'none',cursor:'pointer',fontSize:13,color:'#888'}}>✕</button>}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:4}}>
          <span style={{fontSize:10,fontFamily:F,color:'#666',fontWeight:700}}>FY</span>
          <select value={fy} onChange={e=>setFy(e.target.value)}
            style={{height:20,padding:'0 4px',border:'1px solid #888',fontSize:11,fontFamily:F,outline:'none',background:W}}>
            <option value="all">All FY</option>
            {fyList.map(f=><option key={f} value={f}>FY {f}</option>)}
          </select>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:4}}>
          <span style={{fontSize:10,fontFamily:F,color:'#666',fontWeight:700}}>Vendor</span>
          <select value={vendorFlt} onChange={e=>setVendorFlt(e.target.value)}
            style={{height:20,padding:'0 4px',border:'1px solid #888',fontSize:11,fontFamily:F,outline:'none',
              background:W,maxWidth:160}}>
            <option value="all">All Vendors</option>
            {vendorList.filter(v=>v!=='all').map(v=><option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <span style={{fontSize:11,color:'#666',fontFamily:F,marginLeft:'auto'}}>{filtered.length} orders</span>
        <Btn small onClick={()=>{
          const cols=['#','PO No','PO Date','Vendor','Linked SO','Product / Description','Qty','Rate (₹)','Taxable (₹)','GST%','PO Value (₹)','Status'];
          const rows=[];
          filtered.forEach((o,oi)=>{
            const items=o.items||[];
            const poVal=parseFloat(o.grandTotal||o.totalAmount||0);
            const soLabel=soMap[String(o.linkedSalesOrderId)]?.orderNo||(o.linkedSalesOrderId?`SO#${o.linkedSalesOrderId}`:'—');
            if(items.length===0){
              rows.push([oi+1,o.poNo||o.orderId,fmtDR(o.date||o.poDate),o.vendorName||'—',soLabel,
                '—','—','—','—','—','₹ '+fmtNR(poVal),o.status||'—']);
            } else {
              items.forEach((it,ii)=>{
                const qty=parseFloat(it.qty||it.quantity)||0, rate=parseFloat(it.rate)||0;
                const taxable=qty*rate; const gst=parseFloat(it.gstPercent||it.gstPct)||0;
                rows.push([
                  ii===0?oi+1:'', ii===0?(o.poNo||o.orderId):'', ii===0?fmtDR(o.date||o.poDate):'',
                  ii===0?(o.vendorName||'—'):'', ii===0?soLabel:'',
                  it.itemName||it.description||'—', `${qty} ${it.unit||''}`.trim(), fmtNR(rate), fmtNR(taxable), `${gst}%`,
                  ii===0?'₹ '+fmtNR(poVal):'', ii===0?(o.status||'—'):'',
                ]);
              });
            }
          });
          const tot=filtered.reduce((s,o)=>s+(parseFloat(o.grandTotal||o.totalAmount)||0),0);
          const totalRow=['','','','','','','','','','',`Total (${filtered.length} POs): ₹ ${fmtNR(tot)}`,''];
          const subtitle=vendorFlt==='all'?'All Purchase Orders':`Vendor: ${vendorFlt}`;
          printReport('Purchase Orders Report',subtitle,cols,rows,totalRow);
        }}>🖨 {vendorFlt==='all'?'Print':'Print Vendor POs'}</Btn>
        <Btn small onClick={load}>🔄</Btn>
      </div>
            {msg&&<div style={{padding:'3px 8px',background:'#d8f0d8',borderBottom:'1px solid #44aa44',fontSize:11,color:'#005500',fontWeight:700,fontFamily:F}}>{msg}</div>}

      {/* ── Action bar: appears when a row is selected — classic-button
           style on a blue gradient, matching the sidebar/toolbar theme ── */}
      <div style={{
        minHeight:36,flexShrink:0,
        background: activeRow ? `linear-gradient(90deg,${HDR_BLUE},${HDR_BLUE_D})` : '#F3F6FB',
        borderBottom: activeRow ? `2px solid ${HDR_BLUE_D}` : '1px solid #000000',
        boxShadow: activeRow ? '0 2px 6px rgba(0,0,0,0.18)' : 'none',
        display:'flex',alignItems:'center',gap:8,padding:'5px 10px',
        transition:'background 0.15s, border-color 0.15s',
      }}>
        {activeRow?(
          <>
            <span style={{fontSize:11,fontWeight:700,color:'#fff',fontFamily:F,marginRight:4,whiteSpace:'nowrap'}}>
              PO: {activeRow.poNo||activeRow.orderId}
            </span>
            <span style={{fontSize:10,color:'rgba(255,255,255,0.75)',fontFamily:F,marginRight:8,whiteSpace:'nowrap'}}>
              {activeRow.vendorName||''}{activeRow.grandTotal?' · '+fmt(activeRow.grandTotal):''}
            </span>
            {[
              {label:'👁 View',  action:()=>setSelected(activeRow)},
              ...(['pending','draft'].includes(String(activeRow.status||'').toLowerCase())&&can(user,'purchaseOrder','approve')
                ? [{label:'✓ Approve', ok:true, action:()=>{ if(window.confirm(`Approve PO ${activeRow.poNo||activeRow.orderId}?`)) handleApprove(activeRow); }}] : []),
              {label:'✏️ Edit',  action:()=>onEdit(activeRow.orderId)},
              {label:'🖨️ Print', action:()=>printPurchaseOrder(activeRow,selectedCompany,user)},
              {label:'📧 Email', action:()=>setEmailOrder(activeRow)},
              {label:'🗑️ Delete',action:()=>handleDelete(activeRow.orderId),danger:true},
            ].map(btn=>(
              <button key={btn.label} onClick={btn.action}
                style={{height:26,padding:'0 12px',fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:F,
                  whiteSpace:'nowrap',borderRadius:6,
                  background:btn.danger?'rgba(220,38,38,0.35)':btn.ok?'#16A34A':'rgba(255,255,255,0.18)',
                  border:`1px solid ${btn.danger?'rgba(220,38,38,0.5)':'rgba(255,255,255,0.3)'}`,
                  color:'#fff'}}
                onMouseEnter={e=>{e.currentTarget.style.background=btn.danger?'rgba(220,38,38,0.5)':btn.ok?'#15803D':'rgba(255,255,255,0.3)';}}
                onMouseLeave={e=>{e.currentTarget.style.background=btn.danger?'rgba(220,38,38,0.35)':btn.ok?'#16A34A':'rgba(255,255,255,0.18)';}}>
                {btn.label}
              </button>
            ))}
            <button onClick={()=>setActiveRow(null)}
              style={{marginLeft:'auto',height:26,width:26,border:'1px solid rgba(255,255,255,0.3)',
                background:'rgba(255,255,255,0.15)',borderRadius:6,cursor:'pointer',fontSize:13,color:'#fff'}}>✕</button>
          </>
        ):(
          <span style={{fontSize:11,color:'#94A3B8',fontFamily:F,fontStyle:'italic'}}>
            Click a row to select — actions will appear here
          </span>
        )}
      </div>

      <div style={{flex:1,overflow:'auto',background:W}}>
        {filtered.length===0?(
          <div style={{padding:20,textAlign:'center',color:'#888',fontSize:12,fontFamily:F}}>
            {search?'No orders match your search.':'No purchase orders yet. Create one to get started.'}
          </div>
        ):(
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,fontFamily:F}}>
            <thead style={{position:'sticky',top:0,zIndex:2}}>
              <tr style={{background:HDR_BLUE}}>
                {['SO No.','Client Name','Vendor Name','PO Date','PO No.','Product','Qty','Rate (₹)','Taxable (₹)','GST%','Total Value (₹)','Total ₹','Status'].map((h,i)=>(
                  <th key={i} style={{padding:'4px 8px',color:W,fontWeight:700,fontSize:10,
                    textAlign:'left',borderRight:`1px solid ${HDR_BLUE_D}`,whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((o)=>{
                const so=soMap[String(o.linkedSalesOrderId)];
                const isAct=activeRow?.orderId===o.orderId;
                const items=o.items||[];
                const rowsForPO=items.length>0?items:[null];
                const span=rowsForPO.length;
                const rowBg=isAct?'#EEF4FF':W;

                const soTD=(content,extra={})=>(
                  <td rowSpan={span} style={{padding:'3px 8px',border:'1px solid #000000',
                    verticalAlign:'top',background:rowBg,...extra}}>{content}</td>
                );

                return rowsForPO.map((it,idx)=>{
                  const isFirst=idx===0;
                  const qty=it?parseFloat(it.qty||it.quantity)||0:0;
                  const rate=it?parseFloat(it.rate)||0:0;
                  const taxable=qty*rate;
                  const gst=it?parseFloat(it.gstPercent||it.gstPct)||0:0;
                  const totalValue=taxable+taxable*gst/100;
                  return (
                    <tr key={o.orderId+'-'+idx}
                      style={{background:rowBg,cursor:'pointer',
                        outline:isAct?`2px solid ${HDR_BLUE}`:'none',outlineOffset:'-2px'}}
                      onClick={()=>setActiveRow(isAct?null:o)}
                      onMouseEnter={e=>{ if(!isAct) e.currentTarget.style.background='#F5F8FF'; }}
                      onMouseLeave={e=>{ if(!isAct) e.currentTarget.style.background=rowBg; }}>
                      {isFirst&&soTD(
                        o.linkedSalesOrderId
                          ? <span style={{fontWeight:700,color:HDR_BLUE}}>{so?.orderNo||('SO#'+o.linkedSalesOrderId)}</span>
                          : <span style={{color:'#aaa'}}>—</span>
                      )}
                      {isFirst&&soTD(
                        <span style={{fontWeight:600,color:'#111'}}>{so?.customerName||so?.clientName||'—'}</span>
                      )}
                      {isFirst&&soTD(<span style={{fontWeight:600}}>{o.vendorName||'—'}</span>)}
                      {isFirst&&soTD(<span style={{whiteSpace:'nowrap'}}>{fmtD(o.poDate||o.orderDate||o.date)}</span>)}
                      {isFirst&&soTD(<span style={{fontWeight:700,color:HDR_BLUE}}>{o.poNo||o.orderId}</span>)}

                      <td style={{padding:'3px 8px',border:'1px solid #000000',maxWidth:220,background:rowBg}}>
                        {it ? (it.itemName||it.description||'—') : <span style={{color:'#aaa'}}>—</span>}
                      </td>
                      <td style={{padding:'3px 8px',border:'1px solid #000000',whiteSpace:'nowrap',background:rowBg}}>
                        {it ? `${it.qty||it.quantity||'—'} ${it.unit||''}`.trim() : '—'}
                      </td>
                      <td style={{padding:'3px 8px',border:'1px solid #000000',textAlign:'right',background:rowBg}}>
                        {it ? fmtNR(rate) : '—'}
                      </td>
                      <td style={{padding:'3px 8px',border:'1px solid #000000',textAlign:'right',background:rowBg}}>
                        {it ? fmtNR(taxable) : '—'}
                      </td>
                      <td style={{padding:'3px 8px',border:'1px solid #000000',textAlign:'center',background:rowBg}}>
                        {it ? `${gst}%` : '—'}
                      </td>
                      <td style={{padding:'3px 8px',border:'1px solid #000000',textAlign:'right',fontWeight:700,background:rowBg}}>
                        {it ? fmt(totalValue) : '—'}
                      </td>

                      {isFirst&&soTD(<span style={{fontWeight:700}}>{fmt(o.grandTotal)}</span>)}
                      {isFirst&&soTD(<Badge s={o.status}/>,{textAlign:'center'})}
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════ LIST PENDING ═══════════════════════ */
function ListPending({companyId,onEdit,selectedCompany}){
  const { user } = useAuth();
  const [orders,setOrders]=useState([]);
  const [salesOrders,setSalesOrders]=useState([]);
  const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState('');
  const [selected,setSelected]=useState(null);
  const [emailOrder,setEmailOrder]=useState(null);
  const [msg,setMsg]=useState('');

  const load=useCallback(()=>{
    if(!companyId){setLoading(false);return;}
    setLoading(true);
    Promise.all([
      api(`/api/purchase-orders?companyId=${companyId}`),
      api(`/api/sales-orders?companyId=${companyId}`),
    ])
      .then(([pr,sr])=>{
        setOrders((pr.data||[]).filter(o=>o.status==='pending'||o.status==='draft'));
        setSalesOrders(sr.data||[]);
      })
      .catch(()=>{})
      .finally(()=>setLoading(false));
  },[companyId]);

  const soMap=useMemo(()=>{
    const m={}; salesOrders.forEach(s=>{m[String(s.orderId)]=s;}); return m;
  },[salesOrders]);

  useEffect(()=>{load();},[load]);

  const approve=async o=>{
    try{
      const fd=new FormData(); fd.append('status','approved');
      await api(`/api/purchase-orders/${o.orderId}?companyId=${companyId}`,{method:'PUT',data:fd});
      setMsg(`✓ PO ${o.poNo||o.orderId} approved`); setSelected(null); load();
    }catch(e){setMsg('Error: '+e.message);}
  };

  const reject=async o=>{
    if(!window.confirm(`Reject PO ${o.poNo||o.orderId}?`)) return;
    try{
      const fd=new FormData(); fd.append('status','rejected');
      await api(`/api/purchase-orders/${o.orderId}?companyId=${companyId}`,{method:'PUT',data:fd});
      setMsg(`PO ${o.poNo||o.orderId} rejected`); setSelected(null); load();
    }catch(e){setMsg('Error: '+e.message);}
  };

  const q=search.toLowerCase();
  const filtered=q?orders.filter(o=>
    String(o.orderId).includes(q)||(o.poNo||'').toLowerCase().includes(q)||
    (o.vendorName||'').toLowerCase().includes(q)||String(o.linkedSalesOrderId||'').includes(q)
  ):orders;

  if(loading) return (
    <div style={{position:'relative',flex:1,minHeight:300}}>
      <PageLoader text="Loading purchase orders…"/>
    </div>
  );

  return(
    <div style={{display:'flex',flexDirection:'column',flex:1,overflow:'hidden'}}>
      {selected&&(
        <POModal order={selected} companyId={companyId} soMap={soMap}
          onClose={()=>setSelected(null)}
          onApprove={can(user,'purchaseOrder','approve') ? ()=>approve(selected) : null}
          onReject={can(user,'purchaseOrder','approve') ? ()=>reject(selected) : null}
          onEdit={()=>{setSelected(null);onEdit(selected.orderId);}}
          onPrint={()=>printPurchaseOrder(selected,selectedCompany,user)}
          onEmail={()=>setEmailOrder(selected)}
        />
      )}
      {emailOrder&&(
        <EmailPOModal order={emailOrder} companyId={companyId} company={selectedCompany} onClose={()=>setEmailOrder(null)}/>
      )}
      <div style={{background:'linear-gradient(135deg, #3A6186, #2A4D6E)',borderBottom:'2px solid #22394F',
        padding:'6px 10px',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
        <span style={{fontSize:11.5,fontWeight:800,color:'#fff',fontFamily:F,textTransform:'uppercase',letterSpacing:'0.5px',whiteSpace:'nowrap'}}>
          Pending / Draft — Approval Queue
        </span>
        <div style={{display:'flex',alignItems:'center',gap:5,marginLeft:4,flex:1,maxWidth:280,
          height:26,padding:'0 8px',borderRadius:6,background:'rgba(255,255,255,0.1)',border:'1px solid rgba(255,255,255,0.22)'}}>
          <span style={{fontSize:11,color:'rgba(255,255,255,0.6)'}}>🔍</span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…"
            style={{flex:1,height:'100%',padding:0,border:'none',background:'transparent',fontSize:11,fontFamily:F,outline:'none',color:'#fff'}}/>
          {search&&<button onClick={()=>setSearch('')} style={{border:'none',background:'none',cursor:'pointer',fontSize:13,color:'rgba(255,255,255,0.7)'}}>✕</button>}
        </div>
        <span style={{fontSize:11,color:'rgba(255,255,255,0.75)',fontFamily:F,marginLeft:'auto',whiteSpace:'nowrap'}}>{filtered.length} pending</span>
        <button onClick={()=>{
          const cols=['#','PO No','Vendor','Linked SO','Date','Amount (₹)','Status'];
          const rows=filtered.map((o,i)=>[i+1,o.poNo||o.orderId,o.vendorName||'—',soMap[String(o.linkedSalesOrderId)]?.orderNo||(o.linkedSalesOrderId?`SO#${o.linkedSalesOrderId}`:'—'),fmtDR(o.date||o.poDate),'₹ '+fmtNR(o.grandTotal||o.totalAmount||0),o.status||'—']);
          const tot=filtered.reduce((s,o)=>s+(parseFloat(o.grandTotal||o.totalAmount)||0),0);
          const totalRow=['','','','',`Total: ${filtered.length}`,'₹ '+fmtNR(tot),''];
          printReport('Pending Purchase Orders Report','Pending / Draft — Approval Queue',cols,rows,totalRow);
        }} style={{height:26,padding:'0 12px',fontSize:11,fontWeight:700,fontFamily:F,cursor:'pointer',
          borderRadius:6,color:'#fff',background:'rgba(255,255,255,0.1)',border:'1px solid rgba(255,255,255,0.25)'}}
          onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,0.2)';}}
          onMouseLeave={e=>{e.currentTarget.style.background='rgba(255,255,255,0.1)';}}>
          🖨 Print
        </button>
        <button onClick={load} title="Refresh" style={{height:26,width:30,fontSize:13,fontFamily:F,cursor:'pointer',
          borderRadius:6,color:'#fff',background:'rgba(255,255,255,0.1)',border:'1px solid rgba(255,255,255,0.25)'}}
          onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,0.2)';}}
          onMouseLeave={e=>{e.currentTarget.style.background='rgba(255,255,255,0.1)';}}>
          🔄
        </button>
      </div>
      {msg&&<div style={{padding:'3px 8px',background:'#d8f0d8',borderBottom:'1px solid #44aa44',fontSize:11,color:'#005500',fontWeight:700,fontFamily:F}}>{msg}</div>}
      <div style={{flex:1,overflow:'auto',background:W}}>
        {filtered.length===0?(
          <div style={{padding:20,textAlign:'center',color:'#888',fontSize:12,fontFamily:F}}>No pending purchase orders.</div>
        ):(
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,fontFamily:F}}>
            <thead style={{position:'sticky',top:0,zIndex:2}}>
              <tr style={{background:'linear-gradient(135deg, #3A6186, #2A4D6E)'}}>
                {['PO No','Vendor','Linked SO','PO Date','Total ₹','Status','Actions'].map((h,i)=>(
                  <th key={i} style={{padding:'6px 8px',color:'#fff',fontWeight:700,fontSize:10,
                    textAlign:'left',borderRight:'1px solid rgba(255,255,255,0.18)',whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((o,i)=>(
                <tr key={o.orderId} style={{background:i%2===0?W:'#f5f8fc',cursor:'pointer'}}
                  onClick={()=>setSelected(o)}
                  onMouseEnter={e=>e.currentTarget.style.background='#d0e4f8'}
                  onMouseLeave={e=>e.currentTarget.style.background=i%2===0?W:'#f5f8fc'}>
                  <td style={{padding:'3px 8px',border:'1px solid #e0e0e0',fontWeight:700,color:'#3A6186'}}>{o.poNo||o.orderId}</td>
                  <td style={{padding:'3px 8px',border:'1px solid #e0e0e0',fontWeight:600}}>{o.vendorName||'—'}</td>
                  <td style={{padding:'3px 8px',border:'1px solid #e0e0e0'}}>
                    {o.linkedSalesOrderId
                      ?<span style={{background:'#d8f0d8',color:'#005500',padding:'1px 5px',border:'1px solid #44aa44',fontSize:10,fontWeight:700}}>
                        {soMap[String(o.linkedSalesOrderId)]?.orderNo || ('SO#'+o.linkedSalesOrderId)}
                      </span>
                      :<span style={{color:'#aaa'}}>—</span>}
                  </td>
                  <td style={{padding:'3px 8px',border:'1px solid #e0e0e0',whiteSpace:'nowrap'}}>{fmtD(o.poDate||o.orderDate)}</td>
                  <td style={{padding:'3px 8px',border:'1px solid #e0e0e0',textAlign:'right',fontWeight:700}}>{fmt(o.grandTotal)}</td>
                  <td style={{padding:'3px 8px',border:'1px solid #e0e0e0'}}><Badge s={o.status}/></td>
                  <td style={{padding:'3px 8px',border:'1px solid #e0e0e0'}} onClick={e=>e.stopPropagation()}>
                    <div style={{display:'flex',gap:3}}>
                      <Btn small onClick={()=>setSelected(o)}>👁 View</Btn>
                      {can(user,'purchaseOrder','approve')&&<Btn small v="suc" onClick={()=>approve(o)}>✔ Approve</Btn>}
                      {can(user,'purchaseOrder','approve')&&<Btn small v="dan" onClick={()=>reject(o)}>✕ Reject</Btn>}
                      <Btn small onClick={()=>onEdit(o.orderId)}>✏ï¸</Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════ MAIN MODULE ═══════════════════════ */
export default function PurchaseOrderModule(){
  const {selectedCompany}=useCompany();
  const { user } = useAuth();
  const cid=selectedCompany?.companyId||'';
  const {pathname,state:locState}=useLocation();
  const navigate=useNavigate();

  /* derive tab from URL */
  const tab=pathname.includes('/view')?'view':pathname.includes('/pending')?'pending':'create';

  /* detect edit mode from URL e.g. /purchase-order/edit/400001 */
  const editMatch=pathname.match(/\/purchase-order\/edit\/(\d+)/);
  const editIdFromUrl=editMatch?editMatch[1]:null;

  /* inner section tab */
  const [secTab,setSecTab]=useState('order-details');

  /* data */
  const [salesOrders,setSalesOrders]=useState([]);
  const [vendors,setVendors]=useState([]);
  const [editOrder,setEditOrder]=useState(null);
  const [poNumberLoaded,setPoNumberLoaded]=useState(false);
  const [poDupWarn,setPoDupWarn]=useState('');

  const checkDupPoNo=async(val)=>{
    if(!val?.trim()||!cid){setPoDupWarn('');return;}
    try{
      const r=await api(`/api/purchase-orders?companyId=${cid}`);
      const dup=(r.data||[]).find(o=>
        (o.poNo||'').trim().toLowerCase()===val.trim().toLowerCase()&&
        String(o.orderId)!==String(editOrder?.orderId)
      );
      setPoDupWarn(dup?`⚠ PO Number already used by PO #${dup.orderId} (${dup.poNo})`:'');
    }catch{setPoDupWarn('');}
  };

  /* SO item picker */
  const [showSOPicker,setShowSOPicker]=useState(false);

  /* email modal */
  const [showEmailModal,setShowEmailModal]=useState(false);

  /* vendor search popup */
  const [showVendorSearch,setShowVendorSearch]=useState(false);

  /* form state */
  const blankForm=()=>({
    nextId:'', poNo:'', poDate:today(), poType:'Standard', purchasePerson:'',
    linkedSalesOrderId:'', linkedSODisplay:'',
    vendorId:'', vendorName:'', vendorCode:'', vendorGstin:'', vendorState:'',
    vendorAddress:'', vendorCity:'', vendorPincode:'',
    contactPerson:'', mobile:'', email:'',
    contactPerson2:'', mobile2:'', email2:'',
    vendorRef:'', enquiryRef:'', quotationRef:'', quoteDate:'', eroNo:'',
    incoterms:'', deliveryDate:'',
    deliveryAddr:'', shippingAddr:'', dispatchMode:'Road',
    shipFromAddress:'', shipFromCity:'', shipFromState:'', shipFromPincode:'',
    transporterName:'', vehicleNumber:'', deliveryInstructions:'',
    paymentTerms:'Net 30', paymentMode:'NEFT', billingTerms:'', creditLimit:'', dueDate:'',
    overallDiscount:0, freightCharges:0, packingCharges:0, roundOff:0,
    termsConditions:'', internalNotes:'', vendorNotes:'',
    clientScope:'', epsilonScope:'', vendorScope:'',
  });

  const [form,setForm]=useState(blankForm());
  const [items,setItems]=useState([]);
  const [charges,setCharges]=useState([]);
  const [attachments,setAttachments]=useState([]);
  const [poScopeItems,setPoScopeItems]=useState([]);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [ok,setOk]=useState('');
  const [showApproverPicker,setShowApproverPicker]=useState(false);

  const setF=(k,v)=>setForm(p=>({...p,[k]:v}));

  /* load vendors + sales orders */
  useEffect(()=>{
    if(!cid) return;
    api(`/api/vendors?companyId=${cid}`).then(r=>setVendors((r.data||[]).filter(v=>v.status==='approved'))).catch(()=>{});
    api(`/api/sales-orders?companyId=${cid}`)
      .then(r=>{
        const sos=r.data||[];
        setSalesOrders(sos);
        /* pre-fill SO from tracking-view navigation */
        const preSOId=locState?.linkedSalesOrderId;
        if(preSOId&&tab==='create'&&!editIdFromUrl){
          const matched=sos.find(s=>String(s.orderId)===String(preSOId));
          setF('linkedSalesOrderId',String(preSOId));
          setF('linkedSODisplay',matched?`SO#${matched.orderId} | ${matched.customerName||matched.party||'—'}`:`SO#${preSOId}`);
          setTimeout(()=>setShowSOPicker(true),150);
        }
      })
      .catch(()=>{});
  },[cid]); // eslint-disable-line react-hooks/exhaustive-deps

  /* auto-populate scope items from linked SO's scopeItems */
  useEffect(()=>{
    if(!form.linkedSalesOrderId||!cid) return;
    api(`/api/sales-orders/${form.linkedSalesOrderId}?companyId=${cid}`)
      .then(r=>{
        const soScopes=(r.data?.scopeItems||[]).filter(s=>s.item);
        if(soScopes.length===0) return;
        // Only pre-fill if currently empty (don't overwrite user edits)
        setPoScopeItems(prev=>{
          if(prev.length>0) return prev;
          return soScopes.map(s=>({
            _id:uid(),
            item:s.item||'',
            clientScope:!!s.clientScope,
            ourScope:!!s.ourScope,
            vendorScope:false,  // vendor responsibility set by user
            remarks:s.remarks||'',
          }));
        });
      })
      .catch(()=>{});
  },[form.linkedSalesOrderId,cid]); // eslint-disable-line react-hooks/exhaustive-deps

  /* load next ID on mount (for new PO) — PO Number is left blank; it's
     required input, not auto-filled, so users always type their own. */
  const loadNextId=useCallback(()=>{
    if(!cid) return;
    api(`/api/purchase-orders/next-id?companyId=${cid}`)
      .then(r=>{
        const nid=r.data.nextId||400001;
        setF('nextId',nid);
        setPoNumberLoaded(true);
      })
      .catch(()=>setPoNumberLoaded(true));
  },[cid]); // eslint-disable-line react-hooks/exhaustive-deps

  /* keep linkedSODisplay in sync once salesOrders list loads (handles race on edit load) */
  useEffect(()=>{
    if(!form.linkedSalesOrderId||!salesOrders.length) return;
    const so=salesOrders.find(s=>String(s.orderId)===String(form.linkedSalesOrderId));
    if(!so) return;
    const name=so.customerName||so.party||'';
    const want=`SO#${form.linkedSalesOrderId}${name?' | '+name:''}`;
    if(form.linkedSODisplay!==want) setF('linkedSODisplay',want);
  },[salesOrders,form.linkedSalesOrderId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* load order for editing */
  const loadEdit=useCallback(async(id)=>{
    try{
      const r=await api(`/api/purchase-orders/${id}?companyId=${cid}`);
      const o=r.data;
      setEditOrder(o);
      setForm({
        nextId:o.orderId, poNo:o.poNo||String(o.orderId), poDate:o.poDate||o.orderDate||today(),
        poType:o.poType||'Standard', purchasePerson:o.purchasePerson||'',
        linkedSalesOrderId:String(o.linkedSalesOrderId||''),
        linkedSODisplay:o.linkedSalesOrderId?(()=>{const ms=salesOrders.find(s=>String(s.orderId)===String(o.linkedSalesOrderId));return `SO#${o.linkedSalesOrderId} | ${ms?.customerName||ms?.party||'—'}`;})():'',
        vendorId:String(o.vendorCode||o.vendorId||''),
        vendorName:o.vendorName||'', vendorCode:o.vendorCode||'',
        vendorGstin:o.vendorGstin||'', vendorState:o.vendorState||'',
        vendorAddress:o.vendorAddress||'', vendorCity:o.vendorCity||'', vendorPincode:o.vendorPincode||'',
        contactPerson:o.contactPerson||'', mobile:o.mobile||'', email:o.email||'',
        contactPerson2:o.contactPerson2||'', mobile2:o.mobile2||'', email2:o.email2||'',
        vendorRef:o.vendorRef||'', enquiryRef:o.enquiryRef||'',
        quotationRef:o.quotationRef||'', quoteDate:o.quoteDate||'', eroNo:o.eroNo||'',
        incoterms:o.incoterms||'',
        deliveryDate:o.deliveryDate||'',
        deliveryAddr:o.deliveryAddr||o.deliveryAddress||'',
        shippingAddr:o.shippingAddr||'',
        dispatchMode:o.dispatchMode||o.dispatchedThrough||'Road',
        shipFromAddress:o.shipFromAddress||'', shipFromCity:o.shipFromCity||'',
        shipFromState:o.shipFromState||'', shipFromPincode:o.shipFromPincode||'',
        transporterName:o.transporterName||'', vehicleNumber:o.vehicleNumber||'',
        deliveryInstructions:o.deliveryInstructions||'',
        paymentTerms:o.paymentTerms||'Net 30', paymentMode:o.paymentMode||'NEFT',
        billingTerms:o.billingTerms||'', creditLimit:String(o.creditLimit||''),
        dueDate:o.dueDate||'',
        overallDiscount:o.overallDiscount||0, freightCharges:o.freightCharges||0,
        packingCharges:o.packingCharges||0, roundOff:o.roundOff||0,
        termsConditions:typeof o.termsConditions==='string'&&o.termsConditions!=='[object Object]'?o.termsConditions:'',
        internalNotes:typeof o.internalNotes==='string'&&o.internalNotes!=='[object Object]'?o.internalNotes:'',
        vendorNotes:typeof o.vendorNotes==='string'&&o.vendorNotes!=='[object Object]'?o.vendorNotes:'',
        clientScope:o.clientScope||'', epsilonScope:o.epsilonScope||'', vendorScope:o.vendorScope||'',
      });
      setItems((o.items||[]).map(it=>({...it,_id:uid()})));
      setCharges((o.charges||[]).map(c=>({...c,_id:uid()})));
      setAttachments((o.attachments||o.documents||[]).map(a=>({...a,_id:uid(),file:null})));
      setPoScopeItems((o.scopeItems||[]).map(s=>({...s,_id:s._id||uid()})));
      setSecTab('order-details');
      setPoNumberLoaded(true);
    }catch(e){setError('Error loading order: '+e.message);}
  },[cid]);

  useEffect(()=>{
    if(editIdFromUrl&&cid){
      /* Load the PO for editing. Stay on the edit URL so state isn't lost on navigation. */
      loadEdit(editIdFromUrl);
    } else if(!editOrder){
      loadNextId();
    }
  },[editIdFromUrl,cid]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetForm=()=>{
    setForm(blankForm()); setItems([]); setCharges([]); setAttachments([]); setPoScopeItems([]);
    setEditOrder(null); setError(''); setOk(''); setSecTab('order-details');
    setPoNumberLoaded(false); loadNextId();
  };

  /* totals */
  const subTotal=items.reduce((s,it)=>{const r=calcRow(it);return s+r.tax;},0);
  const totalGST=items.reduce((s,it)=>{const r=calcRow(it);return s+r.gst;},0);
  const chgAmt=charges.reduce((s,c)=>s+(parseFloat(c.amount)||0),0);
  const chgGST=charges.reduce((s,c)=>{const a=parseFloat(c.amount)||0;return s+a*(parseFloat(c.gstPercent)||0)/100;},0);
  const disc=parseFloat(form.overallDiscount)||0;
  const fc=parseFloat(form.freightCharges)||0;
  const pc=parseFloat(form.packingCharges)||0;
  const ro=parseFloat(form.roundOff)||0;
  const isIntra=form.vendorState&&selectedCompany?.state&&form.vendorState===selectedCompany.state;
  const gstTotal=totalGST+chgGST;
  const grand=subTotal+gstTotal+chgAmt+fc+pc-disc+ro;
  const cgst=isIntra?gstTotal/2:0;
  const sgst=isIntra?gstTotal/2:0;
  const igst=isIntra?0:gstTotal;

  /* submit */
  const submit=async(status,approverId)=>{
    if(!form.vendorName.trim()){setError('Vendor Name is required');setSecTab('order-details');return;}
    if(!form.linkedSalesOrderId){setError('Please link a Sales Order');setSecTab('order-details');return;}
    setSaving(true); setError(''); setOk('');
    try{
      const fd=new FormData();
      [['poNo',form.poNo],['poDate',form.poDate],['poType',form.poType],
       ['purchasePerson',form.purchasePerson],
       ['vendorName',form.vendorName],['vendorCode',form.vendorCode],
       ['vendorGstin',form.vendorGstin],['vendorState',form.vendorState],
       ['vendorAddress',form.vendorAddress],['vendorCity',form.vendorCity],['vendorPincode',form.vendorPincode],
       ['contactPerson',form.contactPerson],['mobile',form.mobile],['email',form.email],
       ['contactPerson2',form.contactPerson2],['mobile2',form.mobile2],['email2',form.email2],
       ['linkedSalesOrderId',form.linkedSalesOrderId],
       ['vendorRef',form.vendorRef],['enquiryRef',form.enquiryRef],
       ['quotationRef',form.quotationRef],['quoteDate',form.quoteDate],['eroNo',form.eroNo],
       ['incoterms',form.incoterms],
       ['deliveryDate',form.deliveryDate],
       ['deliveryAddr',form.deliveryAddr],['shippingAddr',form.shippingAddr],
       ['shipFromAddress',form.shipFromAddress],['shipFromCity',form.shipFromCity],
       ['shipFromState',form.shipFromState],['shipFromPincode',form.shipFromPincode],
       ['dispatchMode',form.dispatchMode],['transporterName',form.transporterName],
       ['vehicleNumber',form.vehicleNumber],['deliveryInstructions',form.deliveryInstructions],
       ['paymentTerms',form.paymentTerms],['paymentMode',form.paymentMode],
       ['billingTerms',form.billingTerms],['creditLimit',String(form.creditLimit||'')],
       ['dueDate',form.dueDate],
       ['overallDiscount',form.overallDiscount],['freightCharges',form.freightCharges],
       ['packingCharges',form.packingCharges],['roundOff',form.roundOff],
       ['subTotal',subTotal.toFixed(2)],['totalGST',gstTotal.toFixed(2)],
       ['grandTotal',grand.toFixed(2)],
       ['cgst',cgst.toFixed(2)],['sgst',sgst.toFixed(2)],['igst',igst.toFixed(2)],
       ['termsConditions',form.termsConditions],
       ['internalNotes',form.internalNotes],['vendorNotes',form.vendorNotes],
       ['clientScope',form.clientScope||''],
       ['epsilonScope',form.epsilonScope||''],
       ['vendorScope',form.vendorScope||''],
       ['status',status],['approverId',approverId||''],
      ].forEach(([k,v])=>fd.append(k,v??''));

      fd.append('items',JSON.stringify(items.map(({_id,...r})=>r)));
      fd.append('charges',JSON.stringify(charges.map(({_id,...r})=>r)));
      fd.append('scopeItems',JSON.stringify(poScopeItems.map(({_id,...r})=>r)));
      attachments.forEach(a=>{if(a.file) fd.append('attachmentFiles',a.file);});
      fd.append('attachments',JSON.stringify(attachments.map(({_id,file,...r})=>({...r,fileName:file?.name||r.fileName||''}))));

      if(editOrder){
        await api(`/api/purchase-orders/${editOrder.orderId}?companyId=${cid}`,{method:'PUT',data:fd});
        navigate('/purchase-order/view', { state:{ flashMsg:`PO ${form.poNo} updated successfully` } });
        resetForm();
      } else {
        const res=await api(`/api/purchase-orders?companyId=${cid}`,{method:'POST',data:fd});
        const newId=res.data.orderId;
        navigate('/purchase-order/view', { state:{ flashMsg:`Purchase Order ${newId} (${form.poNo}) created` } });
        resetForm();
      }
    }catch(e){setError(e.response?.data?.error||e.message);setSaving(false);return;}
    setSaving(false);
  };

  /* section nav */
  const secIdx=INNER_TABS.findIndex(t=>t.id===secTab);
  const goNext=()=>{if(secIdx<INNER_TABS.length-1)setSecTab(INNER_TABS[secIdx+1].id);};
  const goPrev=()=>{if(secIdx>0)setSecTab(INNER_TABS[secIdx-1].id);};

  /* ── RENDER ── */
  return(
    <div style={{display:'flex',flexDirection:'column',height:'100%',background:'#eef1f5',fontFamily:F,overflow:'hidden'}}>

      {/* Email PO Modal */}
      {showEmailModal&&editOrder&&(
        <EmailPOModal
          order={{...editOrder,...form,items,charges}}
          companyId={cid}
          company={selectedCompany}
          onClose={()=>setShowEmailModal(false)}
        />
      )}

      {/* SO Item Picker Modal */}
      {showSOPicker&&form.linkedSalesOrderId&&(
        <SOItemPicker
          soId={form.linkedSalesOrderId}
          companyId={cid}
          currentItems={items}
          onClose={()=>setShowSOPicker(false)}
          onImport={(rows,attRows=[])=>{
            if(rows.length>0){
              setItems(prev=>{
                const clean=prev.filter(it=>it.itemName.trim());
                return [...(clean.length?clean:[]),...rows];
              });
            }
            if(attRows.length>0){
              setAttachments(prev=>[...prev,...attRows]);
            }
            setShowSOPicker(false);
            setSecTab(rows.length>0?'items':'attachments');
          }}
        />
      )}

      {/* Tab content */}
      {tab==='view'&&(
        <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}}>
          <ListAll companyId={cid} selectedCompany={selectedCompany}
            onEdit={id=>navigate(`/purchase-order/edit/${id}`)}/>
        </div>
      )}
      {tab==='pending'&&(
        <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}}>
          <ListPending companyId={cid} selectedCompany={selectedCompany}
            onEdit={id=>navigate(`/purchase-order/edit/${id}`)}/>
        </div>
      )}

      {tab==='create'&&(
        <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          {/* Inner section tab bar */}
          <SectionTabBar active={secTab} onChange={setSecTab}/>

          {/* Messages */}
          {error&&(
            <div style={{padding:'3px 8px',background:'#ffe0e0',borderBottom:'1px solid #cc4444',
              fontSize:11,color:R,fontWeight:700,fontFamily:F,flexShrink:0}}>
              ⚠ {error}
            </div>
          )}
          {ok&&(
            <div style={{padding:'3px 8px',background:'#d8f0d8',borderBottom:'1px solid #44aa44',
              fontSize:11,color:'#005500',fontWeight:700,fontFamily:F,flexShrink:0}}>
              ✓ {ok}
            </div>
          )}

          {/* Scrollable form area */}
          <div style={{flex:1,overflowY:'auto',background:'#F5F7FA'}}>
            {secTab==='order-details'&&(
              <TabOrderDetails form={form} setF={setF} salesOrders={salesOrders}
                vendors={vendors} openSOPicker={()=>setShowSOPicker(true)}
                poNumberLoaded={poNumberLoaded}
                showVendorSearch={showVendorSearch} setShowVendorSearch={setShowVendorSearch}
                checkDupPoNo={checkDupPoNo} poDupWarn={poDupWarn}/>
            )}
            {secTab==='items'&&(
              <TabItems items={items} setItems={setItems} form={form}
                openSOPicker={()=>setShowSOPicker(true)}/>
            )}
            {secTab==='charges'&&(
              <TabCharges form={form} setF={setF} items={items}
                charges={charges} setCharges={setCharges}/>
            )}
            {secTab==='delivery'&&(
              <TabDelivery form={form} setF={setF}/>
            )}
            {secTab==='payment'&&(
              <TabPayment form={form} setF={setF}/>
            )}
            {secTab==='notes'&&(
              <TabNotes form={form} setF={setF}/>
            )}
            {secTab==='scope'&&(
              <TabScopeOfWork scopeItems={poScopeItems} setScopeItems={setPoScopeItems} linkedSO={form.linkedSalesOrderId}/>
            )}
            {secTab==='attachments'&&(
              <TabAttachments attachments={attachments} setAttachments={setAttachments}/>
            )}
          </div>

          {/* Bottom action bar — matching Sales Order style */}
          <div style={{background:'#1E293B',borderTop:`2px solid #0F172A`,
            padding:'6px 12px',display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
            {/* Nav */}
            <button onClick={goPrev} disabled={secIdx===0}
              style={{height:30,padding:'0 12px',background:secIdx===0?'#334155':'#475569',border:'none',
                color:W,fontSize:12,fontWeight:600,fontFamily:F,borderRadius:5,cursor:secIdx===0?'default':'pointer',opacity:secIdx===0?0.5:1}}>
              ← Prev
            </button>
            <span style={{fontSize:11,color:'#94A3B8',fontFamily:F}}>
              {secIdx+1} / {INNER_TABS.length} · {INNER_TABS[secIdx]?.label}
            </span>
            <button onClick={goNext} disabled={secIdx===INNER_TABS.length-1}
              style={{height:30,padding:'0 12px',background:secIdx===INNER_TABS.length-1?'#334155':'#475569',border:'none',
                color:W,fontSize:12,fontWeight:600,fontFamily:F,borderRadius:5,cursor:secIdx===INNER_TABS.length-1?'default':'pointer',opacity:secIdx===INNER_TABS.length-1?0.5:1}}>
              Next →
            </button>

            {/* Grand Total */}
            <div style={{marginLeft:8,padding:'4px 14px',display:'flex',alignItems:'center',gap:8,
              background:'rgba(255,255,255,0.08)',borderRadius:6}}>
              <span style={{fontSize:10,color:'#94A3B8',fontFamily:F}}>Grand Total</span>
              <span style={{fontSize:14,fontWeight:700,color:'#60A5FA',fontFamily:F}}>{fmt(grand)}</span>
            </div>

            {/* Save buttons */}
            <div style={{marginLeft:'auto',display:'flex',gap:6,alignItems:'center'}}>
              {editOrder&&(
                <>
                  <button onClick={()=>setShowEmailModal(true)}
                    style={{height:30,padding:'0 12px',background:'#104f4f',border:'none',color:W,
                      fontSize:12,fontWeight:700,fontFamily:F,borderRadius:5,cursor:'pointer'}}>
                    📧 Send Email
                  </button>
                  <button onClick={()=>printPurchaseOrder({...editOrder,...form,items,charges,scopeItems:poScopeItems},selectedCompany,user)}
                    style={{height:30,padding:'0 12px',background:'#475569',border:'none',color:W,
                      fontSize:12,fontWeight:700,fontFamily:F,borderRadius:5,cursor:'pointer'}}>
                    🖨ï¸ Print
                  </button>
                  <button onClick={resetForm}
                    style={{height:30,padding:'0 12px',background:'#DC2626',border:'none',color:W,
                      fontSize:12,fontWeight:700,fontFamily:F,borderRadius:5,cursor:'pointer'}}>
                    ✕ Cancel Edit
                  </button>
                </>
              )}
              <button onClick={()=>submit('draft')} disabled={saving}
                style={{height:30,padding:'0 14px',background:saving?'#475569':'#F59E0B',border:'none',color:W,
                  fontSize:12,fontWeight:700,fontFamily:F,borderRadius:5,cursor:saving?'default':'pointer'}}>
                💾 Save Draft
              </button>
              <button onClick={()=>setShowApproverPicker(true)} disabled={saving}
                style={{height:30,padding:'0 14px',background:saving?'#475569':N,border:'none',color:W,
                  fontSize:12,fontWeight:700,fontFamily:F,borderRadius:5,cursor:saving?'default':'pointer'}}>
                📤 Submit for Approval
              </button>
              {showApproverPicker && (
                <ApproverPickerModal module="purchaseorder" recordLabel={`Purchase Order ${form.poNo||''} — ${form.vendorName||''}`}
                  onConfirm={(approverId)=>{ setShowApproverPicker(false); submit('pending', approverId); }}
                  onCancel={()=>setShowApproverPicker(false)} />
              )}
              {can(user,'purchaseOrder','approve') && (
              <button onClick={()=>submit('approved')} disabled={saving}
                style={{height:30,padding:'0 14px',background:saving?'#475569':'#16A34A',border:'none',color:W,
                  fontSize:12,fontWeight:700,fontFamily:F,borderRadius:5,cursor:saving?'default':'pointer'}}>
                ✔ Approve &amp; Save
              </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
