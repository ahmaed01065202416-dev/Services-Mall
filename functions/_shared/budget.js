// functions/_shared/budget.js
// Cloudflare limits how many outbound requests ("subrequests") ONE Worker invocation may make
// (50 on the Free plan; Workers AI calls count too). One article needs ~25 normally, but every
// failed/retried model call used to add more, so a single hiccup exhausted the limit and every later call
// failed with "Too many subrequests" — which the code then reported (wrongly) as "No AI writer available".
//
// This module counts the calls we make, stops with a CLEAR error before the hard limit, and remembers which
// models are permanently broken during the current request so they are not retried by every parallel section.
//
// NOTE: state is module-level and reset at the start of each request (see resetBudget in api/ai-generate.js).
// The scheduler calls once every few hours, so overlapping requests in one isolate are not a practical concern.

export const SUBREQUEST_LIMIT = 36;   // counted calls (AI, suggestions, images). ~12 more are reserved for Firestore.

export class BudgetError extends Error {
  constructor(msg) { super(msg); this.name = 'BudgetError'; this.budget = true; }
}

let used = 0;
let limit = SUBREQUEST_LIMIT;
const dead = new Set();
let good = '';                          // last model that worked (survives across requests in a warm isolate)

export function resetBudget(max = SUBREQUEST_LIMIT) { used = 0; limit = max; dead.clear(); }
export function remaining() { return limit - used; }
export function usedCount() { return used; }

export function spend(n = 1, label = '') {
  if (used + n > limit) {
    throw new BudgetError(`Cloudflare subrequest budget reached (${used}/${limit}) before: ${label || 'next call'}. ` +
      'Too many retries in one request — run it again later or upgrade the Workers plan.');
  }
  used += n;
}

/** Turn the platform's own "Too many subrequests" error into a BudgetError so callers stop retrying. */
export function asBudgetError(e) {
  const m = String((e && e.message) || e || '');
  return /too many subrequests/i.test(m) ? new BudgetError(m) : null;
}

export const isDead = (id) => dead.has(id);
export const markDead = (id) => { dead.add(id); };
export const lastGood = () => good;
export const setGood = (id) => { good = id; };
