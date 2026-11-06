/* Primary navigation structure — used by SidebarNav.
   Moved out of Header.js so it has a single owner. */

/* Each group carries its own identity color for the sidebar's icon badge —
   the icon keeps this color at all times; only the row background/text
   switches to the orange "active" accent, so identity and state never fight. */
export const NAV_GROUPS = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    color: '#2563EB',
    path: '/dashboard',
    routes: ['/dashboard'],
  },
  {
    key: 'jobcode',
    label: 'Jobcode',
    color: '#4F46E5',
    routes: ['/project'],
    items: [
      { label: 'All Jobcodes',  path: '/project/list'  },
      { label: 'Project Close', path: '/project/close' },
    ],
  },
  {
    key: 'crm',
    label: 'CRM',
    color: '#DB2777',
    routes: ['/client', '/crm', '/sales-order', '/sales-bill', '/delivery-challan', '/communication', '/proforma-invoice'],
    sections: [
      {
        title: 'Clients',
        items: [
          { label: 'View Clients',   path: '/client/view'        },
          { label: 'Tally Debtors',  path: '/client/tally'       },
          { label: 'CRM / Leads',    path: '/crm/view'           },
          { label: 'Communication',  path: '/communication/logs' },
        ],
      },
      {
        title: 'Sales',
        items: [
          { label: 'Sales Orders',      path: '/sales-order/view'        },
          { label: 'Tally Sales Orders', path: '/sales-order/tally'      },
          { label: 'Sales Bills',       path: '/sales-bill'              },
          { label: 'Proforma Invoice',  path: '/proforma-invoice/view'   },
          { label: 'Client Balance',    path: '/account/dues?tab=client' },
        ],
      },
    ],
  },
  {
    key: 'vendor',
    label: 'Vendor',
    color: '#059669',
    routes: ['/vendor', '/purchase-order', '/purchase-bill'],
    sections: [
      {
        title: 'Suppliers',
        items: [
          { label: 'All Vendors',        path: '/vendor/view'               },
          { label: 'Self Registrations', path: '/vendor/self-registrations' },
          { label: 'Tally Creditors',    path: '/vendor/tally'              },
        ],
      },
      {
        title: 'Purchasing',
        items: [
          { label: 'Purchase Orders', path: '/purchase-order/tracking' },
          { label: 'Purchase Bills',  path: '/purchase-bill'           },
          { label: 'Vendor Dues',     path: '/account/dues?tab=vendor' },
        ],
      },
    ],
  },
  {
    key: 'inventory',
    label: 'Inventory',
    color: '#0D9488',
    routes: ['/items', '/stock'],
    sections: [
      {
        title: 'Products',
        items: [
          { label: 'Items / Products', path: '/items/view'   },
          { label: 'Create Item',      path: '/items/create' },
          { label: 'Tally Items',      path: '/items/tally'  },
        ],
      },
      {
        title: 'Stock',
        items: [
          { label: 'Stock View', path: '/stock/view' },
        ],
      },
    ],
  },
  /* HR — Recruitment (candidates + CVs), Employees, Salary */
  {
    key: 'hr',
    label: 'HR',
    color: '#7A5AF8',
    routes: ['/hr'],
    items: [
      { label: 'Recruitment', path: '/hr/recruitment' },
      { label: 'Employee',    path: '/hr/employee'    },
      { label: 'Salary',      path: '/hr/salary'      },
    ],
  },
  /* Tally Reconciliation — bring Tally's clients, orders, vendors, POs, payments, receipts and journals
     into the ERP the simple way (one page, a top bar of tabs) */
  {
    key: 'tallyrecon',
    label: 'Tally Reconciliation',
    color: '#0E7090',
    routes: ['/tally-recon'],
    items: [
      { label: 'Client',  path: '/tally-recon/client'  },
      { label: 'SO',      path: '/tally-recon/so'      },
      { label: 'Vendor',  path: '/tally-recon/vendor'  },
      { label: 'PO',      path: '/tally-recon/po'      },
      { label: 'Payment', path: '/tally-recon/payment' },
      { label: 'Receipt', path: '/tally-recon/receipt' },
      { label: 'Journal', path: '/tally-recon/journal' },
    ],
  },
  /* every money entry screen in one place — listed before 'account' so these
     routes highlight Transaction, not Account (whose '/account' prefix also matches) */
  {
    key: 'transaction',
    label: 'Transaction',
    color: '#C2410C',
    routes: ['/account/payment', '/account/receipt', '/account/expense', '/account/journal',
             '/account/debit-note', '/account/credit-note', '/account/deposit'],
    sections: [
      {
        title: 'Payments',
        items: [
          { label: 'Payment',       path: '/account/payment/create' },
          { label: 'Receipt',       path: '/account/receipt/create' },
          { label: 'Expense Entry', path: '/account/expense/create' },
        ],
      },
      {
        title: 'Adjustments',
        items: [
          { label: 'Journal Entry', path: '/account/journal/view'     },
          { label: 'Debit Note',    path: '/account/debit-note/view'  },
          { label: 'Credit Note',   path: '/account/credit-note/view' },
          { label: 'Deposit',       path: '/account/deposit/view'     },
        ],
      },
    ],
  },
  {
    key: 'account',
    label: 'Account',
    color: '#B45309',
    routes: ['/account', '/tally', '/gst'],
    sections: [
      {
        title: 'Setup',
        items: [
          { label: 'Ledger Master',  path: '/account/ledger/master' },
          { label: 'Account Groups', path: '/account/groups/view'   },
        ],
      },
      {
        title: 'Reports',
        items: [
          { label: 'View Balance',  path: '/account/dues'        },
          { label: 'All Ledgers',   path: '/account/ledger/view' },
          { label: 'Bank Accounts', path: '/account/bank/view'   },
          { label: 'Statement',     path: '/account/statement'   },
          { label: 'Balance Sheet & P&L', path: '/account/balance-sheet' },
          { label: 'Order Profit',  path: '/account/order-profit'  },
        ],
      },
      {
        title: 'Compliance',
        items: [
          { label: 'GST & Compliance', path: '/gst/compliance' },
          { label: 'Tally Import',     path: '/tally/import'   },
        ],
      },
    ],
  },
  {
    key: 'mfg',
    label: 'MFG',
    color: '#7C3AED',
    routes: ['/manufacturing'],
    items: [
      { label: 'Manufacturing Orders', path: '/manufacturing/orders'            },
      { label: 'Job Sheets',           path: '/manufacturing/job-sheets'        },
      { label: 'Create Job Sheet',     path: '/manufacturing/job-sheets/create' },
      { label: 'Locations',            path: '/manufacturing/locations'         },
    ],
  },
  {
    key: 'reports',
    label: 'Reports',
    color: '#0284C7',
    routes: ['/reports'],
    sections: [
      {
        title: 'Day Book',
        items: [
          { label: 'Day Book',       path: '/reports/daybook'   },
          { label: 'Cash Book',      path: '/reports/cashbook'  },
          { label: 'Bank Statement', path: '/account/statement' },
          { label: 'Tally Bank Match', path: '/account/tally-bank' },
          { label: 'Order Profit',     path: '/account/order-profit' },
        ],
      },
      {
        title: 'Monthly Reports',
        items: [
          { label: 'Monthly Summary',   path: '/reports/monthly'           },
          { label: 'Sales Register',    path: '/reports/sales-register'    },
          { label: 'Purchase Register', path: '/reports/purchase-register' },
          { label: 'Balance Sheet',     path: '/account/balance-sheet'     },
          { label: 'P&L Statement',     path: '/account/balance-sheet?tab=pl' },
        ],
      },
      {
        title: 'Party Reports',
        items: [
          { label: 'All Ledgers',    path: '/account/ledger/view'     },
          { label: 'Client Balance', path: '/account/dues?tab=client' },
          { label: 'Vendor Dues',    path: '/account/dues?tab=vendor' },
          { label: 'GST Reports',    path: '/gst/compliance'          },
        ],
      },
    ],
  },
  {
    key: 'admin',
    label: 'Admin',
    color: '#475569',
    routes: ['/admin', '/approval', '/passwords'],
    sections: [
      {
        title: 'System',
        items: [
          { label: 'Approvals',        path: '/approval'        },
          { label: 'Password Manager', path: '/passwords'       },
          { label: 'Companies',        path: '/admin/companies' },
          { label: 'User Management',  path: '/admin/users'     },
        ],
      },
      {
        title: 'Settings',
        items: [
          { label: 'Tally Import', path: '/tally/import' },
        ],
      },
    ],
  },
  {
    key: 'company',
    label: 'Company',
    color: '#0F766E',
    path: '/company-info',
    routes: ['/company-info'],
  },
  {
    key: 'epsilonai',
    label: 'Epsilon AI',
    color: '#8B5CF6',
    path: '/epsilon-ai',
    routes: ['/epsilon-ai'],
  },
];

export const isPathActive = (routes, pathname) =>
  routes?.some(r => pathname === r || pathname.startsWith(r + '/'));
