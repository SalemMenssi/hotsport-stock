const mongoose = require('mongoose');

const unitSchema = new mongoose.Schema({ name: { type: String, required: true, unique: true } });
const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  description: { type: String, default: '' }
});

const customerSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  mobile: String,
  email: String,
  address: String,
  balance: { type: Number, default: 0 },
  status: { type: String, default: 'active' }
}, { timestamps: true });

const supplierSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  mobile: String,
  email: String,
  address: String,
  balance: { type: Number, default: 0 },
  status: { type: String, default: 'active' }
}, { timestamps: true });

const bankSchema = new mongoose.Schema({
  name: { type: String, required: true },
  accountNo: String,
  branch: String,
  balance: { type: Number, default: 0 },
  status: { type: String, default: 'active' }
}, { timestamps: true });

const departmentSchema = new mongoose.Schema({ name: String, description: String });
const designationSchema = new mongoose.Schema({ name: String, description: String });

const employeeSchema = new mongoose.Schema({
  code: String,
  name: { type: String, required: true },
  email: String,
  phone: String,
  department: String,
  designation: String,
  salary: { type: Number, default: 0 },
  status: { type: String, default: 'active' }
}, { timestamps: true });

const purchaseSchema = new mongoose.Schema({
  purchaseNo: { type: String, required: true, unique: true },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  supplierName: String,
  date: { type: Date, default: Date.now },
  lines: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    sku: String,
    name: String,
    qty: Number,
    rate: Number,
    total: Number
  }],
  discount: { type: Number, default: 0 },
  grandTotal: { type: Number, default: 0 },
  paidAmount: { type: Number, default: 0 },
  dueAmount: { type: Number, default: 0 },
  paymentType: { type: String, default: 'cash' },
  bankName: String,
  note: String,
  status: { type: String, default: 'received' }
}, { timestamps: true });

const invoiceSchema = new mongoose.Schema({
  invoiceNo: { type: String, required: true, unique: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  customerName: String,
  date: { type: Date, default: Date.now },
  source: { type: String, enum: ['invoice', 'pos'], default: 'invoice' },
  lines: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    sku: String,
    name: String,
    qty: Number,
    price: Number,
    discount: { type: Number, default: 0 },
    total: Number
  }],
  discount: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  paidAmount: { type: Number, default: 0 },
  dueAmount: { type: Number, default: 0 },
  paymentMethod: { type: String, default: 'cash' },
  bankName: String,
  status: { type: String, default: 'delivered' },
  note: String,
  caisse: { type: mongoose.Schema.Types.ObjectId, ref: 'Caisse' },
  caisseName: String,
  session: { type: mongoose.Schema.Types.ObjectId, ref: 'CaisseSession' },
  sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  sellerName: String
}, { timestamps: true });

const returnSchema = new mongoose.Schema({
  returnNo: { type: String, required: true, unique: true },
  type: { type: String, enum: ['customer', 'supplier'], required: true },
  relatedNo: String,
  partyName: String,
  date: { type: Date, default: Date.now },
  lines: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    sku: String,
    name: String,
    qty: Number,
    price: Number,
    total: Number
  }],
  totalAmount: { type: Number, default: 0 },
  reason: String,
  status: { type: String, default: 'completed' }
}, { timestamps: true });

const transactionSchema = new mongoose.Schema({
  txnNo: { type: String, required: true, unique: true },
  date: { type: Date, default: Date.now },
  type: { type: String, enum: ['receive', 'pay', 'adjustment', 'closing'], required: true },
  category: { type: String, default: 'general' },
  mode: { type: String, default: 'cash' },
  partyType: { type: String, enum: ['customer', 'supplier', 'bank', 'other'], default: 'other' },
  partyName: String,
  amount: { type: Number, required: true },
  description: String,
  bankName: String
}, { timestamps: true });

const attendanceSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  employeeName: String,
  date: { type: Date, required: true },
  inTime: String,
  outTime: String,
  stayHours: Number
}, { timestamps: true });

const salarySchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  employeeName: String,
  month: String,
  amount: Number,
  paidAmount: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['generated', 'pending', 'approved', 'paid', 'rejected'],
    default: 'generated'
  },
  approvedBy: String,
  approvedAt: Date,
  paidAt: Date,
  note: String
}, { timestamps: true });

const leaveSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  employeeName: String,
  fromDate: { type: Date, required: true },
  toDate: { type: Date, required: true },
  days: { type: Number, default: 1 },
  type: { type: String, enum: ['day_off', 'sick', 'annual', 'unpaid', 'holiday'], default: 'day_off' },
  reason: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userEmail: String,
  userRole: String,
  approvedBy: String,
  approvedAt: Date,
  note: String
}, { timestamps: true });

const salaryAdvanceSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName: String,
  userEmail: String,
  userRole: String,
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  employeeName: String,
  month: String,
  amount: { type: Number, required: true },
  salaryAmount: { type: Number, default: 0 },
  reason: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'paid'], default: 'pending' },
  approvedBy: String,
  approvedAt: Date,
  paidAt: Date,
  note: String
}, { timestamps: true });

const closingSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  opening: Number,
  cashIn: Number,
  cashOut: Number,
  closing: Number,
  note: String
}, { timestamps: true });

const orderSchema = new mongoose.Schema({
  orderNo: { type: String, required: true, unique: true },
  source: { type: String, enum: ['web', 'phone', 'shop', 'whatsapp'], default: 'web' },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  customerName: { type: String, required: true },
  phone: String,
  email: String,
  address: String,
  city: { type: String, default: 'Tunis' },
  lines: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    sku: String,
    name: String,
    qty: Number,
    price: Number,
    total: Number
  }],
  shippingFee: { type: Number, default: 8 },
  discount: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  paidAmount: { type: Number, default: 0 },
  paymentMethod: { type: String, default: 'cod' },
  paymentStatus: { type: String, enum: ['unpaid', 'partial', 'paid'], default: 'unpaid' },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled'],
    default: 'pending'
  },
  wooOrderId: Number,
  note: String,
  orderedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = {
  Unit: mongoose.model('Unit', unitSchema),
  Category: mongoose.model('Category', categorySchema),
  Customer: mongoose.model('Customer', customerSchema),
  Supplier: mongoose.model('Supplier', supplierSchema),
  Bank: mongoose.model('Bank', bankSchema),
  Department: mongoose.model('Department', departmentSchema),
  Designation: mongoose.model('Designation', designationSchema),
  Employee: mongoose.model('Employee', employeeSchema),
  Purchase: mongoose.model('Purchase', purchaseSchema),
  Invoice: mongoose.model('Invoice', invoiceSchema),
  ReturnDoc: mongoose.model('ReturnDoc', returnSchema),
  Transaction: mongoose.model('Transaction', transactionSchema),
  Attendance: mongoose.model('Attendance', attendanceSchema),
  Salary: mongoose.model('Salary', salarySchema),
  LeaveRequest: mongoose.model('LeaveRequest', leaveSchema),
  SalaryAdvance: mongoose.model('SalaryAdvance', salaryAdvanceSchema),
  Closing: mongoose.model('Closing', closingSchema),
  Order: mongoose.model('Order', orderSchema)
};
