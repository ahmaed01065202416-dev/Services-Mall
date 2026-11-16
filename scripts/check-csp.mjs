// Fails (exit 1) if markup would violate the strict CSP: inline on*= handlers, style="" attributes, inline <script>/<style>, javascript: URLs.
// Use data-on-click="…" / data-style="…" instead (see CSP_STRICT.md).   Run:  node scripts/check-csp.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
const SKIP = new Set(['node_modules', 'vendor', '.git', 'tests', 'cron-worker']);
const EV = 'click|dblclick|change|input|submit|keyup|keydown|keypress|error|load|focus|blur|mouseover|mouseout|drop|dragover|dragleave|dragenter|dragstart|contextmenu';
const RE_ON = new RegExp(`\\son(${EV})=(?=\\\\?["'])`);
const RE_STYLE = /\sstyle=(?=\\?["'])/;
const files = [];
(function walk(d) { for (const n of readdirSync(d)) { if (SKIP.has(n)) continue; const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.(html|js)$/.test(n) && !p.endsWith('csp-shim.js') && !p.endsWith('check-csp.mjs')) files.push(p); } })('.');
let bad = 0;
const report = (f, m) => { bad++; console.log(`✖ ${f}: ${m}`); };
for (const f of files) {
  let t = readFileSync(f, 'utf8');
  if (f.endsWith('.html')) {
    t = t.replace(/<noscript\b[\s\S]*?<\/noscript>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
    for (const m of t.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) if (!/\bsrc\s*=/.test(m[1]) && !/ld\+json|application\/json/i.test(m[1]) && m[2].trim()) report(f, 'inline <script>');
    if (/<style\b/i.test(t)) report(f, 'inline <style>');
  }
  const body = f.endsWith('.js') ? t.replace(/^\s*(\/\/|\*|\/\*).*$/gm, '') : t;
  if (RE_ON.test(body)) report(f, 'inline on*= handler (use data-on-*)');
  if (RE_STYLE.test(body)) report(f, 'style="" attribute (use data-style)');
  if (/href=\\?["']javascript:/i.test(body)) report(f, 'javascript: URL');
}
console.log(bad ? `\n${bad} problem(s)` : `CSP check passed (${files.length} files)`);
process.exit(bad ? 1 : 0);
