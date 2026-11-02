/**
 * functions/api/kyc.js — Seller identity verification (توثيق البائعين)
 * ============================================================================
 * WHY THIS IS A SERVER API (and not direct Firestore writes from the browser):
 *   - the national-ID number is only ever stored as a keyed HASH (for "one ID = one seller" duplicate detection) plus
 *     the last 4 digits — never in clear text. The photo of the ID itself is the legal record.
 *   - the ID / selfie photos are readable ONLY through this API, by admins, and every view is written to
 *     `kyc_access_log` (who opened whose documents, when). Firestore rules deny every direct read/write of the images.
 *   - the user's role becomes 'seller' only here, after an admin approves (the rules no longer let a user
 *     promote themselves).
 *
 * RETENTION (decided by the site owner): documents are KEPT — they are never deleted by any code path — so that if a
 * problem happens with a merchant, the platform can hand the data to the competent legal authority.
 * The applicant explicitly consents to this in the form, and the Terms/Privacy pages should say so.
 *
 * Actions (POST, JSON, Bearer Firebase ID token):
 *   status        → my application state
 *   submit        → create / re-submit my application (buyers only)
 *   adminList     → admin: applications by status (no images)
 *   adminGet      → admin: one application WITH the 3 images (logged)
 *   adminReview   → admin: approve | reject
 *
 * Env: FIREBASE_PROJECT_ID, FIREBASE_SERVICE_ACCOUNT, ADMIN_UIDS (as the other admin APIs),
 *      KYC_PEPPER  (long random secret used to key the ID-number hash — REQUIRED for `submit`;
 *                   falls back to ADMIN_SECRET if you prefer not to add a new variable).
 */
import { verifyIdToken, fsGet, fsSet, fsQuery, fsCreate } from '../_shared/gcp.js';

const MAX_ATTEMPTS = 5;
const MAX_IMG_CHARS = 900000;                      // per photo (data URL length) — well under Firestore's 1 MiB doc limit
const IMG_RE = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const FILE_KINDS = ['front', 'back', 'selfie'];

function json(status, headers, obj) { return new Response(JSON.stringify(obj), { status, headers }); }
const clean = (v, max) => String(v == null ? '' : v).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

// ── pure helpers (exported for tests) ──────────────────────────────────────────
/** Egyptian national ID: 14 digits. 1st digit = century (2 → 19xx, 3 → 20xx), then YYMMDD, then governorate + serial. */
export function validNationalId(id) {
    const s = String(id || '').replace(/\s+/g, '');
    if (!/^[23]\d{13}$/.test(s)) return null;
    const mm = Number(s.slice(3, 5)), dd = Number(s.slice(5, 7));
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    return s;
}
export function validPhone(p) {
    const s = String(p || '').replace(/[\s-]/g, '').replace(/^\+?20/, '0');
    return /^01[0125]\d{8}$/.test(s) ? s : null;
}
export async function hmacHex(secret, message) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
    return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export function validateSubmission(body) {
    const fullName = clean(body.fullName, 80);
    if (fullName.split(' ').filter(Boolean).length < 3 || fullName.length < 8) return { error: 'اكتب الاسم الثلاثي على الأقل زي ما هو في البطاقة' };
    const nationalId = validNationalId(body.nationalId);
    if (!nationalId) return { error: 'رقم البطاقة لازم يكون 14 رقم صحيح' };
    const phone = validPhone(body.phone);
    if (!phone) return { error: 'رقم الموبايل غير صحيح (مثال: 01012345678)' };
    const address = clean(body.address, 200);
    if (address.length < 8) return { error: 'اكتب العنوان بالتفصيل (المحافظة والمدينة والشارع)' };
    if (body.consent !== true) return { error: 'لازم توافق على حفظ بياناتك وصورة البطاقة لأغراض التحقق والأمان' };
    const images = {};
    for (const k of FILE_KINDS) {
        const v = body[k];
        if (typeof v !== 'string' || !IMG_RE.test(v)) return { error: 'ارفع الصور الثلاثة بصيغة صورة صحيحة (JPG/PNG)' };
        if (v.length > MAX_IMG_CHARS) return { error: 'إحدى الصور كبيرة جدًا — صوّرها بجودة أقل أو صغّرها' };
        images[k] = v;
    }
    return { ok: { fullName, nationalId, phone, address, storeName: clean(body.storeName, 60), images } };
}

const toMs = (t) => { if (!t) return 0; const d = (t instanceof Date) ? t : new Date(t); const n = d.getTime(); return Number.isNaN(n) ? 0 : n; };
const publicApp = (a) => ({
    uid: a.id, fullName: a.fullName || '', idLast4: a.idLast4 || '', phone: a.phone || '', address: a.address || '',
    storeName: a.storeName || '', status: a.status || 'pending', attempts: a.attempts || 1,
    submittedAt: toMs(a.submittedAt), reviewedAt: toMs(a.reviewedAt), reviewNote: a.reviewNote || '', reviewedBy: a.reviewedBy || '',
});

async function notify(env, userId, title, message, type) {
    try { await fsCreate(env, 'notifications', { userId, type: type || 'seller_application', title, message, read: false, createdAt: new Date() }); }
    catch (e) { console.warn('[kyc] notify failed:', e.message); }
}

export async function onRequest(context) {
    const { request, env } = context;
    const CORS = {
        'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS || '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': 'application/json',
    };
    if (request.method === 'OPTIONS') return new Response('', { status: 204, headers: CORS });
    if (request.method !== 'POST') return json(405, CORS, { error: 'Method not allowed' });

    try {
        const idToken = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
        const auth = idToken ? await verifyIdToken(idToken, env) : null;
        if (!auth) return json(401, CORS, { error: 'سجّل دخولك الأول' });

        let body;
        try { body = await request.json(); } catch (_) { return json(400, CORS, { error: 'Invalid JSON' }); }
        const action = String(body.action || '');
        const adminUids = (env.ADMIN_UIDS || '').split(',').map(s => s.trim()).filter(Boolean);
        const isAdmin = adminUids.includes(auth.uid);

        // ── my status ────────────────────────────────────────────────────────
        if (action === 'status') {
            const app = await fsGet(env, `seller_applications/${auth.uid}`).catch(() => null);
            const user = await fsGet(env, `users/${auth.uid}`).catch(() => null);
            return json(200, CORS, {
                success: true,
                role: user?.role || 'buyer',
                status: app ? (app.status || 'pending') : 'none',
                reviewNote: app?.reviewNote || '',
                attempts: app?.attempts || 0,
                canApply: !app || app.status === 'rejected',
            });
        }

        // ── submit ───────────────────────────────────────────────────────────
        if (action === 'submit') {
            const secret = env.KYC_PEPPER || env.ADMIN_SECRET;
            if (!secret) return json(500, CORS, { error: 'السيرفر غير مجهّز لاستقبال التوثيق (KYC_PEPPER مش متضبط)' });
            const user = await fsGet(env, `users/${auth.uid}`).catch(() => null);
            if (!user) return json(404, CORS, { error: 'الحساب غير موجود' });
            if (user.role === 'seller' || user.role === 'admin') return json(409, CORS, { error: 'حسابك بالفعل بائع' });
            const prev = await fsGet(env, `seller_applications/${auth.uid}`).catch(() => null);
            if (prev && prev.status === 'pending') return json(409, CORS, { error: 'طلبك تحت المراجعة حاليًا' });
            if (prev && prev.status === 'approved') return json(409, CORS, { error: 'تم قبول طلبك بالفعل' });
            if (prev && (prev.attempts || 1) >= MAX_ATTEMPTS) return json(429, CORS, { error: 'تجاوزت عدد المحاولات المسموح — كلّم الدعم' });

            const v = validateSubmission(body);
            if (v.error) return json(400, CORS, { error: v.error });
            const d = v.ok;
            const idHash = await hmacHex(secret, d.nationalId);

            // one national ID = one seller account
            const dup = await fsQuery(env, {
                from: [{ collectionId: 'seller_applications' }],
                where: { fieldFilter: { field: { fieldPath: 'idHash' }, op: 'EQUAL', value: { stringValue: idHash } } },
                limit: 5,
            }).catch(() => []);
            if ((dup || []).some(x => x.id !== auth.uid && (x.status === 'pending' || x.status === 'approved'))) {
                return json(409, CORS, { error: 'رقم البطاقة ده مستخدم في حساب تاني' });
            }

            // photos first (separate docs: 3 photos in one doc could exceed Firestore's 1 MiB limit)
            for (const k of FILE_KINDS) {
                await fsSet(env, `seller_applications/${auth.uid}/files/${k}`, { kind: k, dataUrl: d.images[k], savedAt: new Date() });
            }
            await fsSet(env, `seller_applications/${auth.uid}`, {
                uid: auth.uid, status: 'pending', attempts: (prev?.attempts || 0) + 1,
                fullName: d.fullName, idHash, idLast4: d.nationalId.slice(-4),
                phone: d.phone, address: d.address, storeName: d.storeName, email: user.email || '',
                submittedAt: new Date(), reviewedAt: null, reviewNote: '', reviewedBy: '',
            });
            await notify(env, 'ADMIN', '🪪 طلب توثيق بائع جديد', `${d.fullName} قدّم طلب توثيق — راجعه من تاب "توثيق البائعين".`);
            return json(200, CORS, { success: true, status: 'pending' });
        }

        // ── everything below is admin-only ────────────────────────────────────
        if (!isAdmin) return json(403, CORS, { error: 'Forbidden: Admin access only' });

        if (action === 'adminList') {
            const status = ['pending', 'approved', 'rejected'].includes(body.status) ? body.status : null;
            const q = { from: [{ collectionId: 'seller_applications' }], limit: 300 };
            if (status) q.where = { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: status } } };
            const rows = (await fsQuery(env, q).catch(() => [])) || [];
            return json(200, CORS, { success: true, items: rows.map(publicApp).sort((a, b) => b.submittedAt - a.submittedAt) });
        }

        const uid = String(body.uid || '');
        if (!/^[A-Za-z0-9_-]{6,128}$/.test(uid)) return json(400, CORS, { error: 'uid غير صالح' });

        if (action === 'adminGet') {
            const app = await fsGet(env, `seller_applications/${uid}`);
            if (!app) return json(404, CORS, { error: 'الطلب غير موجود' });
            const files = await Promise.all(FILE_KINDS.map(k => fsGet(env, `seller_applications/${uid}/files/${k}`).catch(() => null)));
            // every time someone opens the documents it is written down (who / whose / when)
            await fsCreate(env, 'kyc_access_log', { adminUid: auth.uid, targetUid: uid, action: 'view', at: new Date() }).catch(() => {});
            return json(200, CORS, {
                success: true, app: publicApp(app),
                images: { front: files[0]?.dataUrl || '', back: files[1]?.dataUrl || '', selfie: files[2]?.dataUrl || '' },
            });
        }

        if (action === 'adminReview') {
            const decision = body.decision;
            const note = clean(body.note, 300);
            if (!['approve', 'reject'].includes(decision)) return json(400, CORS, { error: 'decision لازم approve أو reject' });
            if (decision === 'reject' && note.length < 3) return json(400, CORS, { error: 'اكتب سبب الرفض عشان التاجر يعرف يصلّح' });
            const app = await fsGet(env, `seller_applications/${uid}`);
            if (!app) return json(404, CORS, { error: 'الطلب غير موجود' });
            if (app.status !== 'pending') return json(409, CORS, { error: 'الطلب ده اتراجع قبل كده' });

            if (decision === 'approve') {
                await fsSet(env, `users/${uid}`, { role: 'seller', sellerStatus: 'approved', sellerApprovedAt: new Date(), updatedAt: new Date() }, true);
            }
            await fsSet(env, `seller_applications/${uid}`, {
                status: decision === 'approve' ? 'approved' : 'rejected',
                reviewedAt: new Date(), reviewedBy: auth.uid, reviewNote: note,
            }, true);
            await fsCreate(env, 'kyc_access_log', { adminUid: auth.uid, targetUid: uid, action: decision, at: new Date() }).catch(() => {});
            await notify(env, uid,
                decision === 'approve' ? '✅ تم قبول طلب التوثيق' : '❌ تم رفض طلب التوثيق',
                decision === 'approve' ? 'حسابك بقى حساب بائع — تقدر تضيف خدماتك وتفتح متجرك.' : `السبب: ${note}. تقدر تعدّل وتقدّم تاني.`);
            return json(200, CORS, { success: true, status: decision === 'approve' ? 'approved' : 'rejected' });
        }

        return json(400, CORS, { error: 'Unknown action' });
    } catch (err) {
        console.error('[kyc]', err && err.message ? err.message : err);
        return json(500, CORS, { error: 'حصل خطأ في السيرفر — حاول تاني' });
    }
}
