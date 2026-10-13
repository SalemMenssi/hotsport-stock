require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const path = require('path');
const mongoose = require('mongoose');
const { seed } = require('./seed');
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
const { registerExtraRoutes } = require('./extras');
const { registerOpsRoutes, ensureOpsDefaults } = require('./ops');
const { registerPushRoutes, notify } = require('./notify');
const { generateBarcode, normalizeRole, canManageSettings, canApproveHrItem } = require('./roles');
const QRCode = require('qrcode');
const { Caisse, CaisseSession } = require('./models/Caisse');
const Sponsor = require('./models/Sponsor');

const PORT = Number(process.env.PORT) || 3090;
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hotsport_stock';
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';
const SESSION_SECRET = process.env.SESSION_SECRET || 'hotsport-demo-secret-change-me';
const SEED_ON_START = String(process.env.SEED_ON_START ?? 'true').toLowerCase() !== 'false';
const FORCE_SEED = String(process.env.FORCE_SEED || 'false').toLowerCase() === 'true';
const COOKIE_SECURE = process.env.COOKIE_SECURE
  ? String(process.env.COOKIE_SECURE).toLowerCase() === 'true'
  : IS_PROD;

if (IS_PROD && SESSION_SECRET === 'hotsport-demo-secret-change-me') {
  console.warn('[warn] SESSION_SECRET is still the default. Set a strong secret before public deploy.');
}

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(morgan(IS_PROD ? 'combined' : 'dev'));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());
app.use(session({
  name: 'hs.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax',
    secure: COOKIE_SECURE
  }
}));
app.use(express.static(path.join(__dirname, '..', 'public'), {
  setHeaders(res, filePath) {
    if (filePath.endsWith('sw.js')) {
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Service-Worker-Allowed', '/');
    } else if (filePath.endsWith('.webmanifest')) {
      res.setHeader('Content-Type', 'application/manifest+json');
      res.setHeader('Cache-Control', 'no-cache');
    } else if (/\.(css|js)$/.test(filePath)) {
      res.setHeader('Cache-Control', IS_PROD ? 'public, max-age=300' : 'no-cache');
    } else if (/\.(png|jpg|jpeg|webp|svg|ico)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
  }
}));

// Basic security headers for deploy
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=()');
  next();
});

function parseProductParams(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const name = String(row?.name || '').trim();
    const values = Array.isArray(row?.values)
      ? row.values.map((v) => String(v).trim()).filter(Boolean)
      : String(row?.values || row?.value || '').split(/[,;/|]/).map((v) => v.trim()).filter(Boolean);
    return { name, values };
  }).filter((row) => row.name);
}

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ ok: false, message: 'Login required' });
  return res.redirect('/login.html');
}

async function stockSummary() {
  const products = await Product.find({ status: 'active' });
  let low = 0, out = 0, ok = 0, units = 0;
  for (const p of products) {
    units += p.stockQty;
    if (p.stockQty <= 0) out += 1;
    else if (p.stockQty <= p.minStock) low += 1;
    else ok += 1;
  }
  return { totalProducts: products.length, inStock: ok, lowStock: low, outOfStock: out, totalUnits: units };
}

async function dashboardStats() {
  const [products, customers, suppliers, invoices, purchases, employees, orders, stock, openTills, sponsors] = await Promise.all([
    Product.countDocuments({ status: 'active' }),
    Customer.countDocuments(),
    Supplier.countDocuments(),
    Invoice.countDocuments(),
    Purchase.countDocuments(),
    Employee.countDocuments({ status: 'active' }),
    Order.countDocuments(),
    stockSummary(),
    CaisseSession.countDocuments({ status: 'open' }),
    Sponsor.countDocuments()
  ]);
  const salesAgg = await Invoice.aggregate([{ $group: { _id: null, total: { $sum: '$totalAmount' }, paid: { $sum: '$paidAmount' } } }]);
  const purchaseAgg = await Purchase.aggregate([{ $group: { _id: null, total: { $sum: '$grandTotal' } } }]);
  const dueCustomers = await Customer.aggregate([{ $group: { _id: null, total: { $sum: '$balance' } } }]);
  const orderAgg = await Order.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$totalAmount' } } }
  ]);
  const pendingOrders = await Order.countDocuments({ status: { $in: ['pending', 'confirmed', 'preparing'] } });
  const [pendingLeaves, pendingAdvances, caisseCount] = await Promise.all([
    LeaveRequest.countDocuments({ status: 'pending' }),
    SalaryAdvance.countDocuments({ status: 'pending' }),
    Caisse.countDocuments()
  ]);
  return {
    products, customers, suppliers, invoices, purchases, employees, orders, pendingOrders,
    openTills, sponsors, pendingLeaves, pendingAdvances, caisseCount,
    salesTotal: salesAgg[0]?.total || 0,
    salesPaid: salesAgg[0]?.paid || 0,
    purchaseTotal: purchaseAgg[0]?.total || 0,
    customerReceivables: dueCustomers[0]?.total || 0,
    orderStats: orderAgg,
    stock
  };
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    env: NODE_ENV,
    db: mongoose.connection.readyState === 1 ? 'mongodb' : 'down',
    store: 'https://hotsport.tn',
    time: new Date().toISOString()
  });
});

app.post('/api/auth/login', async (req, res) => {
  const user = await User.findOne({ email: (req.body.email || '').toLowerCase() });
  if (!user || !(await user.verifyPassword(req.body.password || ''))) {
    return res.status(401).json({ ok: false, message: 'Incorrect email or password' });
  }
  if (user.active === false) {
    return res.status(403).json({ ok: false, message: 'Account disabled' });
  }
  const role = normalizeRole(user.role);
  req.session.user = {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role,
    defaultCaisse: user.defaultCaisse ? String(user.defaultCaisse) : null
  };
  res.json({ ok: true, user: req.session.user });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/auth/me', (req, res) => res.json({ ok: true, user: req.session.user || null }));

app.get('/api/demo/reset', requireAuth, async (req, res) => {
  if (!canManageSettings(req.session.user.role)) {
    return res.status(403).json({ ok: false, message: 'Admin only' });
  }
  const result = await seed(true);
  res.json({ ok: true, message: 'Complete Inventro-style demo reset for HotSport', result });
});

app.get('/api/dashboard', requireAuth, async (req, res) => {
  const stats = await dashboardStats();
  const [leaveDocs, advanceDocs] = await Promise.all([
    LeaveRequest.find({ status: 'pending' }).sort({ createdAt: -1 }).limit(12),
    SalaryAdvance.find({ status: 'pending' }).sort({ createdAt: -1 }).limit(12)
  ]);
  const actor = req.session.user;
  res.json({
    ok: true,
    stats,
    inbox: {
      leaves: leaveDocs.filter((l) => canApproveHrItem(actor.role, actor.email, l)),
      advances: advanceDocs.filter((a) => canApproveHrItem(actor.role, actor.email, a))
    }
  });
});

app.get('/api/summary', requireAuth, async (_req, res) => {
  res.json({ ok: true, summary: await stockSummary() });
});

app.get('/api/products', requireAuth, async (req, res) => {
  const q = (req.query.q || '').trim();
  const filter = (req.query.filter || 'all').toLowerCase();
  const query = { status: 'active' };
  if (q) {
    query.$or = [
      { name: new RegExp(q, 'i') }, { sku: new RegExp(q, 'i') },
      { barcode: new RegExp(q, 'i') },
      { category: new RegExp(q, 'i') }, { discipline: new RegExp(q, 'i') }
    ];
  }
  if (req.query.category) query.category = req.query.category;
  if (req.query.discipline) query.discipline = req.query.discipline;
  let products = await Product.find(query).sort({ name: 1 }).lean();
  products = products.map((p) => ({
    ...p,
    isLow: p.stockQty <= p.minStock && p.stockQty > 0,
    isOut: p.stockQty <= 0
  }));
  if (filter === 'low') products = products.filter((p) => p.isLow || p.isOut);
  if (filter === 'out') products = products.filter((p) => p.isOut);
  if (filter === 'ok') products = products.filter((p) => !p.isLow && !p.isOut);
  res.json({ ok: true, products, summary: await stockSummary() });
});

app.post('/api/products/:id/adjust', requireAuth, async (req, res) => {
  const qtyChange = Number(req.body.qtyChange);
  if (!Number.isFinite(qtyChange) || qtyChange === 0) {
    return res.status(400).json({ ok: false, message: 'Quantity change required' });
  }
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ ok: false, message: 'Product not found' });
  product.stockQty = Math.max(0, product.stockQty + qtyChange);
  product.lastSyncedAt = new Date();
  await product.save();
  await Adjustment.create({
    product: product._id,
    qtyChange,
    reason: req.body.reason || 'Manual adjust',
    note: req.body.note || '',
    source: req.body.source || 'manual',
    stockAfter: product.stockQty,
    createdBy: req.session.user.email
  });
  res.json({
    ok: true,
    message: 'Stock updated',
    product,
    isLow: product.stockQty <= product.minStock,
    woo: { ok: true, demo: true, message: `Demo sync qty ${product.stockQty} → hotsport.tn` },
    summary: await stockSummary()
  });
});

app.get('/api/history', requireAuth, async (_req, res) => {
  const history = await Adjustment.find().sort({ createdAt: -1 }).limit(40).populate('product', 'name sku').lean();
  res.json({ ok: true, history });
});

app.get('/api/customers', requireAuth, async (_req, res) => {
  res.json({ ok: true, customers: await Customer.find().sort({ name: 1 }) });
});

app.get('/api/suppliers', requireAuth, async (_req, res) => {
  res.json({ ok: true, suppliers: await Supplier.find().sort({ name: 1 }) });
});

app.get('/api/categories', requireAuth, async (_req, res) => {
  res.json({ ok: true, categories: await Category.find().sort({ name: 1 }), units: await Unit.find() });
});

app.get('/api/banks', requireAuth, async (_req, res) => {
  res.json({ ok: true, banks: await Bank.find().sort({ name: 1 }) });
});

app.get('/api/purchases', requireAuth, async (_req, res) => {
  res.json({ ok: true, purchases: await Purchase.find().sort({ date: -1 }) });
});

app.get('/api/invoices', requireAuth, async (req, res) => {
  const q = {};
  if (req.query.source) q.source = req.query.source;
  res.json({ ok: true, invoices: await Invoice.find(q).sort({ date: -1 }) });
});

app.post('/api/invoices/pos-legacy-disabled', requireAuth, async (_req, res) => {
  res.status(410).json({ ok: false, message: 'Use /api/invoices/pos via extras' });
});

app.get('/api/returns', requireAuth, async (_req, res) => {
  res.json({ ok: true, returns: await ReturnDoc.find().sort({ date: -1 }) });
});

app.get('/api/transactions', requireAuth, async (_req, res) => {
  res.json({ ok: true, transactions: await Transaction.find().sort({ date: -1 }) });
});

app.get('/api/closings', requireAuth, async (_req, res) => {
  res.json({ ok: true, closings: await Closing.find().sort({ date: -1 }) });
});

app.get('/api/hrm-legacy', requireAuth, async (_req, res) => {
  res.status(410).json({ ok: false, message: 'Use /api/hrm' });
});

app.get('/api/reports/overview', requireAuth, async (_req, res) => {
  const [sales, purchases, cashTx, bankTx, lowStock] = await Promise.all([
    Invoice.find().sort({ date: -1 }).limit(20),
    Purchase.find().sort({ date: -1 }).limit(20),
    Transaction.find({ mode: 'cash' }).sort({ date: -1 }).limit(20),
    Transaction.find({ mode: 'bank' }).sort({ date: -1 }).limit(20),
    Product.find({ status: 'active' }).then((list) => list.filter((p) => p.stockQty <= p.minStock))
  ]);
  res.json({
    ok: true,
    salesReport: sales,
    purchaseReport: purchases,
    cashBook: cashTx,
    bankBook: bankTx,
    lowStock
  });
});

app.get('/api/settings', requireAuth, async (_req, res) => {
  res.json({ ok: true, settings: await Settings.findOne({ key: 'hotsport' }) });
});

app.post('/api/settings', requireAuth, async (req, res) => {
  if (!canManageSettings(req.session.user.role)) {
    return res.status(403).json({ ok: false, message: 'Admin only' });
  }
  const settings = await Settings.findOneAndUpdate(
    { key: 'hotsport' },
    {
      storeUrl: req.body.storeUrl || 'https://hotsport.tn',
      consumerKey: req.body.consumerKey || '',
      consumerSecret: req.body.consumerSecret || '',
      autoSync: !!req.body.autoSync,
      syncDirection: req.body.syncDirection || 'both',
      lowStockThreshold: Number(req.body.lowStockThreshold) || 5
    },
    { new: true, upsert: true }
  );
  res.json({ ok: true, settings, message: 'Paramètres HotSport enregistrés' });
});

app.post('/api/woo/test', requireAuth, async (_req, res) => {
  res.json({ ok: true, demo: true, message: 'Demo mode OK — add live Woo keys to sync hotsport.tn' });
});

// ---- Products CRUD ----
app.post('/api/products', requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.name) return res.status(400).json({ ok: false, message: 'Name required' });
    const sku = body.sku || `HS-${Date.now().toString().slice(-8)}`;
    const product = await Product.create({
      sku,
      name: body.name,
      category: body.category || 'Pack',
      discipline: body.discipline || 'sport',
      description: body.description || '',
      priceTnd: Number(body.priceTnd) || 0,
      costTnd: Number(body.costTnd) || 0,
      stockQty: Number(body.stockQty) || 0,
      minStock: Number(body.minStock) || 5,
      imageEmoji: body.imageEmoji || '📦',
      imageUrl: body.imageUrl || '',
      barcode: body.barcode || generateBarcode(sku || body.wooProductId || Date.now()),
      wooProductId: body.wooProductId ? Number(body.wooProductId) : null,
      tags: body.tags || [],
      params: parseProductParams(body.params),
      status: 'active'
    });
    res.json({ ok: true, product, message: 'Product created' });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message });
  }
});

app.get('/api/products/:id/qr', requireAuth, async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ ok: false, message: 'Not found' });
  const payload = String(product.barcode || product.sku);
  const png = await QRCode.toBuffer(payload, { type: 'png', width: 280, margin: 1, errorCorrectionLevel: 'M' });
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.send(png);
});

app.put('/api/products/:id', requireAuth, async (req, res) => {
  const body = req.body || {};
  const product = await Product.findByIdAndUpdate(
    req.params.id,
    {
      name: body.name,
      category: body.category,
      discipline: body.discipline,
      description: body.description,
      priceTnd: Number(body.priceTnd),
      costTnd: Number(body.costTnd),
      stockQty: Number(body.stockQty),
      minStock: Number(body.minStock),
      imageEmoji: body.imageEmoji,
      imageUrl: body.imageUrl,
      barcode: body.barcode || undefined,
      wooProductId: body.wooProductId ? Number(body.wooProductId) : null,
      params: parseProductParams(body.params),
      status: body.status || 'active'
    },
    { new: true }
  );
  if (!product) return res.status(404).json({ ok: false, message: 'Not found' });
  res.json({ ok: true, product, message: 'Product updated' });
});

app.delete('/api/products/:id', requireAuth, async (req, res) => {
  const product = await Product.findByIdAndUpdate(req.params.id, { status: 'archived' }, { new: true });
  res.json({ ok: true, product, message: 'Product archived' });
});

// ---- Customers CRUD ----
app.post('/api/customers', requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const customer = await Customer.create({
      code: body.code || `CUS-${Date.now().toString().slice(-5)}`,
      name: body.name,
      mobile: body.mobile || '',
      email: body.email || '',
      address: body.address || '',
      balance: Number(body.balance) || 0
    });
    res.json({ ok: true, customer, message: 'Customer created' });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message });
  }
});

app.put('/api/customers/:id', requireAuth, async (req, res) => {
  const body = req.body || {};
  const customer = await Customer.findByIdAndUpdate(
    req.params.id,
    { name: body.name, mobile: body.mobile, email: body.email, address: body.address, balance: Number(body.balance) || 0 },
    { new: true }
  );
  res.json({ ok: true, customer, message: 'Customer updated' });
});

// ---- Orders / Commandes ----
app.get('/api/orders', requireAuth, async (req, res) => {
  const q = {};
  if (req.query.status) q.status = req.query.status;
  if (req.query.source) q.source = req.query.source;
  if (req.query.q) {
    const s = new RegExp(req.query.q, 'i');
    q.$or = [{ orderNo: s }, { customerName: s }, { phone: s }, { city: s }];
  }
  const orders = await Order.find(q).sort({ orderedAt: -1 });
  res.json({ ok: true, orders });
});

app.get('/api/orders/:id', requireAuth, async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ ok: false, message: 'Order not found' });
  res.json({ ok: true, order });
});

app.post('/api/orders', requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const lines = (body.lines || []).map((l) => ({
      product: l.product || undefined,
      sku: l.sku,
      name: l.name,
      qty: Number(l.qty) || 1,
      price: Number(l.price) || 0,
      total: (Number(l.qty) || 1) * (Number(l.price) || 0)
    }));
    const subtotal = lines.reduce((s, l) => s + l.total, 0);
    const shippingFee = Number(body.shippingFee ?? 8);
    const discount = Number(body.discount) || 0;
    const totalAmount = subtotal + shippingFee - discount;
    const order = await Order.create({
      orderNo: body.orderNo || `CMD-${Date.now()}`,
      source: body.source || 'shop',
      customerName: body.customerName,
      phone: body.phone || '',
      email: body.email || '',
      address: body.address || '',
      city: body.city || 'Tunis',
      lines,
      shippingFee,
      discount,
      totalAmount,
      paidAmount: Number(body.paidAmount) || 0,
      paymentMethod: body.paymentMethod || 'cod',
      paymentStatus: body.paymentStatus || 'unpaid',
      status: body.status || 'pending',
      note: body.note || ''
    });

    // Deduct stock when confirmed/preparing
    if (['confirmed', 'preparing', 'shipped', 'delivered'].includes(order.status)) {
      for (const line of lines) {
        if (!line.sku) continue;
        const product = await Product.findOne({ sku: line.sku });
        if (product) {
          product.stockQty = Math.max(0, product.stockQty - line.qty);
          await product.save();
        }
      }
    }

    res.json({ ok: true, order, message: 'Commande créée' });
    notify({
      title: 'New order',
      body: `${order.orderNo} · ${order.customerName} · ${Number(order.totalAmount).toFixed(3)} TND`,
      url: '/app.html#orders',
      roles: ['admin', 'manager']
    }).catch(() => {});
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message });
  }
});

app.patch('/api/orders/:id/status', requireAuth, async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ ok: false, message: 'Not found' });
  const prev = order.status;
  order.status = req.body.status || order.status;
  if (req.body.paymentStatus) order.paymentStatus = req.body.paymentStatus;
  if (req.body.paidAmount != null) order.paidAmount = Number(req.body.paidAmount);
  await order.save();

  // Deduct stock when moving from pending to confirmed+
  const deductFrom = ['pending', 'cancelled'];
  const deductTo = ['confirmed', 'preparing', 'shipped', 'delivered'];
  if (deductFrom.includes(prev) && deductTo.includes(order.status)) {
    for (const line of order.lines) {
      const product = line.product
        ? await Product.findById(line.product)
        : await Product.findOne({ sku: line.sku });
      if (product) {
        product.stockQty = Math.max(0, product.stockQty - line.qty);
        await product.save();
        await Adjustment.create({
          product: product._id,
          qtyChange: -line.qty,
          reason: 'Commande ' + order.orderNo,
          note: order.status,
          source: 'order',
          stockAfter: product.stockQty,
          createdBy: req.session.user.email
        });
      }
    }
  }
  res.json({ ok: true, order, message: 'Statut commande mis à jour' });
});

app.get('/', (req, res) => res.redirect(req.session.user ? '/app.html' : '/login.html'));
app.get('/app.html', requireAuth, (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'app.html'));
});

registerExtraRoutes(app, requireAuth);
registerOpsRoutes(app, requireAuth);
registerPushRoutes(app, requireAuth);

// 404 API fallback
app.use('/api', (_req, res) => {
  res.status(404).json({ ok: false, message: 'API route not found' });
});

async function start() {
  console.log(`Starting HotSport Inventory (${NODE_ENV})…`);
  await mongoose.connect(MONGODB_URI);
  console.log('MongoDB connected');

  if (FORCE_SEED) {
    await seed(true);
    console.log('Forced seed complete');
  } else if (SEED_ON_START) {
    await seed(false);
  }

  await ensureOpsDefaults();
  const missingCodes = await Product.find({ $or: [{ barcode: { $exists: false } }, { barcode: null }, { barcode: '' }] });
  for (const p of missingCodes) {
    p.barcode = generateBarcode(p.sku || p._id);
    await p.save();
  }

  const server = app.listen(PORT, HOST, () => {
    const base = process.env.APP_URL || `http://${HOST === '0.0.0.0' ? '127.0.0.1' : HOST}:${PORT}`;
    console.log(`HotSport Inventory listening on ${HOST}:${PORT}`);
    console.log(`Open ${base}/login.html`);
    if (!IS_PROD) {
      console.log('Admin:   admin@hotsport.tn / admin123');
      console.log('Manager: manager@hotsport.tn / manager123');
      console.log('Seller:  seller@hotsport.tn / seller123');
    }
  });

  const shutdown = (signal) => {
    console.log(`${signal} received — shutting down`);
    server.close(async () => {
      try { await mongoose.connection.close(); } catch (_) {}
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
