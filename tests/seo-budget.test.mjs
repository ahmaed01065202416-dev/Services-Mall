// Regression test for the "Too many subrequests" failure of the scheduled article writer.
import assert from 'node:assert/strict';
import { resetBudget, spend, usedCount, BudgetError, SUBREQUEST_LIMIT } from '../functions/_shared/budget.js';
import { askWriter } from '../functions/_shared/ai-write.js';

// 1) the counter stops with a clear BudgetError instead of silently running into the platform limit
resetBudget(3);
spend(1); spend(1); spend(1);
assert.throws(() => spend(1, 'x'), (e) => e instanceof BudgetError && e.budget === true && /budget reached/.test(e.message));

// 2) a writer that keeps failing can no longer burn unlimited calls (old behaviour: dozens per section)
resetBudget();
let calls = 0;
const env = { AI: { run: async () => { calls++; throw new Error('boom: temporary failure'); } } };
let budgetHit = false;
for (let i = 0; i < 40 && !budgetHit; i++) {
  try { await askWriter(env, { system: 's', user: 'u', maxTokens: 10 }, 'cloudflare'); }
  catch (e) { if (e.budget) budgetHit = true; }
}
assert.ok(budgetHit, 'budget error must surface');
assert.ok(calls <= SUBREQUEST_LIMIT, `made ${calls} calls, limit ${SUBREQUEST_LIMIT}`);

// 3) the platform's own "Too many subrequests" error is recognised and NOT retried across models/providers
resetBudget();
calls = 0;
const env2 = { AI: { run: async () => { calls++; throw new Error('Too many subrequests by single Worker invocation.'); } }, GEMINI_API_KEY: 'k' };
await assert.rejects(() => askWriter(env2, { system: 's', user: 'u', maxTokens: 10 }, 'cloudflare,gemini'), (e) => e.budget === true);
assert.equal(calls, 1, 'must stop at the first platform subrequest error, not try every model');

// 4) a retired/unknown model is skipped for the rest of the request
resetBudget();
const tried = [];
const env3 = { AI: { run: async (m) => { tried.push(m); if (tried.length === 1) throw new Error('No such model ' + m); return { response: 'مرحبا بكم في هذا النص التجريبي الطويل' }; } } };
const ok = await askWriter(env3, { system: 's', user: 'u', maxTokens: 10 }, 'cloudflare');
assert.equal(ok.provider, 'cloudflare');
await askWriter(env3, { system: 's', user: 'u', maxTokens: 10 }, 'cloudflare');
assert.ok(!tried.slice(1).includes(tried[0]), 'dead model must not be retried');
console.log('seo-budget: ok');
