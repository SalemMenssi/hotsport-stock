const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const webpush = require('web-push');
const User = require('./models/User');
const { normalizeRole } = require('./roles');

const vapidFile = path.join(__dirname, '..', 'data', 'vapid.json');

const subSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  endpoint: { type: String, required: true, unique: true },
  keys: {
    p256dh: String,
    auth: String
  }
}, { timestamps: true });

const noticeSchema = new mongoose.Schema({
  title: { type: String, required: true },
  body: { type: String, default: '' },
  url: { type: String, default: '/app.html' },
  roles: [{ type: String }],
  users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now }
});

const PushSub = mongoose.models.PushSub || mongoose.model('PushSub', subSchema);
const Notice = mongoose.models.Notice || mongoose.model('Notice', noticeSchema);

function loadVapid() {
  try {
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
    }
    if (fs.existsSync(vapidFile)) {
      return JSON.parse(fs.readFileSync(vapidFile, 'utf8'));
    }
    const keys = webpush.generateVAPIDKeys();
    fs.mkdirSync(path.dirname(vapidFile), { recursive: true });
    fs.writeFileSync(vapidFile, JSON.stringify(keys, null, 2));
    return keys;
  } catch (err) {
    console.warn('VAPID setup failed', err.message);
    return null;
  }
}

const vapid = loadVapid();
if (vapid) {
  try {
    webpush.setVapidDetails('mailto:admin@hotsport.tn', vapid.publicKey, vapid.privateKey);
  } catch (err) {
    console.warn('web-push vapid', err.message);
  }
}

async function notify({ title, body, url = '/app.html#dashboard', roles = [], userIds = [] }) {
  const notice = await Notice.create({ title, body, url, roles, users: userIds });
  let users = [];
  if (userIds.length) {
    users = await User.find({ _id: { $in: userIds }, active: { $ne: false } });
  }
  if (roles.length) {
    const extra = await User.find({ role: { $in: roles.map(normalizeRole) }, active: { $ne: false } });
    users = [...users, ...extra];
  }
  const ids = [...new Set(users.map((u) => String(u._id)))];
  const subs = await PushSub.find({ user: { $in: ids } });
  const payload = JSON.stringify({ title, body, url, icon: '/icons/icon-192.png' });
  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload);
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) await PushSub.deleteOne({ _id: sub._id });
    }
  }));
  return notice;
}

function registerPushRoutes(app, requireAuth) {
  app.get('/api/push/public-key', requireAuth, (_req, res) => {
    res.json({ ok: true, publicKey: vapid?.publicKey || '' });
  });

  app.post('/api/push/subscribe', requireAuth, async (req, res) => {
    const { endpoint, keys } = req.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ ok: false, message: 'Invalid subscription' });
    }
    await PushSub.findOneAndUpdate(
      { endpoint },
      { user: req.session.user.id, endpoint, keys },
      { upsert: true, new: true }
    );
    res.json({ ok: true, message: 'Notifications on' });
  });

  app.get('/api/notifications', requireAuth, async (req, res) => {
    const since = req.query.since ? new Date(req.query.since) : new Date(Date.now() - 86400000);
    const role = normalizeRole(req.session.user.role);
    const notices = await Notice.find({
      createdAt: { $gt: since },
      $or: [
        { users: req.session.user.id },
        { roles: role }
      ]
    }).sort({ createdAt: -1 }).limit(30);
    res.json({ ok: true, notices, now: new Date().toISOString() });
  });
}

module.exports = { registerPushRoutes, notify, vapid };
