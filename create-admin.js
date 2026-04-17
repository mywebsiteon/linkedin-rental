require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const mongoUri = 'mongodb+srv://admin:Caleb7909*@linkedin.duvndhx.mongodb.net/?appName=linkedin&serverSelectionTimeoutMS=5000';

const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  role: { type: String, enum: ['client', 'admin'], default: 'client' },
  createdAt: { type: Date, default: Date.now }
});

UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

async function createAdmin() {
  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const User = mongoose.model('User', UserSchema);

    const adminExists = await User.findOne({ email: 'admin@linkedrent.com' });
    if (adminExists) {
      console.log('Admin user already exists');
    } else {
      const admin = new User({
        name: 'Admin',
        email: 'admin@linkedrent.com',
        password: 'admin123',
        role: 'admin'
      });
      await admin.save();
      console.log('Admin user created successfully');
      console.log('Email: admin@linkedrent.com');
      console.log('Password: admin123');
    }

    await mongoose.disconnect();
    console.log('Disconnected');
  } catch (err) {
    console.error(err);
  }
}

async function addSampleData() {
  await mongoose.connect(mongoUri);
  const User = mongoose.model('User', UserSchema);
  const AccountSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    renterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    accountName: String,
    email: String,
    price: Number,
    description: String,
    status: { type: String, enum: ['pending', 'approved', 'rented', 'rejected'], default: 'pending' },
    rentalStart: Date,
    rentalEnd: Date,
    createdAt: { type: Date, default: Date.now }
  });
  const Account = mongoose.model('Account', AccountSchema);

  const sampleUser = await User.findOne({ email: 'demo@linkedrent.com' });
  if (!sampleUser) {
    const demo = new User({
      name: 'Demo User',
      email: 'demo@linkedrent.com',
      password: 'demo123',
      role: 'client'
    });
    await demo.save();

    const accounts = [
      { accountName: 'Tech Startup Exec', email: 'tech@demo.com', price: 25, description: 'C-level executive with 5000+ connections in tech industry', status: 'approved', rentalStart: new Date(), rentalEnd: new Date(Date.now() + 30*24*60*60*1000) },
      { accountName: 'Marketing Pro', email: 'marketing@demo.com', price: 20, description: 'Marketing director with strong B2B network', status: 'approved', rentalStart: new Date(), rentalEnd: new Date(Date.now() + 30*24*60*60*1000) },
      { accountName: 'Finance Expert', email: 'finance@demo.com', price: 30, description: 'Finance professional with investment community connections', status: 'pending', rentalStart: new Date(), rentalEnd: new Date(Date.now() + 30*24*60*60*1000) }
    ];

    for (const acc of accounts) {
      const newAcc = new Account({ userId: demo._id, ...acc });
      await newAcc.save();
    }
    console.log('Sample data created');
  }

  await mongoose.disconnect();
}

createAdmin().then(addSampleData);