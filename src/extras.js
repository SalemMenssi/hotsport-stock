const mongoose = require('mongoose');
const {
  modulesForRole,
  normalizeRole,
  permissionsForRole,
  canApproveHrItem,
  generateBarcode,
  toCsv
} = require('./roles');
const Product = require('./models/Product');
const Adjustment = require('./models/Adjustment');
const {
  Customer, Employee, Attendance, Salary, LeaveRequest, SalaryAdvance, Invoice, Transaction, Purchase, Supplier
} = require('./models/Inventory');
const { attachPosSale, findOpenSession, ensureTill } = require('./ops');
const { notify } = require('./notify');

function requireRole(...roles) {
  const allowed = roles.map(normalizeRole);
  return (req, res, next) => {
    const role = normalizeRole(req.session?.user?.role);
    if (!allowed.includes(role)) {
      return res.status(403).json({ ok: false, message: 'Permission denied' });
    }
    return next();
  };
}

async function staffProfile(sessionUser) {
  if (!sessionUser?.email) return null;
  let emp = await Employee.findOne({ email: sessionUser.email });
  if (emp) return emp;
  const role = normalizeRole(sessionUser.role);
  emp = await Employee.create({
    code: `EMP-${role.slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-4)}`,
    name: sessionUser.name,
    email: sessionUser.email,
    department: role === 'manager' ? 'Management' : 'Sales',
    designation: role,
    salary: role === 'manager' ? 1800 : 950,
    status: 'active'
  });
  return emp;
}

function monthKey(value) {
  if (value && /^\d{4}-\d{2}$/.test(String(value))) return String(value);
  return new Date().toISOString().slice(0, 7);
}

async function salarySnapshot(emp, month) {
  const row = await Salary.findOne({ employee: emp._id, month });
  const base = Number(row?.amount || emp.salary || 0);
  const taken = await SalaryAdvance.aggregate([
    {
      $match: {
        employee: emp._id,
        month,
        status: { $in: ['pending', 'approved', 'paid'] }
      }
    },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  const used = taken[0]?.total || 0;
  return { base, used, remaining: Math.max(0, base - used), salaryRow: row };
}

async function findProductByCode(code) {
  const raw = String(code || '').trim();
  if (!raw) return null;
  let q = raw;
  try {
    if (/^https?:\/\//i.test(raw)) {
      const u = new URL(raw);
      q = u.searchParams.get('code') || u.searchParams.get('barcode') || u.searchParams.get('sku')
        || u.pathname.split('/').filter(Boolean).pop() || raw;
    }
  } catch (_) {}
  q = String(q).trim();
  const compact = q.replace(/\s+/g, '');
  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hs = compact.match(/HS[A-Z0-9]+/i);
  const candidates = [...new Set([
    q, compact, q.toUpperCase(), compact.toUpperCase(),
    hs?.[0], hs?.[0]?.toUpperCase()
  ].filter(Boolean))];
  const ors = [
    { barcode: { $in: candidates } },
    { sku: { $in: candidates } },
    { barcode: { $regex: `^${escapeRegex(compact)}$`, $options: 'i' } },
    { sku: { $regex: `^${escapeRegex(compact)}$`, $options: 'i' } }
  ];
  for (const c of candidates) {
    if (mongoose.isValidObjectId(c)) ors.push({ _id: c });
  }
  return Product.findOne({ status: 'active', $or: ors });
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

function registerExtraRoutes(app, requireAuth) {
  app.get('/api/modules', requireAuth, (req, res) => {
    const role = normalizeRole(req.session.user.role);
    res.json({
      ok: true,
      role,
      modules: modulesForRole(role),
      permissions: permissionsForRole(role)
    });
  });

  app.get('/api/products/lookup', requireAuth, async (req, res) => {
    const product = await findProductByCode(req.query.code || req.query.barcode || req.query.sku);
    if (!product) return res.status(404).json({ ok: false, message: 'Product not found' });
    res.json({ ok: true, product });
  });

  app.post('/api/stock/receive', requireAuth, async (req, res) => {
    const { barcode, name, qty, category, priceTnd, costTnd } = req.body || {};
    const quantity = Math.max(1, Number(qty) || 1);
    let product = await findProductByCode(barcode);

    if (!product) {
      if (!name) {
        return res.status(400).json({ ok: false, message: 'Name required for new product' });
      }
      const code = (barcode && String(barcode).trim()) || generateBarcode(Date.now());
      const sku = `HS-${Date.now().toString().slice(-8)}`;
      product = await Product.create({
        sku,
        barcode: code,
        name: String(name).trim(),
        category: category || 'Pack',
        discipline: category || 'sport',
        priceTnd: Number(priceTnd) || 0,
        costTnd: Number(costTnd) || 0,
        stockQty: 0,
        minStock: 5,
        imageEmoji: '📦',
        status: 'active',
        tags: ['manual']
      });
    }

    product.stockQty += quantity;
    if (!product.barcode) {
      product.barcode = generateBarcode(product.wooProductId || product._id);
    }
    await product.save();

    await Adjustment.create({
      product: product._id,
      qtyChange: quantity,
      reason: 'Received stock',
      note: `Barcode receive ${product.barcode}`,
      source: 'barcode',
      stockAfter: product.stockQty,
      createdBy: req.session.user.email
    });

    res.json({
      ok: true,
      product,
      summary: await stockSummary(),
      message: `+${quantity} added · barcode ${product.barcode}`
    });
  });

  app.post('/api/invoices/pos', requireAuth, async (req, res) => {
    const body = req.body || {};
    let wanted = [];
    if (Array.isArray(body.lines) && body.lines.length) {
      wanted = body.lines;
    } else {
      wanted = [{ productId: body.productId, barcode: body.barcode, qty: body.qty || 1 }];
    }

    const prepared = [];
    for (const line of wanted) {
      let product = null;
      if (line.productId) product = await Product.findById(line.productId);
      else if (line.barcode) product = await findProductByCode(line.barcode);
      if (!product) return res.status(404).json({ ok: false, message: 'Product not found' });
      const quantity = Math.max(1, Number(line.qty) || 1);
      if (product.stockQty < quantity) {
        return res.status(400).json({ ok: false, message: `Insufficient stock · ${product.name}` });
      }
      prepared.push({
        product,
        quantity,
        total: product.priceTnd * quantity,
        variant: String(line.variant || '').trim()
      });
    }
    if (!prepared.length) return res.status(400).json({ ok: false, message: 'No products' });

    const tillOpen = await ensureTill(req);
    if (!tillOpen) {
      return res.status(400).json({ ok: false, message: 'No caisse available', code: 'NO_CAISSE' });
    }
    req.body.sessionId = String(tillOpen._id);
    req.body.caisseId = String(tillOpen.caisse);

    let customer = null;
    if (body.customerId) customer = await Customer.findById(body.customerId);
    if (!customer) customer = await Customer.findOne({ code: 'CUS-WALK' });

    const invoiceLines = [];
    let total = 0;
    for (const row of prepared) {
      row.product.stockQty -= row.quantity;
      await row.product.save();
      invoiceLines.push({
        product: row.product._id,
        sku: row.product.sku,
        name: row.variant ? `${row.product.name} · ${row.variant}` : row.product.name,
        qty: row.quantity,
        price: row.product.priceTnd,
        discount: 0,
        total: row.total
      });
      total += row.total;
      await Adjustment.create({
        product: row.product._id,
        qtyChange: -row.quantity,
        reason: 'Sold offline',
        note: `POS · ${row.product.barcode || row.product.sku}`,
        source: 'pos',
        stockAfter: row.product.stockQty,
        createdBy: req.session.user.email
      });
    }

    const invoice = await Invoice.create({
      invoiceNo: `POS-${Date.now()}`,
      customer: customer?._id,
      customerName: customer?.name || body.customerName || 'Walk-in Cash',
      source: 'pos',
      lines: invoiceLines,
      totalAmount: total,
      paidAmount: total,
      dueAmount: 0,
      paymentMethod: body.paymentMethod || 'cash',
      status: 'delivered',
      note: `POS · ${req.session.user.name}`
    });

    await Transaction.create({
      txnNo: `TXN-POS-${Date.now()}`,
      type: 'receive',
      category: 'pos',
      mode: body.paymentMethod || 'cash',
      partyType: 'customer',
      partyName: invoice.customerName,
      amount: total,
      description: invoice.invoiceNo
    });

    const till = await attachPosSale(req, { invoice, total });
    if (!till.ok) return res.status(till.status || 400).json(till);

    notify({
      title: 'New POS sale',
      body: `${invoice.invoiceNo} · ${invoice.customerName} · ${total.toFixed(3)} TND`,
      url: '/app.html#invoices',
      roles: ['admin', 'manager']
    }).catch(() => {});

    res.json({
      ok: true,
      invoice,
      product: prepared[0].product,
      session: till.session,
      receipt: {
        invoiceNo: invoice.invoiceNo,
        seller: req.session.user.name,
        role: req.session.user.role,
        date: invoice.date,
        items: invoice.lines,
        total: invoice.totalAmount,
        customer: invoice.customerName,
        barcode: prepared.map((p) => p.product.barcode).filter(Boolean).join(' · '),
        paymentMethod: invoice.paymentMethod,
        caisse: till.session.caisseName,
        caisseCode: till.session.caisseCode
      },
      summary: await stockSummary(),
      message: `Sold ${invoiceLines.length} line(s) · ${total.toFixed(3)} TND`
    });
  });

  app.get('/api/hrm', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
    const [employees, departments, designations, attendance, salaries, leaves, advances] = await Promise.all([
      Employee.find().sort({ name: 1 }),
      require('./models/Inventory').Department.find(),
      require('./models/Inventory').Designation.find(),
      Attendance.find().sort({ date: -1 }).limit(60),
      Salary.find().sort({ month: -1 }),
      LeaveRequest.find().sort({ createdAt: -1 }).limit(80),
      SalaryAdvance.find().sort({ createdAt: -1 }).limit(80)
    ]);
    const actor = req.session.user;
    const pendingLeaves = leaves.filter((l) => l.status === 'pending');
    const pendingAdvances = advances.filter((a) => a.status === 'pending');
    res.json({
      ok: true,
      employees,
      departments,
      designations,
      attendance,
      salaries,
      leaves,
      advances,
      inbox: {
        leaves: pendingLeaves.filter((l) => canApproveHrItem(actor.role, actor.email, l)),
        advances: pendingAdvances.filter((a) => canApproveHrItem(actor.role, actor.email, a))
      }
    });
  });

  app.get('/api/hrm/me', requireAuth, async (req, res) => {
    const role = normalizeRole(req.session.user.role);
    if (!['seller', 'manager', 'admin'].includes(role)) {
      return res.status(403).json({ ok: false, message: 'Permission denied' });
    }
    const emp = await staffProfile(req.session.user);
    const month = monthKey(req.query.month);
    const snap = await salarySnapshot(emp, month);
    const [leaves, advances] = await Promise.all([
      LeaveRequest.find({
        $or: [{ user: req.session.user.id }, { userEmail: req.session.user.email }, { employee: emp._id }]
      }).sort({ createdAt: -1 }).limit(40),
      SalaryAdvance.find({ user: req.session.user.id }).sort({ createdAt: -1 }).limit(40)
    ]);
    res.json({
      ok: true,
      employee: emp,
      month,
      salary: snap,
      leaves,
      advances
    });
  });

  app.post('/api/hrm/attendance', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
    const { employeeId, date, inTime, outTime, stayHours } = req.body || {};
    const emp = await Employee.findById(employeeId);
    if (!emp) return res.status(404).json({ ok: false, message: 'Employee not found' });
    const row = await Attendance.create({
      employee: emp._id,
      employeeName: emp.name,
      date: date ? new Date(date) : new Date(),
      inTime: inTime || '09:00',
      outTime: outTime || '17:00',
      stayHours: Number(stayHours) || 8
    });
    res.json({ ok: true, attendance: row, message: 'Presence recorded' });
  });

  app.post('/api/hrm/leaves', requireAuth, async (req, res) => {
    const role = normalizeRole(req.session.user.role);
    if (!['admin', 'manager', 'seller'].includes(role)) {
      return res.status(403).json({ ok: false, message: 'Permission denied' });
    }
    const { employeeId, fromDate, toDate, type, reason, days } = req.body || {};
    let emp = null;
    let self = true;
    if (employeeId && ['admin', 'manager'].includes(role)) {
      emp = await Employee.findById(employeeId);
      self = false;
    } else {
      emp = await staffProfile(req.session.user);
    }
    if (!emp) return res.status(404).json({ ok: false, message: 'Employee not found' });
    if (!fromDate) return res.status(400).json({ ok: false, message: 'From date required' });
    const from = new Date(fromDate);
    const to = new Date(toDate || fromDate);
    const leave = await LeaveRequest.create({
      employee: emp._id,
      employeeName: emp.name,
      user: self ? req.session.user.id : undefined,
      userEmail: self ? req.session.user.email : emp.email,
      userRole: self ? role : (emp.designation || 'seller'),
      fromDate: from,
      toDate: to,
      days: Number(days) || Math.max(1, Math.round((to - from) / 86400000) + 1),
      type: type || 'day_off',
      reason: reason || '',
      status: 'pending'
    });
    res.json({ ok: true, leave, message: 'Request sent to manager / admin' });
    notify({
      title: 'Day-off / holiday request',
      body: `${leave.employeeName} · ${leave.type} · ${leave.days}d`,
      url: '/app.html#hrm',
      roles: ['admin', 'manager']
    }).catch(() => {});
  });

  app.patch('/api/hrm/leaves/:id', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
    const status = req.body?.status;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ ok: false, message: 'status must be approved or rejected' });
    }
    const leave = await LeaveRequest.findById(req.params.id);
    if (!leave) return res.status(404).json({ ok: false, message: 'Leave not found' });
    if (!canApproveHrItem(req.session.user.role, req.session.user.email, leave)) {
      return res.status(403).json({ ok: false, message: 'Only admin can approve this request' });
    }
    leave.status = status;
    leave.approvedBy = req.session.user.email;
    leave.approvedAt = new Date();
    leave.note = req.body?.note || '';
    await leave.save();
    res.json({ ok: true, leave, message: `Day-off ${status}` });
  });

  app.post('/api/hrm/advances', requireAuth, requireRole('manager', 'seller'), async (req, res) => {
    const emp = await staffProfile(req.session.user);
    const month = monthKey(req.body?.month);
    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ ok: false, message: 'Amount required' });
    }
    const snap = await salarySnapshot(emp, month);
    if (amount > snap.remaining) {
      return res.status(400).json({ ok: false, message: `Max available on salary: ${snap.remaining.toFixed(3)} TND` });
    }
    const advance = await SalaryAdvance.create({
      user: req.session.user.id,
      userName: req.session.user.name,
      userEmail: req.session.user.email,
      userRole: normalizeRole(req.session.user.role),
      employee: emp._id,
      employeeName: emp.name,
      month,
      amount,
      salaryAmount: snap.base,
      reason: req.body?.reason || 'Acompte sur salaire',
      status: 'pending'
    });
    res.json({ ok: true, advance, salary: await salarySnapshot(emp, month), message: 'Salary account request sent' });
    notify({
      title: 'Salary account request',
      body: `${advance.userName} · ${Number(advance.amount).toFixed(3)} TND`,
      url: '/app.html#hrm',
      roles: ['admin', 'manager']
    }).catch(() => {});
  });

  app.patch('/api/hrm/advances/:id', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
    const status = req.body?.status;
    if (!['approved', 'rejected', 'paid'].includes(status)) {
      return res.status(400).json({ ok: false, message: 'Invalid status' });
    }
    const advance = await SalaryAdvance.findById(req.params.id);
    if (!advance) return res.status(404).json({ ok: false, message: 'Request not found' });
    if (!canApproveHrItem(req.session.user.role, req.session.user.email, advance)) {
      return res.status(403).json({ ok: false, message: 'Only admin can approve this request' });
    }
    advance.status = status;
    advance.approvedBy = req.session.user.email;
    advance.approvedAt = new Date();
    advance.note = req.body?.note || '';
    if (status === 'paid') advance.paidAt = new Date();
    await advance.save();
    res.json({ ok: true, advance, message: `Salary account ${status}` });
  });

  app.patch('/api/hrm/salaries/:id', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
    const status = req.body?.status;
    if (!['approved', 'paid', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ ok: false, message: 'Invalid salary status' });
    }
    const update = {
      status,
      approvedBy: req.session.user.email,
      approvedAt: new Date(),
      note: req.body?.note || ''
    };
    if (status === 'paid') {
      update.paidAt = new Date();
      const sal = await Salary.findById(req.params.id);
      if (sal) update.paidAmount = sal.amount;
    }
    const salary = await Salary.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!salary) return res.status(404).json({ ok: false, message: 'Salary not found' });
    res.json({ ok: true, salary, message: `Salary ${status}` });
  });

  app.get('/api/calendar', requireAuth, async (req, res) => {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const start = new Date(`${month}-01T00:00:00`);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    const [attendance, leaves] = await Promise.all([
      Attendance.find({ date: { $gte: start, $lt: end } }).sort({ date: 1 }),
      LeaveRequest.find({
        $or: [
          { fromDate: { $gte: start, $lt: end } },
          { toDate: { $gte: start, $lt: end } }
        ]
      }).sort({ fromDate: 1 })
    ]);
    const events = [
      ...attendance.map((a) => ({
        id: a._id,
        type: 'presence',
        title: a.employeeName,
        date: a.date,
        meta: `${a.inTime || ''}–${a.outTime || ''}`
      })),
      ...leaves.map((l) => ({
        id: l._id,
        type: 'leave',
        title: l.employeeName,
        date: l.fromDate,
        end: l.toDate,
        status: l.status,
        meta: `${l.type} · ${l.status}`
      }))
    ];
    res.json({ ok: true, month, events, attendance, leaves });
  });

  app.get('/api/export/products', requireAuth, async (_req, res) => {
    const products = await Product.find({ status: 'active' }).sort({ name: 1 });
    const csv = toCsv(products.map((p) => ({
      sku: p.sku,
      barcode: p.barcode || '',
      name: p.name,
      category: p.category,
      discipline: p.discipline,
      priceTnd: p.priceTnd,
      costTnd: p.costTnd,
      stockQty: p.stockQty,
      minStock: p.minStock,
      imageUrl: p.imageUrl || ''
    })), ['sku', 'barcode', 'name', 'category', 'discipline', 'priceTnd', 'costTnd', 'stockQty', 'minStock', 'imageUrl']);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="hotsport-products.csv"');
    res.send(csv);
  });

  app.get('/api/export/invoices', requireAuth, async (_req, res) => {
    const invoices = await Invoice.find().sort({ date: -1 }).limit(500);
    const csv = toCsv(invoices.map((i) => ({
      invoiceNo: i.invoiceNo,
      customerName: i.customerName,
      source: i.source,
      totalAmount: i.totalAmount,
      paidAmount: i.paidAmount,
      status: i.status,
      date: i.date?.toISOString?.() || i.date
    })), ['invoiceNo', 'customerName', 'source', 'totalAmount', 'paidAmount', 'status', 'date']);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="hotsport-invoices.csv"');
    res.send(csv);
  });

  app.post('/api/import/products', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
    const rows = Array.isArray(req.body?.products) ? req.body.products : [];
    if (!rows.length) return res.status(400).json({ ok: false, message: 'No products to import' });
    let created = 0;
    let updated = 0;
    for (const row of rows) {
      const sku = String(row.sku || '').trim();
      if (!sku || !row.name) continue;
      const existing = await Product.findOne({ sku });
      const barcode = row.barcode || generateBarcode(sku);
      if (existing) {
        existing.name = row.name;
        existing.category = row.category || existing.category;
        existing.priceTnd = Number(row.priceTnd ?? existing.priceTnd);
        existing.costTnd = Number(row.costTnd ?? existing.costTnd);
        existing.stockQty = Number(row.stockQty ?? existing.stockQty);
        existing.minStock = Number(row.minStock ?? existing.minStock);
        existing.barcode = barcode;
        if (row.imageUrl) existing.imageUrl = row.imageUrl;
        await existing.save();
        updated += 1;
      } else {
        await Product.create({
          sku,
          barcode,
          name: row.name,
          category: row.category || 'Pack',
          discipline: row.discipline || row.category || 'sport',
          priceTnd: Number(row.priceTnd) || 0,
          costTnd: Number(row.costTnd) || 0,
          stockQty: Number(row.stockQty) || 0,
          minStock: Number(row.minStock) || 5,
          imageUrl: row.imageUrl || '',
          imageEmoji: '📦',
          status: 'active',
          tags: ['import']
        });
        created += 1;
      }
    }
    res.json({ ok: true, created, updated, message: `Import done · ${created} created · ${updated} updated` });
  });

  async function buildPurchaseLines(rawLines) {
    const lines = [];
    for (const row of rawLines || []) {
      const id = row.productId || row.product;
      const product = id
        ? await Product.findById(id)
        : await findProductByCode(row.sku || row.barcode);
      if (!product) continue;
      const qty = Math.max(1, Number(row.qty) || 1);
      const rate = Number(row.rate ?? row.costTnd ?? product.costTnd) || 0;
      lines.push({
        product: product._id,
        sku: product.sku,
        name: product.name,
        qty,
        rate,
        total: qty * rate
      });
    }
    return lines;
  }

  function purchaseAffectsStock(status) {
    return String(status || 'received') === 'received';
  }

  async function applyPurchaseStock(lines, sign, note, email) {
    for (const line of lines || []) {
      const qty = Math.max(0, Number(line.qty) || 0);
      if (!line.product || !qty) continue;
      const product = await Product.findById(line.product);
      if (!product) continue;
      product.stockQty = Math.max(0, Number(product.stockQty || 0) + (sign * qty));
      if (sign > 0 && Number(line.rate) > 0) product.costTnd = Number(line.rate);
      await product.save();
      await Adjustment.create({
        product: product._id,
        qtyChange: sign * qty,
        reason: sign > 0 ? 'Purchase received' : 'Purchase reversed',
        note: note || product.sku,
        source: 'purchase',
        stockAfter: product.stockQty,
        createdBy: email || 'app'
      });
    }
  }

  async function savePurchasePayload(body, existing) {
    const supplier = body.supplierId ? await Supplier.findById(body.supplierId) : null;
    const lines = await buildPurchaseLines(body.lines);
    if (!lines.length) return { error: 'Add at least one product line' };
    const discount = Number(body.discount) || 0;
    const subtotal = lines.reduce((s, l) => s + l.total, 0);
    const grandTotal = Math.max(0, subtotal - discount);
    const paidAmount = Number(body.paidAmount) || 0;
    const status = body.status || 'received';
    return {
      supplier: supplier?._id || existing?.supplier || null,
      supplierName: supplier?.name || body.supplierName || existing?.supplierName || '',
      date: body.date ? new Date(body.date) : (existing?.date || new Date()),
      lines,
      discount,
      grandTotal,
      paidAmount,
      dueAmount: Math.max(0, grandTotal - paidAmount),
      paymentType: body.paymentType || 'cash',
      bankName: body.bankName || '',
      note: body.note || '',
      status
    };
  }

  app.post('/api/purchases', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
    try {
      const payload = await savePurchasePayload(req.body || {}, null);
      if (payload.error) return res.status(400).json({ ok: false, message: payload.error });
      payload.purchaseNo = `PO-${Date.now()}`;
      const purchase = await Purchase.create(payload);
      if (purchaseAffectsStock(purchase.status)) {
        await applyPurchaseStock(purchase.lines, 1, purchase.purchaseNo, req.session.user.email);
      }
      notify({
        title: 'Achat',
        body: `${purchase.purchaseNo} · ${purchase.supplierName} · ${Number(purchase.grandTotal).toFixed(3)} TND`,
        url: '/app.html#purchases',
        roles: ['admin', 'manager']
      }).catch(() => {});
      res.json({ ok: true, purchase, message: 'Purchase created' });
    } catch (err) {
      res.status(400).json({ ok: false, message: err.message });
    }
  });

  app.put('/api/purchases/:id', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
    try {
      const purchase = await Purchase.findById(req.params.id);
      if (!purchase) return res.status(404).json({ ok: false, message: 'Not found' });
      const wasStock = purchaseAffectsStock(purchase.status);
      const oldLines = (purchase.lines || []).map((l) => l.toObject?.() || l);
      const payload = await savePurchasePayload(req.body || {}, purchase);
      if (payload.error) return res.status(400).json({ ok: false, message: payload.error });
      if (wasStock) await applyPurchaseStock(oldLines, -1, purchase.purchaseNo, req.session.user.email);
      Object.assign(purchase, payload);
      await purchase.save();
      if (purchaseAffectsStock(purchase.status)) {
        await applyPurchaseStock(purchase.lines, 1, purchase.purchaseNo, req.session.user.email);
      }
      res.json({ ok: true, purchase, message: 'Purchase updated' });
    } catch (err) {
      res.status(400).json({ ok: false, message: err.message });
    }
  });

  app.delete('/api/purchases/:id', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
    const purchase = await Purchase.findById(req.params.id);
    if (!purchase) return res.status(404).json({ ok: false, message: 'Not found' });
    if (purchaseAffectsStock(purchase.status)) {
      await applyPurchaseStock(purchase.lines, -1, purchase.purchaseNo, req.session.user.email);
    }
    await purchase.deleteOne();
    res.json({ ok: true, message: 'Purchase deleted' });
  });
}

module.exports = { registerExtraRoutes, requireRole, findProductByCode, generateBarcode };
