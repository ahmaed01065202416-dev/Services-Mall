/**
 * ============================================================================
 * functions/api/ai-brief.js — Cloudflare Pages Function
 * "Smart Brief" — turns 3 short answers (goal / desired outcome / notes)
 * into a clear, professional Arabic project brief for the "Request Custom
 * Service" flow, so buyers write fewer vague requests and sellers get fewer
 * back-and-forth clarification messages.
 *
 * ⚠️ COST NOTE: this calls the same Gemini/OpenAI key already used for blog
 * generation. Each call costs a small fraction of a cent (Gemini 2.5 Flash /
 * GPT-4o-mini, short prompt+response) — genuinely marginal, but not literally
 * $0, and it's now reachable by any logged-in buyer instead of admin-only.
 * The per-user daily cap below (10/day) exists specifically to keep that
 * cost bounded and prevent abuse.
 *
 * Route: /api/ai-brief   (requires a valid Firebase ID token — any logged-in
 * user, not admin-only, since this is a buyer-facing feature)
 * ============================================================================
 */
import { verifyIdToken, fsGet, fsSet } from '../_shared/gcp.js';

function json(status, headers, obj) {
    return new Response(JSON.stringify(obj), { status, headers });
}
function getCORS(env) {
    return {
        'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS || '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': 'application/json',
    };
}

const DAILY_CAP = 10;

async function _checkDailyCap(env, uid) {
    const day = new Date().toISOString().slice(0, 10);
    const path = `ai_brief_usage/${uid}_${day}`;
    const existing = await fsGet(env, path).catch(() => null);
    const count = (existing && existing.count) || 0;
    if (count >= DAILY_CAP) return false;
    await fsSet(env, path, { count: count + 1, uid, day }, true);
    return true;
}

async function fetchJSON(url, options) {
    const res = await fetch(url, options);
    const text = await res.text();
    try { return JSON.parse(text); } catch (_) { return { raw: text }; }
}

function _buildPrompt({ goal, outcome, notes, serviceTitle }) {
    return `أنت مساعد يكتب "بريف" (وصف طلب) احترافي بالعربية لعميل هيطلب خدمة اسمها "${serviceTitle || 'خدمة'}" من بائع مستقل على منصة خدمات.
اكتب فقرة أو فقرتين واضحتين ومباشرتين (بدون عناوين HTML، نص عادي فقط، من 60 إلى 120 كلمة) تلخص:
- الهدف: ${goal || '—'}
- المطلوب استلامه في النهاية: ${outcome || '—'}
- ملاحظات إضافية: ${notes || '—'}

اكتب الوصف بصيغة المتكلم (أنا محتاج... عايز...)، بأسلوب واضح ومنظم يسهّل على البائع فهم المطلوب من أول قراءة. ابدأ مباشرة بالنص بدون أي مقدمة زي "بالتأكيد" أو "إليك الوصف".`;
}

async function _callGemini(prompt, key) {
    if (!key) throw new Error('GEMINI_API_KEY missing');
    // ⚠️ CHANGED: gemini-1.5-flash is retired (404s on every call) — moved to
    // gemini-2.5-flash, same fix as functions/api/ai-generate.js.
    const res = await fetchJSON(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
        {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.6, maxOutputTokens: 400 } }),
        }
    );
    const text = res.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!text) {
        const apiErr = res.error?.message || JSON.stringify(res).slice(0, 300);
        throw new Error(`Empty Gemini response — ${apiErr}`);
    }
    return text.trim();
}

async function _callOpenAI(prompt, key) {
    if (!key) throw new Error('OPENAI_API_KEY missing');
    const res = await fetchJSON('https://api.openai.com/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
            model: 'gpt-4o-mini', max_tokens: 400, temperature: 0.6,
            messages: [{ role: 'user', content: prompt }],
        }),
    });
    const text = res.choices?.[0]?.message?.content || '';
    if (!text) throw new Error('Empty OpenAI response');
    return text.trim();
}

export async function onRequest(context) {
    const { request, env } = context;
    const CORS = getCORS(env);
    if (request.method === 'OPTIONS') return new Response('', { status: 204, headers: CORS });
    if (request.method !== 'POST') return json(405, CORS, { error: 'Method not allowed' });

    const authHeader = request.headers.get('Authorization') || '';
    const idToken = authHeader.replace(/^Bearer\s+/i, '');
    const auth = await verifyIdToken(idToken, env);
    if (!auth) return json(401, CORS, { error: 'يجب تسجيل الدخول' });

    if (!(await _checkDailyCap(env, auth.uid))) {
        return json(429, CORS, { error: `وصلت للحد الأقصى (${DAILY_CAP} مرات يومياً) — جرب تاني بكرة` });
    }

    let body;
    try { body = await request.json(); } catch (_) { return json(400, CORS, { error: 'Invalid JSON' }); }

    const goal        = String(body.goal || '').slice(0, 300);
    const outcome     = String(body.outcome || '').slice(0, 300);
    const notes       = String(body.notes || '').slice(0, 300);
    const serviceTitle = String(body.serviceTitle || '').slice(0, 150);
    if (!goal && !outcome) return json(400, CORS, { error: 'محتاج تجاوب على سؤال واحد على الأقل' });

    const prompt = _buildPrompt({ goal, outcome, notes, serviceTitle });

    try {
        let text;
        try { text = await _callGemini(prompt, env.GEMINI_API_KEY); }
        catch (e1) {
            console.warn('[AIBrief] Gemini failed, trying OpenAI:', e1.message);
            text = await _callOpenAI(prompt, env.OPENAI_API_KEY);
        }
        return json(200, CORS, { success: true, brief: text });
    } catch (err) {
        console.error('[AIBrief] Error:', err.message);
        return json(500, CORS, { error: 'تعذر توليد النص دلوقتي، حاول تاني أو اكتب الطلب يدوياً' });
    }
}
