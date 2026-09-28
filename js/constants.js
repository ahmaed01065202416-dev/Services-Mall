/**
 * ============================================================================
 * CONSTANTS.JS — Mall Services Platform
 * Global constants, helpers, and utilities
 * ============================================================================
 */
(function () {
'use strict';
// Guard: prevent double-execution if script is loaded twice
if (window.__CONSTANTS_LOADED__) return;
window.__CONSTANTS_LOADED__ = true;

// ── Firestore Collection Names ────────────────────────────────────────────────
const COLLECTIONS = {
    USERS:         'users',
    SERVICES:      'services',
    ORDERS:        'orders',
    REVIEWS:       'reviews',
    NOTIFICATIONS: 'notifications',
    MESSAGES:      'messages',
    CONVERSATIONS: 'conversations',
    WALLET:        'wallets',
    TRANSACTIONS:  'transactions',
    PAYMENTS:      'payments',
    REPORTS:       'reports',
    CATEGORIES:    'categories',
    ESCROW:        'escrow',
    DISPUTES:      'disputes',
    WITHDRAWALS:   'withdrawals',
    COUPONS:       'coupons',
    SUBSCRIPTIONS: 'subscriptions',
    DELIVERIES:    'deliveries',
};

// ── Platform Config (defaults — overridden by Firestore settings/platform) ────
const PLATFORM = {
    // ── Commission ─────────────────────────────────────────────────────
    FEE_TYPE:         'percent',   // 'percent' | 'fixed' | 'both'
    FEE_PERCENT:      5,           // percentage (used when type=percent or both)
    FEE_FIXED:        0,           // fixed amount in EGP (used when type=fixed or both)
    FEE_MIN:          0,           // minimum commission amount (0 = no minimum)
    FEE_MAX:          0,           // maximum commission amount (0 = no maximum)
    // ── Commission Tiers (optional) ───────────────────────────────────
    // If enabled, overrides FEE_PERCENT/FEE_FIXED based on order amount
    TIERS_ENABLED:    false,
    TIERS:            [], // [{minAmount:0, maxAmount:500, feePercent:7, feeFixed:0}, ...]
    // ── Withdrawal ────────────────────────────────────────────────────
    MIN_WITHDRAWAL:   100,
    MAX_WITHDRAWAL:   50000,
    WITHDRAWAL_NOTE:  '',
    // ── Platform Info ─────────────────────────────────────────────────
    CURRENCY:         'ج.م',
    CURRENCY_CODE:    'EGP',
    NAME:             'مول الخدمات',
    NAME_EN:          'Mall Services',
    SUPPORT_EMAIL:    'support@mall-services.com',
    VERSION:          '3.0.0',
    // ── Maintenance ───────────────────────────────────────────────────
    MAINTENANCE:      false,
    MAINTENANCE_MSG:  '',
};

// ── Load live settings from Firestore and merge into PLATFORM ─────────────────
// Called once at app start (before DOMContentLoaded).
// All existing code uses PLATFORM.FEE_PERCENT etc. and will automatically
// get the live values after this resolves.
async function loadPlatformSettings() {
    try {
        if (!window.db) return;
        const snap = await window.db.collection('settings').doc('platform').get();
        if (snap.exists) {
            const data = snap.data();
            Object.keys(data).forEach(k => { if (k in PLATFORM) PLATFORM[k] = data[k]; });
            console.log('[Settings] Platform config loaded | type:', PLATFORM.FEE_TYPE, '| %:', PLATFORM.FEE_PERCENT, '| fixed:', PLATFORM.FEE_FIXED);
        } else {
            // First run — write the defaults so the admin panel can display them
            await window.db.collection('settings').doc('platform').set(PLATFORM);
            console.log('[Settings] Default platform config written to Firestore');
        }
    } catch (e) {
        // Non-fatal — fall back to hardcoded defaults
        console.warn('[Settings] Could not load platform config:', e.message);
    }
}
window.loadPlatformSettings = loadPlatformSettings;

// ── Supported Currencies ──────────────────────────────────────────────────────
const CURRENCIES = {
    EGP: { symbol: 'ج.م', name: 'جنيه مصري',        nameEn: 'Egyptian Pound',   rate: 1       },
    USD: { symbol: '$',    name: 'دولار أمريكي',      nameEn: 'US Dollar',         rate: 0.0204  },
    EUR: { symbol: '€',    name: 'يورو',              nameEn: 'Euro',              rate: 0.0188  },
    GBP: { symbol: '£',    name: 'جنيه إسترليني',    nameEn: 'British Pound',     rate: 0.016   },
    SAR: { symbol: 'ر.س', name: 'ريال سعودي',        nameEn: 'Saudi Riyal',       rate: 0.0766  },
    AED: { symbol: 'د.إ', name: 'درهم إماراتي',      nameEn: 'UAE Dirham',        rate: 0.0748  },
};

// ── Order Statuses ────────────────────────────────────────────────────────────
const ORDER_STATUS = {
    PENDING:        'pending',
    PAYMENT_HELD:   'payment_held',
    IN_PROGRESS:    'in_progress',
    DELIVERED:      'delivered',
    REVISION:       'revision',
    COMPLETED:      'completed',
    DISPUTED:       'disputed',
    CANCELLED:      'cancelled',
    REFUNDED:       'refunded',
};

// ── Payment Methods ───────────────────────────────────────────────────────────
const PAYMENT_METHODS = {
    PAYMOB_CARD:    'paymob_card',
    FAWRY:          'fawry',
    VODAFONE:       'vodafone_cash',
    ETISALAT:       'etisalat_cash',
    ORANGE:         'orange_cash',
    WE_PAY:         'we_pay',
    PAYONEER:       'payoneer',
    STRIPE:         'stripe',
    WALLET:         'wallet_balance',
    BANK_TRANSFER:  'bank_transfer',
};

// ── Global AppState ───────────────────────────────────────────────────────────
window.AppState = window.AppState || {
    currentUser:          null,
    currentPage:          'home',
    cart:                 [],
    orders:               [],
    notifications:        [],
    wallet:               { balance: 0, currency: 'EGP' },
    currentService:       null,
    currentPaymentService: null,
    currentOrder:         null,
    language:             localStorage.getItem('ms_lang') || 'ar',
    currency:             localStorage.getItem('ms_currency') || 'EGP',
    theme:                localStorage.getItem('ms_theme') || 'light',
};

// Restore cart from storage
try {
    const saved = localStorage.getItem('ms_cart');
    if (saved) AppState.cart = JSON.parse(saved) || [];
} catch(_) { AppState.cart = []; }

// ── Firebase Helpers ──────────────────────────────────────────────────────────
function serverTimestamp() {
    if (window.firebase?.firestore?.FieldValue) {
        return window.firebase.firestore.FieldValue.serverTimestamp();
    }
    return new Date();
}

function increment(value) {
    if (window.firebase?.firestore?.FieldValue) {
        return window.firebase.firestore.FieldValue.increment(value);
    }
    return value;
}

// ── Storage Helpers ───────────────────────────────────────────────────────────
function saveToStorage() {
    try {
        localStorage.setItem('ms_cart', JSON.stringify(AppState.cart || []));
        localStorage.setItem('ms_lang', AppState.language || 'ar');
        localStorage.setItem('ms_currency', AppState.currency || 'EGP');
    } catch(e) { console.warn('Storage save failed:', e); }
}

async function uploadFile(file, folder, filename) {
    // ── Canvas Compression (bypasses Firebase Storage CORS entirely) ─────────
    // Resizes image to max 900px, converts to JPEG @0.78 quality → base64 data URL
    // Stored directly in Firestore — no external storage request, no CORS error.
    return new Promise((resolve, reject) => {
        const MAX_PX = 900;
        const QUALITY = 0.78;
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.onload = (e) => {
            const img = new Image();
            img.onerror = () => reject(new Error('Failed to load image'));
            img.onload = () => {
                // Calculate dimensions
                let { width, height } = img;
                if (width > MAX_PX || height > MAX_PX) {
                    if (width >= height) { height = Math.round(height * MAX_PX / width); width = MAX_PX; }
                    else                 { width  = Math.round(width  * MAX_PX / height); height = MAX_PX; }
                }
                const canvas = document.createElement('canvas');
                canvas.width  = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                const dataUrl = canvas.toDataURL('image/jpeg', QUALITY);
                // Guard: Firestore doc limit ~900KB for image field
                if (dataUrl.length > 900_000) {
                    // Re-compress at lower quality
                    resolve(canvas.toDataURL('image/jpeg', 0.5));
                } else {
                    resolve(dataUrl);
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// ── Formatting Helpers ────────────────────────────────────────────────────────
function generateId(prefix = '') {
    return `${prefix}${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function formatDateAr(timestamp) {
    if (!timestamp) return '—';
    let date;
    if (timestamp?.toDate) date = timestamp.toDate();
    else if (timestamp?.seconds) date = new Date(timestamp.seconds * 1000);
    else date = new Date(timestamp);
    if (isNaN(date.getTime())) return '—';
    const locale = AppState.language === 'en' ? 'en-US' : 'ar-EG';
    return date.toLocaleDateString(locale, { year:'numeric', month:'long', day:'numeric' });
}

function formatTimeAgo(timestamp) {
    if (!timestamp) return '';
    let date;
    if (timestamp?.toDate) date = timestamp.toDate();
    else if (timestamp?.seconds) date = new Date(timestamp.seconds * 1000);
    else date = new Date(timestamp);
    const diff = Date.now() - date.getTime();
    const min = Math.floor(diff / 60000);
    const hr  = Math.floor(diff / 3600000);
    const day = Math.floor(diff / 86400000);
    const isAr = AppState.language !== 'en';
    if (min < 1)   return isAr ? 'الآن' : 'Just now';
    if (min < 60)  return isAr ? `منذ ${min} دقيقة` : `${min}m ago`;
    if (hr  < 24)  return isAr ? `منذ ${hr} ساعة`   : `${hr}h ago`;
    return isAr ? `منذ ${day} يوم` : `${day}d ago`;
}

function formatCurrency(amount, currencyCode) {
    const code = currencyCode || AppState.currency || 'EGP';
    const cur  = CURRENCIES[code] || CURRENCIES.EGP;
    const val  = (parseFloat(amount) || 0) * cur.rate;
    const locale = AppState.language === 'en' ? 'en-US' : 'ar-EG';
    try {
        return new Intl.NumberFormat(locale, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(val) + ' ' + cur.symbol;
    } catch(_) {
        return val.toFixed(2) + ' ' + cur.symbol;
    }
}

function convertCurrency(amountEGP) {
    const code = AppState.currency || 'EGP';
    const cur  = CURRENCIES[code] || CURRENCIES.EGP;
    return parseFloat(amountEGP) * cur.rate;
}

// ── UI Helpers ────────────────────────────────────────────────────────────────
function updateCartCount() {
    const count = (AppState.cart || []).length;
    document.querySelectorAll('[data-cart-count]').forEach(el => {
        el.textContent = count;
        el.classList.toggle('hidden', count === 0);
    });
}

function getStatusText(status) {
    const isAr = AppState.language !== 'en';
    const map = {
        pending:        isAr ? 'في الانتظار'    : 'Pending',
        payment_held:   isAr ? 'الدفع محجوز'    : 'Payment Held',
        in_progress:    isAr ? 'جاري التنفيذ'   : 'In Progress',
        delivered:      isAr ? 'تم التسليم'     : 'Delivered',
        revision:       isAr ? 'طلب مراجعة'     : 'Revision',
        completed:      isAr ? 'مكتمل'          : 'Completed',
        disputed:       isAr ? 'نزاع'           : 'Disputed',
        cancelled:      isAr ? 'ملغي'           : 'Cancelled',
        refunded:       isAr ? 'مسترد'          : 'Refunded',
    };
    return map[status] || status || '—';
}

function getStatusClass(status) {
    const map = {
        pending:        'status-pending',
        payment_held:   'status-pending',
        in_progress:    'status-in-progress',
        delivered:      'status-delivered',
        revision:       'status-review',
        completed:      'status-completed',
        disputed:       'status-cancelled',
        cancelled:      'status-cancelled',
        refunded:       'status-review',
    };
    return map[status] || 'status-pending';
}

// ── Modal Helpers ─────────────────────────────────────────────────────────────
function openModal(id) {
    const m = document.getElementById(id);
    if (m) {
        m.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(id) {
    const m = document.getElementById(id);
    if (m) {
        m.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// ── Toast Notifications ───────────────────────────────────────────────────────
function showToast(message, type = 'info', duration = 4000) {
    const existing = document.getElementById('globalToast');
    if (existing) existing.remove();

    const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', warning: 'fa-triangle-exclamation', info: 'fa-circle-info' };
    const toast = document.createElement('div');
    toast.id = 'globalToast';
    toast.className = `toast ${type} show`;
    toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><span>${message}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, duration);
}

// ── Loading Overlay ───────────────────────────────────────────────────────────
function showLoading(msg = AppState.language === 'en' ? 'Loading...' : 'جاري التحميل...') {
    let loader = document.getElementById('globalLoader');
    if (!loader) {
        loader = document.createElement('div');
        loader.id = 'globalLoader';
        loader.className = 'fixed inset-0 bg-black/50 z-[100000] flex items-center justify-center';
        loader.innerHTML = `
            <div class="bg-white rounded-3xl p-8 flex flex-col items-center gap-4 shadow-2xl">
                <div class="w-14 h-14 rounded-full border-4 border-brand-200 border-t-brand-600 animate-spin"></div>
                <p id="loaderMsg" class="text-gray-700 font-semibold text-lg">${msg}</p>
            </div>`;
        document.body.appendChild(loader);
    } else {
        const p = loader.querySelector('#loaderMsg');
        if (p) p.textContent = msg;
        loader.classList.remove('hidden');
    }
}

function hideLoading() {
    const loader = document.getElementById('globalLoader');
    if (loader) loader.classList.add('hidden');
}

// ── Secure API Helper ─────────────────────────────────────────────────────────
async function secureApiCall(endpoint, action, data = {}) {
    const user = window.auth?.currentUser;
    if (!user) throw new Error(AppState.language === 'en' ? 'Please login first' : 'يرجى تسجيل الدخول أولاً');
    const idToken = await user.getIdToken();
    const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({ action, ...data }),
    });
    if (resp.status === 401) throw new Error('Session expired');
    if (resp.status === 429) throw new Error('Rate limit exceeded');
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `Server error: ${resp.status}`);
    }
    return resp.json();
}

// ── Input Sanitizer ───────────────────────────────────────────────────────────
function sanitizeInput(value, maxLength = 1000) {
    if (typeof value !== 'string') return value;
    return value
        .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]*>/g, '')
        .trim()
        .slice(0, maxLength);
}

// ── Image Preview ─────────────────────────────────────────────────────────────
function previewImage(input, previewId = 'serviceImagePreview') {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const preview = document.getElementById(previewId);
        if (preview) {
            preview.src = e.target.result;
            preview.classList.remove('hidden');
            preview.classList.add('show');
        }
        const zone = document.getElementById('uploadZoneText');
        if (zone) zone.classList.add('hidden');
    };
    reader.readAsDataURL(file);
}

// ── Cart Operations ───────────────────────────────────────────────────────────
function addToCart(service) {
    if (!service) return;
    const alreadyIn = (AppState.cart || []).some(i => i.id === service.id);
    if (alreadyIn) {
        showToast(AppState.language === 'en' ? 'Already in cart' : 'الخدمة موجودة في السلة', 'warning');
        return;
    }
    AppState.cart = AppState.cart || [];
    AppState.cart.push({ ...service, addedAt: new Date().toISOString() });
    saveToStorage();
    updateCartCount();
    showToast(AppState.language === 'en' ? 'Added to cart!' : 'تمت الإضافة للسلة!', 'success');
}

function removeFromCart(serviceId) {
    AppState.cart = (AppState.cart || []).filter(i => i.id !== serviceId);
    saveToStorage();
    updateCartCount();
    if (typeof renderCart === 'function') renderCart();
    showToast(AppState.language === 'en' ? 'Removed from cart' : 'تم الحذف من السلة', 'info');
}

function clearCart() {
    AppState.cart = [];
    saveToStorage();
    updateCartCount();
}

// ── Calculate platform fee ───────────────────────────────────────────────────
function calcPlatformFee(amount) {
    if (PLATFORM.TIERS_ENABLED && PLATFORM.TIERS && PLATFORM.TIERS.length) {
        const tier = PLATFORM.TIERS.find(t => amount >= (t.minAmount||0) && amount <= (t.maxAmount||Infinity));
        if (tier) {
            const pct   = Number(((tier.feePercent||0) * amount / 100).toFixed(2));
            const fixed = Number((tier.feeFixed||0).toFixed(2));
            return Number((pct + fixed).toFixed(2));
        }
    }
    const type = PLATFORM.FEE_TYPE || 'percent';
    if (type === 'fixed')   return Number((PLATFORM.FEE_FIXED || 0).toFixed(2));
    if (type === 'percent') return Number(((PLATFORM.FEE_PERCENT || 0) * amount / 100).toFixed(2));
    // 'both': percentage + fixed
    const pct   = Number(((PLATFORM.FEE_PERCENT || 0) * amount / 100).toFixed(2));
    const fixed = Number((PLATFORM.FEE_FIXED || 0).toFixed(2));
    return Number((pct + fixed).toFixed(2));
}

function getCartTotals() {
    const cart = AppState.cart || [];
    const subtotal = cart.reduce((s, i) => s + (parseFloat(i.price) || 0), 0);
    const fees     = calcPlatformFee(subtotal);
    const total    = Number((subtotal + fees).toFixed(2));
    return { subtotal, fees, total, count: cart.length };
}

// ── Navigation ────────────────────────────────────────────────────────────────
function navigateTo(page, data = null) {
    AppState.currentPage = page;
    if (data) AppState.pageData = data;

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById(`page-${page}`);
    if (target) {
        target.classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Update nav highlights
    document.querySelectorAll('[data-nav]').forEach(el => {
        el.classList.toggle('active', el.dataset.nav === page);
    });

    // Page-specific init
    const pageKey = page.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const fnName  = `init${pageKey.charAt(0).toUpperCase()}${pageKey.slice(1)}Page`;
    if (typeof window[fnName] === 'function') {
        window[fnName]();
    }

    history.pushState({ page }, '', `#${page}`);
}


// ── Fee label for display ─────────────────────────────────────────────────────
window._feeLabel = function() {
    const type = PLATFORM.FEE_TYPE || 'percent';
    if (type === 'fixed')   return formatCurrency(PLATFORM.FEE_FIXED || 0);
    if (type === 'percent') return (PLATFORM.FEE_PERCENT || 0) + '%';
    return (PLATFORM.FEE_PERCENT || 0) + '% + ' + formatCurrency(PLATFORM.FEE_FIXED || 0);
};
// ── Expose to Global Scope ───────────────────────────────────────────────────
Object.assign(window, {
    COLLECTIONS, PLATFORM, CURRENCIES, ORDER_STATUS, PAYMENT_METHODS,
    serverTimestamp, increment, saveToStorage, uploadFile,
    generateId, formatDateAr, formatTimeAgo, formatCurrency, convertCurrency,
    updateCartCount, getStatusText, getStatusClass,
    openModal, closeModal, showToast, showLoading, hideLoading,
    secureApiCall, sanitizeInput, previewImage,
    calcPlatformFee, addToCart, removeFromCart, clearCart, getCartTotals,
    navigateTo,
});

console.log('✅ Constants v3.0 loaded');
})();
