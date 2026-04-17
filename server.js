require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const socketio = require('socket.io');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');

const app = express();
const server = http.createServer(app);
const io = socketio(server);

const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://admin:Caleb7909*@linkedin.duvndhx.mongodb.net/?appName=linkedin';
mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB Atlas connected'))
  .catch(err => console.error(err));

const User = require('./models/User');
const Account = require('./models/Account');
const Message = require('./models/Message');

app.use(express.static('public'));
app.use(bodyParser.json());

const requireAdmin = (req, res, next) => {
  const role = req.headers['x-role'] || req.query.role;
  if (role !== 'admin') {
    return res.status(403).send({ success: false, message: 'Admin access required' });
  }
  next();
};

const requireAuth = (req, res, next) => {
  const userId = req.headers['x-user-id'] || req.query.userId;
  if (!userId) {
    return res.status(401).send({ success: false, message: 'Authentication required' });
  }
  req.userId = userId;
  next();
};

app.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).send({ success: false, message: 'All fields required' });
  }
  try {
    const user = new User({ name, email, password });
    await user.save();
    res.send({ success: true, message: 'User registered' });
  } catch (err) {
    console.error(err);
    res.status(400).send({ success: false, message: 'Email already exists' });
  }
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).send({ success: false, message: 'Email and password required' });
  }
  const user = await User.findOne({ email });
  if (!user) return res.status(400).send({ success: false, message: 'User not found' });

  const valid = await user.verifyPassword(password);
  if (!valid) return res.status(400).send({ success: false, message: 'Invalid password' });

  res.send({ success: true, userId: user._id, role: user.role, name: user.name });
});

app.post('/submit-account', requireAuth, async (req, res) => {
  const { accountName, email, price, description, rentalDays } = req.body;

  if (!accountName || !email || !price || !rentalDays) {
    return res.status(400).send({ success: false, message: 'Required fields missing' });
  }

  const rentalStart = new Date();
  const rentalEnd = new Date();
  rentalEnd.setDate(rentalEnd.getDate() + parseInt(rentalDays));

  const account = new Account({
    userId: req.userId,
    accountName,
    email,
    price: parseFloat(price),
    description,
    status: 'pending',
    rentalStart,
    rentalEnd
  });
  await account.save();
  res.send({ success: true });
});

app.get('/admin/accounts', requireAdmin, async (req, res) => {
  const accounts = await Account.find().populate('userId', 'name email');
  const now = new Date();
  accounts.forEach(async (a) => {
    if (a.rentalEnd && now > a.rentalEnd && a.status === 'rented') {
      a.status = 'approved';
      await a.save();
    }
  });
  res.send(accounts);
});

app.post('/admin/approve-account', requireAdmin, async (req, res) => {
  const { accountId, action } = req.body;
  const account = await Account.findById(accountId);
  if (!account) return res.status(404).send({ success: false, message: 'Account not found' });

  if (action === 'approve') {
    account.status = 'approved';
  } else if (action === 'reject') {
    account.status = 'rejected';
  }
  await account.save();
  res.send({ success: true });
});

app.get('/admin/chart-data', requireAdmin, async (req, res) => {
  const data = [3, 5, 2, 4];
  res.send(data);
});

app.get('/client/my-accounts', requireAuth, async (req, res) => {
  const accounts = await Account.find({ userId: req.userId });
  res.send(accounts);
});

app.get('/client/available-accounts', async (req, res) => {
  const accounts = await Account.find({ status: 'approved' }).populate('userId', 'name email');
  res.send(accounts);
});

app.post('/client/rent-account', requireAuth, async (req, res) => {
  const { accountId } = req.body;
  const account = await Account.findById(accountId);
  if (!account) return res.status(404).send({ success: false, message: 'Account not found' });
  if (account.status !== 'approved') return res.status(400).send({ success: false, message: 'Account not available for rent' });

  account.status = 'rented';
  account.renterId = req.userId;
  await account.save();
  res.send({ success: true });
});

io.on('connection', (socket) => {
  console.log('User connected');

  socket.on('sendMessage', async (msg) => {
    if (!msg.sender || !msg.text) return;
    const message = new Message(msg);
    await message.save();
    io.emit('receiveMessage', msg);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
