const mongoose = require('mongoose');
const Product = require('./models/Product');
const Adjustment = require('./models/Adjustment');
const User = require('./models/User');
const Settings = require('./models/Settings');
const {
  Unit, Category, Customer, Supplier, Bank,
  Department, Designation, Employee,
  Purchase, Invoice, ReturnDoc, Transaction,
  Attendance, Salary, Closing, Order, LeaveRequest, SalaryAdvance
} = require('./models/Inventory');
const { Caisse, CaisseSession } = require('./models/Caisse');
const Sponsor = require('./models/Sponsor');
const { generateBarcode } = require('./roles');

const PRODUCT_DEFS = [
  {
    "sku": "HS-BOX-PACK",
    "name": "Pack Boxing",
    "category": "Pack",
    "discipline": "Boxing",
    "priceTnd": 118,
    "costTnd": 73.16,
    "minStock": 6,
    "wooProductId": 17788,
    "imageEmoji": "🥊",
    "imageUrl": "https://hotsport.tn/wp-content/uploads/2026/07/AD62859C-B0FC-4F5C-B145-4E4ABF7703AE.png",
    "tags": [
      "hotsport",
      "woo"
    ]
  },
  {
    "sku": "HS-KARATE-PACK",
    "name": "Pack Karate's",
    "category": "Pack",
    "discipline": "Karate",
    "priceTnd": 153,
    "costTnd": 94.86,
    "minStock": 5,
    "wooProductId": 17785,
    "imageEmoji": "🥋",
    "imageUrl": "https://hotsport.tn/wp-content/uploads/2026/07/A4562185-BDAD-4BF8-951B-F570D8E0BFE5.png",
    "tags": [
      "hotsport",
      "woo"
    ]
  },
  {
    "sku": "HS-MT-PROTECT",
    "name": "Pack Protection Muay Thai & Kickboxing Premium",
    "category": "Pack",
    "discipline": "Muay Thai",
    "priceTnd": 158,
    "costTnd": 97.96,
    "minStock": 5,
    "wooProductId": 17747,
    "imageEmoji": "🛡️",
    "imageUrl": "https://hotsport.tn/wp-content/uploads/2026/05/WhatsApp-Image-2026-05-21-at-17.37.33-2.jpeg",
    "tags": [
      "hotsport",
      "woo"
    ]
  },
  {
    "sku": "HS-MT-DESERT",
    "name": "Ensemble Muay Thai Desert Camo Premium",
    "category": "Ensemble",
    "discipline": "Muay Thai",
    "priceTnd": 188,
    "costTnd": 116.56,
    "minStock": 4,
    "wooProductId": 17745,
    "imageEmoji": "🏜️",
    "imageUrl": "https://hotsport.tn/wp-content/uploads/2026/05/WhatsApp-Image-2026-05-21-at-17.37.35.jpeg",
    "tags": [
      "hotsport",
      "woo"
    ]
  },
  {
    "sku": "HS-MT-FULL",
    "name": "Pack Complet Muay Thai Premium",
    "category": "Pack",
    "discipline": "Muay Thai",
    "priceTnd": 288,
    "costTnd": 178.56,
    "minStock": 3,
    "wooProductId": 17742,
    "imageEmoji": "🔥",
    "imageUrl": "https://hotsport.tn/wp-content/uploads/2026/05/WhatsApp-Image-2026-05-21-at-17.37.33-1.jpeg",
    "tags": [
      "hotsport",
      "woo"
    ]
  },
  {
    "sku": "HS-GLOVES-16",
    "name": "Casque kpnp",
    "category": "sport",
    "discipline": "sport",
    "priceTnd": 88,
    "costTnd": 54.56,
    "minStock": 8,
    "wooProductId": 17708,
    "imageEmoji": "⛑️",
    "imageUrl": "https://hotsport.tn/wp-content/uploads/2026/05/838BDAAE-52EA-4846-999D-0429EC0313CE.png",
    "tags": [
      "hotsport",
      "woo"
    ]
  },
  {
    "sku": "HS-SHIN-MT",
    "name": "Protege tba et avant bras kpnp",
    "category": "sport",
    "discipline": "sport",
    "priceTnd": 88,
    "costTnd": 54.56,
    "minStock": 5,
    "wooProductId": 17704,
    "imageEmoji": "🛡️",
    "imageUrl": "https://hotsport.tn/wp-content/uploads/2026/05/BB086475-7C82-4FF0-8196-27F5FA905206.png",
    "tags": [
      "hotsport",
      "woo"
    ]
  },
  {
    "sku": "HS-BANDES",
    "name": "Gants MMA Blancs",
    "category": "MMA",
    "discipline": "MMA",
    "priceTnd": 68,
    "costTnd": 42.16,
    "minStock": 15,
    "wooProductId": 17700,
    "imageEmoji": "🥊",
    "imageUrl": "https://hotsport.tn/wp-content/uploads/2026/05/db6a0056-97cd-46f8-803d-fdfb1503c73a.jpeg",
    "tags": [
      "hotsport",
      "woo"
    ]
  },
  {
    "sku": "HS-FIT-DUMB",
    "name": "Haies pro",
    "category": "Fitness",
    "discipline": "Fitness",
    "priceTnd": 35,
    "costTnd": 21.7,
    "minStock": 6,
    "wooProductId": 17693,
    "imageEmoji": "🏋️",
    "imageUrl": "https://hotsport.tn/wp-content/uploads/2026/05/20f6f31e-baa3-4f59-9606-94fba348ce27.jpeg",
    "tags": [
      "hotsport",
      "woo"
    ]
  },
  {
    "sku": "HS-FIT-MAT",
    "name": "Casque de Boxe Noir Venum",
    "category": "Box",
    "discipline": "Box",
    "priceTnd": 85,
    "costTnd": 52.7,
    "minStock": 5,
    "wooProductId": 17690,
    "imageEmoji": "🥊",
    "imageUrl": "https://hotsport.tn/wp-content/uploads/2026/05/6cbc3edb-2f50-46b8-b6b7-514853e51130.jpeg",
    "tags": [
      "hotsport",
      "woo"
    ]
  },
  {
    "sku": "HS-MMA-GLOVE",
    "name": "Socle multifonction en rezine",
    "category": "Fitness",
    "discipline": "Fitness",
    "priceTnd": 28,
    "costTnd": 17.36,
    "minStock": 4,
    "wooProductId": 17687,
    "imageEmoji": "🧱",
    "imageUrl": "https://hotsport.tn/wp-content/uploads/2026/05/2542e36c-99b0-41f5-9bd7-c6aed44b5b83.jpeg",
    "tags": [
      "hotsport",
      "woo"
    ]
  },
  {
    "sku": "HS-WUSHU-SET",
    "name": "Haies hoxagonal",
    "category": "Fitness",
    "discipline": "Fitness",
    "priceTnd": 35,
    "costTnd": 21.7,
    "minStock": 3,
    "wooProductId": 17684,
    "imageEmoji": "⬡",
    "imageUrl": "https://hotsport.tn/wp-content/uploads/2026/05/66e9a553-c788-4bf3-a857-29be4ddff0f9.jpeg",
    "tags": [
      "hotsport",
      "woo"
    ]
  },
  {
    "sku": "HS-FOOTBALL-KIT",
    "name": "Jeux de plots 50 piece",
    "category": "Fitness",
    "discipline": "Fitness",
    "priceTnd": 48,
    "costTnd": 29.76,
    "minStock": 4,
    "wooProductId": 17681,
    "imageEmoji": "🟧",
    "imageUrl": "https://hotsport.tn/wp-content/uploads/2026/05/1b55feed-3afa-4039-a012-d26febfa6d8e.jpeg",
    "tags": [
      "hotsport",
      "woo"
    ]
  },
  {
    "sku": "HS-KIDS-GLOVE",
    "name": "Gants de Combat Professionnels",
    "category": "MMA",
    "discipline": "MMA",
    "priceTnd": 68,
    "costTnd": 42.16,
    "minStock": 6,
    "wooProductId": 17678,
    "imageEmoji": "🥊",
    "imageUrl": "https://hotsport.tn/wp-content/uploads/2026/05/6420e483-1bbb-4b81-b4a8-5e744048de14.jpeg",
    "tags": [
      "hotsport",
      "woo"
    ]
  },
  {
    "sku": "HS-WOMEN-SET",
    "name": "Casque de Protection Boxe Vintage",
    "category": "Box",
    "discipline": "Box",
    "priceTnd": 108,
    "costTnd": 66.96,
    "minStock": 4,
    "wooProductId": 17675,
    "imageEmoji": "⛑️",
    "imageUrl": "https://hotsport.tn/wp-content/uploads/2026/05/bdec0271-fc4c-4a08-9fee-fc057d04a2d0.jpeg",
    "tags": [
      "hotsport",
      "woo"
    ]
  },
  {
    "sku": "HS-FB-BALL",
    "name": "Ballon d’Équilibre Fitness",
    "category": "sport",
    "discipline": "sport",
    "priceTnd": 178,
    "costTnd": 110.36,
    "minStock": 8,
    "wooProductId": 17669,
    "imageEmoji": "⚪",
    "imageUrl": "https://hotsport.tn/wp-content/uploads/2026/05/990f311f-68c7-4f0a-b1d5-be64928f2ce7.jpeg",
    "tags": [
      "hotsport",
      "woo"
    ]
  },
  {
    "sku": "HS-SHOE-RUN",
    "name": "Gants MMA Venum",
    "category": "MMA",
    "discipline": "MMA",
    "priceTnd": 65,
    "costTnd": 40.3,
    "minStock": 4,
    "wooProductId": 17666,
    "imageEmoji": "🥊",
    "imageUrl": "https://hotsport.tn/wp-content/uploads/2026/05/b668e733-9689-412d-a8ef-efe9059bfa84.jpeg",
    "tags": [
      "hotsport",
      "woo"
    ]
  },
  {
    "sku": "HS-MOUTH",
    "name": "Socle multifonctions",
    "category": "sport",
    "discipline": "sport",
    "priceTnd": 15,
    "costTnd": 9.3,
    "minStock": 10,
    "wooProductId": 17663,
    "imageEmoji": "🧱",
    "imageUrl": "https://hotsport.tn/wp-content/uploads/2026/05/9cf8465a-5876-4f63-be57-f44f57b15052.jpeg",
    "tags": [
      "hotsport",
      "woo"
    ]
  },
  {
    "sku": "HS-BAG-HEAVY",
    "name": "Arceau d’Entraînement",
    "category": "sport",
    "discipline": "sport",
    "priceTnd": 35,
    "costTnd": 21.7,
    "minStock": 2,
    "wooProductId": 17660,
    "imageEmoji": "⭕",
    "imageUrl": "https://hotsport.tn/wp-content/uploads/2026/05/7271afbc-50b7-4547-92bb-3e4c11f75a2b.jpeg",
    "tags": [
      "hotsport",
      "woo"
    ]
  },
  {
    "sku": "HS-SOCKS",
    "name": "Casque de Protection Boxe ZTTY",
    "category": "Box",
    "discipline": "Box",
    "priceTnd": 85,
    "costTnd": 52.7,
    "minStock": 12,
    "wooProductId": 17658,
    "imageEmoji": "⛑️",
    "imageUrl": "https://hotsport.tn/wp-content/uploads/2026/05/9a803dc5-1ceb-4da3-9999-7c2896c13303.jpeg",
    "tags": [
      "hotsport",
      "woo"
    ]
  }
];

async function clearAll() {
  await Promise.all([
    Product.deleteMany({}), Adjustment.deleteMany({}), User.deleteMany({}), Settings.deleteMany({}),
    Unit.deleteMany({}), Category.deleteMany({}), Customer.deleteMany({}), Supplier.deleteMany({}),
    Bank.deleteMany({}), Department.deleteMany({}), Designation.deleteMany({}), Employee.deleteMany({}),
    Purchase.deleteMany({}), Invoice.deleteMany({}), ReturnDoc.deleteMany({}), Transaction.deleteMany({}),
    Attendance.deleteMany({}), Salary.deleteMany({}), LeaveRequest.deleteMany({}), Closing.deleteMany({}), Order.deleteMany({}),
    Caisse.deleteMany({}), CaisseSession.deleteMany({}), Sponsor.deleteMany({}), SalaryAdvance.deleteMany({})
  ]);
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function seed(force = false) {
  const existing = await Product.countDocuments();
  if (existing > 0 && !force) {
    console.log(`Demo already seeded (${existing} products). Use reset to reload.`);
    return { seeded: false, products: existing };
  }

  await clearAll();

  // Settings & users
  await Settings.create({
    key: 'hotsport',
    storeName: 'HotSport Stock',
    storeUrl: 'https://hotsport.tn',
    autoSync: true,
    syncDirection: 'both',
    lowStockThreshold: 5,
    currency: 'TND',
    demoMode: true
  });

  const adminHash = await User.hashPassword('admin123');
  const managerHash = await User.hashPassword('manager123');
  const sellerHash = await User.hashPassword('seller123');
  const legacyAdminHash = await User.hashPassword('demo1234');
  const cashierHash = await User.hashPassword('cashier123');
  const caisses = await Caisse.create([
    { code: 'CAISSE-01', name: 'Boutique Tunis', location: 'Centre ville', kind: 'shop', openingFloat: 200, note: 'Till principale' },
    { code: 'CAISSE-02', name: 'Caisse La Marsa', location: 'La Marsa', kind: 'shop', openingFloat: 150, note: 'Annexe' },
    { code: 'CAISSE-03', name: 'Caisse Event', location: 'Tournois / pop-up', kind: 'event', openingFloat: 100, note: 'Mobile' }
  ]);

  const users = await User.create([
    { name: 'HotSport Admin', email: 'admin@hotsport.tn', passwordHash: adminHash, role: 'admin' },
    { name: 'HotSport Manager', email: 'manager@hotsport.tn', passwordHash: managerHash, role: 'manager' },
    { name: 'HotSport Seller', email: 'seller@hotsport.tn', passwordHash: sellerHash, role: 'seller', defaultCaisse: caisses[0]._id },
    { name: 'HotSport Cashier', email: 'cashier@hotsport.tn', passwordHash: cashierHash, role: 'seller', defaultCaisse: caisses[1]._id },
    { name: 'Demo Admin', email: 'demo@hotsport.tn', passwordHash: legacyAdminHash, role: 'admin' }
  ]);
  caisses[0].assignedUsers = [users[2]._id];
  caisses[1].assignedUsers = [users[3]._id];
  await caisses[0].save();
  await caisses[1].save();

  // Master data
  await Unit.insertMany([{ name: 'Piece' }, { name: 'Pair' }, { name: 'Set' }, { name: 'Pack' }]);
  const cats = [...new Set(PRODUCT_DEFS.map((p) => p.category))];
  await Category.insertMany(cats.map((name) => ({ name, description: `${name} — HotSport Tunisia` })));

  const suppliers = await Supplier.insertMany([
    { code: 'SUP-NIKE', name: 'Nike Tunisia Dist.', mobile: '+216 71 000 111', email: 'orders@nike-tn.demo', address: 'Tunis', balance: 420 },
    { code: 'SUP-ADIDAS', name: 'Adidas Maghreb', mobile: '+216 71 000 222', email: 'b2b@adidas-tn.demo', address: 'Sfax', balance: 180 },
    { code: 'SUP-LOCAL', name: 'Local Martial Arts Co.', mobile: '+216 98 555 010', email: 'contact@localma.demo', address: 'Sousse', balance: 0 }
  ]);

  const customers = await Customer.insertMany([
    { code: 'CUS-WALK', name: 'Walk-in Cash', mobile: '', email: '', address: 'Boutique', balance: 0 },
    { code: 'CUS-ESP', name: 'Club Espérance', mobile: '+216 98 111 222', email: 'club@esperance.demo', address: 'Tunis', balance: 250 },
    { code: 'CUS-AHMED', name: 'Ahmed Ben Ali', mobile: '+216 22 333 444', email: 'ahmed@demo.tn', address: 'Ariana', balance: 95 },
    { code: 'CUS-SARAH', name: 'Sarah Trabelsi', mobile: '+216 55 666 777', email: 'sarah@demo.tn', address: 'La Marsa', balance: 0 },
    { code: 'CUS-FIGHT', name: 'Fight Club Sfax', mobile: '+216 74 888 999', email: 'fight@sfax.demo', address: 'Sfax', balance: 410 }
  ]);

  const banks = await Bank.insertMany([
    { name: 'BIAT Main', accountNo: 'TN59 BIAT 0001', branch: 'Avenue Habib Bourguiba', balance: 12500 },
    { name: 'Amen Bank POS', accountNo: 'TN59 AMEN 0002', branch: 'Centre Urbain Nord', balance: 3200 }
  ]);

  await Department.insertMany([
    { name: 'Sales', description: 'Boutique & POS' },
    { name: 'Warehouse', description: 'Stock & receiving' },
    { name: 'Admin', description: 'Management' }
  ]);
  await Designation.insertMany([
    { name: 'Store Manager', description: 'Full store ops' },
    { name: 'Cashier', description: 'POS & invoices' },
    { name: 'Stock Keeper', description: 'Inventory' }
  ]);

  const employees = await Employee.insertMany([
    { code: 'EMP-01', name: 'Youssef Gharbi', email: 'youssef@hotsport.tn', phone: '+216 20 100 200', department: 'Admin', designation: 'Store Manager', salary: 1800 },
    { code: 'EMP-02', name: 'Nour Jemai', email: 'nour@hotsport.tn', phone: '+216 20 100 201', department: 'Sales', designation: 'Cashier', salary: 950 },
    { code: 'EMP-03', name: 'Karim Saidi', email: 'karim@hotsport.tn', phone: '+216 20 100 202', department: 'Warehouse', designation: 'Stock Keeper', salary: 900 }
  ]);

  // Products with opening stock (will be adjusted by purchases/sales in seed narrative)
  const openingStock = {
    'HS-BOX-PACK': 24, 'HS-KARATE-PACK': 12, 'HS-MT-PROTECT': 4, 'HS-MT-DESERT': 9, 'HS-MT-FULL': 7,
    'HS-GLOVES-16': 31, 'HS-SHIN-MT': 2, 'HS-BANDES': 60, 'HS-FIT-DUMB': 18, 'HS-FIT-MAT': 0,
    'HS-MMA-GLOVE': 14, 'HS-WUSHU-SET': 6, 'HS-FOOTBALL-KIT': 11, 'HS-KIDS-GLOVE': 20, 'HS-WOMEN-SET': 8,
    'HS-FB-BALL': 15, 'HS-SHOE-RUN': 5, 'HS-MOUTH': 28, 'HS-BAG-HEAVY': 3, 'HS-SOCKS': 40
  };

  const products = await Product.insertMany(
    PRODUCT_DEFS.map((p, idx) => ({
      ...p,
      barcode: generateBarcode(p.wooProductId || (1000000000 + idx)),
      description: `${p.name} — équipement HotSport Tunisia.`,
      stockQty: openingStock[p.sku] ?? 10,
      status: 'active'
    }))
  );
  const bySku = Object.fromEntries(products.map((p) => [p.sku, p]));

  // Purchases
  const purchaseLines1 = [
    { product: bySku['HS-GLOVES-16']._id, sku: 'HS-GLOVES-16', name: bySku['HS-GLOVES-16'].name, qty: 20, rate: 52, total: 1040 },
    { product: bySku['HS-BANDES']._id, sku: 'HS-BANDES', name: bySku['HS-BANDES'].name, qty: 40, rate: 8, total: 320 },
    { product: bySku['HS-BOX-PACK']._id, sku: 'HS-BOX-PACK', name: bySku['HS-BOX-PACK'].name, qty: 10, rate: 75, total: 750 }
  ];
  const purchase1 = await Purchase.create({
    purchaseNo: 'PO-2026-001',
    supplier: suppliers[0]._id,
    supplierName: suppliers[0].name,
    date: daysAgo(20),
    lines: purchaseLines1,
    discount: 50,
    grandTotal: 2060,
    paidAmount: 1640,
    dueAmount: 420,
    paymentType: 'bank',
    bankName: banks[0].name,
    note: 'Nike Tunisia — gloves & packs',
    status: 'received'
  });

  const purchaseLines2 = [
    { product: bySku['HS-MT-PROTECT']._id, sku: 'HS-MT-PROTECT', name: bySku['HS-MT-PROTECT'].name, qty: 8, rate: 105, total: 840 },
    { product: bySku['HS-SHIN-MT']._id, sku: 'HS-SHIN-MT', name: bySku['HS-SHIN-MT'].name, qty: 12, rate: 40, total: 480 },
    { product: bySku['HS-MT-DESERT']._id, sku: 'HS-MT-DESERT', name: bySku['HS-MT-DESERT'].name, qty: 6, rate: 120, total: 720 }
  ];
  await Purchase.create({
    purchaseNo: 'PO-2026-002',
    supplier: suppliers[2]._id,
    supplierName: suppliers[2].name,
    date: daysAgo(12),
    lines: purchaseLines2,
    discount: 0,
    grandTotal: 2040,
    paidAmount: 2040,
    dueAmount: 0,
    paymentType: 'cash',
    note: 'Local MA — Muay Thai restock',
    status: 'received'
  });

  await Purchase.create({
    purchaseNo: 'PO-2026-003',
    supplier: suppliers[1]._id,
    supplierName: suppliers[1].name,
    date: daysAgo(5),
    lines: [
      { product: bySku['HS-FOOTBALL-KIT']._id, sku: 'HS-FOOTBALL-KIT', name: bySku['HS-FOOTBALL-KIT'].name, qty: 15, rate: 45, total: 675 },
      { product: bySku['HS-FB-BALL']._id, sku: 'HS-FB-BALL', name: bySku['HS-FB-BALL'].name, qty: 20, rate: 22, total: 440 },
      { product: bySku['HS-SHOE-RUN']._id, sku: 'HS-SHOE-RUN', name: bySku['HS-SHOE-RUN'].name, qty: 8, rate: 110, total: 880 }
    ],
    discount: 25,
    grandTotal: 1970,
    paidAmount: 1790,
    dueAmount: 180,
    paymentType: 'bank',
    bankName: banks[1].name,
    note: 'Adidas Maghreb football & footwear',
    status: 'received'
  });

  // Invoices / POS
  await Invoice.create({
    invoiceNo: 'INV-2026-001',
    customer: customers[1]._id,
    customerName: customers[1].name,
    date: daysAgo(8),
    source: 'invoice',
    lines: [
      { product: bySku['HS-BOX-PACK']._id, sku: 'HS-BOX-PACK', name: bySku['HS-BOX-PACK'].name, qty: 4, price: 118, discount: 0, total: 472 },
      { product: bySku['HS-GLOVES-16']._id, sku: 'HS-GLOVES-16', name: bySku['HS-GLOVES-16'].name, qty: 4, price: 89, discount: 0, total: 356 }
    ],
    discount: 20,
    tax: 0,
    totalAmount: 808,
    paidAmount: 558,
    dueAmount: 250,
    paymentMethod: 'bank',
    bankName: banks[0].name,
    status: 'delivered',
    note: 'Club order — partial payment'
  });

  await Invoice.create({
    invoiceNo: 'POS-2026-014',
    customer: customers[0]._id,
    customerName: customers[0].name,
    date: daysAgo(1),
    source: 'pos',
    lines: [
      { product: bySku['HS-BANDES']._id, sku: 'HS-BANDES', name: bySku['HS-BANDES'].name, qty: 2, price: 18, discount: 0, total: 36 },
      { product: bySku['HS-MOUTH']._id, sku: 'HS-MOUTH', name: bySku['HS-MOUTH'].name, qty: 1, price: 25, discount: 0, total: 25 }
    ],
    totalAmount: 61,
    paidAmount: 61,
    dueAmount: 0,
    paymentMethod: 'cash',
    status: 'delivered',
    note: 'Walk-in POS',
    caisse: caisses[0]._id,
    caisseName: caisses[0].name,
    sellerName: 'HotSport Seller'
  });

  await Invoice.create({
    invoiceNo: 'INV-2026-002',
    customer: customers[4]._id,
    customerName: customers[4].name,
    date: daysAgo(3),
    source: 'invoice',
    lines: [
      { product: bySku['HS-MT-FULL']._id, sku: 'HS-MT-FULL', name: bySku['HS-MT-FULL'].name, qty: 2, price: 249, discount: 10, total: 488 },
      { product: bySku['HS-MT-PROTECT']._id, sku: 'HS-MT-PROTECT', name: bySku['HS-MT-PROTECT'].name, qty: 2, price: 158, discount: 0, total: 316 }
    ],
    discount: 10,
    totalAmount: 794,
    paidAmount: 384,
    dueAmount: 410,
    paymentMethod: 'cash',
    status: 'processing',
    note: 'Fight Club Sfax — credit'
  });

  await Invoice.create({
    invoiceNo: 'POS-2026-015',
    customer: customers[3]._id,
    customerName: customers[3].name,
    date: daysAgo(0),
    source: 'pos',
    lines: [
      { product: bySku['HS-WOMEN-SET']._id, sku: 'HS-WOMEN-SET', name: bySku['HS-WOMEN-SET'].name, qty: 1, price: 110, discount: 0, total: 110 },
      { product: bySku['HS-SOCKS']._id, sku: 'HS-SOCKS', name: bySku['HS-SOCKS'].name, qty: 2, price: 22, discount: 0, total: 44 }
    ],
    totalAmount: 154,
    paidAmount: 154,
    dueAmount: 0,
    paymentMethod: 'card',
    bankName: banks[1].name,
    status: 'delivered',
    caisse: caisses[1]._id,
    caisseName: caisses[1].name,
    sellerName: 'HotSport Cashier'
  });

  await Invoice.create({
    invoiceNo: 'INV-2026-003',
    customer: customers[2]._id,
    customerName: customers[2].name,
    date: daysAgo(6),
    source: 'invoice',
    lines: [
      { product: bySku['HS-SHOE-RUN']._id, sku: 'HS-SHOE-RUN', name: bySku['HS-SHOE-RUN'].name, qty: 1, price: 175, discount: 0, total: 175 }
    ],
    totalAmount: 175,
    paidAmount: 80,
    dueAmount: 95,
    paymentMethod: 'cash',
    status: 'delivered',
    note: 'Wrong size later returned partially'
  });

  // Returns
  await ReturnDoc.create({
    returnNo: 'CR-2026-001',
    type: 'customer',
    relatedNo: 'INV-2026-003',
    partyName: customers[2].name,
    date: daysAgo(2),
    lines: [
      { product: bySku['HS-SHOE-RUN']._id, sku: 'HS-SHOE-RUN', name: bySku['HS-SHOE-RUN'].name, qty: 1, price: 175, total: 175 }
    ],
    totalAmount: 175,
    reason: 'Wrong size — exchanged credit',
    status: 'completed'
  });
  // Put shoe back in stock for return demo
  bySku['HS-SHOE-RUN'].stockQty += 1;
  await bySku['HS-SHOE-RUN'].save();

  await ReturnDoc.create({
    returnNo: 'SR-2026-001',
    type: 'supplier',
    relatedNo: 'PO-2026-003',
    partyName: suppliers[1].name,
    date: daysAgo(1),
    lines: [
      { product: bySku['HS-FB-BALL']._id, sku: 'HS-FB-BALL', name: bySku['HS-FB-BALL'].name, qty: 2, price: 22, total: 44 }
    ],
    totalAmount: 44,
    reason: 'Damaged balls on delivery',
    status: 'completed'
  });
  bySku['HS-FB-BALL'].stockQty = Math.max(0, bySku['HS-FB-BALL'].stockQty - 2);
  await bySku['HS-FB-BALL'].save();

  // Stock adjustments
  await Adjustment.create([
    { product: bySku['HS-SHIN-MT']._id, qtyChange: -1, reason: 'Damaged / loss', note: 'Torn during demo', source: 'manual', stockAfter: bySku['HS-SHIN-MT'].stockQty, createdBy: 'demo@hotsport.tn' },
    { product: bySku['HS-BANDES']._id, qtyChange: 5, reason: 'Inventory count', note: 'Found in backroom', source: 'manual', stockAfter: bySku['HS-BANDES'].stockQty, createdBy: 'demo@hotsport.tn' },
    { product: bySku['HS-FIT-MAT']._id, qtyChange: 0, reason: 'Out of stock check', note: 'Awaiting PO', source: 'demo', stockAfter: 0, createdBy: 'demo@hotsport.tn' }
  ]);

  // Accounts / bank transactions
  await Transaction.insertMany([
    { txnNo: 'TXN-001', date: daysAgo(25), type: 'adjustment', category: 'opening', mode: 'cash', partyType: 'other', partyName: 'Opening capital', amount: 5000, description: 'Opening cash float' },
    { txnNo: 'TXN-002', date: daysAgo(25), type: 'adjustment', category: 'opening', mode: 'bank', partyType: 'bank', partyName: banks[0].name, amount: 10000, description: 'Opening BIAT balance', bankName: banks[0].name },
    { txnNo: 'TXN-003', date: daysAgo(8), type: 'receive', category: 'customer', mode: 'bank', partyType: 'customer', partyName: customers[1].name, amount: 558, description: 'Partial receipt INV-2026-001', bankName: banks[0].name },
    { txnNo: 'TXN-004', date: daysAgo(18), type: 'pay', category: 'supplier', mode: 'bank', partyType: 'supplier', partyName: suppliers[0].name, amount: 1640, description: 'Payment PO-2026-001', bankName: banks[0].name },
    { txnNo: 'TXN-005', date: daysAgo(1), type: 'receive', category: 'pos', mode: 'cash', partyType: 'customer', partyName: 'Walk-in Cash', amount: 61, description: 'POS-2026-014' },
    { txnNo: 'TXN-006', date: daysAgo(0), type: 'receive', category: 'pos', mode: 'bank', partyType: 'customer', partyName: customers[3].name, amount: 154, description: 'POS-2026-015 card', bankName: banks[1].name },
    { txnNo: 'TXN-007', date: daysAgo(4), type: 'pay', category: 'supplier', mode: 'cash', partyType: 'supplier', partyName: suppliers[2].name, amount: 2040, description: 'Payment PO-2026-002' }
  ]);

  await Closing.create({
    date: daysAgo(1),
    opening: 820,
    cashIn: 445,
    cashOut: 210,
    closing: 1055,
    note: 'Yesterday cash closing — HotSport boutique'
  });

  await CaisseSession.create({
    caisse: caisses[0]._id,
    caisseName: caisses[0].name,
    caisseCode: caisses[0].code,
    user: users[2]._id,
    userName: users[2].name,
    userRole: 'seller',
    openedAt: daysAgo(1),
    closedAt: daysAgo(1),
    openingCash: 200,
    cashIn: 61,
    cashOut: 0,
    countedCash: 261,
    difference: 0,
    salesCount: 1,
    status: 'closed',
    note: 'Clôture veille'
  });

  await Sponsor.create([
    {
      code: 'SPN-NIKE', name: 'Nike Tunisia', company: 'Nike Dist. Maghreb', contact: 'Sami Khelifi',
      email: 'sponsor@nike-tn.demo', phone: '+216 71 000 111', website: 'https://hotsport.tn',
      package: 'gold', amountTnd: 8500, startDate: daysAgo(200), endDate: new Date('2026-12-31'),
      status: 'active', benefits: 'Logo pack boxing · vitrine boutique · posts Instagram'
    },
    {
      code: 'SPN-ADIDAS', name: 'Adidas Maghreb', company: 'Adidas Maghreb', contact: 'Lina Trabelsi',
      email: 'b2b@adidas-tn.demo', phone: '+216 71 000 222',
      package: 'silver', amountTnd: 4200, startDate: daysAgo(120), endDate: new Date('2026-12-31'),
      status: 'active', benefits: 'Kits football · banderole event'
    },
    {
      code: 'SPN-BIAT', name: 'BIAT Sport', company: 'BIAT', contact: 'Karim Jaziri',
      email: 'sport@biat.demo', phone: '+216 71 140 000',
      package: 'platinum', amountTnd: 12000, startDate: daysAgo(250), endDate: new Date('2026-12-31'),
      status: 'active', benefits: 'Naming caisse principale · QR paiement'
    },
    {
      code: 'SPN-FIGHT', name: 'Fight Club Sfax', company: 'Fight Club Sfax', contact: 'Club manager',
      email: 'fight@sfax.demo', phone: '+216 74 888 999',
      package: 'partner', amountTnd: 1500, startDate: daysAgo(40), endDate: new Date('2027-06-01'),
      status: 'pending', benefits: 'Club partner · packs Muay Thai'
    }
  ]);

  // HRM
  await Attendance.insertMany([
    { employee: employees[0]._id, employeeName: employees[0].name, date: daysAgo(0), inTime: '08:55', outTime: '18:05', stayHours: 9.1 },
    { employee: employees[1]._id, employeeName: employees[1].name, date: daysAgo(0), inTime: '09:00', outTime: '17:30', stayHours: 8.5 },
    { employee: employees[2]._id, employeeName: employees[2].name, date: daysAgo(0), inTime: '08:30', outTime: '17:00', stayHours: 8.5 },
    { employee: employees[1]._id, employeeName: employees[1].name, date: daysAgo(1), inTime: '09:05', outTime: '17:40', stayHours: 8.5 }
  ]);

  await Salary.insertMany([
    { employee: employees[0]._id, employeeName: employees[0].name, month: '2026-06', amount: 1800, paidAmount: 1800, status: 'paid', paidAt: daysAgo(10), approvedBy: 'admin@hotsport.tn', approvedAt: daysAgo(12) },
    { employee: employees[1]._id, employeeName: employees[1].name, month: '2026-06', amount: 950, paidAmount: 950, status: 'paid', paidAt: daysAgo(10), approvedBy: 'admin@hotsport.tn', approvedAt: daysAgo(12) },
    { employee: employees[2]._id, employeeName: employees[2].name, month: '2026-06', amount: 900, paidAmount: 0, status: 'pending' },
    { employee: employees[0]._id, employeeName: employees[0].name, month: '2026-07', amount: 1800, paidAmount: 0, status: 'pending' },
    { employee: employees[1]._id, employeeName: employees[1].name, month: '2026-07', amount: 950, paidAmount: 0, status: 'approved', approvedBy: 'manager@hotsport.tn', approvedAt: daysAgo(1) }
  ]);

  await LeaveRequest.insertMany([
    {
      employee: employees[1]._id,
      employeeName: employees[1].name,
      fromDate: daysAgo(-2),
      toDate: daysAgo(-2),
      days: 1,
      type: 'day_off',
      reason: 'Family appointment',
      status: 'pending'
    },
    {
      employee: employees[2]._id,
      employeeName: employees[2].name,
      fromDate: daysAgo(-5),
      toDate: daysAgo(-4),
      days: 2,
      type: 'annual',
      reason: 'Summer break',
      status: 'approved',
      approvedBy: 'admin@hotsport.tn',
      approvedAt: daysAgo(1)
    },
    {
      employee: employees[0]._id,
      employeeName: employees[0].name,
      fromDate: daysAgo(3),
      toDate: daysAgo(3),
      days: 1,
      type: 'sick',
      reason: 'Flu',
      status: 'approved',
      approvedBy: 'manager@hotsport.tn',
      approvedAt: daysAgo(3)
    },
    {
      employeeName: users[2].name,
      user: users[2]._id,
      userEmail: users[2].email,
      userRole: 'seller',
      fromDate: daysAgo(-4),
      toDate: daysAgo(-4),
      days: 1,
      type: 'day_off',
      reason: 'Seller day off request',
      status: 'pending'
    },
    {
      employeeName: users[1].name,
      user: users[1]._id,
      userEmail: users[1].email,
      userRole: 'manager',
      fromDate: daysAgo(-10),
      toDate: daysAgo(-7),
      days: 4,
      type: 'holiday',
      reason: 'Manager holiday',
      status: 'pending'
    }
  ]);

  await SalaryAdvance.insertMany([
    {
      user: users[2]._id,
      userName: users[2].name,
      userEmail: users[2].email,
      userRole: 'seller',
      employeeName: users[2].name,
      month: '2026-09',
      amount: 150,
      salaryAmount: 950,
      reason: 'Acompte salaire — frais perso',
      status: 'pending'
    },
    {
      user: users[1]._id,
      userName: users[1].name,
      userEmail: users[1].email,
      userRole: 'manager',
      employeeName: users[1].name,
      month: '2026-09',
      amount: 400,
      salaryAmount: 1800,
      reason: 'Acompte manager',
      status: 'pending'
    }
  ]);

  // Web / WhatsApp commandes (orders) — HotSport store style
  await Order.insertMany([
    {
      orderNo: 'CMD-2026-1042',
      source: 'web',
      customer: customers[2]._id,
      customerName: customers[2].name,
      phone: customers[2].mobile,
      email: customers[2].email,
      address: 'Rue de la Liberté 12',
      city: 'Ariana',
      lines: [
        { product: bySku['HS-MT-PROTECT']._id, sku: 'HS-MT-PROTECT', name: bySku['HS-MT-PROTECT'].name, qty: 1, price: 158, total: 158 },
        { product: bySku['HS-BANDES']._id, sku: 'HS-BANDES', name: bySku['HS-BANDES'].name, qty: 2, price: 18, total: 36 }
      ],
      shippingFee: 8,
      discount: 0,
      totalAmount: 202,
      paidAmount: 0,
      paymentMethod: 'cod',
      paymentStatus: 'unpaid',
      status: 'pending',
      wooOrderId: 5042,
      note: 'Pack promo site hotsport.tn',
      orderedAt: daysAgo(0)
    },
    {
      orderNo: 'CMD-2026-1038',
      source: 'whatsapp',
      customer: customers[3]._id,
      customerName: customers[3].name,
      phone: customers[3].mobile,
      email: customers[3].email,
      address: 'La Marsa, près du marché',
      city: 'Tunis',
      lines: [
        { product: bySku['HS-WOMEN-SET']._id, sku: 'HS-WOMEN-SET', name: bySku['HS-WOMEN-SET'].name, qty: 1, price: 110, total: 110 },
        { product: bySku['HS-SOCKS']._id, sku: 'HS-SOCKS', name: bySku['HS-SOCKS'].name, qty: 1, price: 22, total: 22 }
      ],
      shippingFee: 8,
      totalAmount: 140,
      paidAmount: 140,
      paymentMethod: 'card',
      paymentStatus: 'paid',
      status: 'confirmed',
      note: 'WhatsApp order — size M',
      orderedAt: daysAgo(1)
    },
    {
      orderNo: 'CMD-2026-1029',
      source: 'web',
      customer: customers[1]._id,
      customerName: customers[1].name,
      phone: customers[1].mobile,
      email: customers[1].email,
      address: 'Stade, vestiaires',
      city: 'Tunis',
      lines: [
        { product: bySku['HS-BOX-PACK']._id, sku: 'HS-BOX-PACK', name: bySku['HS-BOX-PACK'].name, qty: 5, price: 118, total: 590 },
        { product: bySku['HS-GLOVES-16']._id, sku: 'HS-GLOVES-16', name: bySku['HS-GLOVES-16'].name, qty: 5, price: 89, total: 445 }
      ],
      shippingFee: 0,
      discount: 40,
      totalAmount: 995,
      paidAmount: 500,
      paymentMethod: 'bank',
      paymentStatus: 'partial',
      status: 'preparing',
      wooOrderId: 5029,
      note: 'Club bulk order',
      orderedAt: daysAgo(2)
    },
    {
      orderNo: 'CMD-2026-1015',
      source: 'phone',
      customer: customers[4]._id,
      customerName: customers[4].name,
      phone: customers[4].mobile,
      address: 'Sfax médina',
      city: 'Sfax',
      lines: [
        { product: bySku['HS-MT-FULL']._id, sku: 'HS-MT-FULL', name: bySku['HS-MT-FULL'].name, qty: 1, price: 249, total: 249 }
      ],
      shippingFee: 8,
      totalAmount: 257,
      paidAmount: 257,
      paymentMethod: 'cod',
      paymentStatus: 'paid',
      status: 'shipped',
      note: 'Livraison Steg',
      orderedAt: daysAgo(4)
    },
    {
      orderNo: 'CMD-2026-1001',
      source: 'shop',
      customer: customers[0]._id,
      customerName: 'Walk-in Cash',
      phone: '',
      address: 'Boutique HotSport',
      city: 'Tunis',
      lines: [
        { product: bySku['HS-MOUTH']._id, sku: 'HS-MOUTH', name: bySku['HS-MOUTH'].name, qty: 2, price: 25, total: 50 }
      ],
      shippingFee: 0,
      totalAmount: 50,
      paidAmount: 50,
      paymentMethod: 'cash',
      paymentStatus: 'paid',
      status: 'delivered',
      orderedAt: daysAgo(6)
    },
    {
      orderNo: 'CMD-2026-0990',
      source: 'web',
      customerName: 'Mehdi Karray',
      phone: '+216 90 111 000',
      email: 'mehdi@demo.tn',
      address: 'Nabeul centre',
      city: 'Nabeul',
      lines: [
        { product: bySku['HS-KARATE-PACK']._id, sku: 'HS-KARATE-PACK', name: bySku['HS-KARATE-PACK'].name, qty: 1, price: 153, total: 153 }
      ],
      shippingFee: 8,
      totalAmount: 161,
      paidAmount: 0,
      paymentMethod: 'cod',
      paymentStatus: 'unpaid',
      status: 'cancelled',
      wooOrderId: 4990,
      note: 'Client annulé — taille indisponible',
      orderedAt: daysAgo(7)
    }
  ]);

  console.log(`Complete HotSport demo seeded: ${products.length} products, purchases, invoices, returns, HRM, accounts, orders.`);
  return {
    seeded: true,
    products: products.length,
    purchases: 3,
    invoices: 5,
    orders: 6,
    customers: customers.length,
    suppliers: suppliers.length
  };
}

if (require.main === module) {
  require('dotenv').config();
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hotsport_stock';
  mongoose.connect(uri)
    .then(() => seed(true))
    .then((r) => { console.log(r); return mongoose.disconnect(); })
    .catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { seed };
