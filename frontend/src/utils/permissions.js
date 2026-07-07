/* Granular permission definitions — every sub-menu with full action set */

export const ALL_ACTIONS = ['view', 'create', 'edit', 'delete', 'approve'];

export const GROUP_ORDER = [
  'Dashboard','CRM','Vendor','Inventory',
  'Sales Order','Sales Bill','Purchase Order','Purchase Bill',
  'Manufacturing','Account','Stock','GST','Projects','Communication','Other','Admin',
];

/* navKey maps each module to the Sidebar top-level key it lives under */
export const MODULES = [
  /* Dashboard */
  { key:'dashboard',       label:'Dashboard',                group:'Dashboard',      navKey:'dashboard',     actions:['view'] },

  /* CRM */
  { key:'client',          label:'Clients',                  group:'CRM',            navKey:'crm',           actions:['view','create','edit','delete','approve'] },
  { key:'crm',             label:'CRM',                      group:'CRM',            navKey:'crm',           actions:['view','create','edit','delete'] },

  /* Vendor */
  { key:'vendor',          label:'Vendors',                  group:'Vendor',         navKey:'vendor',        actions:['view','create','edit','delete','approve'] },
  { key:'vendorSelfReg',   label:'Self Registrations',       group:'Vendor',         navKey:'vendor',        actions:['view','approve'] },

  /* Inventory */
  { key:'items',           label:'Items / Products',         group:'Inventory',      navKey:'inventory',     actions:['view','create','edit','delete'] },
  { key:'orderTracker',    label:'Order Tracker',            group:'Inventory',      navKey:'inventory',     actions:['view'] },

  /* Sales Order */
  { key:'salesOrder',      label:'Sales Order',              group:'Sales Order',    navKey:'sales',         actions:['view','create','edit','delete','approve'] },

  /* Sales Bill & Dispatch */
  { key:'salesBill',       label:'Sales Bill / Tax Invoice', group:'Sales Bill',     navKey:'dispatch',      actions:['view','create','edit','delete','approve'] },
  { key:'deliveryChallan', label:'Delivery Challan / GDN',   group:'Sales Bill',     navKey:'dispatch',      actions:['view','create','edit','delete'] },

  /* Purchase Order */
  { key:'purchaseOrder',   label:'Purchase Order',           group:'Purchase Order', navKey:'purchase',      actions:['view','create','edit','delete','approve'] },

  /* Purchase Bill & GRN */
  { key:'purchaseBill',    label:'Purchase Bill',            group:'Purchase Bill',  navKey:'purchasebill',  actions:['view','create','edit','delete','approve'] },
  { key:'grn',             label:'GRN (Goods Receipt)',      group:'Purchase Bill',  navKey:'purchasebill',  actions:['view','create'] },

  /* Manufacturing */
  { key:'mfgOrders',       label:'Manufacturing Orders',     group:'Manufacturing',  navKey:'mfg',           actions:['view','create','edit','delete'] },
  { key:'jobSheets',       label:'Job Sheets',               group:'Manufacturing',  navKey:'mfg',           actions:['view','create','edit','delete'] },
  { key:'mfgLocations',    label:'Mfg Locations',            group:'Manufacturing',  navKey:'mfg',           actions:['view','create','edit','delete'] },

  /* Account */
  { key:'accExpense',      label:'Expense',                  group:'Account',        navKey:'finance',       actions:['view','create','edit','delete','approve'] },
  { key:'accDebitNote',    label:'Debit Note',               group:'Account',        navKey:'finance',       actions:['view','create','edit','delete'] },
  { key:'accCreditNote',   label:'Credit Note',              group:'Account',        navKey:'finance',       actions:['view','create','edit','delete'] },
  { key:'accPayment',      label:'Payment',                  group:'Account',        navKey:'finance',       actions:['view','create','edit','delete'] },
  { key:'accReceipt',      label:'Receipt',                  group:'Account',        navKey:'finance',       actions:['view','create','edit','delete'] },
  { key:'accJournal',      label:'Journal',                  group:'Account',        navKey:'finance',       actions:['view','create','edit','delete'] },
  { key:'accBank',         label:'Bank Accounts',            group:'Account',        navKey:'finance',       actions:['view','create','edit'] },
  { key:'accStatement',    label:'Statement',                group:'Account',        navKey:'finance',       actions:['view'] },
  { key:'accLedger',       label:'All Ledgers',              group:'Account',        navKey:'finance',       actions:['view'] },
  { key:'accDues',         label:'View Balance / Dues',      group:'Account',        navKey:'finance',       actions:['view'] },
  { key:'accApproval',     label:'Account Approval',         group:'Account',        navKey:'finance',       actions:['view','approve'] },
  { key:'accDeposit',      label:'Deposit',                  group:'Account',        navKey:'finance',       actions:['view','create','edit'] },

  /* Stock */
  { key:'stock',           label:'Stock View',               group:'Stock',          navKey:'stock',         actions:['view'] },
  { key:'stockIn',         label:'Stock In / GRN',           group:'Stock',          navKey:'stock',         actions:['view','create'] },
  { key:'stockOut',        label:'Stock Out / GDN',          group:'Stock',          navKey:'stock',         actions:['view','create'] },

  /* GST */
  { key:'gst',             label:'GST & Compliance',         group:'GST',            navKey:'gst',           actions:['view'] },

  /* Projects */
  { key:'project',         label:'Projects',                 group:'Projects',       navKey:'project',       actions:['view','create','edit','delete'] },

  /* Communication */
  { key:'communication',   label:'Communication Logs',       group:'Communication',  navKey:'communication', actions:['view','create','edit','delete'] },

  /* Other */
  { key:'approvals',       label:'Approvals',                group:'Other',          navKey:'approvals',     actions:['view','approve'] },
  { key:'passwords',       label:'Password Manager',         group:'Other',          navKey:'passwords',     actions:['view','create','edit','delete'] },
  { key:'tally',           label:'Tally Import',             group:'Other',          navKey:'finance',       actions:['view','create'] },

  /* Admin */
  { key:'userMgmt',        label:'User Management',          group:'Admin',          navKey:'admin',         actions:['view','create','edit','delete'] },
];

/** True if user can perform action on module. Admin always true. null permissions = full access except approve (backward compat). */
export const can = (user, moduleKey, action = 'view') => {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.permissions == null) return action !== 'approve';
  return !!(user.permissions[moduleKey]?.[action]);
};

/** True if the sidebar nav section (by navKey) should be accessible — true if ANY module in that section has view permission. */
export const canViewNav = (user, navKey) => {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (navKey === 'admin') return !!(user.permissions?.userMgmt?.view);
  if (navKey === 'dashboard') return true;
  if (user.permissions == null) return true;
  const mods = MODULES.filter(m => m.navKey === navKey);
  if (!mods.length) return true;
  return mods.some(m => !!(user.permissions[m.key]?.view));
};
