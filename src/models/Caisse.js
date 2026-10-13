const mongoose = require('mongoose');

const caisseSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  location: { type: String, default: '' },
  kind: { type: String, enum: ['shop', 'event', 'web', 'mobile'], default: 'shop' },
  openingFloat: { type: Number, default: 200 },
  assignedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  note: { type: String, default: '' }
}, { timestamps: true });

const sessionSchema = new mongoose.Schema({
  caisse: { type: mongoose.Schema.Types.ObjectId, ref: 'Caisse', required: true },
  caisseName: String,
  caisseCode: String,
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName: String,
  userRole: String,
  openedAt: { type: Date, default: Date.now },
  closedAt: Date,
  openingCash: { type: Number, default: 0 },
  cashIn: { type: Number, default: 0 },
  cashOut: { type: Number, default: 0 },
  countedCash: Number,
  difference: Number,
  salesCount: { type: Number, default: 0 },
  status: { type: String, enum: ['open', 'closed'], default: 'open' },
  note: { type: String, default: '' }
}, { timestamps: true });

module.exports = {
  Caisse: mongoose.model('Caisse', caisseSchema),
  CaisseSession: mongoose.model('CaisseSession', sessionSchema)
};
