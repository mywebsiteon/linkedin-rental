require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Account = require('./models/Account');
const { connectToMongo } = require('./mongo');

async function createAdmin() {
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
}

async function addSampleData() {
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
}

async function main() {
  try {
    const { uriType } = await connectToMongo();
    console.log(`Connected to MongoDB using ${uriType} connection`);
    await createAdmin();
    await addSampleData();
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected');
  }
}

main();
