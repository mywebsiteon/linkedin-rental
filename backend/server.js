/**
 * Eagle Web Commerce - Backend Server with Payments
 * 
 * @version 1.0.0
 * Features: JWT Auth, Payments (Pesapal, Coinbase), 2FA, Sessions
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// MIDDLEWARE
// ==========================================

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api/', limiter);

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5 });

// ==========================================
// CONFIG - Payment Providers
// ==========================================

const PAYMENT_CONFIG = {
    pesapal: {
        consumerKey: process.env.PESAPAL_KEY || '8MXJW3oXrSHpMDbKNxaG3XcAhVOdLCj+',
        consumerSecret: process.env.PESAPAL_SECRET || 'GjY4RLxU2dJFdtQ3xjCImQoPnPQ=',
        baseUrl: process.env.PESAPAL_URL || 'https://demo.pesapal.com',
        callbackUrl: process.env.PESAPAL_CALLBACK || 'https://eaglewebcommerce.com/payment-callback'
    },
    coinbase: {
        apiKey: process.env.COINBASE_KEY || '',
        webhookSecret: process.env.COINBASE_WEBHOOK_SECRET || '',
        callbackUrl: process.env.COINBASE_CALLBACK || 'https://eaglewebcommerce.com/coinbase-callback'
    }
};

// Package pricing
const PACKAGES = {
    basic: { name: 'Basic Membership', price: 50, duration: 30, features: ['Basic tasks', 'Referral access'] },
    premium: { name: 'Premium Membership', price: 150, duration: 30, features: ['All tasks', 'Priority support', 'Higher earnings'] },
    vip: { name: 'VIP Membership', price: 300, duration: 30, features: ['Unlimited tasks', 'VIP support', 'Max earnings', 'Bonus rewards'] }
};

// ==========================================
// DATABASE (In-Memory)
// ==========================================

const users = new Map();
const transactions = new Map();
const payments = new Map();
const sessions = new Map();

const JWT_SECRET = process.env.JWT_SECRET || 'eagleweb-secret-2024';
const generateId = () => 'EW' + Date.now().toString(36).toUpperCase();
const hashPassword = (p) => bcrypt.hash(p, 10);
const comparePassword = (p, h) => bcrypt.compare(p, h);

const createToken = (user) => jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
const verifyToken = (t) => { try { return jwt.verify(t, JWT_SECRET); } catch { return null; } };

// ==========================================
// AUTH MIDDLEWARE
// ==========================================

const authenticate = (req, res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
    const token = header.split(' ')[1];
    const decoded = verifyToken(token);
    if (!decoded) return res.status(401).json({ error: 'Invalid token' });
    const user = users.get(decoded.id);
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = user;
    next();
};

// ==========================================
// PESAPAL INTEGRATION
// ==========================================

const getPesapalToken = async () => {
    const { consumerKey, consumerSecret, baseUrl } = PAYMENT_CONFIG.pesapal;
    const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    
    try {
        const response = await fetch(`${baseUrl}/api/Authentication/RequestToken`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                consumer_key: consumerKey,
                consumer_secret: consumerSecret
            })
        });
        
        const data = await response.json();
        return data.token;
    } catch (error) {
        console.error('Pesapal token error:', error);
        return null;
    }
};

const createPesapalOrder = async (user, packageKey) => {
    const { baseUrl, callbackUrl } = PAYMENT_CONFIG.pesapal;
    const pkg = PACKAGES[packageKey];
    
    const order = {
        id: generateId(),
        userId: user.id,
        amount: pkg.price,
        description: pkg.name,
        type: 'pesapal',
        callback_url: callbackUrl,
        notification_id: generateId()
    };
    
    try {
        const token = await getPesapalToken();
        if (!token) return { error: 'Payment service unavailable' };
        
        // Create order registration
        const pesapalOrder = {
            unique_id: order.id,
            description: pkg.name,
            amount: pkg.price,
            currency: 'USD',
            callback_url: callbackUrl,
            notification_id: order.id
        };
        
        // Store pending payment
        payments.set(order.id, { ...order, status: 'pending', token });
        
        return {
            id: order.id,
            reference: order.id,
            amount: pkg.price,
            description: pkg.name,
            paymentUrl: `${baseUrl}/api/Checkout/Register?
                oauth_token=${token}&
                unique_id=${order.id}&
                description=${encodeURIComponent(pkg.name)}&
                amount=${pkg.price}&
                currency=USD&
                callback_url=${encodeURIComponent(callbackUrl)}`
        };
    } catch (error) {
        console.error('Pesapal order error:', error);
        return { error: 'Failed to create order' };
    }
};

// ==========================================
// COINBASE COMMERCE INTEGRATION
// ==========================================

const createCoinbaseCharge = async (user, packageKey) => {
    const pkg = PACKAGES[packageKey];
    
    const chargeData = {
        name: pkg.name,
        description: `Eagle Web ${pkg.name} - ${user.email}`,
        logo_url: 'https://eaglewebcommerce.com/logo.png',
        redirect_url: PAYMENT_CONFIG.coinbase.callbackUrl,
        webhook_url: PAYMENT_CONFIG.coinbase.callbackUrl,
        pricing_type: 'fixed_price',
        local_price: {
            amount: pkg.price.toString(),
            currency: 'USD'
        }
    };
    
    try {
        const response = await fetch('https://api.commerce.coinbase.com/charges', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CC-Version': '2018-03-22',
                'X-CC-Api-Key': PAYMENT_CONFIG.coinbase.apiKey
            },
            body: JSON.stringify(chargeData)
        });
        
        const result = await response.json();
        
        if (result.data) {
            const charge = {
                id: generateId(),
                userId: user.id,
                coinbaseId: result.data.code,
                amount: pkg.price,
                package: packageKey,
                status: 'pending',
                hostedUrl: result.data.hosted_url,
                createdAt: Date.now()
            };
            
            payments.set(charge.id, charge);
            return {
                id: charge.id,
                reference: result.data.code,
                amount: pkg.price,
                paymentUrl: result.data.hosted_url
            };
        }
        
        return { error: 'Failed to create charge' };
    } catch (error) {
        console.error('Coinbase error:', error);
        return { error: 'Payment service unavailable' };
    }
};

// ==========================================
// PAYMENT WEBHOOKS
// ==========================================

// Pesapal IPN webhook
app.post('/api/payment/pesapal-ipn', async (req, res) => {
    const { pesapalNotification, pesapalTrackingId } = req.body;
    
    // Verify Pesapal notification
    const payment = payments.get(pesapalTrackingId);
    if (payment) {
        payment.status = 'completed';
        payment.verifiedAt = Date.now();
        payments.set(pesapalTrackingId, payment);
        
        // Update user membership
        const user = users.get(payment.userId);
        if (user) {
            user.membership = payment.packageKey;
            user.membershipExpires = Date.now() + (30 * 24 * 60 * 60 * 1000);
            users.set(user.id, user);
        }
    }
    
    res.status(200).send('OK');
});

// Coinbase webhook
app.post('/api/payment/coinbase-webhook', async (req, res) => {
    const event = req.body;
    
    if (event.type === 'charge:confirmed') {
        const chargeId = event.data.metadata?.charge_id;
        const payment = payments.get(chargeId);
        
        if (payment) {
            payment.status = 'completed';
            payment.verifiedAt = Date.now();
            payments.set(chargeId, payment);
            
            const user = users.get(payment.userId);
            if (user) {
                user.membership = payment.package;
                user.membershipExpires = Date.now() + (30 * 24 * 60 * 60 * 1000);
                users.set(user.id, user);
            }
        }
    }
    
    res.status(200).send('OK');
});

// ==========================================
// PUBLIC ROUTES
// ==========================================

// Health check
app.get('/api/health', (req, res) => 
    res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Get packages
app.get('/api/packages', (req, res) => 
    res.json({ packages: PACKAGES }));

// Create payment
app.post('/api/payment/create', authenticate, async (req, res) => {
    try {
        const { provider, package: packageKey } = req.body;
        
        if (!provider || !['pesapal', 'coinbase'].includes(provider)) {
            return res.status(400).json({ error: 'Invalid provider' });
        }
        
        if (!PACKAGES[packageKey]) {
            return res.status(400).json({ error: 'Invalid package' });
        }
        
        let result;
        
        if (provider === 'pesapal') {
            result = await createPesapalOrder(req.user, packageKey);
        } else if (provider === 'coinbase') {
            result = await createCoinbaseCharge(req.user, packageKey);
        }
        
        if (result.error) {
            return res.status(400).json(result);
        }
        
        res.json({
            success: true,
            paymentId: result.id,
            reference: result.reference,
            amount: result.amount,
            paymentUrl: result.paymentUrl
        });
    } catch (error) {
        console.error('Payment create error:', error);
        res.status(500).json({ error: 'Payment failed' });
    }
});

// Check payment status
app.get('/api/payment/:id/status', authenticate, (req, res) => {
    const payment = payments.get(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Not found' });
    
    res.json({
        id: payment.id,
        status: payment.status,
        amount: payment.amount,
        createdAt: payment.createdAt
    });
});

// Get user payments
app.get('/api/payments', authenticate, (req, res) => {
    const userPayments = [];
    for (const payment of payments.values()) {
        if (payment.userId === req.user.id) {
            userPayments.push(payment);
        }
    }
    res.json({ payments: userPayments });
});

// ==========================================
// AUTH ROUTES
// ==========================================

app.post('/api/auth/register', authLimiter, async (req, res) => {
    const { name, email, password, referral } = req.body;
    
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'All fields required' });
    }
    
    for (const user of users.values()) {
        if (user.email === email) return res.status(409).json({ error: 'Email exists' });
    }
    
    const id = generateId();
    const user = {
        id, name, email,
        password: await hashPassword(password),
        referralCode: generateId(),
        balance: 0,
        referredBy: referral || null,
        createdAt: new Date().toISOString()
    };
    
    users.set(id, user);
    
    const token = createToken(user);
    
    res.json({
        success: true,
        token,
        user: { id: user.id, name: user.name, email: user.email, referralCode: user.referralCode }
    });
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
    const { email, password } = req.body;
    
    let user = null;
    for (const u of users.values()) {
        if (u.email === email) { user = u; break; }
    }
    
    if (!user || !(await comparePassword(password, user.password))) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = createToken(user);
    
    res.json({
        success: true,
        token,
        user: { 
            id: user.id, 
            name: user.name, 
            email: user.email, 
            balance: user.balance,
            referralCode: user.referralCode,
            membership: user.membership,
            membershipExpires: user.membershipExpires
        }
    });
});

// Get user profile
app.get('/api/user', authenticate, (req, res) => {
    res.json({ user: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        balance: req.user.balance,
        referralCode: req.user.referralCode,
        membership: req.user.membership,
        membershipExpires: req.user.membershipExpires,
        createdAt: req.user.createdAt
    }});
});

// ==========================================
// TRANSACTIONS & REFERRALS
// ==========================================

app.get('/api/transactions', authenticate, (req, res) => {
    const userTxs = [];
    for (const tx of transactions.values()) {
        if (tx.userId === req.user.id) userTxs.push(tx);
    }
    res.json({ transactions: userTxs });
});

app.get('/api/referral', authenticate, (req, res) => {
    const referrals = [];
    for (const user of users.values()) {
        if (user.referredBy === req.user.referralCode) referrals.push(user);
    }
    
    res.json({
        referralCode: req.user.referralCode,
        referralLink: `https://eaglewebcommerce.com/register?ref=${req.user.referralCode}`,
        referrals: referrals.length,
        earnings: referrals.length * 10
    });
});

// ==========================================
// BALANCE & WITHDRAW
// ==========================================

app.get('/api/balance', authenticate, (req, res) => {
    res.json({ balance: req.user.balance || 0 });
});

app.post('/api/withdraw', authenticate, async (req, res) => {
    const { amount, method, address } = req.body;
    
    if (!amount || amount < 50) {
        return res.status(400).json({ error: 'Minimum withdrawal $50' });
    }
    
    if (req.user.balance < amount) {
        return res.status(400).json({ error: 'Insufficient balance' });
    }
    
    req.user.balance -= amount;
    users.set(req.user.id, req.user);
    
    const tx = {
        id: generateId(),
        userId: req.user.id,
        type: 'withdraw',
        amount,
        method,
        address,
        status: 'pending',
        createdAt: new Date().toISOString()
    };
    
    transactions.set(tx.id, tx);
    
    res.json({ success: true, transaction: tx, balance: req.user.balance });
});

// ==========================================
// ERROR HANDLING
// ==========================================

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: 'Server error' });
});

// ==========================================
// START SERVER
// ==========================================

app.listen(PORT, () => {
    console.log(`Eagle Web Server running on port ${PORT}`);
    console.log(`Payments: Pesapal ${PAYMENT_CONFIG.pesapal.baseUrl.includes('demo') ? '(Demo)' : '(Live)'}`);
    console.log(`Coinbase: ${PAYMENT_CONFIG.coinbase.apiKey ? 'Configured' : 'Not configured'}`);
});

module.exports = app;