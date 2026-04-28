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
const DOMAIN = process.env.DOMAIN || 'http://localhost:3000';
const io = socketio(server, {
  cors: {
    origin: DOMAIN,
    methods: ['GET', 'POST']
  }
});

const User = require('./models/User');
const Account = require('./models/Account');
const Message = require('./models/Message');
const Review = require('./models/Review');
const Contact = require('./models/Contact');
const Newsletter = require('./models/Newsletter');

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
  
  if (!user.isActive) return res.status(400).send({ success: false, message: 'Account is deactivated' });

  const valid = await user.verifyPassword(password);
  if (!valid) return res.status(400).send({ success: false, message: 'Invalid password' });

  // Save login history
  user.loginHistory.unshift({
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.headers['user-agent']
  });
  if (user.loginHistory.length > 10) user.loginHistory = user.loginHistory.slice(0, 10);
  await user.save();

  setSessionCookie(res, user, Boolean(remember));
  res.send({ success: true, role: user.role, name: user.name });
});

app.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.send({ success: true });
});

app.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).send({ success: false, message: 'Email required' });

  const crypto = require('crypto');
  const token = crypto.randomBytes(32).toString('hex');
  const user = await User.findOne({ email });
  
  if (user) {
    user.resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex');
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();
    // In production, send email. For now, return token for testing
    res.send({ success: true, message: 'Reset link sent to email', token });
  } else {
    res.send({ success: true, message: 'If email exists, reset link sent' });
  }
});

app.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).send({ success: false, message: 'Token and password required' });

  const crypto = require('crypto');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  
  const user = await User.findOne({
    resetPasswordToken: tokenHash,
    resetPasswordExpires: { $gt: Date.now() }
  });

  if (!user) return res.status(400).send({ success: false, message: 'Invalid or expired token' });

  user.password = password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();

  res.send({ success: true, message: 'Password reset successful' });
});

app.get('/user/profile', requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id).select('-password -resetPasswordToken');
  if (!user) return res.status(404).send({ success: false, message: 'User not found' });
  res.send({ 
    success: true, 
    user: { 
      id: user._id, 
      name: user.name, 
      email: user.email, 
      role: user.role,
      profilePicture: user.profilePicture,
      twoFactorEnabled: user.twoFactorEnabled,
      createdAt: user.createdAt,
      loginHistory: user.loginHistory.slice(0, 5)
    } 
  });
});

app.post('/user/profile', requireAuth, async (req, res) => {
  const { name, profilePicture } = req.body;
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).send({ success: false, message: 'User not found' });

  if (name) user.name = name;
  if (profilePicture !== undefined) user.profilePicture = profilePicture;
  await user.save();

  res.send({ success: true, message: 'Profile updated' });
});

app.post('/user/delete-account', requireAuth, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).send({ success: false, message: 'Password required' });

  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).send({ success: false, message: 'User not found' });

  const valid = await user.verifyPassword(password);
  if (!valid) return res.status(400).send({ success: false, message: 'Invalid password' });

  await User.findByIdAndDelete(req.user.id);
  await Account.deleteMany({ userId: req.user.id });
  clearSessionCookie(res);
  res.send({ success: true, message: 'Account deleted' });
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

app.get('/admin/users', requireAuth, requireAdmin, async (req, res) => {
  const users = await User.find().select('-password -resetPasswordToken').sort({ createdAt: -1 });
  res.send({ success: true, users });
});

app.post('/admin/user/:userId/toggle', requireAuth, requireAdmin, async (req, res) => {
  const { userId } = req.params;
  const user = await User.findById(userId);
  if (!user) return res.status(404).send({ success: false, message: 'User not found' });
  if (user.role === 'admin') return res.status(400).send({ success: false, message: 'Cannot deactivate admin' });

  user.isActive = !user.isActive;
  await user.save();
  res.send({ success: true, isActive: user.isActive, message: user.isActive ? 'User activated' : 'User deactivated' });
});

app.get('/admin/user/:userId/login-history', requireAuth, requireAdmin, async (req, res) => {
  const { userId } = req.params;
  const user = await User.findById(userId).select('loginHistory name');
  if (!user) return res.status(404).send({ success: false, message: 'User not found' });
  res.send({ success: true, loginHistory: user.loginHistory, name: user.name });
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
  console.log('User connected:', socket.user.name, socket.user.role);

  socket.on('sendMessage', async (msg) => {
    const text = typeof msg?.text === 'string' ? msg.text.trim() : '';
    if (!text) return;

    const sender = socket.user.role === 'admin' ? 'admin' : 'client';
    const receiver = sender === 'admin' ? 'client' : 'admin';
    const message = new Message({ sender, receiver, text });
    await message.save();

    console.log('Message sent:', sender, '->', receiver, text);
    
    io.emit('receiveMessage', {
      sender,
      receiver,
      text,
      timestamp: message.timestamp
    });
  });
});

app.get('/messages', requireAuth, async (req, res) => {
  const messages = await Message.find().sort({ timestamp: -1 }).limit(100);
  res.send({ success: true, messages });
});

// Reviews
app.post('/reviews', requireAuth, async (req, res) => {
  const { accountId, rating, text } = req.body;
  if (!rating || !text) {
    return res.status(400).send({ success: false, message: 'Rating and text required' });
  }
  const review = new Review({
    userId: req.user.id,
    userName: req.user.name,
    accountId,
    rating: parseInt(rating, 10),
    text
  });
  await review.save();
  res.send({ success: true, message: 'Review submitted for approval' });
});

app.get('/reviews', async (req, res) => {
  const reviews = await Review.find({ isApproved: true }).sort({ createdAt: -1 }).limit(20);
  res.send({ success: true, reviews });
});

app.get('/admin/reviews', requireAuth, requireAdmin, async (req, res) => {
  const reviews = await Review.find().sort({ createdAt: -1 }).populate('userId', 'name email');
  res.send({ success: true, reviews });
});

app.post('/admin/reviews/:reviewId/approve', requireAuth, requireAdmin, async (req, res) => {
  const { reviewId } = req.params;
  const review = await Review.findById(reviewId);
  if (!review) return res.status(404).send({ success: false, message: 'Review not found' });
  review.isApproved = !review.isApproved;
  await review.save();
  res.send({ success: true, isApproved: review.isApproved });
});

app.delete('/admin/reviews/:reviewId', requireAuth, requireAdmin, async (req, res) => {
  await Review.findByIdAndDelete(req.params.reviewId);
  res.send({ success: true, message: 'Review deleted' });
});

// Contact
app.post('/contact', async (req, res) => {
  const { name, email, subject, message } = req.body;
  if (!name || !email || !message) {
    return res.status(400).send({ success: false, message: 'Name, email and message required' });
  }
  const contact = new Contact({ name, email, subject, message });
  await contact.save();
  res.send({ success: true, message: 'Message sent successfully' });
});

app.get('/admin/contacts', requireAuth, requireAdmin, async (req, res) => {
  const contacts = await Contact.find().sort({ createdAt: -1 });
  res.send({ success: true, contacts });
});

app.post('/admin/contacts/:contactId/status', requireAuth, requireAdmin, async (req, res) => {
  const { status } = req.body;
  const contact = await Contact.findByIdAndUpdate(req.params.contactId, { status }, { new: true });
  res.send({ success: true, contact });
});

// Newsletter
app.post('/newsletter', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).send({ success: false, message: 'Email required' });
  try {
    const subscriber = new Newsletter({ email });
    await subscriber.save();
    res.send({ success: true, message: 'Subscribed successfully' });
  } catch (err) {
    res.status(400).send({ success: false, message: 'Already subscribed' });
  }
});

app.get('/admin/newsletter', requireAuth, requireAdmin, async (req, res) => {
  const subscribers = await Newsletter.find().sort({ createdAt: -1 });
  res.send({ success: true, subscribers });
});

// Search & Filter Accounts
app.get('/client/available-accounts', async (req, res) => {
  const { search, minPrice, maxPrice, category, sort } = req.query;
  let query = { status: 'approved' };
  
  if (search) {
    query.$or = [
      { accountName: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } }
    ];
  }
  if (minPrice || maxPrice) {
    query.price = {};
    if (minPrice) query.price.$gte = parseFloat(minPrice);
    if (maxPrice) query.price.$lte = parseFloat(maxPrice);
  }
  if (category) {
    query.category = category;
  }
  
  let sortOption = {};
  if (sort === 'price_asc') sortOption.price = 1;
  else if (sort === 'price_desc') sortOption.price = -1;
  else if (sort === 'newest') sortOption.createdAt = -1;
  else sortOption.createdAt = -1;
  
  const accounts = await Account.find(query).populate('userId', 'name email').sort(sortOption);
  res.send(accounts);
});

// Stats for homepage
app.get('/stats', async (req, res) => {
  const totalAccounts = await Account.countDocuments();
  const rentedAccounts = await Account.countDocuments({ status: 'rented' });
  const totalUsers = await User.countDocuments();
  const totalReviews = await Review.countDocuments({ isApproved: true });
  const avgRating = await Review.aggregate([
    { $match: { isApproved: true } },
    { $group: { _id: null, avg: { $avg: '$rating' } } }
  ]);
  
  res.send({
    success: true,
    stats: {
      totalAccounts,
      rentedAccounts,
      totalUsers,
      totalReviews,
      avgRating: avgRating[0]?.avg ? avgRating[0].avg.toFixed(1) : 0
    }
  });
});

// Activity feed
app.get('/activity', async (req, res) => {
  const recentRentals = await Account.find({ status: 'rented' })
    .sort({ updatedAt: -1 })
    .limit(5)
    .populate('userId', 'name')
    .select('accountName price updatedAt');
  
  const recentReviews = await Review.find({ isApproved: true })
    .sort({ createdAt: -1 })
    .limit(5)
    .select('userName rating text createdAt');
  
  res.send({
    success: true,
    activities: [
      ...recentRentals.map(r => ({
        type: 'rental',
        text: `${r.accountName} was rented`,
        time: r.updatedAt
      })),
      ...recentReviews.map(r => ({
        type: 'review',
        text: `${r.userName} left a ${r.rating}-star review`,
        time: r.createdAt
      }))
    ].sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 8)
  });
});

// Notifications
app.get('/notifications', requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id);
  res.send({ success: true, notifications: user.notifications || [] });
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
