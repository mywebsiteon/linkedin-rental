const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  role: { type: String, enum: ['client','admin'], default:'client' },
  createdAt: { type: Date, default: Date.now }
});

UserSchema.pre('save', async function(next){
  if(!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

UserSchema.methods.verifyPassword = async function(password){
  return await bcrypt.compare(password, this.password);
};

module.exports = mongoose.model('User', UserSchema);