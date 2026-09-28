/**
 * ============================================================================
 * I18N.JS — Internationalization System
 * Full Arabic / English support with RTL/LTR, currency & locale detection
 * ============================================================================
 */
(function () {
    'use strict';

    const TRANSLATIONS = {
        ar: {
            // Navigation
            'nav.home':           'الرئيسية',
            'nav.services':       'الخدمات',
            'nav.orders':         'طلباتي',
            'nav.cart':           'السلة',
            'nav.dashboard':      'لوحة التحكم',
            'nav.notifications':  'الإشعارات',
            'nav.logout':         'تسجيل الخروج',
            'nav.login':          'تسجيل الدخول',
            'nav.register':       'إنشاء حساب',
            'nav.profile':        'الملف الشخصي',
            'nav.wallet':         'المحفظة',
            'nav.seller_panel':   'لوحة البائع',
            'nav.admin':          'الإدارة',

            // Home
            'home.hero.title':    'منصتك الأولى للخدمات الرقمية الاحترافية',
            'home.hero.subtitle': 'اطلب أفضل الخدمات من خبراء معتمدين بأمان تام وضمان استرداد',
            'home.hero.cta':      'استعرض الخدمات',
            'home.hero.sell':     'ابدأ البيع',
            'home.stats.services':'خدمة نشطة',
            'home.stats.sellers': 'بائع محترف',
            'home.stats.orders':  'طلب مكتمل',
            'home.stats.rating':  'تقييم المستخدمين',
            'home.featured':      'خدمات مميزة',
            'home.categories':    'تصفح التصنيفات',

            // Services
            'services.title':     'استعرض الخدمات',
            'services.search':    'ابحث عن خدمة...',
            'services.filter':    'تصفية',
            'services.sort':      'ترتيب',
            'services.add_cart':  'أضف للسلة',
            'services.buy_now':   'اشتر الآن',
            'services.delivery':  'مدة التسليم',
            'services.days':      'يوم',
            'services.reviews':   'تقييم',

            // Cart
            'cart.title':         'سلة الشراء',
            'cart.empty':         'سلتك فارغة',
            'cart.empty_sub':     'أضف خدمات لبدء طلبك',
            'cart.subtotal':      'المجموع الفرعي',
            'cart.fees':          'رسوم المنصة',
            'cart.total':         'الإجمالي',
            'cart.checkout':      'إتمام الشراء',
            'cart.remove':        'حذف',
            'cart.continue':      'مواصلة التسوق',

            // Payment
            'pay.title':          'إتمام الدفع',
            'pay.method':         'اختر طريقة الدفع',
            'pay.secure':         'دفع آمن ومحمي بالكامل',
            'pay.summary':        'ملخص الطلب',
            'pay.pay_now':        'ادفع الآن',
            'pay.processing':     'جاري المعالجة...',
            'pay.success':        'تم الدفع بنجاح!',
            'pay.failed':         'فشل الدفع',
            'pay.select_method':  'يرجى اختيار طريقة الدفع',
            'pay.card':           'بطاقة بنكية',
            'pay.fawry':          'فوري',
            'pay.vodafone':       'فودافون كاش',
            'pay.etisalat':       'اتصالات كاش',
            'pay.orange':         'أورانج كاش',
            'pay.we':             'WE Pay',
            'pay.paypal':         'PayPal',
            'pay.stripe':         'بطاقة دولية (Stripe)',
            'pay.wallet':         'رصيد المحفظة',
            'pay.bank':           'تحويل بنكي',
            'pay.balance':        'رصيدك',
            'pay.insufficient':   'الرصيد غير كافي',
            'pay.bank_instructions': 'أرسل المبلغ على الحساب التالي وارفع صورة الإيصال',

            // Escrow
            'escrow.held':        'الدفع محجوز في الضمان',
            'escrow.info':        'سيصل المبلغ للبائع فقط بعد تأكيد استلام الخدمة',
            'escrow.confirm':     'تأكيد الاستلام',
            'escrow.dispute':     'فتح نزاع',
            'escrow.dispute_sent':'تم إرسال النزاع للمراجعة',

            // Orders
            'orders.title':       'طلباتي',
            'orders.empty':       'لا توجد طلبات حتى الآن',
            'orders.workspace':   'مساحة العمل',
            'orders.status':      'الحالة',
            'orders.id':          'رقم الطلب',
            'orders.date':        'التاريخ',
            'orders.deliver':     'تسليم الخدمة',
            'orders.revision':    'طلب مراجعة',
            'orders.confirm_del': 'تأكيد الاستلام',
            'orders.chat':        'المحادثة',
            'orders.files':       'الملفات',
            'orders.timeline':    'المراحل',
            'orders.send_msg':    'أرسل رسالة...',
            'orders.send':        'إرسال',
            'orders.attach_file': 'إرفاق ملف',

            // Dashboard
            'dash.revenue':       'الإيرادات',
            'dash.orders':        'الطلبات',
            'dash.rating':        'التقييم',
            'dash.balance':       'الرصيد',
            'dash.withdraw':      'سحب',
            'dash.services':      'خدماتي',
            'dash.add_service':   'إضافة خدمة',
            'dash.analytics':     'الإحصائيات',
            'dash.earnings':      'الأرباح',

            // Auth
            'auth.login':         'تسجيل الدخول',
            'auth.register':      'إنشاء حساب',
            'auth.email':         'البريد الإلكتروني',
            'auth.password':      'كلمة المرور',
            'auth.name':          'الاسم الكامل',
            'auth.phone':         'رقم الهاتف',
            'auth.google':        'متابعة بـ Google',
            'auth.forgot':        'نسيت كلمة المرور؟',
            'auth.no_account':    'ليس لديك حساب؟',
            'auth.have_account':  'لديك حساب؟',

            // General
            'general.loading':    'جاري التحميل...',
            'general.error':      'حدث خطأ',
            'general.success':    'تم بنجاح',
            'general.cancel':     'إلغاء',
            'general.confirm':    'تأكيد',
            'general.save':       'حفظ',
            'general.edit':       'تعديل',
            'general.delete':     'حذف',
            'general.back':       'رجوع',
            'general.next':       'التالي',
            'general.search':     'بحث',
            'general.filter':     'تصفية',
            'general.all':        'الكل',
            'general.close':      'إغلاق',
            'general.copy':       'نسخ',
            'general.copied':     'تم النسخ!',
            'general.send':       'إرسال',
            'general.upload':     'رفع ملف',
            'general.download':   'تحميل',
            'general.view':       'عرض',
            'general.more':       'المزيد',
            'general.days':       'أيام',
            'general.egp':        'ج.م',
            'general.login_req':  'يرجى تسجيل الدخول أولاً',
        },

        en: {
            // Navigation
            'nav.home':           'Home',
            'nav.services':       'Services',
            'nav.orders':         'My Orders',
            'nav.cart':           'Cart',
            'nav.dashboard':      'Dashboard',
            'nav.notifications':  'Notifications',
            'nav.logout':         'Logout',
            'nav.login':          'Login',
            'nav.register':       'Register',
            'nav.profile':        'Profile',
            'nav.wallet':         'Wallet',
            'nav.seller_panel':   'Seller Panel',
            'nav.admin':          'Admin',

            // Home
            'home.hero.title':    'Your #1 Platform for Professional Digital Services',
            'home.hero.subtitle': 'Order the best services from certified experts with full security and refund guarantee',
            'home.hero.cta':      'Browse Services',
            'home.hero.sell':     'Start Selling',
            'home.stats.services':'Active Services',
            'home.stats.sellers': 'Pro Sellers',
            'home.stats.orders':  'Completed Orders',
            'home.stats.rating':  'User Rating',
            'home.featured':      'Featured Services',
            'home.categories':    'Browse Categories',

            // Services
            'services.title':     'Browse Services',
            'services.search':    'Search for a service...',
            'services.filter':    'Filter',
            'services.sort':      'Sort',
            'services.add_cart':  'Add to Cart',
            'services.buy_now':   'Buy Now',
            'services.delivery':  'Delivery Time',
            'services.days':      'days',
            'services.reviews':   'reviews',

            // Cart
            'cart.title':         'Shopping Cart',
            'cart.empty':         'Your cart is empty',
            'cart.empty_sub':     'Add services to start your order',
            'cart.subtotal':      'Subtotal',
            'cart.fees':          'Platform Fees',
            'cart.total':         'Total',
            'cart.checkout':      'Checkout',
            'cart.remove':        'Remove',
            'cart.continue':      'Continue Shopping',

            // Payment
            'pay.title':          'Complete Payment',
            'pay.method':         'Choose Payment Method',
            'pay.secure':         'Fully Secure & Protected Payment',
            'pay.summary':        'Order Summary',
            'pay.pay_now':        'Pay Now',
            'pay.processing':     'Processing...',
            'pay.success':        'Payment Successful!',
            'pay.failed':         'Payment Failed',
            'pay.select_method':  'Please select a payment method',
            'pay.card':           'Bank Card',
            'pay.fawry':          'Fawry',
            'pay.vodafone':       'Vodafone Cash',
            'pay.etisalat':       'Etisalat Cash',
            'pay.orange':         'Orange Cash',
            'pay.we':             'WE Pay',
            'pay.paypal':         'PayPal',
            'pay.stripe':         'International Card (Stripe)',
            'pay.wallet':         'Wallet Balance',
            'pay.bank':           'Bank Transfer',
            'pay.balance':        'Your Balance',
            'pay.insufficient':   'Insufficient balance',
            'pay.bank_instructions': 'Transfer the amount to the following account and upload receipt',

            // Escrow
            'escrow.held':        'Payment Held in Escrow',
            'escrow.info':        'Funds will be released to seller only after you confirm delivery',
            'escrow.confirm':     'Confirm Delivery',
            'escrow.dispute':     'Open Dispute',
            'escrow.dispute_sent':'Dispute submitted for review',

            // Orders
            'orders.title':       'My Orders',
            'orders.empty':       'No orders yet',
            'orders.workspace':   'Workspace',
            'orders.status':      'Status',
            'orders.id':          'Order ID',
            'orders.date':        'Date',
            'orders.deliver':     'Deliver Service',
            'orders.revision':    'Request Revision',
            'orders.confirm_del': 'Confirm Delivery',
            'orders.chat':        'Chat',
            'orders.files':       'Files',
            'orders.timeline':    'Timeline',
            'orders.send_msg':    'Send a message...',
            'orders.send':        'Send',
            'orders.attach_file': 'Attach File',

            // Dashboard
            'dash.revenue':       'Revenue',
            'dash.orders':        'Orders',
            'dash.rating':        'Rating',
            'dash.balance':       'Balance',
            'dash.withdraw':      'Withdraw',
            'dash.services':      'My Services',
            'dash.add_service':   'Add Service',
            'dash.analytics':     'Analytics',
            'dash.earnings':      'Earnings',

            // Auth
            'auth.login':         'Login',
            'auth.register':      'Create Account',
            'auth.email':         'Email Address',
            'auth.password':      'Password',
            'auth.name':          'Full Name',
            'auth.phone':         'Phone Number',
            'auth.google':        'Continue with Google',
            'auth.forgot':        'Forgot Password?',
            'auth.no_account':    "Don't have an account?",
            'auth.have_account':  'Already have an account?',

            // General
            'general.loading':    'Loading...',
            'general.error':      'An error occurred',
            'general.success':    'Success',
            'general.cancel':     'Cancel',
            'general.confirm':    'Confirm',
            'general.save':       'Save',
            'general.edit':       'Edit',
            'general.delete':     'Delete',
            'general.back':       'Back',
            'general.next':       'Next',
            'general.search':     'Search',
            'general.filter':     'Filter',
            'general.all':        'All',
            'general.close':      'Close',
            'general.copy':       'Copy',
            'general.copied':     'Copied!',
            'general.send':       'Send',
            'general.upload':     'Upload File',
            'general.download':   'Download',
            'general.view':       'View',
            'general.more':       'More',
            'general.days':       'days',
            'general.egp':        'EGP',
            'general.login_req':  'Please login first',
        }
    };

    // ── Core i18n Engine ──────────────────────────────────────────────────────
    const I18n = {
        current: 'ar',
        cache: {},

        t(key, vars = {}) {
            const lang = this.current;
            const dict = TRANSLATIONS[lang] || TRANSLATIONS['ar'];
            let str = dict[key] || TRANSLATIONS['ar'][key] || key;
            Object.entries(vars).forEach(([k, v]) => {
                str = str.replace(new RegExp(`{{${k}}}`, 'g'), v);
            });
            return str;
        },

        setLanguage(lang) {
            if (!TRANSLATIONS[lang]) return;
            this.current = lang;
            AppState.language = lang;
            localStorage.setItem('ms_lang', lang);

            // RTL / LTR
            document.documentElement.lang = lang;
            document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';

            // Translate all data-i18n elements
            this.applyTranslations();

            // Update currency display
            if (typeof updateAllCurrencies === 'function') updateAllCurrencies();

            // Update nav language toggle
            const toggleBtn = document.getElementById('langToggle');
            if (toggleBtn) toggleBtn.textContent = lang === 'ar' ? '🇬🇧 English' : '🇪🇬 عربي';

            console.log(`✅ Language set to: ${lang}`);
        },

        applyTranslations() {
            document.querySelectorAll('[data-i18n]').forEach(el => {
                const key = el.dataset.i18n;
                const text = this.t(key);
                if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                    el.placeholder = text;
                } else {
                    el.textContent = text;
                }
            });

            document.querySelectorAll('[data-i18n-html]').forEach(el => {
                el.innerHTML = this.t(el.dataset.i18nHtml);
            });

            document.querySelectorAll('[data-i18n-title]').forEach(el => {
                el.title = this.t(el.dataset.i18nTitle);
            });
        },

        init() {
            const saved = localStorage.getItem('ms_lang') || 'ar';

            // Try to detect from browser if no preference
            const browserLang = navigator.language?.startsWith('ar') ? 'ar' : 'en';
            const lang = saved || browserLang;

            this.setLanguage(lang);
        }
    };

    // ── Currency Switcher ─────────────────────────────────────────────────────
    function setCurrency(code) {
        if (!CURRENCIES[code]) return;
        AppState.currency = code;
        localStorage.setItem('ms_currency', code);

        // Re-render all price elements
        document.querySelectorAll('[data-price-egp]').forEach(el => {
            const egp = parseFloat(el.dataset.priceEgp) || 0;
            el.textContent = formatCurrency(egp);
        });

        const curBtn = document.getElementById('currencyToggle');
        if (curBtn) curBtn.textContent = code + ' ' + CURRENCIES[code].symbol;
    }

    // ── Country/Currency Detection ────────────────────────────────────────────
    async function detectUserLocation() {
        try {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const tzMap = {
                'Africa/Cairo':           { lang: 'ar', currency: 'EGP' },
                'Asia/Riyadh':            { lang: 'ar', currency: 'SAR' },
                'Asia/Dubai':             { lang: 'ar', currency: 'AED' },
                'Europe/London':          { lang: 'en', currency: 'GBP' },
                'America/New_York':       { lang: 'en', currency: 'USD' },
                'America/Los_Angeles':    { lang: 'en', currency: 'USD' },
                'Europe/Berlin':          { lang: 'en', currency: 'EUR' },
                'Europe/Paris':           { lang: 'en', currency: 'EUR' },
            };

            const detected = tzMap[tz];
            if (detected && !localStorage.getItem('ms_lang')) {
                I18n.setLanguage(detected.lang);
            }
            if (detected && !localStorage.getItem('ms_currency')) {
                setCurrency(detected.currency);
            }
        } catch (_) { /* fallback to defaults */ }
    }

    // ── Toggle Helpers ────────────────────────────────────────────────────────
    function toggleLanguage() {
        const next = AppState.language === 'ar' ? 'en' : 'ar';
        I18n.setLanguage(next);
    }

    function toggleCurrencyMenu() {
        const menu = document.getElementById('currencyMenu');
        if (menu) menu.classList.toggle('active');
    }

    // ── Expose ────────────────────────────────────────────────────────────────
    window.I18n         = I18n;
    window.t            = (key, vars) => I18n.t(key, vars);
    window.setCurrency  = setCurrency;
    window.toggleLanguage = toggleLanguage;
    window.toggleCurrencyMenu = toggleCurrencyMenu;
    window.detectUserLocation = detectUserLocation;

    // Init on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { I18n.init(); detectUserLocation(); });
    } else {
        I18n.init(); detectUserLocation();
    }

    console.log('✅ i18n system loaded');
})();
