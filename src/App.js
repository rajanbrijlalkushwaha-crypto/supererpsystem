import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useNavigate } from 'react-router-dom';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import SubNav from './components/SubNav';
import Companies from './pages/admin/Companies';
import { CompanyProvider, useCompany } from './context/CompanyContext';

import CreateClient from './pages/client/Create';
import ViewClients from './pages/client/View';
import EditClient from './pages/client/Edit';
import PendingClients from './pages/client/Pending';

import CreateVendor from './pages/vendor/Create';
import ViewVendors from './pages/vendor/View';
import EditVendor from './pages/vendor/Edit';
import VendorPurchaseOrder from './pages/vendor/PurchaseOrder';
import VendorCompletedOrders from './pages/vendor/CompletedOrders';
import PendingVendors from './pages/vendor/Pending';

import PurchaseOrderModule from './pages/purchaseorder/PurchaseOrderModule';
import CreatePurchaseOrder from './pages/purchaseorder/Create';
import ViewPurchaseOrders from './pages/purchaseorder/View';
import EditPurchaseOrder from './pages/purchaseorder/Edit';
import PendingPurchaseOrders from './pages/purchaseorder/Pending';

import SalesOrderModule from './pages/salesorder/SalesOrderModule';
import ProjectDashboard from './pages/salesorder/ProjectDashboard';

import Dashboard from './pages/dashboard/Dashboard';
import SAPClientDashboard from './pages/clientsap/SAPClientDashboard';
import TallyImport from './pages/tally/Import';
import TallyPending from './pages/tally/Pending';
import CreateExpense from './pages/account/expense/Create';
import ViewExpenses from './pages/account/expense/View';
import CreateAsset from './pages/account/asset/Create';
import ViewAssets from './pages/account/asset/View';
import CreatePayment from './pages/account/payment/Create';
import ViewPayments from './pages/account/payment/View';
import CreateReceipt from './pages/account/receipt/Create';
import ViewDues from './pages/account/dues/View';
import CreateBank from './pages/account/bank/Create';
import ViewBanks from './pages/account/bank/View';
import CreateJournal from './pages/account/journal/Create';
import ViewJournals from './pages/account/journal/View';

import './App.css';

// Guard: renders children only when a company is selected, else shows block screen
function RequireCompany() {
  const { selectedCompany, companies } = useCompany();
  const navigate = useNavigate();

  if (!selectedCompany) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '60vh',
        gap: '20px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '60px' }}>&#x1F3E2;</div>
        <h2 style={{ color: '#1a3c6e', margin: 0 }}>No Company Selected</h2>
        <p style={{ color: '#555', maxWidth: '360px', lineHeight: 1.6, margin: 0 }}>
          {companies.length === 0
            ? 'You have not created any company yet. Please create a company first to start managing your data.'
            : 'Please select a company from the header dropdown to continue.'
          }
        </p>
        <button
          onClick={() => navigate('/admin/companies')}
          style={{
            background: '#1a3c6e',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            padding: '10px 24px',
            fontSize: '15px',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          {companies.length === 0 ? 'Create Company' : 'Manage Companies'}
        </button>
      </div>
    );
  }

  return <Outlet />;
}

// Inner component so it can use useCompany (which requires CompanyProvider above it)
function AppContent() {
  const { selectedCompany } = useCompany();

  return (
    <div className="app-container">
      <Header username="Admin" onLogout={() => alert('Logged out successfully')} />
      <div className="main-content">
        <Sidebar />
        <div className="right-panel">
          <SubNav />
          {/* Status bar rendered at bottom — classic ERP style */}

          {/* key forces full remount of all pages when company changes → data reloads automatically */}
          <div className="content-area" key={selectedCompany?.companyId || 'no-company'}>
            <Routes>
              {/* Admin always accessible — no company required */}
              <Route path="/admin/companies" element={<Companies />} />

              {/* All other routes guarded — RequireCompany blocks if no company selected */}
              <Route element={<RequireCompany />}>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />

                {/* Client routes */}
                <Route path="/client/create" element={<CreateClient />} />
                <Route path="/client/view" element={<ViewClients />} />
                <Route path="/client/edit/:clientId" element={<EditClient />} />
                <Route path="/client/pending" element={<PendingClients />} />

                {/* Sales Order routes */}
                <Route path="/sales-order/create"  element={<SalesOrderModule />} />
                <Route path="/sales-order/view"    element={<SalesOrderModule />} />
                <Route path="/sales-order/pending" element={<SalesOrderModule />} />
                <Route path="/sales-order/project/:orderId" element={<ProjectDashboard />} />

                {/* Purchase Order Module (unified) */}
                <Route path="/purchase-order/create"  element={<PurchaseOrderModule />} />
                <Route path="/purchase-order/view"    element={<PurchaseOrderModule />} />
                <Route path="/purchase-order/pending" element={<PurchaseOrderModule />} />
                <Route path="/purchase-order/edit/:orderId" element={<PurchaseOrderModule />} />

                {/* Vendor routes */}
                <Route path="/vendor/create" element={<CreateVendor />} />
                <Route path="/vendor/view" element={<ViewVendors />} />
                <Route path="/vendor/edit/:vendorId" element={<EditVendor />} />
                <Route path="/vendor/purchase-order" element={<VendorPurchaseOrder />} />
                <Route path="/vendor/completed" element={<VendorCompletedOrders />} />
                <Route path="/vendor/pending" element={<PendingVendors />} />

                {/* Account routes */}
                <Route path="/account" element={<Navigate to="/account/expense/view" replace />} />
                <Route path="/account/expense/create" element={<CreateExpense />} />
                <Route path="/account/expense/view" element={<ViewExpenses />} />
                <Route path="/account/asset/create" element={<CreateAsset />} />
                <Route path="/account/asset/view" element={<ViewAssets />} />
                <Route path="/account/payment/create" element={<CreatePayment />} />
                <Route path="/account/payment/view" element={<ViewPayments />} />
                <Route path="/account/receipt/create" element={<CreateReceipt />} />
                <Route path="/account/dues" element={<ViewDues />} />
                <Route path="/account/bank/create" element={<CreateBank />} />
                <Route path="/account/bank/view" element={<ViewBanks />} />
                <Route path="/account/journal/create" element={<CreateJournal />} />
                <Route path="/account/journal/view" element={<ViewJournals />} />

                {/* Tally Import routes */}
                <Route path="/tally/import" element={<TallyImport />} />
                <Route path="/tally/pending" element={<TallyPending />} />

                {/* SAP Client Config */}
                <Route path="/client-sap" element={<SAPClientDashboard />} />
              </Route>
            </Routes>
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <CompanyProvider>
      <Router>
        <AppContent />
      </Router>
    </CompanyProvider>
  );
}

export default App;
