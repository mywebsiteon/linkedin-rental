const mongoose = require('mongoose');

const AccountSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref:'User' },
  renterId: { type: mongoose.Schema.Types.ObjectId, ref:'User' },
  accountName: String,
  email: String,
  price: Number,
  description: String,
  status: { type: String, enum:['pending','approved','rented','rejected'], default:'pending' },
  rentalStart: Date,
  rentalEnd: Date,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Account', AccountSchema);