const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, default: 'hotsport' },
    storeName: { type: String, default: 'HotSport Stock' },
    storeUrl: { type: String, default: 'https://hotsport.tn' },
    consumerKey: { type: String, default: '' },
    consumerSecret: { type: String, default: '' },
    autoSync: { type: Boolean, default: true },
    syncDirection: { type: String, default: 'both' },
    lowStockThreshold: { type: Number, default: 5 },
    currency: { type: String, default: 'TND' },
    demoMode: { type: Boolean, default: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Settings', settingsSchema);
