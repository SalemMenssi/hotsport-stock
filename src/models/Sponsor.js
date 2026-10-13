const mongoose = require('mongoose');

const sponsorSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  company: { type: String, default: '' },
  contact: { type: String, default: '' },
  email: { type: String, default: '' },
  phone: { type: String, default: '' },
  website: { type: String, default: '' },
  logoUrl: { type: String, default: '' },
  package: {
    type: String,
    enum: ['bronze', 'silver', 'gold', 'platinum', 'partner'],
    default: 'bronze'
  },
  amountTnd: { type: Number, default: 0 },
  startDate: Date,
  endDate: Date,
  status: { type: String, enum: ['active', 'pending', 'expired', 'paused'], default: 'active' },
  benefits: { type: String, default: '' },
  notes: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Sponsor', sponsorSchema);
