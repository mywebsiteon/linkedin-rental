const mongoose = require('mongoose');

const NewsletterSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Newsletter', NewsletterSchema);

