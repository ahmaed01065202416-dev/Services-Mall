/**
 * ============================================================================
 * functions/api/ads.js — Route: /api/ads  (POST)
 * Sellers request a paid placement for one of their listings, the admin
 * approves / rejects, the ad runs for N days and then ends by itself.
 * ============================================================================
 * Collections (all WRITES happen here, with the service account — see
 * firestore.rules: sellers can read their own ads but never write them, so a
 * seller can't mark their own ad paid / active from the browser):
 *   ad_placements/{key}  admin-managed: where ads can appear, price list, slots
 *   ads/{id}             one ad request / running ad
 *
 * Status flow:
 *   pending_payment → (paid via Fawaterak webhook) → pending_review
 *   pending_review  → active   (admin approves, or the placement auto-approves)
 *                   → rejected (admin rejects → paid amount refunded to the
 *                               seller's wallet minus ONLY the gateway fee)
 *   active          → expired  (endAt reached — cron + the feed filters by time)
 *                   → stopped  (admin stops it early)
 *   pending_*       → cancelled (seller cancels)
 *
 * Payment is OPTIONAL and fully admin-controlled: a placement with
 * requiresPayment=false (or a price of 0) skips payment entirely and goes
 * straight to review. Global switch + refund-fee settings live in
 * settings/platform (ADS_ENABLED, ADS_REFUND_FEE_PERCENT, ADS_REFUND_FEE_FIXED,
 * ADS_REMINDER_DAYS) and are edited from the admin "Ads" tab.
 *
 * ⚠️ HONEST NOTE ON REFUNDS: Fawaterak's refund API isn't something I could
 * confirm from public docs, so a rejected/cancelled PAID ad is refunded to the
 * seller's platform wallet (withdrawable like any earning), not back to their
 * card. If you later confirm a gateway refund endpoint, only refundToWallet()
 * below needs to change.
 * ============================================================================
 */
import { verifyIdToken, fsGet, fsCreate, fsSet, fsQuery, fsCommit, writeIncrement, writeCreate } from '../_shared/gcp.js';
import { timingSafeEqual } from './payment.js';

const DAY = 86400000;

function json(status, headers, obj) { return new Response(JSON.stringify(obj), { status, headers }); }
function safeId(v) { const s = String(v == null ? '' : v); return /^[A-Za-z0-9_\-]{1,128}$/.test(s) ? s : null; }
function siteUrl(env) {
    const first = (env.SITE_URL || (env.ALLOWED_ORIGINS || '').split(',')[0] || 'https://mall-services.pages.dev').trim();
    return first.replace(/\/+$/, '');
}
function isHttps(u) { try { return new URL(String(u)).protocol === 'https:'; } catch (_) { return false; } }
const eq = (field, v) => ({ fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: typeof v === 'boolean' ? { booleanValue: v } : { stringValue: String(v) } } });
const and = (...f) => (f.length === 1 ? f[0] : { compositeFilter: { op: 'AND', filters: f } });

async function apiPost(url, body, headers = {}) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    const text = await res.text();
    try { return JSON.parse(text); } catch (_) { return { raw: text }; }
}

async function getSettings(env) {
    const d = await fsGet(env, 'settings/platform').catch(() => null);
    return {
        ADS_ENABLED: d && d.ADS_ENABLED === false ? false : true,
        ADS_REFUND_FEE_PERCENT: Number(d && d.ADS_REFUND_FEE_PERCENT) || 0,
        ADS_REFUND_FEE_FIXED: Number(d && d.ADS_REFUND_FEE_FIXED) || 0,
        ADS_REMINDER_DAYS: Number(d && d.ADS_REMINDER_DAYS) > 0 ? Number(d.ADS_REMINDER_DAYS) : 3,
    };
}

async function isAdminUid(env, uid) {
    const list = (env.ADMIN_UIDS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (list.includes(uid)) return true;
    const u = await fsGet(env, `users/${uid}`).catch(() => null);
    return !!(u && u.role === 'admin');
}

function notify(env, userId, title, message, extra = {}) {
    return fsCreate(env, 'notifications', { userId, type: 'ad_update', title, message, read: false, createdAt: new Date(), ...extra }).catch(e => console.warn('[ads] notify failed', e.message));
}

// How many ads are CURRENTLY running in a placement (status active AND not past endAt).
async function runningCount(env, placementKey) {
    const rows = await fsQuery(env, {
        from: [{ collectionId: 'ads' }],
        where: and(eq('placementKey', placementKey), eq('status', 'active')),
        limit: 500,
    });
    const now = Date.now();
    return rows.filter(a => Date.parse(a.endAt || 0) > now).length;
}

async function activateAd(env, ad, placement) {
    const slots = Math.max(1, Number(placement.slots) || 1);
    if ((await runningCount(env, ad.placementKey)) >= slots) {
        const err = new Error('كل خانات هذا المكان ممتلئة حالياً — أوقف إعلاناً أو زوّد عدد الخانات'); err.status = 409; throw err;
    }
    const startAt = new Date();
    const endAt = new Date(startAt.getTime() + ad.days * DAY);
    await fsSet(env, `ads/${ad.id}`, { status: 'active', startAt, endAt, reviewedAt: new Date(), reminderSent: false }, true);
    if (ad.sellerId) {
        await notify(env, ad.sellerId, '✅ تمت الموافقة على إعلانك', `إعلانك في "${ad.placementName || ad.placementKey}" شغّال دلوقتي لمدة ${ad.days} يوم.`, { adId: ad.id });
    }
    return { startAt, endAt };
}

// Refund to the seller's wallet minus ONLY the gateway fee (admin-editable).
async function refundToWallet(env, ad, settings, reason) {
    const paid = Number(ad.paidAmount) || 0;
    if (!ad.paid || paid <= 0 || ad.refunded) return 0;
    const fee = Math.min(paid, Number(((paid * settings.ADS_REFUND_FEE_PERCENT) / 100 + settings.ADS_REFUND_FEE_FIXED).toFixed(2)));
    const refund = Number((paid - fee).toFixed(2));
    const writes = [
        writeCreate(env, `transactions/${crypto.randomUUID()}`, {
            userId: ad.sellerId, type: 'ad_refund', amount: refund, gatewayFee: fee, adId: ad.id,
            description: `استرداد إعلان — ${reason}`, status: 'completed', createdAt: new Date(),
        }),
    ];
    if (refund > 0) writes.unshift(writeIncrement(env, `wallets/${ad.sellerId}`, 'balance', refund));
    await fsCommit(env, writes);
    await fsSet(env, `ads/${ad.id}`, { refunded: true, refundAmount: refund, refundFee: fee }, true);
    return refund;
}

// ── Media ads (image upload / image URL / video link) ───────────────────────
// Videos are LINKS (direct .mp4/.webm/.ogg, YouTube or Vimeo): there is no file storage behind this app
// (photos live inside Firestore documents), so a video file cannot be uploaded — it must be hosted elsewhere.
const IMG_DATA_RE = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
function parseVideo(url) {
    const u = String(url || '').trim();
    if (!isHttps(u)) return null;
    let m = /^https:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i.exec(u);
    if (m) return { videoKind: 'youtube', videoUrl: u, embedUrl: `https://www.youtube-nocookie.com/embed/${m[1]}` };
    m = /^https:\/\/(?:www\.)?vimeo\.com\/(?:video\/)?(\d{6,12})/i.exec(u);
    if (m) return { videoKind: 'vimeo', videoUrl: u, embedUrl: `https://player.vimeo.com/video/${m[1]}` };
    if (/\.(?:mp4|webm|ogg)$/i.test(u.split('?')[0].split('#')[0])) return { videoKind: 'file', videoUrl: u, embedUrl: '' };
    return null;
}
// Returns { error } or { fields } — the creative of a media ad. `who` = 'admin' | { sellerId }.
async function buildMedia(env, body, who) {
    const mediaType = body.mediaType === 'video' ? 'video' : 'image';
    const fields = { kind: 'media', mediaType, title: String(body.title || '').replace(/[<>]/g, '').slice(0, 120) };
    if (mediaType === 'image') {
        if (body.imageData) {
            if (!IMG_DATA_RE.test(String(body.imageData)) || String(body.imageData).length > 260000) return { error: 'الصورة غير صالحة أو كبيرة جدًا (الحد 250KB بعد الضغط)' };
            fields.imageData = String(body.imageData);
        } else if (isHttps(body.imageUrl)) fields.imageUrl = String(body.imageUrl);
        else return { error: 'ارفع صورة أو حط رابط صورة يبدأ بـ https://' };
    } else {
        const v = parseVideo(body.videoUrl);
        if (!v) return { error: 'رابط الفيديو لازم يكون mp4/webm مباشر أو يوتيوب أو فيميو (https)' };
        Object.assign(fields, v);
        if (body.imageData && IMG_DATA_RE.test(String(body.imageData)) && String(body.imageData).length <= 260000) fields.imageData = String(body.imageData);   // optional poster
    }
    // Click target
    const link = String(body.linkUrl || '').trim();
    if (who === 'admin') {
        if (link && !isHttps(link) && !link.startsWith('/') && !link.startsWith('#')) return { error: 'رابط الإعلان غير صالح' };
        fields.linkUrl = link;
    } else if (body.linkType === 'store' && safeId(body.linkId)) {
        const st = await fsGet(env, `stores/${safeId(body.linkId)}`);
        if (!st || st.ownerId !== who.sellerId) return { error: 'المتجر ده مش بتاعك' };
        fields.linkUrl = `#store-${safeId(body.linkId)}`;
    } else if (body.linkType === 'listing' && safeId(body.linkId)) {
        const sv = await fsGet(env, `services/${safeId(body.linkId)}`);
        if (!sv || sv.sellerId !== who.sellerId) return { error: 'المنتج ده مش بتاعك' };
        fields.linkUrl = `#listing-${safeId(body.linkId)}`;
    } else fields.linkUrl = '';
    return { fields };
}

// ── Seller: request an ad ────────────────────────────────────────────────────
async function handleCreate(body, env, CORS, auth) {
    const settings = await getSettings(env);
    if (!settings.ADS_ENABLED) return json(403, CORS, { error: 'نظام الإعلانات متوقف حالياً' });

    const isMedia = body.kind === 'media';
    const serviceId = isMedia ? null : safeId(body.serviceId), placementKey = safeId(body.placementKey), days = parseInt(body.days, 10);
    if ((!isMedia && !serviceId) || !placementKey || !days) return json(400, CORS, { error: 'بيانات الإعلان ناقصة' });

    const user = await fsGet(env, `users/${auth.uid}`).catch(() => null);
    if (!user || !['seller', 'admin'].includes(user.role)) return json(403, CORS, { error: 'الإعلانات متاحة للبائعين فقط' });
    const trust = await fsGet(env, `trust/${auth.uid}`).catch(() => null);
    if (trust && trust.sellerBlocked) return json(403, CORS, { error: 'حسابك موقوف مؤقتًا بسبب نزاعات — تواصل مع الإدارة' });

    let svc = null, media = null;
    if (isMedia) {
        const mb = await buildMedia(env, body, { sellerId: auth.uid });
        if (mb.error) return json(400, CORS, { error: mb.error });
        media = mb.fields;
    } else {
        svc = await fsGet(env, `services/${serviceId}`);
        if (!svc) return json(404, CORS, { error: 'الخدمة غير موجودة' });
        if (svc.sellerId !== auth.uid) return json(403, CORS, { error: 'الخدمة دي مش بتاعتك' });
        if (svc.active === false || svc.status === 'paused') return json(400, CORS, { error: 'فعّل الخدمة الأول قبل الإعلان عنها' });
    }

    const placement = await fsGet(env, `ad_placements/${placementKey}`);
    if (!placement || placement.enabled === false) return json(404, CORS, { error: 'مكان الإعلان غير متاح' });
    const kinds = Array.isArray(placement.allowedKinds) && placement.allowedKinds.length ? placement.allowedKinds : ['service'];
    if (isMedia ? !kinds.includes('banner') : !kinds.includes('service')) return json(400, CORS, { error: isMedia ? 'المكان ده مش بيقبل إعلانات صور/فيديو' : 'المكان ده مش بيقبل إعلانات خدمات' });

    const option = (Array.isArray(placement.pricing) ? placement.pricing : []).find(p => Number(p.days) === days);
    if (!option) return json(400, CORS, { error: 'مدة غير متاحة لهذا المكان' });
    const price = Math.max(0, Number(option.price) || 0);

    // One live request per (service, placement) — avoids paying twice for the same slot.
    const mine = await fsQuery(env, { from: [{ collectionId: 'ads' }], where: eq('sellerId', auth.uid), limit: 300 });
    if (!isMedia && mine.some(a => a.serviceId === serviceId && a.placementKey === placementKey && ['pending_payment', 'pending_review', 'active'].includes(a.status) && (a.status !== 'active' || Date.parse(a.endAt || 0) > Date.now()))) {
        return json(409, CORS, { error: 'عندك إعلان قائم لنفس الخدمة في نفس المكان' });
    }
    if (isMedia && mine.filter(a => a.kind === 'media' && ['pending_payment', 'pending_review'].includes(a.status)).length >= 3) {
        return json(409, CORS, { error: 'عندك 3 طلبات إعلان وسائط قيد الانتظار — استنى المراجعة أو الغي واحد' });
    }

    const needsPayment = price > 0 && placement.requiresPayment !== false;
    const adId = crypto.randomUUID();
    const base = {
        sellerId: auth.uid, sellerName: user.name || user.displayName || '',
        ...(isMedia ? media : { serviceId, serviceTitle: svc.title || '', kind: 'service' }),
        placementKey, placementName: placement.nameAr || placementKey, days, price,
        paid: false, paidAmount: 0, status: needsPayment ? 'pending_payment' : 'pending_review',
        startAt: null, endAt: null, reminderSent: false, views: 0, clicks: 0, createdAt: new Date(),
    };
    await fsCreate(env, 'ads', base, adId);

    if (!needsPayment) return json(200, CORS, await maybeAutoApprove(env, { id: adId, ...base }, placement, { adId }));

    if (!env.FAWATERAK_API_KEY) {
        if (env.ALLOW_SIMULATED_PAYMENTS !== 'true') {
            await fsSet(env, `ads/${adId}`, { status: 'cancelled' }, true);
            return json(500, CORS, { error: 'بوابة الدفع غير مفعّلة (FAWATERAK_API_KEY ناقص)' });
        }
        await activateAdPayment(env, adId, 'DEMO_' + adId);
        return json(200, CORS, { adId, simulated: true, status: 'pending_review' });
    }

    const priv = await fsGet(env, `users/${auth.uid}/private/contact`).catch(() => ({}));
    const phone = (priv && priv.phone) || user.phone || '';
    const nameParts = String(user.name || 'Seller N/A').trim().split(' ');
    const origin = siteUrl(env);
    const resp = await apiPost(`${env.FAWATERAK_BASE_URL || 'https://app.fawaterk.com'}/api/v2/createInvoiceLink`, {
        cartTotal: price, currency: 'EGP',
        customer: { first_name: nameParts[0] || 'Seller', last_name: nameParts.slice(1).join(' ') || 'N/A', email: user.email || auth.email || '', phone },
        cartItems: [{ name: `إعلان: ${svc.title || ''} — ${placement.nameAr || placementKey} (${days} يوم)`, price, quantity: 1 }],
        payLoad: { adId },
        redirectionUrls: {
            successUrl: `${origin}/?ad_payment=success&ad_id=${adId}#seller`,
            failUrl: `${origin}/?ad_payment=failed&ad_id=${adId}#seller`,
            pendingUrl: `${origin}/?ad_payment=pending&ad_id=${adId}#seller`,
            webhookUrl: `${origin}/api/fawaterak-webhook`,
        },
        sendEmail: false, sendSMS: false,
    }, { Authorization: `Bearer ${env.FAWATERAK_API_KEY}` });

    if (resp.status !== 'success' || !resp.data?.url) {
        await fsSet(env, `ads/${adId}`, { status: 'cancelled' }, true);
        return json(502, CORS, { error: resp.message || 'تعذر إنشاء فاتورة الدفع' });
    }
    return json(200, CORS, { adId, redirectUrl: resp.data.url });
}

async function maybeAutoApprove(env, ad, placement, out) {
    if (placement.autoApprove === true && ad.kind !== 'media') {   // seller image/video creatives are ALWAYS reviewed by the admin
        try { await activateAd(env, ad, placement); return { ...out, status: 'active' }; }
        catch (e) { console.warn('[ads] auto-approve skipped:', e.message); }
    }
    return { ...out, status: 'pending_review' };
}

// Called by fawaterak-webhook.js after the signature check passes.
export async function activateAdPayment(env, adId, invoiceId) {
    const ad = await fsGet(env, `ads/${adId}`);
    if (!ad || ad.status !== 'pending_payment') return { skipped: true };      // idempotent
    await fsSet(env, `ads/${adId}`, { paid: true, paidAmount: Number(ad.price) || 0, paidAt: new Date(), invoiceId: String(invoiceId || ''), status: 'pending_review' }, true);
    const placement = await fsGet(env, `ad_placements/${ad.placementKey}`).catch(() => null);
    if (ad.sellerId) await notify(env, ad.sellerId, '💳 تم استلام دفع الإعلان', 'طلب إعلانك بيتراجع من الإدارة وهيتم إشعارك بالنتيجة.', { adId });
    if (placement && placement.autoApprove === true && ad.kind !== 'media') {
        try { await activateAd(env, { ...ad, id: adId }, placement); } catch (e) { console.warn('[ads] auto-approve skipped:', e.message); }
    }
    return { ok: true };
}

// ── Seller: cancel own request ──────────────────────────────────────────────
async function handleCancel(body, env, CORS, auth) {
    const adId = safeId(body.adId);
    const ad = adId && await fsGet(env, `ads/${adId}`);
    if (!ad) return json(404, CORS, { error: 'الإعلان غير موجود' });
    if (ad.sellerId !== auth.uid) return json(403, CORS, { error: 'غير مصرح' });
    if (!['pending_payment', 'pending_review'].includes(ad.status)) return json(400, CORS, { error: 'مينفعش تلغي إعلان شغّال أو منتهي' });
    await fsSet(env, `ads/${adId}`, { status: 'cancelled', reviewedAt: new Date() }, true);
    const refund = await refundToWallet(env, { ...ad, id: adId }, await getSettings(env), 'إلغاء من البائع');
    return json(200, CORS, { success: true, refund });
}

// ── Admin: approve / reject ─────────────────────────────────────────────────
async function handleReview(body, env, CORS, auth) {
    const adId = safeId(body.adId);
    const ad = adId && await fsGet(env, `ads/${adId}`);
    if (!ad) return json(404, CORS, { error: 'الإعلان غير موجود' });
    if (ad.status !== 'pending_review') return json(400, CORS, { error: 'الإعلان مش في انتظار المراجعة' });
    ad.id = adId;
    const note = String(body.note || '').slice(0, 300);

    if (body.decision === 'approve') {
        const placement = await fsGet(env, `ad_placements/${ad.placementKey}`);
        if (!placement) return json(404, CORS, { error: 'مكان الإعلان اتحذف' });
        try { const r = await activateAd(env, ad, placement); return json(200, CORS, { success: true, ...r }); }
        catch (e) { return json(e.status || 500, CORS, { error: e.message }); }
    }
    if (body.decision === 'reject') {
        await fsSet(env, `ads/${adId}`, { status: 'rejected', reviewNote: note, reviewedAt: new Date() }, true);
        const refund = await refundToWallet(env, ad, await getSettings(env), 'رفض الإعلان');
        if (ad.sellerId) {
            await notify(env, ad.sellerId, '❌ تم رفض إعلانك',
                (note ? `السبب: ${note}. ` : '') + (refund > 0 ? `تم رد ${refund} ج.م لمحفظتك (بعد خصم رسوم البوابة فقط).` : 'لم يتم دفع أي مبلغ.'), { adId });
        }
        return json(200, CORS, { success: true, refund });
    }
    return json(400, CORS, { error: 'decision لازم تكون approve أو reject' });
}

async function handleStop(body, env, CORS) {
    const adId = safeId(body.adId);
    const ad = adId && await fsGet(env, `ads/${adId}`);
    if (!ad) return json(404, CORS, { error: 'الإعلان غير موجود' });
    if (ad.status !== 'active') return json(400, CORS, { error: 'الإعلان مش شغّال' });
    await fsSet(env, `ads/${adId}`, { status: 'stopped', stoppedAt: new Date(), reviewNote: String(body.note || '').slice(0, 300) }, true);
    if (ad.sellerId) await notify(env, ad.sellerId, '⏹ تم إيقاف إعلانك', String(body.note || '').slice(0, 300) || 'تم إيقاف الإعلان من الإدارة.', { adId });
    return json(200, CORS, { success: true });
}

// ── Admin: create a house ad (banner or a free promotion of any service) ────
async function handleAdminCreate(body, env, CORS, auth) {
    const placementKey = safeId(body.placementKey), days = parseInt(body.days, 10);
    if (!placementKey || !days || days < 1 || days > 3650) return json(400, CORS, { error: 'المكان والمدة مطلوبين' });
    const placement = await fsGet(env, `ad_placements/${placementKey}`);
    if (!placement) return json(404, CORS, { error: 'مكان الإعلان غير موجود' });

    const doc = {
        sellerId: null, sellerName: 'الإدارة', placementKey, placementName: placement.nameAr || placementKey, days, price: 0,
        paid: false, paidAmount: 0, status: 'pending_review', startAt: null, endAt: null, reminderSent: false, views: 0, clicks: 0, createdAt: new Date(), createdByAdmin: auth.uid,
    };
    if (body.kind === 'media') {
        const mb = await buildMedia(env, body, 'admin');
        if (mb.error) return json(400, CORS, { error: mb.error });
        Object.assign(doc, mb.fields);
    } else if (body.kind === 'banner') {
        if (!isHttps(body.imageUrl)) return json(400, CORS, { error: 'رابط الصورة لازم يبدأ بـ https://' });
        if (body.linkUrl && !isHttps(body.linkUrl) && !String(body.linkUrl).startsWith('/') && !String(body.linkUrl).startsWith('#')) return json(400, CORS, { error: 'رابط الإعلان غير صالح' });
        Object.assign(doc, { kind: 'banner', title: String(body.title || '').slice(0, 120), imageUrl: String(body.imageUrl), linkUrl: String(body.linkUrl || '') });
    } else {
        const serviceId = safeId(body.serviceId);
        const svc = serviceId && await fsGet(env, `services/${serviceId}`);
        if (!svc) return json(404, CORS, { error: 'الخدمة غير موجودة' });
        Object.assign(doc, { kind: 'service', serviceId, serviceTitle: svc.title || '', sellerId: svc.sellerId || null, sellerName: svc.sellerName || '' });
    }
    const adId = crypto.randomUUID();
    await fsCreate(env, 'ads', doc, adId);
    try { const r = await activateAd(env, { ...doc, id: adId }, placement); return json(200, CORS, { success: true, adId, ...r }); }
    catch (e) { await fsSet(env, `ads/${adId}`, { status: 'cancelled' }, true); return json(e.status || 500, CORS, { error: e.message }); }
}

// ── Cron: expire finished ads + 3-day (configurable) reminder ───────────────
async function handleExpireSweep(env, CORS) {
    const settings = await getSettings(env);
    const now = Date.now();
    const active = await fsQuery(env, { from: [{ collectionId: 'ads' }], where: eq('status', 'active'), limit: 1000 });
    let expired = 0, reminded = 0, cleaned = 0;

    for (const ad of active) {
        const end = Date.parse(ad.endAt || 0);
        if (!end) continue;
        try {
            if (end <= now) {
                await fsSet(env, `ads/${ad.id}`, { status: 'expired' }, true);
                if (ad.sellerId) await notify(env, ad.sellerId, '⌛ انتهى إعلانك', `انتهت مدة إعلانك في "${ad.placementName || ad.placementKey}". تقدر تجدده من لوحة البائع.`, { adId: ad.id });
                expired++;
            } else if (!ad.reminderSent && end - now <= settings.ADS_REMINDER_DAYS * DAY) {
                await fsSet(env, `ads/${ad.id}`, { reminderSent: true }, true);
                if (ad.sellerId) await notify(env, ad.sellerId, '⏰ إعلانك قرّب ينتهي', `إعلانك في "${ad.placementName || ad.placementKey}" هينتهي خلال ${settings.ADS_REMINDER_DAYS} أيام تقريباً.`, { adId: ad.id });
                reminded++;
            }
        } catch (e) { console.error('[ads] sweep item failed', ad.id, e.message); }
    }
    // Abandoned checkouts: unpaid for 2 days → cancelled.
    const unpaid = await fsQuery(env, { from: [{ collectionId: 'ads' }], where: eq('status', 'pending_payment'), limit: 500 });
    for (const ad of unpaid) {
        if (now - Date.parse(ad.createdAt || 0) > 2 * DAY) { await fsSet(env, `ads/${ad.id}`, { status: 'cancelled' }, true).catch(() => {}); cleaned++; }
    }
    return json(200, CORS, { success: true, expired, reminded, cleaned });
}

// ── Public: impression / click counters (best-effort, rate limited) ─────────
async function handleTrack(body, env, CORS, request) {
    const adId = safeId(body.adId), field = body.type === 'click' ? 'clicks' : body.type === 'view' ? 'views' : null;
    if (!adId || !field) return json(400, CORS, { error: 'bad request' });
    const ip = (request.headers.get('cf-connecting-ip') || 'unknown').replace(/[:.]/g, '_');
    const docId = `adtrack_${ip}_${Math.floor(Date.now() / 60000)}`;
    try {
        const rl = await fsGet(env, `rate_limits/${docId}`);
        if (!rl) await fsCreate(env, 'rate_limits', { count: 1, createdAt: new Date() }, docId).catch(() => {});
        else if ((rl.count || 0) >= 60) return json(429, CORS, { error: 'slow down' });
        else await fsCommit(env, [writeIncrement(env, `rate_limits/${docId}`, 'count', 1)]);
    } catch (_) { /* fail open */ }
    const ad = await fsGet(env, `ads/${adId}`);
    if (!ad || ad.status !== 'active') return json(200, CORS, { ok: false });
    await fsCommit(env, [writeIncrement(env, `ads/${adId}`, field, 1)]);
    return json(200, CORS, { ok: true });
}

export async function onRequest(context) {
    const { request, env } = context;
    const CORS = {
        'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS || '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token',
        'Content-Type': 'application/json',
    };
    if (request.method === 'OPTIONS') return new Response('', { status: 204, headers: CORS });
    if (request.method !== 'POST') return json(405, CORS, { error: 'Method not allowed' });

    let body = {};
    try { body = await request.json(); } catch (_) { return json(400, CORS, { error: 'Invalid JSON' }); }
    const { action } = body;

    try {
        if (action === 'track') return await handleTrack(body, env, CORS, request);
        if (action === 'expireSweep') {
            const sent = request.headers.get('X-Admin-Token') || '';
            if (!env.ADMIN_SECRET || !timingSafeEqual(sent, String(env.ADMIN_SECRET))) return json(401, CORS, { error: 'Unauthorized' });
            return await handleExpireSweep(env, CORS);
        }

        const tok = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
        const auth = tok ? await verifyIdToken(tok, env) : null;
        if (!auth) return json(401, CORS, { error: 'يجب تسجيل الدخول' });

        if (action === 'create') return await handleCreate(body, env, CORS, auth);
        if (action === 'cancel') return await handleCancel(body, env, CORS, auth);

        if (['review', 'stop', 'adminCreate'].includes(action)) {
            if (!(await isAdminUid(env, auth.uid))) return json(403, CORS, { error: 'للإدارة فقط' });
            if (action === 'review') return await handleReview(body, env, CORS, auth);
            if (action === 'stop') return await handleStop(body, env, CORS);
            return await handleAdminCreate(body, env, CORS, auth);
        }
        return json(400, CORS, { error: `Unknown action: ${action}` });
    } catch (err) {
        console.error(`[ads] ${action} failed:`, err.message);
        return json(err.status || 500, CORS, { error: err.message || 'Internal server error' });
    }
}
