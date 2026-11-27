// functions/_shared/ai-write.js
// One place that talks to the LLMs used for article writing.
//
//   1. Cloudflare Workers AI  (env.AI binding — NO API key, 10,000 free neurons/day)
//   2. Google Gemini          (env.GEMINI_API_KEY — optional fallback / alternative)
//
// The order is configurable (settings/seoAuto.providerOrder, e.g. "cloudflare,gemini" or "gemini,cloudflare").
// Model ids change often on both platforms, so every provider has a LIST of models that are tried in turn, and the
// Cloudflare list can be overridden without a redeploy via the CF_AI_MODELS env var (comma separated).

import { spend, asBudgetError, isDead, markDead, lastGood, setGood } from './budget.js';

export const CF_MODELS_DEFAULT = [
  '@cf/google/gemma-4-26b-a4b-it',     // multilingual (140+ languages in pre-training), cheap MoE model
  '@cf/qwen/qwen3-30b-a3b-fp8',        // strong Arabic
  '@cf/zai-org/glm-4.7-flash',         // multilingual fallback
];
export const GEMINI_MODELS_DEFAULT = ['gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-3.1-flash-lite'];

const withTimeout = (p, ms, label) => Promise.race([
  p,
  new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timeout after ${ms}ms`)), ms)),
]);

/** Different Workers AI models answer in different shapes — normalise them all to a plain string. */
function extractText(out) {
  if (!out) return '';
  if (typeof out === 'string') return out;
  let t = out.response ?? out.result?.response ?? out.choices?.[0]?.message?.content ?? out.choices?.[0]?.text ?? '';
  if (Array.isArray(t)) t = t.map(p => (typeof p === 'string' ? p : p?.text || '')).join('');
  return String(t || '');
}

/** Remove reasoning blocks / code fences that some models add. */
export function cleanModelText(s) {
  return String(s || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^\s*```(?:json|html|markdown|md)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

// A model that answers "not found / retired / invalid" will never work in this request — do not retry it.
// Timeouts, 429s and empty answers are transient: they still count against the budget but the model stays usable.
const FATAL_RE = /not found|no such model|unknown model|invalid model|deprecated|retired|does not exist|not enabled|\b404\b|\b400\b/i;

function preferGood(list) {
  const ms = list.filter(m => !isDead(m));
  const i = ms.indexOf(lastGood());
  if (i > 0) ms.unshift(ms.splice(i, 1)[0]);
  return ms;
}

async function viaCloudflare(env, { system, user, maxTokens, temperature }) {
  if (!env.AI || typeof env.AI.run !== 'function') throw new Error('Workers AI binding "AI" is not configured');
  const all = (env.CF_AI_MODELS ? String(env.CF_AI_MODELS).split(',').map(s => s.trim()).filter(Boolean) : CF_MODELS_DEFAULT);
  const models = preferGood(all);
  if (!models.length) throw new Error('Workers AI: every model already failed in this request');
  let last = 'no model tried';
  for (const model of models) {
    spend(1, 'Workers AI ' + model);                       // throws BudgetError → stops everything cleanly
    try {
      const out = await withTimeout(env.AI.run(model, {
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        max_tokens: maxTokens,
        temperature,
      }), 70000, model);
      const text = cleanModelText(extractText(out));
      if (text.length > 20) { setGood(model); return { text, provider: 'cloudflare', model }; }
      last = `${model}: empty answer`;
    } catch (e) {
      const be = asBudgetError(e); if (be) throw be;
      last = `${model}: ${e && e.message ? e.message : e}`;
      if (FATAL_RE.test(last)) markDead(model);
    }
  }
  throw new Error('Workers AI failed — ' + last);
}

async function viaGemini(env, { system, user, maxTokens, temperature }) {
  const key = env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY missing');
  const models = preferGood(GEMINI_MODELS_DEFAULT);
  if (!models.length) throw new Error('Gemini: every model already failed in this request');
  let last = 'no model tried';
  for (const model of models) {
    spend(1, 'Gemini ' + model);
    try {
      const res = await withTimeout(fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: user }] }],
            generationConfig: { maxOutputTokens: maxTokens, temperature, thinkingConfig: { thinkingLevel: 'low' } },
          }),
        }), 60000, model);
      const j = await res.json().catch(() => ({}));
      const text = cleanModelText((j?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join(''));
      if (text.length > 20) { setGood(model); return { text, provider: 'gemini', model }; }
      last = `${model}: ${j?.error?.message || 'empty answer'}`;
      if (res.status === 404 || res.status === 400) markDead(model);
    } catch (e) {
      const be = asBudgetError(e); if (be) throw be;
      last = `${model}: ${e && e.message ? e.message : e}`;
      if (FATAL_RE.test(last)) markDead(model);
    }
  }
  throw new Error('Gemini failed — ' + last);
}

/** Which writers are usable right now (shown in the dashboard checklist). */
export function providerStatus(env) {
  return {
    cloudflare: !!(env.AI && typeof env.AI.run === 'function'),
    gemini: !!env.GEMINI_API_KEY,
    unsplash: !!env.UNSPLASH_ACCESS_KEY,
  };
}

/**
 * Ask the writer. Tries providers in `order` ("cloudflare,gemini" by default); one retry per provider chain.
 * Returns { text, provider, model }.
 */
export async function askWriter(env, opts, order = 'cloudflare,gemini') {
  const o = { system: '', maxTokens: 1500, temperature: 0.8, ...opts };
  const chain = String(order || 'cloudflare,gemini').split(',').map(s => s.trim()).filter(Boolean);
  const errors = [];
  for (const p of chain) {
    try {
      if (p === 'cloudflare') return await viaCloudflare(env, o);
      if (p === 'gemini') return await viaGemini(env, o);
    } catch (e) { if (e && e.budget) throw e; errors.push(`${p}: ${e && e.message ? e.message : e}`); }
  }
  throw new Error('No AI writer available — ' + (errors.join(' | ') || 'no provider configured'));
}

/**
 * If the model's answer was cut off (token limit), close the open brackets after the last complete element
 * so a truncated-but-mostly-complete JSON can still be used. Returns a parsed value or throws.
 */
function repairTruncatedJson(raw) {
  const stack = [];
  const cuts = [];          // [endIndex, closersString] after each complete object/array
  let inStr = false, esc = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') stack.push('}');
    else if (c === '[') stack.push(']');
    else if (c === '}' || c === ']') {
      stack.pop();
      cuts.push([i + 1, stack.slice().reverse().join('')]);
    }
  }
  for (let k = cuts.length - 1; k >= 0; k--) {
    const [end, closers] = cuts[k];
    const cand = (raw.slice(0, end) + closers).replace(/,\s*([}\]])/g, '$1');
    try { return JSON.parse(cand); } catch (_) { /* try an earlier cut */ }
  }
  throw new Error('model JSON is cut off and could not be repaired');
}

/** Pull a JSON object out of a model answer (tolerates text before/after, trailing commas and truncated output). */
export function parseJsonLoose(text) {
  const s = String(text || '');
  const a = s.indexOf('{');
  if (a < 0) throw new Error('model did not return JSON');
  const b = s.lastIndexOf('}');
  const tail = b > a ? s.slice(a, b + 1) : s.slice(a);
  try { return JSON.parse(tail.replace(/,\s*([}\]])/g, '$1')); }
  catch (_) { return repairTruncatedJson(s.slice(a)); }
}
