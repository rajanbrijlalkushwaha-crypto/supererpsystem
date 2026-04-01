/**
 * SAP MODE — Classic Tree Navigation (SAP Easy Access style)
 * Light grey sidebar, tree-expand arrows, no icons/animations
 */
import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSAP } from '../context/SAPContext';

const G = {
  sidebar:    '#EBE7DE',
  sidebarSel: '#316AC5',
  border:     '#a0a0a0',
  borderDk:   '#808080',
  text:       '#000000',
  muted:      '#555555',
  sapNavy:    '#003875',
  sapBlue:    '#0070D2',
  font:       "Arial, Helvetica, 'Liberation Sans', sans-serif",
  fs:         '12px',
  fsSm:       '11px',
  fsXs:       '10px',
};

/* ── Nav tree structure ── */
const TREE = [
  { key:'dashboard',  label:'SAP Easy Access',  path:'/sap',   flat: true },

  { key:'sales',      label:'SD — Sales & Distribution',
    children: [
      { key:'so-new',    label:'VA01 — Create Sales Order',   path:'/sap/sales-orders/new', primary: true },
      { key:'so-list',   label:'VA05 — List Sales Orders',    path:'/sap/sales-orders' },
    ]},

  { key:'projects',   label:'PS — Project System',
    children: [
      { key:'proj-list', label:'CJ20N — Project Overview',    path:'/sap/projects' },
      { key:'proj-new',  label:'CJ01  — Create Project',      path:'/sap/projects/new' },
    ]},

  { key:'mrp',        label:'PP — Material Planning',
    children: [
      { key:'mrp-bal',   label:'MD04  — MRP Balance View',    path:'/sap/mrp' },
      { key:'bom',       label:'CS03  — BOM Explosion',       path:'/sap/bom' },
    ]},

  { key:'purchase',   label:'MM — Materials Management',
    children: [
      { key:'po-list',   label:'ME2N  — Purchase Orders',     path:'/sap/purchase-orders' },
      { key:'po-new',    label:'ME21N — Create Purchase Order',path:'/sap/purchase-orders/new' },
    ]},

  { key:'grn',        label:'MM — Goods Receipt (MIGO)',
    children: [
      { key:'grn-list',  label:'MIGO  — GRN List',            path:'/sap/grn' },
      { key:'grn-new',   label:'MIGO  — Post Goods Receipt',  path:'/sap/grn/new' },
    ]},

  { key:'inventory',  label:'MM — Inventory Management',
    children: [
      { key:'inv-stock', label:'MB52  — Stock Register',      path:'/sap/inventory' },
    ]},

  { key:'production', label:'PP — Production Planning',
    children: [
      { key:'prod-list', label:'CO03  — Production Orders',   path:'/sap/production' },
      { key:'prod-new',  label:'CO01  — Create Prod. Order',  path:'/sap/production/new' },
    ]},

  { key:'tasks',      label:'CNS — Task Management',
    children: [
      { key:'task-board',label:'CNS41 — Task Board',          path:'/sap/tasks' },
    ]},

  { key:'finance',    label:'FI/CO — Finance & Controlling',
    children: [
      { key:'fin-inv',   label:'VF03  — Customer Invoices',   path:'/sap/invoices' },
      { key:'fin-pay',   label:'F110  — Payment Runs',        path:'/sap/payments' },
      { key:'fin-jrn',   label:'FB03  — Journal Entries',     path:'/sap/journals' },
    ]},

  { key:'reports',    label:'SLG — Reporting & Analysis',
    children: [
      { key:'rpt-proj',  label:'S_ALR — Project P&L',         path:'/sap/reports/pnl' },
      { key:'rpt-flow',  label:'MMBE  — Document Flow',       path:'/sap/reports/docflow' },
    ]},
];

/* ── Triangle expand/collapse arrows ── */
const Arrow = ({ open }) => (
  <span style={{
    display: 'inline-block', width: 12, flexShrink: 0, textAlign: 'center',
    fontSize: 9, color: G.borderDk, userSelect: 'none',
  }}>
    {open ? '▼' : '▶'}
  </span>
);

export default function SAPSidebar({ onModeSwitch }) {
  const location = useLocation();
  const { projects } = useSAP();
  const [expanded, setExpanded] = useState({
    sales: true, projects: true, finance: true,
  });

  const toggle   = (key) => setExpanded(p => ({ ...p, [key]: !p[key] }));
  const isActive = (path) => path && (location.pathname === path || location.pathname.startsWith(path + '/'));

  return (
    <aside style={{
      width: 240, minWidth: 240, flexShrink: 0, display: 'flex', flexDirection: 'column',
      background: G.sidebar, borderRight: `1px solid ${G.border}`,
      fontFamily: G.font, fontSize: G.fs,
    }}>
      {/* ── Sidebar header ── */}
      <div style={{
        background: G.sapNavy, color: '#fff', padding: '4px 8px',
        borderBottom: `1px solid ${G.borderDk}`, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: G.fsSm, fontWeight: 700, letterSpacing: '0.3px' }}>SAP Easy Access</span>
        <span style={{ fontSize: G.fsXs, opacity: 0.7 }}>▣</span>
      </div>

      {/* ── Tree nav ── */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>

        {TREE.map(node => {
          /* ── Flat (no children) ── */
          if (node.flat) {
            const active = isActive(node.path);
            return (
              <Link key={node.key} to={node.path}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '4px 8px', textDecoration: 'none',
                  background: active ? G.sidebarSel : G.sidebar,
                  color: active ? '#fff' : G.text,
                  fontSize: G.fsSm, fontWeight: active ? 700 : 400,
                  borderBottom: `1px solid ${G.border}`,
                }}>
                <span style={{ fontSize: 11 }}>⌂</span>
                <span>{node.label}</span>
              </Link>
            );
          }

          /* ── Group with children ── */
          const open      = expanded[node.key] !== false;
          const anyActive = node.children.some(c => isActive(c.path));

          return (
            <div key={node.key}>
              {/* Group header row */}
              <div
                onClick={() => toggle(node.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer',
                  padding: '3px 8px',
                  background: anyActive ? '#D8E8F4' : G.sidebar,
                  color: anyActive ? G.sapNavy : G.text,
                  fontWeight: 700, fontSize: G.fsXs,
                  textTransform: 'uppercase', letterSpacing: '0.3px',
                  borderBottom: `1px solid ${G.border}`,
                  userSelect: 'none',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#D8DDD4')}
                onMouseLeave={e => (e.currentTarget.style.background = anyActive ? '#D8E8F4' : G.sidebar)}
              >
                <Arrow open={open} />
                <span style={{ flex: 1 }}>{node.label}</span>
              </div>

              {/* Children */}
              {open && (
                <div style={{ background: '#F5F3EE', borderBottom: `1px solid ${G.border}` }}>
                  {node.children.map(child => {
                    const cActive = isActive(child.path);
                    return (
                      <Link key={child.key} to={child.path}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          padding: '3px 8px 3px 22px', textDecoration: 'none',
                          background: cActive ? G.sidebarSel : 'transparent',
                          color: cActive ? '#fff' : (child.primary ? G.sapBlue : G.text),
                          fontSize: G.fsSm,
                          fontWeight: cActive ? 700 : (child.primary ? 700 : 400),
                          borderBottom: `1px solid ${G.border}40`,
                        }}
                        onMouseEnter={e => !cActive && (e.currentTarget.style.background = '#D4E8F5')}
                        onMouseLeave={e => !cActive && (e.currentTarget.style.background = 'transparent')}
                      >
                        <span style={{ fontSize: 9, flexShrink: 0, color: cActive ? '#fff' : G.muted }}>■</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {child.label}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Footer: project count + mode switch ── */}
      <div style={{
        borderTop: `2px solid ${G.border}`, padding: '4px 8px',
        background: '#D8D4CC', flexShrink: 0,
      }}>
        <div style={{ fontSize: G.fsXs, color: G.muted, marginBottom: 3 }}>
          {projects.length} project{projects.length !== 1 ? 's' : ''} loaded
        </div>
        <button onClick={onModeSwitch}
          style={{
            width: '100%', background: G.sapNavy, color: '#fff',
            border: `1px solid ${G.borderDk}`, padding: '2px 8px',
            fontSize: G.fsSm, fontWeight: 700, fontFamily: G.font,
            cursor: 'pointer', textAlign: 'center',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#002560')}
          onMouseLeave={e => (e.currentTarget.style.background = G.sapNavy)}>
          ↩ Switch to OLD MODE
        </button>
      </div>
    </aside>
  );
}
