/**
 * ============================================================================
 * functions/api/disputes.js — Route: /api/disputes
 * ============================================================================
 * The strict "not received / don't want it" system. EVERYTHING here runs on the
 * server (service account); the browser can't forge a dispute, a shipment or a
 * seller reply.
 *
 *   reportNonReceipt  buyer  → structured report (+photos) → dispute opened,
 *                              escrow frozen, seller notified with a deadline
 *   respondDispute    seller → one written reply (+photos) before the admin rules
 *   markShipped       seller → carrier + tracking number are MANDATORY; the
 *                              firestore.rules refuse "delivered" without them
 *
 * The admin rules through /api/payment resolveDispute:
 *   refund_buyer | refund_minus_shipping | pay_seller
 * ============================================================================
 */
import { verifyIdToken, fsGet, fsQuery, fsSet, fsCommit, writeUpdate, writeCreate } from '../_shared/gcp.js';
import { REASONS, getDisputeCfg, isBuyerBlocked } from '../_shared/trust.js';

const HOUR = 3600000, DAY = 86400000;
const MIN_DESC = 30;
// Photos live INSIDE the dispute document (Firestore limit 1 MiB): buyer ≤ 3 × 200k, seller ≤ 2 × 150k → always fits.
const BUYER_PHOTOS = { n: 3, each: 200000, total: 540000 }, SELLER_PHOTOS = { n: 2, each: 150000, total: 300000 };

function safeId(v) { const s = String(v == null ? '' : v); return /^[A-Za-z0-9_\-]{1,128}$/.test(s) ? s : null; }
function json(status, headers, obj) { return new Response(JSON.stringify(obj), { status, headers }); }
function getCORS(request, env) {
    const origin = request.headers.get('origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    return {
        'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : (allowed[0] || '*'),
        'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': 'application/json', 'Vary': 'Origin',
    };
}
const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const toMs = (v) => { if (!v) return 0; const t = typeof v === 'string' ? Date.parse(v) : (v.seconds ? v.seconds * 1000 : +v); return Number.isFinite(t) ? t : 0; };
const note = (env, userId, title, message, orderId) => fsCommit(env, [writeCreate(env, `notifications/${crypto.randomUUID()}`,
    { userId, type: 'dispute', title, message, orderId: orderId || null, read: false, createdAt: new Date() })]).catch(() => {});

function cleanPhotos(list, lim) {
    const out = [];
    for (const p of (Array.isArray(list) ? list : []).slice(0, lim.n)) {
        const s = String(p || '');
        if (!(s.startsWith('data:image/') || s.startsWith('https://'))) continue;
        if (s.length > lim.each) throw Object.assign(new Error('إحدى الصور كبيرة جدًا — استخدم صورة أصغر'), { status: 400 });
        out.push(s);
    }
    if (out.reduce((n, s) => n + s.length, 0) > lim.total) throw Object.assign(new Error('حجم الصور كبير — قلّل عددها أو حجمها'), { status: 400 });
    return out;
}

export async function onRequest(context) {
    const { request, env } = context;
    const CORS = getCORS(request, env);
    if (request.method === 'OPTIONS') return new Response('', { status: 204, headers: CORS });
    if (request.method !== 'POST') return json(405, CORS, { error: 'Method not allowed' });

    let body; try { body = await request.json(); } catch (_) { return json(400, CORS, { error: 'Invalid JSON' }); }
    const auth = await verifyIdToken((request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, ''), env);
    if (!auth) return json(401, CORS, { error: 'يجب تسجيل الدخول' });
    if (!auth.emailVerified) return json(403, CORS, { error: 'لازم تفعّل بريدك الإلكتروني الأول', code: 'EMAIL_NOT_VERIFIED' });

    try {
        switch (body.action) {
            case 'reportNonReceipt': return await reportNonReceipt(body, env, CORS, auth);
            case 'respondDispute':   return await respondDispute(body, env, CORS, auth);
            case 'markShipped':      return await markShipped(body, env, CORS, auth);
            default: return json(400, CORS, { error: 'Unknown action' });
        }
    } catch (err) {
        console.error('[disputes]', body.action, err.message);
        return json(err.status || 500, CORS, { error: err.message || 'Internal error' });
    }
}

// ── Buyer: "عدم استلام" ──────────────────────────────────────────────────────
async function reportNonReceipt(body, env, CORS, auth) {
    const cfg = await getDisputeCfg(env);
    if (!cfg.NONRECEIPT_ENABLED) return json(403, CORS, { error: 'ميزة عدم الاستلام متوقفة حاليًا من الإدارة' });

    const orderId = safeId(body.orderId);
    const reason = REASONS[body.reasonCode];
    if (!orderId || !reason) return json(400, CORS, { error: 'بيانات البلاغ ناقصة' });

    const order = await fsGet(env, `orders/${orderId}`);
    if (!order) return json(404, CORS, { error: 'الطلب غير موجود' });
    if (order.buyerId !== auth.uid) return json(403, CORS, { error: 'مش طلبك' });
    if (order.listingType !== 'product' || !order.shippingInfo) return json(400, CORS, { error: 'البلاغ ده للمنتجات المشحونة فعليًا فقط' });

    const escrow = await fsGet(env, `escrow/${orderId}`);
    if (!escrow || escrow.status !== 'held') return json(409, CORS, { error: 'المبلغ مش في الضمان (اتأكد استلامه أو اتحل قبل كده) — مينفعش فتح بلاغ' });

    // ① strict eligibility: only after the seller says "delivered", or when a shipment is clearly late
    const now = Date.now();
    const delivered = order.status === 'delivered';
    const shippedLate = order.shippingStatus === 'shipped' && toMs(order.shippedAt) && (now - toMs(order.shippedAt)) > cfg.SHIPPED_LATE_DAYS * DAY;
    if (!delivered && !shippedLate) {
        return json(400, CORS, { error: `البلاغ متاح بعد ما البائع يسجّل التسليم، أو لو الشحنة اتأخرت أكتر من ${cfg.SHIPPED_LATE_DAYS} أيام من تاريخ الشحن` });
    }
    if (body.reasonCode !== 'not_arrived' && !delivered) return json(400, CORS, { error: 'سبب «وصل ومعجبنيش/تالف» مينفعش قبل تسجيل التسليم' });
    if (delivered && cfg.RETURN_WINDOW_DAYS > 0) {
        const anchor = toMs(order.deliveredAt) || toMs(order.updatedAt) || toMs(order.createdAt);
        if (anchor && (now - anchor) > cfg.RETURN_WINDOW_DAYS * DAY) return json(400, CORS, { error: `انتهت مدة البلاغ (${cfg.RETURN_WINDOW_DAYS} يوم من التسليم)` });
    }

    // ② one report per order, ever
    const prev = await fsQuery(env, { from: [{ collectionId: 'disputes' }], where: { fieldFilter: { field: { fieldPath: 'orderId' }, op: 'EQUAL', value: { stringValue: orderId } } }, limit: 5 });
    if (prev.length) return json(409, CORS, { error: 'فيه بلاغ/نزاع اتفتح بالفعل على الطلب ده — مينفعش تفتح تاني' });

    // ③ repeat at-fault buyers are blocked until the admin reviews them
    if (await isBuyerBlocked(env, cfg, auth.uid)) return json(403, CORS, { error: 'تم إيقاف خاصية البلاغات على حسابك بسبب بلاغات سابقة اتحكم فيها ضدك. تواصل مع الإدارة.' });

    // ④ mandatory content: real description + photo evidence where it matters + explicit acceptance of the shipping rule
    const description = clean(body.description, 1500);
    if (description.length < (body.reasonCode === 'other' ? 50 : MIN_DESC)) {
        return json(400, CORS, { error: `اشرح المشكلة بالتفصيل (${body.reasonCode === 'other' ? 50 : MIN_DESC} حرف على الأقل)` });
    }
    const evidence = cleanPhotos(body.evidence, BUYER_PHOTOS);
    if (reason.evidence && evidence.length < 1) return json(400, CORS, { error: 'لازم ترفع صورة واحدة على الأقل كإثبات (صورة المنتج وحالته/الكرتونة)' });
    if (body.acceptRules !== true) return json(400, CORS, { error: 'لازم توافق على شروط البلاغ (خصم الشحن لو الخطأ منك)' });

    const faultHint = reason.fault;
    // buyer-at-fault deduction = this product's own shipping price (set by the seller, written by the server at payment); falls back to the platform default
    const ownShip = Number(order.shippingFee) || 0;
    const shippingDeduction = Math.min(ownShip > 0 ? ownShip : cfg.RETURN_SHIPPING_FEE, Number(escrow.amount) || 0);
    const buyerName = order.buyerName || auth.email || auth.uid;
    const disputeId = crypto.randomUUID();
    const deadline = new Date(now + cfg.SELLER_RESPONSE_HOURS * HOUR);

    await fsCommit(env, [
        writeCreate(env, `disputes/${disputeId}`, {
            orderId, type: 'non_receipt', buyerId: order.buyerId, sellerId: escrow.sellerId || order.sellerId,
            raisedBy: auth.uid, raisedByName: buyerName, raisedByRole: 'buyer',
            reasonCode: body.reasonCode, reason: `${reason.ar} — ${description}`, description, evidence,
            faultHint, shippingDeduction, shipmentLate: !!shippedLate,
            sellerDeadline: deadline, sellerResponse: null,
            status: 'open', adminNotes: '', resolution: null, createdAt: new Date(), updatedAt: new Date(),
        }),
        writeUpdate(env, `escrow/${orderId}`, { status: 'frozen', frozenAt: new Date() }, { updateTime: escrow._updateTime }),
        writeUpdate(env, `orders/${orderId}`, { status: 'disputed', disputeId, disputeType: 'non_receipt', updatedAt: new Date() }),
    ]);

    // any older "return request" still waiting on the seller is folded into this dispute
    try {
        const pend = await fsQuery(env, { from: [{ collectionId: 'returns' }], where: { compositeFilter: { op: 'AND', filters: [
            { fieldFilter: { field: { fieldPath: 'orderId' }, op: 'EQUAL', value: { stringValue: orderId } } },
            { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'pending' } } }] } }, limit: 10 });
        for (const r of pend) await fsSet(env, `returns/${r.id}`, { status: 'rejected', autoClosed: true, sellerNote: 'اتحوّل لنزاع عدم استلام', updatedAt: new Date(), resolvedAt: new Date() }, true);
    } catch (_) {}

    await note(env, escrow.sellerId || order.sellerId, '⚠️ بلاغ عدم استلام على طلبك',
        `${reason.ar}. المبلغ اتجمّد. ردّك مطلوب خلال ${cfg.SELLER_RESPONSE_HOURS} ساعة مع إثبات الشحن، وإلا هيتم الحكم بناءً على كلام العميل.`, orderId);
    await note(env, 'ADMIN', 'نزاع عدم استلام جديد', `طلب #${orderId.slice(-8)} — ${reason.ar}${faultHint === 'buyer' ? ' (الخطأ المحتمل على المشتري)' : ''}`, orderId);
    return json(200, CORS, { success: true, disputeId, faultHint, shippingDeduction, sellerDeadline: deadline.toISOString() });
}

// ── Seller: one reply ────────────────────────────────────────────────────────
async function respondDispute(body, env, CORS, auth) {
    const cfg = await getDisputeCfg(env);
    const disputeId = safeId(body.disputeId);
    const d = disputeId && await fsGet(env, `disputes/${disputeId}`);
    if (!d) return json(404, CORS, { error: 'النزاع غير موجود' });
    if (d.sellerId !== auth.uid) return json(403, CORS, { error: 'النزاع ده مش على طلب بتاعك' });
    if (d.status !== 'open') return json(409, CORS, { error: 'النزاع اتقفل بالفعل' });
    if (d.sellerResponse) return json(409, CORS, { error: 'رديت قبل كده — الرد يتسجل مرة واحدة فقط' });
    const text = clean(body.text, 1500);
    if (text.length < 20) return json(400, CORS, { error: 'اكتب رد واضح (20 حرف على الأقل) مع إثبات الشحن/التسليم' });
    const evidence = cleanPhotos(body.evidence, SELLER_PHOTOS);
    const late = Date.now() > toMs(d.sellerDeadline);
    await fsSet(env, `disputes/${disputeId}`, { sellerResponse: { text, evidence, at: new Date(), late }, updatedAt: new Date() }, true);
    await note(env, 'ADMIN', 'رد البائع على نزاع', `طلب #${String(d.orderId).slice(-8)}${late ? ' (رد متأخر)' : ''}`, d.orderId);
    await note(env, d.buyerId, 'البائع رد على بلاغك', 'الإدارة بتراجع الطرفين وهتحكم قريبًا.', d.orderId);
    return json(200, CORS, { success: true, late });
}

// ── Seller: shipping with MANDATORY proof ────────────────────────────────────
async function markShipped(body, env, CORS, auth) {
    const orderId = safeId(body.orderId);
    const order = orderId && await fsGet(env, `orders/${orderId}`);
    if (!order) return json(404, CORS, { error: 'الطلب غير موجود' });
    if (order.sellerId !== auth.uid) return json(403, CORS, { error: 'مش طلبك' });
    if (order.dropship) return json(400, CORS, { error: 'الشحن بيتم من المورد' });
    if (order.listingType !== 'product' || !order.shippingInfo) return json(400, CORS, { error: 'التتبع للمنتجات المادية فقط' });
    if (!['payment_held', 'in_progress', 'revision'].includes(order.status)) return json(409, CORS, { error: 'حالة الطلب مش بتسمح بتسجيل الشحن' });
    const carrier = clean(body.carrier, 60), tracking = clean(body.trackingNumber, 80);
    if (carrier.length < 2) return json(400, CORS, { error: 'اكتب اسم شركة الشحن' });
    if (tracking.length < 4) return json(400, CORS, { error: 'رقم التتبع إجباري (4 أحرف/أرقام على الأقل)' });
    const now = new Date();
    await fsSet(env, `orders/${orderId}`, { shippingStatus: 'shipped', carrier, trackingNumber: tracking, shippedAt: now, updatedAt: now }, true);
    await fsCommit(env, [writeCreate(env, `notifications/${crypto.randomUUID()}`, {
        userId: order.buyerId, type: 'shipping', title: '🚚 تم شحن طلبك!',
        message: `"${order.serviceTitle || ''}" في الطريق إليك — ${carrier} • رقم التتبع ${tracking}`, orderId, read: false, createdAt: now })]).catch(() => {});
    return json(200, CORS, { success: true });
}
