import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useNavigate } from 'react-router-dom';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import SubNav from './components/SubNav';
import Admin from './pages/admin/Admin';
import { CompanyProvider, useCompany } from './context/CompanyContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { VendorAuthProvider, useVendorAuth } from './context/VendorAuthContext';
import Login from './pages/auth/Login';
import VendorRegister from './pages/vendor-portal/Register';
import ForgotPassword from './pages/vendor-portal/ForgotPassword';
import VendorPortal from './pages/vendor-portal/VendorPortal';
import SelfRegistrations from './pages/vendor/SelfRegistrations';

import ViewClients from './pages/client/View';
import PendingClients from './pages/client/Pending';

import CreateItem from './pages/items/Create';
import ViewItems  from './pages/items/View';

import CreateVendor from './pages/vendor/Create';
import ViewVendors from './pages/vendor/View';
import VendorDetail from './pages/vendor/Detail';
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
import SalesBill from './pages/salesbill/SalesBill';
import PurchaseBill from './pages/purchasebill/PurchaseBill';

import Dashboard from './pages/dashboard/Dashboard';
import SAPClientDashboard from './pages/clientsap/SAPClientDashboard';
import TallyImport from './pages/tally/Import';
import TallyPending from './pages/tally/Pending';
import CreateExpense from './pages/account/expense/Create';
import ViewExpenses  from './pages/account/expense/View';
import OrderTracker  from './pages/items/Tracker';
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
import StatementView from './pages/account/statement/View';
import ApprovalView from './pages/account/approval/View';

import ManufacturingDashboard from './pages/manufacturing/ManufacturingDashboard';
import JobSheetList from './pages/manufacturing/JobSheetList';
import JobSheetCreate from './pages/manufacturing/JobSheetCreate';
import LocationList from './pages/manufacturing/LocationList';

import PurchaseDashboard from './pages/purchaseorder/PurchaseDashboard';
import POTrackingView from './pages/purchaseorder/POTrackingView';

import ProjectList from './pages/project/ProjectList';
import ProjectCreate from './pages/project/ProjectCreate';
import PasswordManager from './pages/passwords/PasswordManager';

import StockView from './pages/stock/StockView';
import StockIn from './pages/stock/StockIn';
import StockOut from './pages/stock/StockOut';

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

// Guard: redirect to /login if not authenticated
function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', flexDirection:'column', gap:12, fontFamily:'Inter,sans-serif' }}>
      <div style={{ width:36, height:36, border:'3px solid #E5E7EB', borderTopColor:'#2563EB', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
      <div style={{ fontSize:13, color:'#6B7280' }}>Loading…</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}

// Inner component so it can use useCompany (which requires CompanyProvider above it)
function AppContent() {
  const { selectedCompany } = useCompany();
  const { user, logout }    = useAuth();

  return (
    <div className="app-container">
      <Header username={user?.name || user?.username || 'User'} onLogout={logout} />
      <div className="main-content">
        <Sidebar />
        <div className="right-panel">
          <SubNav />
          {/* key forces full remount of all pages when company changes → data reloads automatically */}
          <div className="content-area" key={selectedCompany?.companyId || 'no-company'}>
            <Routes>
              {/* Admin panel */}
              <Route path="/admin"           element={<Admin />} />
              <Route path="/admin/companies" element={<Admin />} />

              {/* All other routes guarded — RequireCompany blocks if no company selected */}
              <Route element={<RequireCompany />}>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />

                {/* Items routes */}
                <Route path="/items/create"         element={<CreateItem />} />
                <Route path="/items/view"           element={<ViewItems />} />
                <Route path="/items/edit/:itemCode" element={<CreateItem />} />
                <Route path="/items/tracker"        element={<OrderTracker />} />

                {/* Client routes */}
                <Route path="/client/create" element={<SAPClientDashboard />} />
                <Route path="/client-sap" element={<SAPClientDashboard />} />
                <Route path="/client/view" element={<ViewClients />} />
                <Route path="/client/edit/:clientId" element={<SAPClientDashboard />} />
                <Route path="/client/pending" element={<PendingClients />} />

                {/* Sales Order routes */}
                <Route path="/sales-order/create"  element={<SalesOrderModule />} />
                <Route path="/sales-order/view"    element={<SalesOrderModule />} />
                <Route path="/sales-order/pending" element={<SalesOrderModule />} />
                <Route path="/sales-order/project/:orderId" element={<ProjectDashboard />} />

                {/* Sales Bill */}
                <Route path="/sales-bill" element={<SalesBill />} />

                {/* Purchase Order Module (unified) */}
                <Route path="/purchase-order/dashboard" element={<PurchaseDashboard />} />
                <Route path="/purchase-order/tracking" element={<POTrackingView />} />
                <Route path="/purchase-order/create"  element={<PurchaseOrderModule />} />
                <Route path="/purchase-order/view"    element={<PurchaseOrderModule />} />
                <Route path="/purchase-order/pending" element={<PurchaseOrderModule />} />
                <Route path="/purchase-order/edit/:orderId" element={<PurchaseOrderModule />} />

                {/* Purchase Bill */}
                <Route path="/purchase-bill" element={<PurchaseBill />} />

                {/* Project routes */}
                <Route path="/project" element={<Navigate to="/project/list" replace />} />
                <Route path="/project/list"   element={<ProjectList />} />
                <Route path="/project/create" element={<ProjectCreate />} />

                {/* Stock routes */}
                <Route path="/stock" element={<Navigate to="/stock/view" replace />} />
                <Route path="/stock/view" element={<StockView />} />
                <Route path="/stock/in"   element={<StockIn />} />
                <Route path="/stock/out"  element={<StockOut />} />

                {/* Vendor routes */}
                <Route path="/vendor/create" element={<CreateVendor />} />
                <Route path="/vendor/view" element={<ViewVendors />} />
                <Route path="/vendor/edit/:vendorId" element={<CreateVendor />} />
                <Route path="/vendor/detail/:vendorId" element={<VendorDetail />} />
                <Route path="/vendor/purchase-order" element={<VendorPurchaseOrder />} />
                <Route path="/vendor/completed" element={<VendorCompletedOrders />} />
                <Route path="/vendor/pending" element={<PendingVendors />} />
                <Route path="/vendor/self-registrations" element={<SelfRegistrations />} />

                {/* Account routes */}
                <Route path="/account" element={<Navigate to="/account/expense/view" replace />} />
                <Route path="/account/expense/create"    element={<CreateExpense />} />
                <Route path="/account/expense/edit/:expenseId" element={<CreateExpense />} />
                <Route path="/account/expense/view"      element={<ViewExpenses />} />
                <Route path="/account/expense/pending"   element={<ViewExpenses />} />
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
                <Route path="/account/statement" element={<StatementView />} />
                <Route path="/account/approval" element={<ApprovalView />} />

                {/* Tally Import routes */}
                <Route path="/tally/import" element={<TallyImport />} />
                <Route path="/tally/pending" element={<TallyPending />} />

                {/* Manufacturing routes */}
                <Route path="/manufacturing/job-sheets" element={<JobSheetList />} />
                <Route path="/manufacturing/job-sheets/create" element={<JobSheetCreate />} />
                <Route path="/manufacturing/job-sheets/edit/:jobId" element={<JobSheetCreate />} />
                <Route path="/manufacturing/locations" element={<LocationList />} />
                <Route path="/manufacturing" element={<ManufacturingDashboard />} />

                {/* Password Manager */}
                <Route path="/passwords" element={<PasswordManager />} />
              </Route>
            </Routes>
          </div>
        </div>
      </div>
    </div>
  );
}

function RequireVendorAuth() {
  const { vendor, loading } = useVendorAuth();
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', flexDirection:'column', gap:12 }}>
      <div style={{ width:36, height:36, border:'3px solid #E5E7EB', borderTopColor:'#2563EB', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
  // Allow both approved (token) and pending vendors
  return (vendor) ? <Outlet /> : <Navigate to="/login" replace />;
}

function App() {
  return (
    <AuthProvider>
      <VendorAuthProvider>
        <CompanyProvider>
          <Router>
            <Routes>
              {/* Public routes */}
              <Route path="/login"                    element={<Login />} />
              <Route path="/vendor-register"          element={<VendorRegister />} />
              <Route path="/vendor-forgot-password"   element={<ForgotPassword />} />

              {/* Vendor portal — requires vendor auth */}
              <Route element={<RequireVendorAuth />}>
                <Route path="/vendor-portal" element={<VendorPortal />} />
              </Route>

              {/* All other routes require company auth */}
              <Route element={<RequireAuth />}>
                <Route path="/*" element={<AppContent />} />
              </Route>
            </Routes>
          </Router>
        </CompanyProvider>
      </VendorAuthProvider>
    </AuthProvider>
  );
}

export default App;
