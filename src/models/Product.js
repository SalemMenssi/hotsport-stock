const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, index: true },
    category: { type: String, required: true, index: true },
    discipline: { type: String, default: 'sport' },
    description: { type: String, default: '' },
    priceTnd: { type: Number, required: true, default: 0 },
    costTnd: { type: Number, default: 0 },
    stockQty: { type: Number, required: true, default: 0 },
    minStock: { type: Number, default: 5 },
    wooProductId: { type: Number, default: null },
    barcode: { type: String, unique: true, sparse: true, index: true },
    imageEmoji: { type: String, default: '🥊' },
    imageUrl: { type: String, default: '' },
    tags: [{ type: String }],
    params: [{
      name: { type: String, trim: true },
      values: [{ type: String, trim: true }]
    }],
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
    lastSyncedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

productSchema.virtual('isLow').get(function () {
  return this.stockQty <= this.minStock && this.stockQty > 0;
});

productSchema.virtual('isOut').get(function () {
  return this.stockQty <= 0;
});

productSchema.pre('validate', function (next) {
  if (!this.sku) this.sku = `HS-${Date.now().toString().slice(-8)}`;
  if (!this.barcode) {
    const base = String(this.sku || this.wooProductId || Date.now()).replace(/\D/g, '').slice(-10).padStart(10, '0');
    this.barcode = `HS${base}`;
  }
  next();
});
productSchema.set('toObject', { virtuals: true });
productSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Product', productSchema);
