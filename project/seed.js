/**
 * ============================================================================
 * SEED.JS — Test Data Seeder
 * Run this ONCE in browser console after logging in as admin to populate
 * Firestore with sample services for local testing.
 *
 * Usage:
 *   1. Open index.html in browser
 *   2. Log in with your admin account
 *   3. Open browser console (F12)
 *   4. Copy-paste this entire file and press Enter
 * ============================================================================
 */

(async function seedDatabase() {
    'use strict';

    const user = window.AppState?.currentUser;
    if (!user) { console.error('❌ Please login first'); return; }

    console.log('🌱 Starting database seed...');
    const db   = window.db;
    const now  = window.firebase.firestore.FieldValue.serverTimestamp();

    // ── Sample Services ───────────────────────────────────────────────────────
    const sampleServices = [
        {
            title:        'تصميم شعار احترافي بأسلوب حديث',
            description:  'سأصمم لك شعاراً احترافياً يعبر عن هويتك التجارية بأسلوب عصري وأنيق. يشمل 3 مقترحات وتعديلات غير محدودة حتى رضاك الكامل.',
            category:     'design',
            price:        350,
            deliveryDays: 3,
            revisions:    5,
            image:        'https://images.unsplash.com/photo-1626785774625-0b1c2c4eab67?w=800',
            sellerId:     user.uid,
            sellerName:   user.displayName || 'Admin',
            sellerAvatar: user.photoURL || '',
            sellerVerified: true,
            active:       true,
            featured:     true,
            rating:       4.9,
            reviewCount:  127,
            orderCount:   213,
        },
        {
            title:        'تطوير موقع ويب كامل بـ React وFirebase',
            description:  'بناء موقع ويب احترافي متكامل بـ React.js مع قاعدة بيانات Firebase. تصميم responsive، لوحة تحكم، نظام تسجيل دخول، SEO.',
            category:     'programming',
            price:        1200,
            deliveryDays: 14,
            revisions:    3,
            image:        'https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=800',
            sellerId:     user.uid,
            sellerName:   user.displayName || 'Admin',
            sellerAvatar: user.photoURL || '',
            sellerVerified: true,
            active:       true,
            featured:     true,
            rating:       5.0,
            reviewCount:  89,
            orderCount:   145,
        },
        {
            title:        'كتابة محتوى تسويقي جذاب لمنصات السوشيال ميديا',
            description:  'كتابة 30 منشوراً تسويقياً جاهزاً لمنصات فيسبوك، انستجرام، تيك توك. محتوى إبداعي يزيد التفاعل ويجذب العملاء.',
            category:     'writing',
            price:        450,
            deliveryDays: 5,
            revisions:    2,
            image:        'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=800',
            sellerId:     user.uid,
            sellerName:   user.displayName || 'Admin',
            sellerAvatar: user.photoURL || '',
            sellerVerified: false,
            active:       true,
            featured:     false,
            rating:       4.7,
            reviewCount:  54,
            orderCount:   98,
        },
        {
            title:        'إدارة حملات إعلانية على Google Ads وFacebook',
            description:  'إدارة احترافية لحملاتك الإعلانية على Google وFacebook لمدة شهر كامل. تحليل البيانات، تحسين الأداء، تقارير أسبوعية.',
            category:     'marketing',
            price:        800,
            deliveryDays: 30,
            revisions:    0,
            image:        'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=800',
            sellerId:     user.uid,
            sellerName:   user.displayName || 'Admin',
            sellerAvatar: user.photoURL || '',
            sellerVerified: true,
            active:       true,
            featured:     false,
            rating:       4.8,
            reviewCount:  41,
            orderCount:   67,
        },
        {
            title:        'مونتاج فيديو احترافي مع موسيقى وتأثيرات',
            description:  'مونتاج فيديوهاتك بأعلى جودة مع إضافة موسيقى، تأثيرات، نصوص متحركة. صالح للـ YouTube، TikTok، Instagram Reels.',
            category:     'video',
            price:        250,
            deliveryDays: 2,
            revisions:    3,
            image:        'https://images.unsplash.com/photo-1574717024453-354056aafa98?w=800',
            sellerId:     user.uid,
            sellerName:   user.displayName || 'Admin',
            sellerAvatar: user.photoURL || '',
            sellerVerified: false,
            active:       true,
            featured:     true,
            rating:       4.6,
            reviewCount:  33,
            orderCount:   78,
        },
        {
            title:        'تحسين محركات البحث SEO لموقعك الإلكتروني',
            description:  'تحليل كامل لموقعك، تحسين الكلمات المفتاحية، بناء الروابط، تحسين سرعة الموقع. نتائج مضمونة خلال 30-60 يوم.',
            category:     'seo',
            price:        600,
            deliveryDays: 7,
            revisions:    2,
            image:        'https://images.unsplash.com/photo-1432888498266-38ffec3eaf0a?w=800',
            sellerId:     user.uid,
            sellerName:   user.displayName || 'Admin',
            sellerAvatar: user.photoURL || '',
            sellerVerified: true,
            active:       true,
            featured:     false,
            rating:       4.9,
            reviewCount:  72,
            orderCount:   134,
        },
        {
            title:        'تصميم هوية بصرية متكاملة للشركات',
            description:  'تصميم هوية بصرية شاملة: شعار، بطاقات أعمال، ورق رسمي، حسابات سوشيال ميديا، دليل الهوية. ملفات جاهزة للطباعة والرقمي.',
            category:     'design',
            price:        1500,
            deliveryDays: 10,
            revisions:    'unlimited',
            image:        'https://images.unsplash.com/photo-1558655146-d09347e92766?w=800',
            sellerId:     user.uid,
            sellerName:   user.displayName || 'Admin',
            sellerAvatar: user.photoURL || '',
            sellerVerified: true,
            active:       true,
            featured:     true,
            rating:       5.0,
            reviewCount:  18,
            orderCount:   29,
        },
        {
            title:        'برمجة تطبيق موبايل Flutter لأندرويد وiOS',
            description:  'تطوير تطبيق موبايل كامل بـ Flutter يعمل على iOS وAndroid. تصميم UI/UX، API integration، نشر على المتاجر.',
            category:     'programming',
            price:        3500,
            deliveryDays: 21,
            revisions:    3,
            image:        'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=800',
            sellerId:     user.uid,
            sellerName:   user.displayName || 'Admin',
            sellerAvatar: user.photoURL || '',
            sellerVerified: true,
            active:       true,
            featured:     false,
            rating:       4.8,
            reviewCount:  22,
            orderCount:   31,
        },
    ];

    // ── Insert Services ───────────────────────────────────────────────────────
    let created = 0;
    for (const service of sampleServices) {
        try {
            await db.collection('services').add({ ...service, createdAt: now, updatedAt: now });
            created++;
            console.log(`✅ Created: ${service.title.substring(0, 40)}...`);
        } catch (err) {
            console.error(`❌ Failed: ${service.title.substring(0, 40)}`, err.message);
        }
    }

    // ── Update user to admin ──────────────────────────────────────────────────
    try {
        await db.collection('users').doc(user.uid).set({
            name:      user.displayName || 'Admin',
            email:     user.email,
            phone:     '',
            role:      'seller', // Keep as seller to test both buyer/seller views
            avatar:    user.photoURL || '',
            verified:  true,
            createdAt: now,
            updatedAt: now,
        }, { merge: true });

        // Create wallet if not exists
        await db.collection('wallets').doc(user.uid).set({
            balance:   500, // Seed balance for testing
            currency:  'EGP',
            createdAt: now,
            updatedAt: now,
        }, { merge: true });

        console.log('✅ User profile & wallet created');
    } catch (err) {
        console.error('❌ User setup failed:', err.message);
    }

    // ── Sample Coupon ─────────────────────────────────────────────────────────
    try {
        await db.collection('coupons').add({
            code:      'MALL20',
            type:      'percent',
            value:     20,
            active:    true,
            uses:      0,
            maxUses:   100,
            createdAt: now,
        });
        console.log('✅ Coupon MALL20 (20% off) created');
    } catch (_) {}

    console.log(`\n🎉 Seed complete! Created ${created}/${sampleServices.length} services`);
    console.log('💡 Refresh the page to see the services');
    console.log('🎟️ Test coupon: MALL20 (20% discount)');
    console.log('💰 Test wallet balance: 500 EGP');

})();
