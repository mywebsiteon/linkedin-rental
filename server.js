require('dotenv').config();
const express = require('express');
const http = require('http');
const socketio = require('socket.io');
const bodyParser = require('body-parser');
const {
  assertAuthConfig,
  clearSessionCookie,
  getSessionUserFromCookieHeader,
  getSessionUserFromRequest,
  setSessionCookie
} = require('./auth');
const { connectToMongo } = require('./mongo');

const app = express();
const server = http.createServer(app);
const io = socketio(server);

const User = require('./models/User');
const Account = require('./models/Account');
const Message = require('./models/Message');

app.use(express.static('public'));
app.use(bodyParser.json());

const requireAuth = (req, res, next) => {
  const user = getSessionUserFromRequest(req);
  if (!user) {
    return res.status(401).send({ success: false, message: 'Authentication required' });
  }

  req.user = user;
  next();
};

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).send({ success: false, message: 'Admin access required' });
  }

  next();
};

app.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).send({ success: false, message: 'All fields required' });
  }

  if (password.length < 8) {
    return res.status(400).send({ success: false, message: 'Password must be at least 8 characters' });
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
  const { email, password, remember } = req.body;
  if (!email || !password) {
    return res.status(400).send({ success: false, message: 'Email and password required' });
  }

  const user = await User.findOne({ email });
  if (!user) return res.status(400).send({ success: false, message: 'User not found' });

  const valid = await user.verifyPassword(password);
  if (!valid) return res.status(400).send({ success: false, message: 'Invalid password' });

  setSessionCookie(res, user, Boolean(remember));
  res.send({ success: true, role: user.role, name: user.name });
});

app.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.send({ success: true });
});

app.get('/me', requireAuth, (req, res) => {
  res.send({
    success: true,
    userId: req.user.id,
    role: req.user.role,
    name: req.user.name
  });
});

app.post('/submit-account', requireAuth, async (req, res) => {
  const { accountName, email, price, description, rentalDays } = req.body;

  if (!accountName || !email || !price || !rentalDays) {
    return res.status(400).send({ success: false, message: 'Required fields missing' });
  }

  const rentalStart = new Date();
  const rentalEnd = new Date();
  rentalEnd.setDate(rentalEnd.getDate() + parseInt(rentalDays, 10));

  const account = new Account({
    userId: req.user.id,
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

app.get('/admin/accounts', requireAuth, requireAdmin, async (req, res) => {
  const accounts = await Account.find().populate('userId', 'name email');
  const now = new Date();

  for (const account of accounts) {
    if (account.rentalEnd && now > account.rentalEnd && account.status === 'rented') {
      account.status = 'approved';
      await account.save();
    }
  }

  res.send(accounts);
});

app.post('/admin/approve-account', requireAuth, requireAdmin, async (req, res) => {
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

app.get('/setup-admin', async (req, res) => {
  const email = req.query.email || 'admin@linkedrent.com';
  const password = req.query.password || 'admin123';
  const adminExists = await User.findOne({ email });
  if (adminExists) {
    return res.send({ success: false, message: 'Admin already exists' });
  }
  const admin = new User({
    name: 'Admin',
    email,
    password,
    role: 'admin'
  });
  await admin.save();
  res.send({ success: true, message: 'Admin created', email, password });
});

app.get('/admin/chart-data', requireAuth, requireAdmin, async (req, res) => {
  const data = [3, 5, 2, 4];
  res.send(data);
});

app.get('/client/my-accounts', requireAuth, async (req, res) => {
  const accounts = await Account.find({ userId: req.user.id });
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
  if (account.status !== 'approved') {
    return res.status(400).send({ success: false, message: 'Account not available for rent' });
  }

  account.status = 'rented';
  account.renterId = req.user.id;
  await account.save();
  res.send({ success: true });
});

io.use((socket, next) => {
  const user = getSessionUserFromCookieHeader(socket.handshake.headers.cookie);
  if (!user) {
    return next(new Error('Authentication required'));
  }

  socket.user = user;
  next();
});

io.on('connection', (socket) => {
  console.log('User connected');

  socket.on('sendMessage', async (msg) => {
    const text = typeof msg?.text === 'string' ? msg.text.trim() : '';
    if (!text) return;

    const sender = socket.user.role === 'admin' ? 'admin' : 'client';
    const receiver = sender === 'admin' ? 'client' : 'admin';
    const message = new Message({ sender, receiver, text });
    await message.save();

    io.emit('receiveMessage', {
      sender,
      receiver,
      text,
      timestamp: message.timestamp
    });
  });
});

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    assertAuthConfig();
    const { uriType } = await connectToMongo();
    console.log(`MongoDB Atlas connected using ${uriType} connection`);
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

startServer();
