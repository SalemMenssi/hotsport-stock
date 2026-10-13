const User = require('./models/User');
const Sponsor = require('./models/Sponsor');
const { Invoice, LeaveRequest, SalaryAdvance } = require('./models/Inventory');
const { Caisse, CaisseSession } = require('./models/Caisse');
const {
  normalizeRole,
  permissionsForRole,
  ROLE_CRUD,
  ALL_MODULES,
  ROLE_MODULES
} = require('./roles');

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

function publicUser(u) {
  if (!u) return null;
  return {
    _id: u._id,
    name: u.name,
    email: u.email,
    role: normalizeRole(u.role),
    phone: u.phone || '',
    active: u.active !== false,
    defaultCaisse: u.defaultCaisse || null,
    createdAt: u.createdAt
  };
}

function canEditTarget(actorRole, targetRole) {
  const a = normalizeRole(actorRole);
  const t = normalizeRole(targetRole);
  if (a === 'admin') return true;
  if (a === 'manager') return t === 'seller';
  return false;
}

async function findOpenSession({ sessionId, caisseId, userId }) {
  if (sessionId) {
    return CaisseSession.findOne({ _id: sessionId, status: 'open' });
  }
  if (caisseId) {
    return CaisseSession.findOne({ caisse: caisseId, status: 'open' });
  }
  if (userId) {
    return CaisseSession.findOne({ user: userId, status: 'open' }).sort({ openedAt: -1 });
  }
  return null;
}

async function ensureTill(req) {
  const found = await findOpenSession({
    sessionId: req.body?.sessionId,
    caisseId: req.body?.caisseId,
    userId: req.session.user.id
  });
  if (found) return found;

  const user = await User.findById(req.session.user.id);
  let caisse = null;
  if (req.body?.caisseId) caisse = await Caisse.findById(req.body.caisseId);
  if (!caisse && user?.defaultCaisse) caisse = await Caisse.findById(user.defaultCaisse);
  if (!caisse) caisse = await Caisse.findOne({ status: 'active' }).sort({ code: 1 });
  if (!caisse) return null;

  const existing = await CaisseSession.findOne({ caisse: caisse._id, status: 'open' });
  if (existing && String(existing.user) === String(req.session.user.id)) return existing;
  if (existing) {
    const busy = await CaisseSession.find({ status: 'open' }).distinct('caisse');
    const free = await Caisse.findOne({ status: 'active', _id: { $nin: busy } });
    if (free) caisse = free;
    else return existing;
  }

  return CaisseSession.create({
    caisse: caisse._id,
    caisseName: caisse.name,
    caisseCode: caisse.code,
    user: req.session.user.id,
    userName: req.session.user.name,
    userRole: normalizeRole(req.session.user.role),
    openingCash: Number(caisse.openingFloat) || 0,
    note: 'Auto-open'
  });
}

async function attachPosSale(req, { invoice, total }) {
  const sess = await ensureTill(req);
  if (!sess) {
    return { ok: false, status: 400, message: 'Open a caisse before selling', code: 'NO_CAISSE' };
  }
  sess.cashIn = Number(sess.cashIn || 0) + Number(total || 0);
  sess.salesCount = Number(sess.salesCount || 0) + 1;
  await sess.save();
  invoice.caisse = sess.caisse;
  invoice.caisseName = sess.caisseName;
  invoice.session = sess._id;
  invoice.sellerId = req.session.user.id;
  invoice.sellerName = req.session.user.name;
  await invoice.save();
  return { ok: true, session: sess };
}

async function ensureOpsDefaults() {
  if (await Caisse.countDocuments() === 0) {
    const caisses = await Caisse.create([
      { code: 'CAISSE-01', name: 'Boutique Tunis', location: 'Centre ville', kind: 'shop', openingFloat: 200, note: 'Till principale' },
      { code: 'CAISSE-02', name: 'Caisse La Marsa', location: 'La Marsa', kind: 'shop', openingFloat: 150, note: 'Annexe' },
      { code: 'CAISSE-03', name: 'Caisse Event', location: 'Tournois / pop-up', kind: 'event', openingFloat: 100, note: 'Mobile' }
    ]);
    const seller = await User.findOne({ email: 'seller@hotsport.tn' });
    const cashier = await User.findOne({ email: 'cashier@hotsport.tn' });
    if (seller && !seller.defaultCaisse) {
      seller.defaultCaisse = caisses[0]._id;
      await seller.save();
      caisses[0].assignedUsers = [seller._id];
      await caisses[0].save();
    }
    if (cashier && !cashier.defaultCaisse) {
      cashier.defaultCaisse = caisses[1]._id;
      await cashier.save();
      caisses[1].assignedUsers = [cashier._id];
      await caisses[1].save();
    }
  }

  if (await User.countDocuments({ email: 'cashier@hotsport.tn' }) === 0) {
    const hash = await User.hashPassword('cashier123');
    const c2 = await Caisse.findOne({ code: 'CAISSE-02' });
    await User.create({
      name: 'HotSport Cashier',
      email: 'cashier@hotsport.tn',
      passwordHash: hash,
      role: 'seller',
      defaultCaisse: c2?._id || null,
      active: true
    });
  }

  if (await Sponsor.countDocuments() === 0) {
    await Sponsor.create([
      {
        code: 'SPN-NIKE',
        name: 'Nike Tunisia',
        company: 'Nike Dist. Maghreb',
        contact: 'Sami Khelifi',
        email: 'sponsor@nike-tn.demo',
        phone: '+216 71 000 111',
        website: 'https://hotsport.tn',
        package: 'gold',
        amountTnd: 8500,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
        status: 'active',
        benefits: 'Logo pack boxing · vitrine boutique · posts Instagram'
      },
      {
        code: 'SPN-ADIDAS',
        name: 'Adidas Maghreb',
        company: 'Adidas Maghreb',
        contact: 'Lina Trabelsi',
        email: 'b2b@adidas-tn.demo',
        phone: '+216 71 000 222',
        website: 'https://hotsport.tn',
        package: 'silver',
        amountTnd: 4200,
        startDate: new Date('2026-03-01'),
        endDate: new Date('2026-12-31'),
        status: 'active',
        benefits: 'Kits football · banderole event'
      },
      {
        code: 'SPN-BIAT',
        name: 'BIAT Sport',
        company: 'BIAT',
        contact: 'Karim Jaziri',
        email: 'sport@biat.demo',
        phone: '+216 71 140 000',
        package: 'platinum',
        amountTnd: 12000,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
        status: 'active',
        benefits: 'Naming caisse principale · QR paiement'
      },
      {
        code: 'SPN-FIGHT',
        name: 'Fight Club Sfax',
        company: 'Fight Club Sfax',
        contact: 'Club manager',
        email: 'fight@sfax.demo',
        phone: '+216 74 888 999',
        package: 'partner',
        amountTnd: 1500,
        startDate: new Date('2026-06-01'),
        endDate: new Date('2027-06-01'),
        status: 'pending',
        benefits: 'Club partner · packs Muay Thai'
      }
    ]);
  }

  if (await SalaryAdvance.countDocuments() === 0) {
    const seller = await User.findOne({ email: 'seller@hotsport.tn' });
    const manager = await User.findOne({ email: 'manager@hotsport.tn' });
    if (seller) {
      await SalaryAdvance.create({
        user: seller._id,
        userName: seller.name,
        userEmail: seller.email,
        userRole: 'seller',
        employeeName: seller.name,
        month: new Date().toISOString().slice(0, 7),
        amount: 150,
        salaryAmount: 950,
        reason: 'Acompte salaire',
        status: 'pending'
      });
      await LeaveRequest.create({
        employeeName: seller.name,
        user: seller._id,
        userEmail: seller.email,
        userRole: 'seller',
        fromDate: new Date(Date.now() + 2 * 86400000),
        toDate: new Date(Date.now() + 2 * 86400000),
        days: 1,
        type: 'day_off',
        reason: 'Day off request',
        status: 'pending'
      });
    }
    if (manager) {
      await SalaryAdvance.create({
        user: manager._id,
        userName: manager.name,
        userEmail: manager.email,
        userRole: 'manager',
        employeeName: manager.name,
        month: new Date().toISOString().slice(0, 7),
        amount: 400,
        salaryAmount: 1800,
        reason: 'Acompte manager',
        status: 'pending'
      });
      await LeaveRequest.create({
        employeeName: manager.name,
        user: manager._id,
        userEmail: manager.email,
        userRole: 'manager',
        fromDate: new Date(Date.now() + 10 * 86400000),
        toDate: new Date(Date.now() + 14 * 86400000),
        days: 5,
        type: 'holiday',
        reason: 'Holiday request',
        status: 'pending'
      });
    }
  }
}

function registerOpsRoutes(app, requireAuth) {
  app.get('/api/roles', requireAuth, (req, res) => {
    const role = normalizeRole(req.session.user.role);
    res.json({
      ok: true,
      role,
      roles: ['admin', 'manager', 'seller'],
      modules: ALL_MODULES,
      map: ROLE_MODULES,
      crud: ROLE_CRUD,
      permissions: permissionsForRole(role)
    });
  });

  app.get('/api/users', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
    const users = await User.find().sort({ role: 1, name: 1 }).populate('defaultCaisse', 'code name');
    const role = normalizeRole(req.session.user.role);
    const list = role === 'manager'
      ? users.filter((u) => normalizeRole(u.role) === 'seller' || u._id.toString() === req.session.user.id)
      : users;
    res.json({ ok: true, users: list.map(publicUser), permissions: permissionsForRole(role), crud: ROLE_CRUD });
  });

  app.post('/api/users', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
    const actor = normalizeRole(req.session.user.role);
    const { name, email, password, role, phone, defaultCaisse, active } = req.body || {};
    const targetRole = normalizeRole(role || 'seller');
    if (!canEditTarget(actor, targetRole) || (actor === 'manager' && targetRole !== 'seller')) {
      return res.status(403).json({ ok: false, message: 'You can only create seller accounts' });
    }
    if (!name || !email || !password) {
      return res.status(400).json({ ok: false, message: 'Name, email and password required' });
    }
    const exists = await User.findOne({ email: String(email).toLowerCase() });
    if (exists) return res.status(400).json({ ok: false, message: 'Email already used' });
    const user = await User.create({
      name: String(name).trim(),
      email: String(email).toLowerCase().trim(),
      passwordHash: await User.hashPassword(String(password)),
      role: targetRole,
      phone: phone || '',
      active: active !== false,
      defaultCaisse: defaultCaisse || null
    });
    res.json({ ok: true, user: publicUser(user), message: 'User created' });
  });

  app.put('/api/users/:id', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
    const actor = normalizeRole(req.session.user.role);
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ ok: false, message: 'User not found' });
    if (!canEditTarget(actor, user.role)) {
      return res.status(403).json({ ok: false, message: 'Cannot edit this role' });
    }
    const { name, email, password, role, phone, defaultCaisse, active } = req.body || {};
    if (name) user.name = String(name).trim();
    if (email) user.email = String(email).toLowerCase().trim();
    if (phone !== undefined) user.phone = phone;
    if (defaultCaisse !== undefined) user.defaultCaisse = defaultCaisse || null;
    if (active !== undefined) user.active = active !== false && active !== 'false';
    if (role) {
      const next = normalizeRole(role);
      if (!canEditTarget(actor, next) || (actor === 'manager' && next !== 'seller')) {
        return res.status(403).json({ ok: false, message: 'Cannot assign this role' });
      }
      user.role = next;
    }
    if (password) user.passwordHash = await User.hashPassword(String(password));
    await user.save();
    res.json({ ok: true, user: publicUser(user), message: 'User updated' });
  });

  app.delete('/api/users/:id', requireAuth, requireRole('admin'), async (req, res) => {
    if (req.params.id === req.session.user.id) {
      return res.status(400).json({ ok: false, message: 'Cannot delete yourself' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ ok: false, message: 'User not found' });
    if (normalizeRole(user.role) === 'admin') {
      const admins = await User.countDocuments({ role: 'admin', active: { $ne: false } });
      if (admins <= 1) return res.status(400).json({ ok: false, message: 'Keep at least one admin' });
    }
    await user.deleteOne();
    res.json({ ok: true, message: 'User deleted' });
  });

  app.get('/api/caisses', requireAuth, async (req, res) => {
    const role = normalizeRole(req.session.user.role);
    const caisses = await Caisse.find().sort({ code: 1 }).lean();
    const sessions = await CaisseSession.find({ status: 'open' }).lean();
    const openByCaisse = Object.fromEntries(sessions.map((s) => [String(s.caisse), s]));
    const mine = await CaisseSession.findOne({ user: req.session.user.id, status: 'open' });
    const users = await User.find({}, 'name email role defaultCaisse').lean();
    let list = caisses.map((c) => ({
      ...c,
      openSession: openByCaisse[String(c._id)] || null
    }));
    if (role === 'seller') {
      const uid = req.session.user.id;
      list = list.filter((c) => {
        const assigned = (c.assignedUsers || []).map(String);
        const user = users.find((u) => String(u._id) === uid);
        return assigned.includes(uid) || String(user?.defaultCaisse || '') === String(c._id) || !assigned.length;
      });
    }
    res.json({
      ok: true,
      caisses: list,
      currentSession: mine,
      users,
      permissions: permissionsForRole(role)
    });
  });

  app.post('/api/caisses', requireAuth, requireRole('admin'), async (req, res) => {
    const { code, name, location, kind, openingFloat, note, assignedUsers, status } = req.body || {};
    if (!name) return res.status(400).json({ ok: false, message: 'Name required' });
    const caisse = await Caisse.create({
      code: (code && String(code).trim().toUpperCase()) || `CAISSE-${Date.now().toString().slice(-4)}`,
      name: String(name).trim(),
      location: location || '',
      kind: kind || 'shop',
      openingFloat: Number(openingFloat) || 0,
      note: note || '',
      assignedUsers: assignedUsers || [],
      status: status === 'inactive' ? 'inactive' : 'active'
    });
    res.json({ ok: true, caisse, message: 'Caisse created' });
  });

  app.put('/api/caisses/:id', requireAuth, requireRole('admin'), async (req, res) => {
    const caisse = await Caisse.findById(req.params.id);
    if (!caisse) return res.status(404).json({ ok: false, message: 'Caisse not found' });
    const fields = ['name', 'location', 'kind', 'note', 'status'];
    for (const f of fields) {
      if (req.body[f] !== undefined) caisse[f] = req.body[f];
    }
    if (req.body.code) caisse.code = String(req.body.code).trim().toUpperCase();
    if (req.body.openingFloat !== undefined) caisse.openingFloat = Number(req.body.openingFloat) || 0;
    if (req.body.assignedUsers !== undefined) caisse.assignedUsers = req.body.assignedUsers || [];
    await caisse.save();
    res.json({ ok: true, caisse, message: 'Caisse updated' });
  });

  app.delete('/api/caisses/:id', requireAuth, requireRole('admin'), async (req, res) => {
    const open = await CaisseSession.findOne({ caisse: req.params.id, status: 'open' });
    if (open) return res.status(400).json({ ok: false, message: 'Close the till first' });
    const caisse = await Caisse.findByIdAndDelete(req.params.id);
    if (!caisse) return res.status(404).json({ ok: false, message: 'Caisse not found' });
    res.json({ ok: true, message: 'Caisse deleted' });
  });

  app.post('/api/caisses/:id/open', requireAuth, async (req, res) => {
    const caisse = await Caisse.findById(req.params.id);
    if (!caisse || caisse.status !== 'active') {
      return res.status(404).json({ ok: false, message: 'Caisse unavailable' });
    }
    const existingTill = await CaisseSession.findOne({ caisse: caisse._id, status: 'open' });
    if (existingTill) {
      return res.status(400).json({ ok: false, message: `Already open by ${existingTill.userName}` });
    }
    const myOpen = await CaisseSession.findOne({ user: req.session.user.id, status: 'open' });
    if (myOpen) {
      return res.status(400).json({ ok: false, message: 'Close your current till first' });
    }
    const role = normalizeRole(req.session.user.role);
    if (role === 'seller') {
      const assigned = (caisse.assignedUsers || []).map(String);
      const user = await User.findById(req.session.user.id);
      const ok = !assigned.length
        || assigned.includes(req.session.user.id)
        || String(user?.defaultCaisse || '') === String(caisse._id);
      if (!ok) return res.status(403).json({ ok: false, message: 'This till is not assigned to you' });
    }
    const openingCash = req.body.openingCash !== undefined
      ? Number(req.body.openingCash)
      : Number(caisse.openingFloat) || 0;
    const session = await CaisseSession.create({
      caisse: caisse._id,
      caisseName: caisse.name,
      caisseCode: caisse.code,
      user: req.session.user.id,
      userName: req.session.user.name,
      userRole: role,
      openingCash,
      note: req.body.note || ''
    });
    res.json({ ok: true, session, message: `${caisse.name} opened` });
  });

  app.post('/api/sessions/:id/close', requireAuth, async (req, res) => {
    const session = await CaisseSession.findById(req.params.id);
    if (!session || session.status !== 'open') {
      return res.status(404).json({ ok: false, message: 'Session not found' });
    }
    const role = normalizeRole(req.session.user.role);
    if (role === 'seller' && String(session.user) !== req.session.user.id) {
      return res.status(403).json({ ok: false, message: 'You can only close your till' });
    }
    const expected = Number(session.openingCash || 0) + Number(session.cashIn || 0) - Number(session.cashOut || 0);
    const counted = req.body.countedCash !== undefined ? Number(req.body.countedCash) : expected;
    session.status = 'closed';
    session.closedAt = new Date();
    session.countedCash = counted;
    session.difference = Number((counted - expected).toFixed(3));
    if (req.body.note) session.note = req.body.note;
    await session.save();
    res.json({ ok: true, session, expected, message: 'Till closed' });
  });

  app.get('/api/sessions', requireAuth, async (req, res) => {
    const role = normalizeRole(req.session.user.role);
    const q = {};
    if (req.query.caisse) q.caisse = req.query.caisse;
    if (req.query.status) q.status = req.query.status;
    if (role === 'seller') q.user = req.session.user.id;
    const sessions = await CaisseSession.find(q).sort({ openedAt: -1 }).limit(80);
    res.json({ ok: true, sessions });
  });

  app.get('/api/caisses/:id/sales', requireAuth, async (req, res) => {
    const invoices = await Invoice.find({ caisse: req.params.id, source: 'pos' }).sort({ date: -1 }).limit(40);
    res.json({ ok: true, invoices });
  });

  app.get('/api/sponsors', requireAuth, async (req, res) => {
    const q = {};
    if (req.query.status && req.query.status !== 'all') q.status = req.query.status;
    if (req.query.package && req.query.package !== 'all') q.package = req.query.package;
    const sponsors = await Sponsor.find(q).sort({ amountTnd: -1, name: 1 });
    res.json({ ok: true, sponsors, permissions: permissionsForRole(req.session.user.role) });
  });

  app.post('/api/sponsors', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
    const b = req.body || {};
    if (!b.name) return res.status(400).json({ ok: false, message: 'Name required' });
    const sponsor = await Sponsor.create({
      code: (b.code && String(b.code).trim().toUpperCase()) || `SPN-${Date.now().toString().slice(-5)}`,
      name: String(b.name).trim(),
      company: b.company || '',
      contact: b.contact || '',
      email: b.email || '',
      phone: b.phone || '',
      website: b.website || '',
      logoUrl: b.logoUrl || '',
      package: b.package || 'bronze',
      amountTnd: Number(b.amountTnd) || 0,
      startDate: b.startDate || null,
      endDate: b.endDate || null,
      status: b.status || 'active',
      benefits: b.benefits || '',
      notes: b.notes || ''
    });
    res.json({ ok: true, sponsor, message: 'Sponsor created' });
  });

  app.put('/api/sponsors/:id', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
    const sponsor = await Sponsor.findById(req.params.id);
    if (!sponsor) return res.status(404).json({ ok: false, message: 'Sponsor not found' });
    const fields = ['name', 'company', 'contact', 'email', 'phone', 'website', 'logoUrl', 'package', 'status', 'benefits', 'notes'];
    for (const f of fields) {
      if (req.body[f] !== undefined) sponsor[f] = req.body[f];
    }
    if (req.body.code) sponsor.code = String(req.body.code).trim().toUpperCase();
    if (req.body.amountTnd !== undefined) sponsor.amountTnd = Number(req.body.amountTnd) || 0;
    if (req.body.startDate !== undefined) sponsor.startDate = req.body.startDate || null;
    if (req.body.endDate !== undefined) sponsor.endDate = req.body.endDate || null;
    await sponsor.save();
    res.json({ ok: true, sponsor, message: 'Sponsor updated' });
  });

  app.delete('/api/sponsors/:id', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
    const sponsor = await Sponsor.findByIdAndDelete(req.params.id);
    if (!sponsor) return res.status(404).json({ ok: false, message: 'Sponsor not found' });
    res.json({ ok: true, message: 'Sponsor deleted' });
  });
}

module.exports = {
  registerOpsRoutes,
  ensureOpsDefaults,
  attachPosSale,
  findOpenSession,
  ensureTill,
  requireRole
};
