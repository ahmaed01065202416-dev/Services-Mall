/**
 * ============================================================================
 * functions/api/dropship.js — Route: POST /api/dropship
 * ============================================================================
 * Supplier + reseller + fulfilment actions for the dropshipping marketplace.
 * Money rules live in _shared/dropship.js and payment.js; this file handles
 * everything else. ALL writes happen here (service account) — firestore.rules
 * lets clients only READ suppliers / supplier_products / dropship_orders.
 *
 *  becomeSupplier        any signed-in user  → suppliers/{uid} (auto-active by default)
 *  supplierSaveProduct   supplier            → create/update a catalogue product
 *  supplierToggleProduct supplier            → pause / resume
 *  importProduct         seller (reseller)   → creates MY listing for a supplier product
 *  supplierShip          the order's supplier→ carrier + tracking number, order → shipped
 *  supplierDelivered     the order's supplier→ order → delivered (buyer can now confirm)
 *  adminSetSupplier      admin               → active / suspended
 *  adminSetProduct       admin               → active / blocked
 *  slaSweep              cron (X-Admin-Token)→ late-to-ship reminders
 * ============================================================================
 */
import { verifyIdToken, fsGet, fsCreate, fsSet, fsQuery, rtdbUpdate } from '../_shared/gcp.js';
import { getDropshipSettings, minAllowedPrice, syncListings } from '../_shared/dropship.js';
import { timingSafeEqual } from './payment.js';

function json(status, headers, obj) { return new Response(JSON.stringify(obj), { status, headers }); }
function safeId(v) { const s = String(v == null ? '' : v); return /^[A-Za-z0-9_\-]{1,128}$/.test(s) ? s : null; }
const r2 = n => Number(Number(n).toFixed(2));
const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const isHttps = u => { try { return new URL(String(u)).protocol === 'https:'; } catch (_) { return false; } };
// This app has no object storage: photos are compressed in the browser and stored as base64 data URLs inside the
// document (see uploadFile in js/constants.js). Accept those (strict mime) or plain https URLs.
const isImg = u => typeof u === 'string' && (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(u) || isHttps(u));
const eq = (f, v) => ({ fieldFilter: { field: { fieldPath: f }, op: 'EQUAL', value: typeof v === 'boolean' ? { booleanValue: v } : { stringValue: String(v) } } });

export const CATEGORIES = ['clothing', 'electronics', 'home', 'beauty', 'food', 'accessories', 'other'];   // 'digital' is not shippable stock
// Same idea as the browser-side contact-leak scan: keep phone/email/off-platform contact out of listings.
const LEAK = /[\w.+-]+@[\w-]+\.[\w.]+|(?:\+?\d[\s().-]*){10,}|whats\s?app|واتس|تليجرام|telegram/i;

function err(status, message) { const e = new Error(message); e.status = status; return e; }
const notify = (env, userId, title, message, extra = {}) =>
    fsCreate(env, 'notifications', { userId, type: 'dropship', title, message, read: false, createdAt: new Date(), ...extra }).catch(e => console.warn('[dropship] notify failed', e.message));

async function isAdminUid(env, uid) {
    if ((env.ADMIN_UIDS || '').split(',').map(s => s.trim()).filter(Boolean).includes(uid)) return true;
    const u = await fsGet(env, `users/${uid}`).catch(() => null);
    return !!(u && u.role === 'admin');
}
async function requireSupplier(env, uid) {
    const s = await fsGet(env, `suppliers/${uid}`);
    if (!s) throw err(403, 'سجّل كمورد الأول');
    if (s.status !== 'active') throw err(403, s.status === 'pending' ? 'حساب المورد قيد المراجعة' : 'حساب المورد موقوف');
    return s;
}

// ── becomeSupplier ───────────────────────────────────────────────────────────
async function becomeSupplier(body, env, auth) {
    const ds = await getDropshipSettings(env);
    if (!ds.DROPSHIP_ENABLED) throw err(403, 'الدروبشيبنج متوقف حالياً');
    const existing = await fsGet(env, `suppliers/${auth.uid}`);
    if (existing) return { status: existing.status, already: true };
    const user = await fsGet(env, `users/${auth.uid}`).catch(() => null);
    if (!user) throw err(400, 'أكمل بيانات حسابك الأول');
    if (user.role === 'buyer') await fsSet(env, `users/${auth.uid}`, { role: 'seller', updatedAt: new Date() }, true);   // a supplier is also a seller
    const name = clean(body.businessName, 80) || user.name || user.displayName || 'مورد';
    const status = ds.DROPSHIP_AUTO_APPROVE_SUPPLIERS ? 'active' : 'pending';
    await fsSet(env, `suppliers/${auth.uid}`, { uid: auth.uid, name, status, createdAt: new Date(), productsCount: 0 });
    return { status };
}

// ── supplier catalogue ───────────────────────────────────────────────────────
function validateProduct(b) {
    const title = clean(b.title, 120), description = clean(b.description, 2000);
    if (title.length < 3) throw err(400, 'اكتب عنوان للمنتج (٣ حروف على الأقل)');
    if (description.length < 10) throw err(400, 'اكتب وصف للمنتج (١٠ حروف على الأقل)');
    if (LEAK.test(title + ' ' + description)) throw err(400, 'ممنوع وضع أرقام هاتف أو إيميل أو واتساب في بيانات المنتج');
    const category = CATEGORIES.includes(b.category) ? b.category : null;
    if (!category) throw err(400, 'اختار تصنيف صالح للمنتج');
    const wholesalePrice = r2(b.wholesalePrice), suggestedPrice = b.suggestedPrice ? r2(b.suggestedPrice) : 0;
    if (!(wholesalePrice >= 1 && wholesalePrice <= 1e7)) throw err(400, 'سعر الجملة غير صالح');
    if (suggestedPrice && suggestedPrice <= wholesalePrice) throw err(400, 'السعر المقترح لازم يكون أعلى من سعر الجملة');
    const stock = parseInt(b.stock, 10);
    if (!(stock >= 0 && stock <= 1e6)) throw err(400, 'المخزون غير صالح');
    const shipDays = parseInt(b.shipDays, 10);
    if (!(shipDays >= 1 && shipDays <= 60)) throw err(400, 'مدة التوصيل بين ١ و٦٠ يوم');
    const list = [...new Set([b.image, ...(Array.isArray(b.images) ? b.images : [])].filter(isImg))].slice(0, 5);   // cover first, max 5 in total
    if (!list.length) throw err(400, 'ارفع صورة واحدة على الأقل للمنتج');
    // One Firestore document is capped at 1 MiB — keep the photos well inside it (the reseller listing copies them).
    if (list.reduce((n, u) => n + u.length, 0) > 880000) throw err(400, 'حجم الصور كبير — قلل عدد الصور أو استخدم صور أصغر');
    return { title, description, category, wholesalePrice, suggestedPrice, stock, shipDays, image: list[0], images: list };
}
async function afterProductChange(env, id) {
    const sp = await fsGet(env, `supplier_products/${id}`), ds = await getDropshipSettings(env);
    return syncListings(env, id, sp, ds, (uid, t, m, x) => notify(env, uid, t, m, x));
}
async function supplierSaveProduct(body, env, auth) {
    const sup = await requireSupplier(env, auth.uid);
    const data = validateProduct(body);
    let id = safeId(body.id);
    if (id) {
        const cur = await fsGet(env, `supplier_products/${id}`);
        if (!cur || cur.supplierId !== auth.uid) throw err(403, 'المنتج مش بتاعك');
        if (cur.blocked) throw err(403, 'المنتج ده موقوف من الإدارة');
        await fsSet(env, `supplier_products/${id}`, { ...data, updatedAt: new Date() }, true);
    } else {
        id = crypto.randomUUID();
        await fsCreate(env, 'supplier_products', { ...data, supplierId: auth.uid, supplierName: sup.name, active: true, blocked: false, soldCount: 0, createdAt: new Date(), updatedAt: new Date() }, id);
    }
    return { id, ...(await afterProductChange(env, id)) };
}
async function supplierToggleProduct(body, env, auth) {
    await requireSupplier(env, auth.uid);
    const id = safeId(body.id), cur = id && await fsGet(env, `supplier_products/${id}`);
    if (!cur || cur.supplierId !== auth.uid) throw err(403, 'المنتج مش بتاعك');
    if (cur.blocked) throw err(403, 'المنتج ده موقوف من الإدارة');
    await fsSet(env, `supplier_products/${id}`, { active: !!body.active, updatedAt: new Date() }, true);
    return { id, ...(await afterProductChange(env, id)) };
}

// ── reseller: import a supplier product as my own listing ───────────────────
async function importProduct(body, env, auth) {
    const ds = await getDropshipSettings(env);
    if (!ds.DROPSHIP_ENABLED) throw err(403, 'الدروبشيبنج متوقف حالياً');
    const user = await fsGet(env, `users/${auth.uid}`).catch(() => null);
    if (!user || !['seller', 'admin'].includes(user.role)) throw err(403, 'الاستيراد للبائعين فقط');
    const spId = safeId(body.supplierProductId), sp = spId && await fsGet(env, `supplier_products/${spId}`);
    if (!sp || sp.active === false || sp.blocked) throw err(404, 'المنتج غير متاح');
    if (sp.supplierId === auth.uid) throw err(400, 'مينفعش تستورد منتجك أنت');
    const sup = await fsGet(env, `suppliers/${sp.supplierId}`);
    if (!sup || sup.status !== 'active') throw err(400, 'المورد غير متاح حالياً');
    if ((Number(sp.stock) || 0) < 1) throw err(400, 'نفد المخزون');

    const price = r2(body.price), floor = minAllowedPrice(sp.wholesalePrice, ds);
    if (!(price >= floor)) throw err(400, `أقل سعر بيع مسموح ${floor} ج.م (سعر الجملة + الحد الأدنى للربح)`);
    const title = clean(body.title, 120) || sp.title;
    if (title.length < 3) throw err(400, 'عنوان غير صالح');
    if (LEAK.test(title)) throw err(400, 'ممنوع وضع بيانات تواصل في العنوان');

    const mine = await fsQuery(env, { from: [{ collectionId: 'services' }], where: eq('sellerId', auth.uid), limit: 1000 });
    if (mine.some(s => s.supplierProductId === spId)) throw err(409, 'انت مستورد المنتج ده قبل كده');

    const id = 'ds_' + crypto.randomUUID().replace(/-/g, '').slice(0, 20);
    await fsCreate(env, 'services', {
        title, description: sp.description, category: sp.category, listingType: 'product',
        price, deliveryDays: sp.shipDays, revisions: 0, recurring: false,
        image: sp.image, images: (Array.isArray(sp.images) ? sp.images : []).filter(u => u && u !== sp.image).slice(0, 4),   // cover lives in `image`; `images` = extras only (same shape the listing form saves)
        sellerId: auth.uid, sellerName: user.name || user.displayName || '', sellerAvatar: user.avatar || user.photoURL || '', sellerVerified: !!user.verified,
        active: true, status: 'active', rating: 0, reviewCount: 0, orderCount: 0, featured: false,
        digitalDelivery: null, stockLimit: Math.max(0, Number(sp.stock) || 0), expiryDate: null, orderRules: '', structuredFields: [],
        // dropshipping markers — not in the client-editable allow-list of firestore.rules, so a reseller can never remove/alter them
        dropship: true, supplierProductId: spId, supplierId: sp.supplierId, supplierName: sup.name || sp.supplierName || '', dropshipFloorPrice: floor,
        createdAt: new Date(), updatedAt: new Date(),
    }, id);
    return { serviceId: id, price, floor };
}

// ── fulfilment (supplier side) ──────────────────────────────────────────────
async function loadFulfilment(env, auth, body, allowed) {
    const orderId = safeId(body.orderId), dso = orderId && await fsGet(env, `dropship_orders/${orderId}`);
    if (!dso) throw err(404, 'الطلب غير موجود');
    if (dso.supplierId !== auth.uid) throw err(403, 'الطلب ده مش بتاعك');
    if (!allowed.includes(dso.status)) throw err(409, 'حالة الطلب لا تسمح بالإجراء ده');
    const order = await fsGet(env, `orders/${orderId}`);
    if (!order || ['refunded', 'cancelled', 'completed', 'disputed'].includes(order.status)) throw err(409, 'الطلب لم يعد قابلاً للشحن');
    return { orderId, dso, order };
}
async function chatNote(env, orderId, sender, status) {
    try { await rtdbUpdate(env, `chats/${orderId}/messages/${crypto.randomUUID().replace(/-/g, '')}`, { senderId: sender.uid, senderName: sender.name || 'المورد', type: 'shipping_update', shippingStatus: status, createdAt: Date.now() }); }
    catch (e) { console.warn('[dropship] chat note skipped:', e.message); }
}
async function supplierShip(body, env, auth) {
    const sup = await requireSupplier(env, auth.uid);
    const { orderId, dso, order } = await loadFulfilment(env, auth, body, ['processing']);
    const carrier = clean(body.carrier, 60), tracking = clean(body.trackingNumber, 80);
    if (carrier.length < 2) throw err(400, 'اكتب اسم شركة الشحن');
    if (tracking.length < 3) throw err(400, 'اكتب رقم التتبع');
    const now = new Date();
    await fsSet(env, `dropship_orders/${orderId}`, { status: 'shipped', carrier, trackingNumber: tracking, shippedAt: now }, true);
    await fsSet(env, `orders/${orderId}`, { shippingStatus: 'shipped', carrier, trackingNumber: tracking, shippedAt: now, updatedAt: now }, true);
    await notify(env, order.buyerId, '🚚 تم شحن طلبك!', `"${order.serviceTitle || ''}" في الطريق إليك — ${carrier} • رقم التتبع ${tracking}`, { orderId });
    if (dso.resellerId) await notify(env, dso.resellerId, '🚚 المورد شحن الطلب', `تم شحن "${order.serviceTitle || ''}" — رقم التتبع ${tracking}`, { orderId });
    await chatNote(env, orderId, { uid: auth.uid, name: sup.name }, 'shipped');
    return { orderId, status: 'shipped' };
}
async function supplierDelivered(body, env, auth) {
    const sup = await requireSupplier(env, auth.uid);
    const { orderId, dso, order } = await loadFulfilment(env, auth, body, ['shipped']);
    const now = new Date();
    await fsSet(env, `dropship_orders/${orderId}`, { status: 'delivered', deliveredAt: now }, true);
    // Same state the existing seller flow (OrderWorkspace.markProductDelivered) produces → buyer's "confirm receipt" button appears.
    await fsSet(env, `orders/${orderId}`, { shippingStatus: 'delivered', status: 'delivered', deliveredAt: now, updatedAt: now }, true);
    await notify(env, order.buyerId, '📦 تم تسليم طلبك!', `"${order.serviceTitle || ''}" تم تسليمه — راجع الطلب وأكّد الاستلام`, { orderId });
    await chatNote(env, orderId, { uid: auth.uid, name: sup.name }, 'delivered');
    return { orderId, status: 'delivered' };
}

// ── admin ───────────────────────────────────────────────────────────────────
async function adminSetSupplier(body, env) {
    const uid = safeId(body.uid), status = ['active', 'suspended', 'pending'].includes(body.status) ? body.status : null;
    if (!uid || !status || !(await fsGet(env, `suppliers/${uid}`))) throw err(400, 'بيانات غير صالحة');
    await fsSet(env, `suppliers/${uid}`, { status, updatedAt: new Date() }, true);
    // A suspended supplier's products stop being sellable immediately (assertDropshipPurchasable checks supplier status);
    // also pause the listings so they disappear from browse.
    const ds = await getDropshipSettings(env);
    const prods = await fsQuery(env, { from: [{ collectionId: 'supplier_products' }], where: eq('supplierId', uid), limit: 1000 });
    for (const p of prods) await syncListings(env, p.id, { ...p, active: status === 'active' ? p.active : false }, ds, (u, t, m, x) => notify(env, u, t, m, x));
    await notify(env, uid, status === 'active' ? '✅ تم تفعيل حساب المورد' : '⛔ تم إيقاف حساب المورد', status === 'active' ? 'تقدر تضيف منتجات وتستقبل طلبات.' : 'تواصل مع الدعم لمعرفة السبب.');
    return { uid, status };
}
async function adminSetProduct(body, env) {
    const id = safeId(body.id), sp = id && await fsGet(env, `supplier_products/${id}`);
    if (!sp) throw err(404, 'المنتج غير موجود');
    const blocked = !!body.blocked;
    await fsSet(env, `supplier_products/${id}`, { blocked, ...(blocked ? { active: false } : {}), updatedAt: new Date() }, true);
    await notify(env, sp.supplierId, blocked ? '⛔ تم إيقاف منتجك' : '✅ تم السماح بمنتجك', `"${sp.title}"`, {});
    return { id, ...(await afterProductChange(env, id)) };
}

// ── cron: remind about orders not shipped within the SLA ────────────────────
async function slaSweep(env) {
    const ds = await getDropshipSettings(env);
    const rows = await fsQuery(env, { from: [{ collectionId: 'dropship_orders' }], where: eq('status', 'processing'), limit: 500 });
    let late = 0;
    for (const o of rows) {
        if (o.slaNotified) continue;
        if (Date.now() - Date.parse(o.createdAt || 0) < ds.DROPSHIP_SHIP_SLA_DAYS * 86400000) continue;
        await fsSet(env, `dropship_orders/${o.id}`, { slaNotified: true, late: true }, true);
        await notify(env, o.supplierId, '⏰ طلب متأخر في الشحن', `طلب "${o.title || ''}" عدّى ${ds.DROPSHIP_SHIP_SLA_DAYS} أيام من غير شحن. اشحنه وسجّل رقم التتبع.`, { orderId: o.id });
        if (o.resellerId) await notify(env, o.resellerId, '⚠️ تأخر شحن طلب', `المورد لسه ما شحنش "${o.title || ''}".`, { orderId: o.id });
        late++;
    }
    return { late };
}

export async function onRequest(context) {
    const { request, env } = context;
    const CORS = {
        'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS || '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token', 'Content-Type': 'application/json',
    };
    if (request.method === 'OPTIONS') return new Response('', { status: 204, headers: CORS });
    if (request.method !== 'POST') return json(405, CORS, { error: 'Method not allowed' });
    let body; try { body = await request.json(); } catch (_) { return json(400, CORS, { error: 'Invalid JSON' }); }
    const { action } = body;
    try {
        if (action === 'slaSweep') {
            if (!env.ADMIN_SECRET || !timingSafeEqual(request.headers.get('X-Admin-Token') || '', String(env.ADMIN_SECRET))) return json(401, CORS, { error: 'Unauthorized' });
            return json(200, CORS, { success: true, ...(await slaSweep(env)) });
        }
        const tok = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
        const auth = tok ? await verifyIdToken(tok, env) : null;
        if (!auth) return json(401, CORS, { error: 'يجب تسجيل الدخول' });

        const handlers = { becomeSupplier, supplierSaveProduct, supplierToggleProduct, importProduct, supplierShip, supplierDelivered };
        if (handlers[action]) return json(200, CORS, { success: true, ...(await handlers[action](body, env, auth)) });
        if (action === 'adminSetSupplier' || action === 'adminSetProduct') {
            if (!(await isAdminUid(env, auth.uid))) return json(403, CORS, { error: 'للإدارة فقط' });
            return json(200, CORS, { success: true, ...(await (action === 'adminSetSupplier' ? adminSetSupplier : adminSetProduct)(body, env)) });
        }
        return json(400, CORS, { error: `Unknown action: ${action}` });
    } catch (e) {
        if (!e.status) console.error(`[dropship] ${action} failed:`, e.message);
        return json(e.status || 500, CORS, { error: e.message || 'Internal server error' });
    }
}
