/**
 * SAP MODE — Root Layout (SAP GUI Classic Shell)
 * Light background, classic sidebar, status bar at bottom.
 */
import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { SAPProvider, useSAP } from '../context/SAPContext';
import SAPSidebar from './SAPSidebar';
import SAPTopbar  from './SAPTopbar';
import { SapStatusBar } from '../components/SAPGui';

/* ── SAP pages ── */
import SAPDashboard     from '../pages/SAPDashboard';
import ProjectList      from '../pages/projects/ProjectList';
import ProjectCreate    from '../pages/projects/ProjectCreate';
import ProjectDetail    from '../pages/projects/ProjectDetail';
import SOList           from '../pages/sales/SOList';
import SOCreate         from '../pages/sales/SOCreate';
import POList           from '../pages/purchase/POList';
import POCreate         from '../pages/purchase/POCreate';
import GRNList          from '../pages/grn/GRNList';
import GRNCreate        from '../pages/grn/GRNCreate';
import MRPBalance       from '../pages/mrp/MRPBalance';
import BOMExplosion     from '../pages/mrp/BOMExplosion';
import ProductionList   from '../pages/production/ProductionList';
import ProductionCreate from '../pages/production/ProductionCreate';
import InventoryStock   from '../pages/inventory/InventoryStock';
import InvoiceList      from '../pages/finance/InvoiceList';
import PaymentList      from '../pages/finance/PaymentList';
import JournalList      from '../pages/finance/JournalList';
import PnLReport        from '../pages/reports/PnLReport';
import DocFlowReport    from '../pages/reports/DocFlowReport';
import TaskBoard        from '../pages/tasks/TaskBoard';

/* ── Status bar reads current context ── */
function AppStatusBar({ companyId, companyName }) {
  const { notifications } = useSAP();
  const location = useLocation();

  const lastNote = notifications[notifications.length - 1];
  const msg  = lastNote ? lastNote.msg : 'System ready';
  const type = lastNote ? lastNote.type : 'ok';

  /* derive human-readable screen name for status */
  const screen = (() => {
    const p = location.pathname;
    if (p === '/sap')                      return 'SAP Easy Access';
    if (p.endsWith('/new'))                return 'Create Document';
    if (p.includes('sales-orders'))        return 'VA05 — Sales Orders';
    if (p.includes('purchase-orders'))     return 'ME2N — Purchase Orders';
    if (p.includes('grn'))                 return 'MIGO — Goods Receipt';
    if (p.includes('inventory'))           return 'MB52 — Stock Overview';
    if (p.includes('bom'))                 return 'CS03 — BOM';
    if (p.includes('mrp'))                 return 'MD04 — MRP';
    if (p.includes('production'))          return 'CO03 — Production';
    if (p.includes('invoices'))            return 'VF03 — Invoices';
    if (p.includes('payments'))            return 'F110 — Payments';
    if (p.includes('journals'))            return 'FB03 — Journals';
    if (p.includes('reports'))             return 'S_ALR — Reports';
    if (p.includes('projects'))            return 'CJ20N — Projects';
    if (p.includes('tasks'))               return 'CNS41 — Tasks';
    return location.pathname;
  })();

  return (
    <SapStatusBar
      message={msg}
      type={type}
      companyCode={companyId || '—'}
      user="ADMIN"
      extra={screen}
    />
  );
}

/* ── Inner shell (needs SAPProvider context) ── */
function SAPShell({ companyId, companyName, onModeSwitch }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      background: '#dfe3e8', overflow: 'hidden',
      fontFamily: "Arial, Helvetica, 'Liberation Sans', sans-serif",
    }}>
      {/* Top: menu bar + standard toolbar */}
      <SAPTopbar onModeSwitch={onModeSwitch} />

      {/* Middle: sidebar + content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <SAPSidebar onModeSwitch={onModeSwitch} />

        {/* Main content area */}
        <main style={{
          flex: 1, overflowY: 'auto', background: '#dfe3e8',
          display: 'flex', flexDirection: 'column',
        }}>
          <Routes>
            <Route path="/sap"                        element={<SAPDashboard />} />

            {/* Sales Orders — SD */}
            <Route path="/sap/sales-orders"           element={<SOList />} />
            <Route path="/sap/sales-orders/new"       element={<SOCreate />} />

            {/* Projects — PS */}
            <Route path="/sap/projects"               element={<ProjectList />} />
            <Route path="/sap/projects/new"           element={<ProjectCreate />} />
            <Route path="/sap/projects/:projectId"    element={<ProjectDetail />} />

            {/* MRP — PP */}
            <Route path="/sap/mrp"                    element={<MRPBalance />} />
            <Route path="/sap/bom"                    element={<BOMExplosion />} />

            {/* Purchase — MM */}
            <Route path="/sap/purchase-orders"        element={<POList />} />
            <Route path="/sap/purchase-orders/new"    element={<POCreate />} />

            {/* GRN — MM */}
            <Route path="/sap/grn"                    element={<GRNList />} />
            <Route path="/sap/grn/new"                element={<GRNCreate />} />

            {/* Inventory */}
            <Route path="/sap/inventory"              element={<InventoryStock />} />

            {/* Production — PP */}
            <Route path="/sap/production"             element={<ProductionList />} />
            <Route path="/sap/production/new"         element={<ProductionCreate />} />

            {/* Tasks */}
            <Route path="/sap/tasks"                  element={<TaskBoard />} />

            {/* Finance — FI/CO */}
            <Route path="/sap/invoices"               element={<InvoiceList />} />
            <Route path="/sap/payments"               element={<PaymentList />} />
            <Route path="/sap/journals"               element={<JournalList />} />

            {/* Reports */}
            <Route path="/sap/reports/pnl"            element={<PnLReport />} />
            <Route path="/sap/reports/docflow"        element={<DocFlowReport />} />

            <Route path="*"                           element={<Navigate to="/sap" replace />} />
          </Routes>
        </main>
      </div>

      {/* Bottom: SAP status bar */}
      <AppStatusBar companyId={companyId} companyName={companyName} />
    </div>
  );
}

/* ── Root export ── */
export default function SAPApp({ companyId, companyName, onModeSwitch }) {
  const handleSwitch = () => {
    localStorage.setItem('erpMode', 'old');
    onModeSwitch();
  };

  return (
    <SAPProvider companyId={companyId} companyName={companyName}>
      <SAPShell companyId={companyId} companyName={companyName} onModeSwitch={handleSwitch} />
    </SAPProvider>
  );
}
