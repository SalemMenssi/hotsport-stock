const ROLE_MODULES = {
  admin: [
    'dashboard', 'orders', 'pos', 'caisse', 'invoices', 'customers', 'sponsors',
    'stock', 'items', 'purchases', 'suppliers', 'returns',
    'banks', 'accounts', 'reports', 'hrm', 'calendar', 'requests', 'users', 'settings'
  ],
  manager: [
    'dashboard', 'orders', 'pos', 'caisse', 'invoices', 'customers', 'sponsors',
    'stock', 'items', 'purchases', 'suppliers', 'returns',
    'reports', 'hrm', 'calendar', 'requests', 'users'
  ],
  seller: [
    'dashboard', 'pos', 'caisse', 'invoices', 'customers', 'orders', 'stock', 'items', 'sponsors', 'requests'
  ]
};

const ALL_MODULES = [
  { id: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard', group: 'main' },
  { id: 'orders', label: 'Commandes', icon: 'shopping-bag', group: 'sales' },
  { id: 'pos', label: 'POS / Scan', icon: 'monitor-smartphone', group: 'sales' },
  { id: 'caisse', label: 'Caisses', icon: 'banknote', group: 'sales' },
  { id: 'invoices', label: 'Invoices', icon: 'receipt', group: 'sales' },
  { id: 'customers', label: 'Customers', icon: 'users', group: 'sales' },
  { id: 'sponsors', label: 'Sponsors', icon: 'handshake', group: 'sales' },
  { id: 'stock', label: 'Easy Stock', icon: 'package', group: 'inventory' },
  { id: 'items', label: 'Products', icon: 'tags', group: 'inventory' },
  { id: 'purchases', label: 'Purchases', icon: 'clipboard-list', group: 'inventory' },
  { id: 'suppliers', label: 'Suppliers', icon: 'truck', group: 'inventory' },
  { id: 'returns', label: 'Returns', icon: 'undo-2', group: 'inventory' },
  { id: 'banks', label: 'Banks', icon: 'landmark', group: 'finance' },
  { id: 'accounts', label: 'Accounts', icon: 'book-open', group: 'finance' },
  { id: 'reports', label: 'Reports', icon: 'bar-chart-3', group: 'finance' },
  { id: 'hrm', label: 'HRM', icon: 'badge-check', group: 'hr' },
  { id: 'requests', label: 'My requests', icon: 'inbox', group: 'hr' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar-days', group: 'hr' },
  { id: 'users', label: 'Team', icon: 'user-cog', group: 'system' },
  { id: 'settings', label: 'Settings', icon: 'settings', group: 'system' }
];

const ROLE_CRUD = {
  admin: {
    users: 'crud',
    caisses: 'crud',
    sessions: 'crud',
    sponsors: 'crud',
    products: 'crud',
    customers: 'crud',
    purchases: 'crud',
    pos: 'sell'
  },
  manager: {
    users: 'sellers',
    caisses: 'crud',
    sessions: 'crud',
    sponsors: 'crud',
    products: 'crud',
    customers: 'crud',
    purchases: 'crud',
    pos: 'sell'
  },
  seller: {
    users: 'none',
    caisses: 'session',
    sessions: 'own',
    sponsors: 'read',
    products: 'read',
    customers: 'crud',
    purchases: 'none',
    pos: 'sell'
  }
};

function normalizeRole(role) {
  if (role === 'staff') return 'seller';
  if (['admin', 'manager', 'seller'].includes(role)) return role;
  return 'seller';
}

function modulesForRole(role) {
  const r = normalizeRole(role);
  const allowed = new Set(ROLE_MODULES[r] || ROLE_MODULES.seller);
  return ALL_MODULES.filter((m) => allowed.has(m.id));
}

function canApproveHr(role) {
  return ['admin', 'manager'].includes(normalizeRole(role));
}

function canManageSettings(role) {
  return normalizeRole(role) === 'admin';
}

function canEditStock(role) {
  return ['admin', 'manager', 'seller'].includes(normalizeRole(role));
}

function canCreateProducts(role) {
  return ['admin', 'manager'].includes(normalizeRole(role));
}

function canManageUsers(role) {
  return ['admin', 'manager'].includes(normalizeRole(role));
}

function canManageCaisses(role) {
  return normalizeRole(role) === 'admin';
}

function canApproveHrItem(actorRole, actorEmail, item = {}) {
  const a = normalizeRole(actorRole);
  const targetRole = normalizeRole(item.userRole || 'seller');
  const targetEmail = String(item.userEmail || '').toLowerCase();
  if (a === 'admin') return true;
  if (a !== 'manager') return false;
  if (targetEmail && targetEmail === String(actorEmail || '').toLowerCase()) return false;
  return targetRole === 'seller';
}

function canManageSponsors(role) {
  return ['admin', 'manager'].includes(normalizeRole(role));
}

function canManagePurchases(role) {
  return ['admin', 'manager'].includes(normalizeRole(role));
}

function permissionsForRole(role) {
  const r = normalizeRole(role);
  return {
    approveHr: canApproveHr(r),
    settings: canManageSettings(r),
    createProducts: canCreateProducts(r),
    manageUsers: canManageUsers(r),
    manageCaisses: canManageCaisses(r),
    manageSponsors: canManageSponsors(r),
    managePurchases: canManagePurchases(r),
    crud: ROLE_CRUD[r] || ROLE_CRUD.seller
  };
}

function generateBarcode(seed = '') {
  const base = String(seed || Date.now()).replace(/\D/g, '').slice(-10).padStart(10, '0');
  return `HS${base}`;
}

function csvEscape(v) {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows, headers) {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(','));
  }
  return lines.join('\n');
}

module.exports = {
  ROLE_MODULES,
  ALL_MODULES,
  ROLE_CRUD,
  normalizeRole,
  modulesForRole,
  canApproveHr,
  canManageSettings,
  canEditStock,
  canCreateProducts,
  canManageUsers,
  canManageCaisses,
  canApproveHrItem,
  canManageSponsors,
  canManagePurchases,
  permissionsForRole,
  generateBarcode,
  toCsv
};
