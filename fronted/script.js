/**
 * Eagle Web Commerce - Dashboard JavaScript
 * 
 * @version 1.0.0
 */

(function() {
    'use strict';

    // Configuration
    const CONFIG = {
        STORAGE_KEY: 'eagleweb_data',
        MIN_WITHDRAW: 500,
        CRYPTO_NETWORKS: {
            bnb: 'BEP20',
            btc: 'Bitcoin',
            eth: 'ERC20',
            usdt: 'TRC20'
        }
    };

    // State
    let state = {
        isLoggedIn: false,
        user: null,
        balance: 0,
        referralCode: '',
        referralCount: 0,
        referralEarnings: 0,
        transactions: [],
        settings: { theme: 'dark' }
    };

    // ==========================================
    // Utility Functions
    // ==========================================
    function generateId() {
        return 'EW' + Date.now().toString(36).toUpperCase();
    }

    function formatCurrency(amount) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount);
    }

    function formatDate(timestamp) {
        return new Date(timestamp).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }

    // ==========================================
    // Storage
    // ==========================================
    function saveState() {
        try {
            localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(state));
        } catch (e) {
            console.error('Save error:', e);
        }
    }

    function loadState() {
        try {
            const data = localStorage.getItem(CONFIG.STORAGE_KEY);
            if (data) {
                state = { ...state, ...JSON.parse(data) };
            }
        } catch (e) {
            console.error('Load error:', e);
        }
    }

    // ==========================================
    // Toast Notifications
    // ==========================================
    function showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'times-circle' : 'exclamation-circle'}"></i>
            <span>${message}</span>
        `;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // ==========================================
    // UI Updates
    // ==========================================
    function updateUI() {
        // Balance
        document.getElementById('header-balance').textContent = formatCurrency(state.balance);
        document.getElementById('stat-balance').textContent = formatCurrency(state.balance);
        document.getElementById('stat-earnings').textContent = formatCurrency(state.referralEarnings);
        document.getElementById('stat-referrals').textContent = state.referralCount;
        document.getElementById('stat-pending').textContent = formatCurrency(0);

        // User
        if (state.user) {
            const initials = state.user.split(' ').map(n => n[0]).join('').toUpperCase();
            document.getElementById('user-avatar').textContent = initials.slice(0, 2);
            document.getElementById('user-name').textContent = state.user;
        }

        // Referral
        const refLink = `https://eaglewebcommerce.com/register?ref=${state.referralCode}`;
        document.getElementById('referral-link').value = refLink;
        document.getElementById('ref-count').textContent = state.referralCount;
        document.getElementById('ref-earnings').textContent = formatCurrency(state.referralEarnings);

        // Transactions
        renderTransactions();
    }

    function renderTransactions() {
        const tbody = document.getElementById('transactions-list');
        if (!tbody) return;

        if (!state.transactions.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="3" class="empty-state">
                        <i class="fas fa-inbox"></i>
                        <p>No transactions yet</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = state.transactions.slice(0, 5).map(tx => `
            <tr>
                <td>${tx.type}</td>
                <td>${formatCurrency(tx.amount)}</td>
                <td><span class="status-badge ${tx.status}">${tx.status}</span></td>
            </tr>
        `).join('');
    }

    function showLoading(show = true) {
        document.getElementById('loading').classList.toggle('hidden', !show);
    }

    // ==========================================
    // Auth Functions
    // ==========================================
    function handleLogin(e) {
        e.preventDefault();
        
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-pass').value;

        if (!email || !password) {
            showToast('Please fill in all fields', 'error');
            return;
        }

        showLoading(true);

        // Simulate login
        setTimeout(() => {
            state.isLoggedIn = true;
            state.user = email.split('@')[0];
            state.balance = 1250.00;
            state.referralCode = generateId();
            state.referralCount = 12;
            state.referralEarnings = 120;
            saveState();

            showLoading(false);
            showDashboard();
            showToast('Welcome back!');
        }, 1500);
    }

    function handleRegister(e) {
        e.preventDefault();
        
        const username = document.getElementById('reg-username').value.trim();
        const email = document.getElementById('reg-email').value.trim();
        const password = document.getElementById('reg-pass').value;
        const terms = document.getElementById('terms').checked;

        if (!username || !email || !password) {
            showToast('Please fill all fields', 'error');
            return;
        }

        if (!terms) {
            showToast('Please accept terms', 'error');
            return;
        }

        showLoading(true);

        // Simulate registration
        setTimeout(() => {
            state.isLoggedIn = true;
            state.user = `${document.getElementById('reg-firstname').value} ${document.getElementById('reg-lastname').value}`;
            state.balance = 0;
            state.referralCode = generateId();
            state.referralCount = 0;
            state.referralEarnings = 0;
            saveState();

            showLoading(false);
            showDashboard();
            showToast('Account created successfully!');
        }, 1500);
    }

    function showDashboard() {
        document.getElementById('auth-page').classList.add('hidden');
        document.getElementById('dashboard').classList.remove('hidden');
        updateUI();
    }

    function logout() {
        state.isLoggedIn = false;
        saveState();
        
        document.getElementById('dashboard').classList.add('hidden');
        document.getElementById('auth-page').classList.remove('hidden');
        
        showToast('Logged out successfully');
    }

    // ==========================================
    // Navigation
    // ==========================================
    function navigateTo(page) {
        // Hide all pages
        document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
        
        // Show selected page
        document.getElementById(`${page}-page`).classList.remove('hidden');
        
        // Update nav
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
            if (link.dataset.page === page) {
                link.classList.add('active');
            }
        });
    }

    function toggleSidebar() {
        document.getElementById('sidebar').classList.toggle('active');
    }

    // ==========================================
    // Withdraw
    // ==========================================
    function selectWithdrawalMethod(method) {
        document.querySelectorAll('.method-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.method === method);
        });
    }

    function updateWithdrawSummary() {
        const amount = parseFloat(document.getElementById('withdraw-amount').value) || 0;
        document.getElementById('summary-amount').textContent = formatCurrency(amount);
        document.getElementById('summary-total').textContent = formatCurrency(amount);
    }

    function processWithdraw() {
        const wallet = document.getElementById('wallet-address').value.trim();
        const amount = parseFloat(document.getElementById('withdraw-amount').value);

        if (!wallet) {
            showToast('Please enter wallet address', 'error');
            return;
        }

        if (!amount || amount < CONFIG.MIN_WITHDRAW) {
            showToast(`Minimum withdrawal is ${CONFIG.MIN_WITHDRAW}`, 'error');
            return;
        }

        if (amount > state.balance) {
            showToast('Insufficient balance', 'error');
            return;
        }

        showLoading(true);

        setTimeout(() => {
            const tx = {
                id: generateId(),
                type: 'Withdrawal',
                amount: amount,
                method: document.querySelector('.method-btn.active')?.textContent.trim() || 'Crypto',
                status: 'pending',
                timestamp: Date.now()
            };

            state.transactions.unshift(tx);
            state.balance -= amount;
            saveState();

            showLoading(false);
            updateUI();
            
            document.getElementById('wallet-address').value = '';
            document.getElementById('withdraw-amount').value = '';
            updateWithdrawSummary();
            
            showToast('Withdrawal submitted!');
            navigateTo('transactions');
        }, 1500);
    }

    // ==========================================
    // Payment & Membership
    // ==========================================
    let selectedPackage = 'basic';
    let selectedPaymentMethod = 'pesapal';

    window.selectPackage = function(packageKey) {
        selectedPackage = packageKey;
        
        // Update UI
        document.querySelectorAll('.package-card').forEach(card => {
            card.classList.toggle('featured', card.dataset.package === packageKey && packageKey !== 'basic');
        });
        
        // Update package name display
        const packageNames = {
            basic: 'Basic - $50/month',
            premium: 'Premium - $150/month',
            vip: 'VIP - $300/month'
        };
        document.getElementById('package-name').textContent = packageNames[packageKey] || 'Basic - $50/month';
        
        // Navigate to payment
        navigateTo('payment');
        showToast(`${packageKey.charAt(0).toUpperCase() + packageKey.slice(1)} selected`);
    };

    window.selectPaymentMethod = function(method) {
        selectedPaymentMethod = method;
        
        document.querySelectorAll('.payment-method').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.method === method);
        });
    };

    window.processPayment = async function() {
        showLoading(true);
        
        try {
            // Simulate API call to backend
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const paymentUrls = {
                pesapal: 'https://demo.pesapal.com/?amount=50',
                coinbase: 'https://commerce.coinbase.com/checkout'
            };
            
            showLoading(false);
            
            // In production, this would redirect to actual payment
            const confirmPay = confirm(`Proceed to ${selectedPaymentMethod === 'pesapal' ? 'Pesapal' : 'Coinbase'} for payment?`);
            
            if (confirmPay) {
                showToast('Redirecting to payment...');
                
                // Mark as paid for demo
                state.membership = selectedPackage;
                saveState();
                
                showToast('Payment successful! Membership activated.');
                navigateTo('overview');
            }
        } catch (error) {
            showLoading(false);
            showToast('Payment failed. Try again.', 'error');
        }
    };

    // ==========================================
    // Referral
    // ==========================================
    function copyReferralLink() {
        const input = document.getElementById('referral-link');
        if (!input) return;

        if (navigator.clipboard) {
            navigator.clipboard.writeText(input.value).then(() => {
                showToast('Link copied!');
            });
        } else {
            input.select();
            document.execCommand('copy');
            showToast('Link copied!');
        }
    }

    function shareLink(platform) {
        const input = document.getElementById('referral-link');
        const url = encodeURIComponent(input?.value || '');
        
        let shareUrl = '';
        switch (platform) {
            case 'whatsapp':
                shareUrl = `https://wa.me/?text=${url}`;
                break;
            case 'twitter':
                shareUrl = `https://twitter.com/intent/tweet?text=Join%20me%20on%20Eagle%20Web&url=${url}`;
                break;
            case 'facebook':
                shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${url}`;
                break;
        }
        
        if (shareUrl) {
            window.open(shareUrl, '_blank');
        }
    }

    // ==========================================
    // Toggle Password Visibility
    // ==========================================
    window.togglePassword = function(inputId) {
        const input = document.getElementById(inputId);
        if (!input) return;
        
        const btn = input.nextElementSibling;
        if (btn && btn.classList.contains('toggle-password')) {
            const icon = btn.querySelector('i');
            if (input.type === 'password') {
                input.type = 'text';
                icon.classList.replace('fa-eye', 'fa-eye-slash');
            } else {
                input.type = 'password';
                icon.classList.replace('fa-eye-slash', 'fa-eye');
            }
        }
    };

    // ==========================================
    // Theme Toggle
    // ==========================================
    window.toggleTheme = function() {
        const app = document.getElementById('app');
        const current = app?.getAttribute('data-theme') || 'dark';
        const newTheme = current === 'dark' ? 'light' : 'dark';
        app?.setAttribute('data-theme', newTheme);
        state.settings.theme = newTheme;
        saveState();
    };

    // ==========================================
    // Event Listeners
    // ==========================================
    function initEventListeners() {
        // Auth tabs
        document.querySelectorAll('.auth-tab').forEach(tab => {
            tab.addEventListener('click', function() {
                document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                
                const tabName = this.dataset.tab;
                document.getElementById('login-form').classList.toggle('hidden', tabName !== 'login');
                document.getElementById('register-form').classList.toggle('hidden', tabName !== 'register');
            });
        });

        // Forms
        document.getElementById('login-form').addEventListener('submit', handleLogin);
        document.getElementById('register-form').addEventListener('submit', handleRegister);

        // Nav
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', function() {
                navigateTo(this.dataset.page);
            });
        });

        // Withdraw methods
        document.querySelectorAll('.method-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                selectWithdrawalMethod(this.dataset.method);
            });
        });

        // Withdraw amount
        document.getElementById('withdraw-amount').addEventListener('input', updateWithdrawSummary);
    }

    // ==========================================
    // Initialize
    // ==========================================
    function init() {
        loadState();
        initEventListeners();

        // Check if logged in
        if (state.isLoggedIn) {
            showDashboard();
        }

        console.log('Eagle Web Commerce v1.0.0');
    }

    // Start
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose to window
    window.App = {
        navigateTo,
        logout,
        processWithdraw,
        copyReferralLink,
        shareLink,
        toggleTheme,
        toggleSidebar
    };

})();