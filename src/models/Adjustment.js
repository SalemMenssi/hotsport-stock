const mongoose = require('mongoose');

const adjustmentSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    qtyChange: { type: Number, required: true },
    reason: { type: String, default: 'Manual adjust' },
    note: { type: String, default: '' },
    source: { type: String, default: 'manual' },
    stockAfter: { type: Number, default: 0 },
    createdBy: { type: String, default: 'demo' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Adjustment', adjustmentSchema);
