// SEO regression guard for the STATIC pages. Run: node scripts/check-seo.mjs   (exit 1 on errors; warnings don't fail)
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const SKIP = new Set(['node_modules', 'vendor', 'dist', '.git', 'tests', 'scripts', 'functions', 'cron-worker']);
const pages = [];
(function walk(d) { for (const n of readdirSync(d)) { if (SKIP.has(n)) continue; const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (n === 'index.html' || n === '404.html') pages.push(p); } })('.');
let err = 0, warn = 0;
const E = (f, m) => { err++; console.log(`✖ ${f}: ${m}`); }, W = (f, m) => { warn++; console.log(`⚠ ${f}: ${m}`); };
const titles = new Map(), descs = new Map();
const text = (s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
for (const f of pages) {
  const s = readFileSync(f, 'utf8'); const head = s.slice(0, s.indexOf('</head>'));
  const noindex = /<meta name="robots" content="[^"]*noindex/i.test(head);
  const title = (/<title>([\s\S]*?)<\/title>/.exec(head) || [])[1]?.trim();
  const desc = (/<meta name="description" content="([^"]*)"/.exec(head) || [])[1];
  const canon = (/<link rel="canonical" href="([^"]+)"/.exec(head) || [])[1];
  if (!title) E(f, 'missing <title>'); else { if (title.length > 80) W(f, `title ${title.length} chars (>80 gets truncated)`); if (titles.has(title)) E(f, `duplicate title with ${titles.get(title)}`); titles.set(title, f); }
  if (noindex) continue;                                                  // 404 etc.
  if (!desc) E(f, 'missing meta description'); else { if (desc.length < 70) W(f, `description only ${desc.length} chars`); if (desc.length > 170) W(f, `description ${desc.length} chars (>170 truncated)`); if (descs.has(desc)) E(f, `duplicate description with ${descs.get(desc)}`); descs.set(desc, f); }
  if (!canon) E(f, 'missing canonical'); else if (!canon.startsWith('https://')) E(f, 'canonical is not https');
  if (!/property="og:image" content="[^"]*og-cover\.png"/.test(head)) E(f, 'og:image is not the 1200x630 cover');
  if (!/name="twitter:card"/.test(head)) E(f, 'missing twitter:card');
  if (!/<html lang="ar"/.test(s)) W(f, 'html lang is not ar');
  const h1 = (s.match(/<h1\b/g) || []).length; if (h1 === 0) E(f, 'no <h1>'); else if (h1 > 1 && f !== 'index.html') W(f, `${h1} <h1> tags`);
  for (const m of s.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) { try { const j = JSON.parse(m[1]); if (j.datePublished && !/^\d{4}-\d{2}-\d{2}/.test(j.datePublished)) E(f, `JSON-LD datePublished is not ISO: ${j.datePublished}`); } catch (e) { E(f, 'invalid JSON-LD: ' + e.message); } }
  if (f !== 'index.html' && !/BreadcrumbList/.test(s)) W(f, 'no BreadcrumbList JSON-LD');
  if (f.startsWith('blog/') && f !== 'blog/index.html' && !f.includes('_')) { const words = text((/<article[\s\S]*?<\/article>/.exec(s) || [''])[0]).split(' ').length; if (words < 350) W(f, `article only ${words} words`); }
  for (const m of s.matchAll(/<img\b[^>]*>/g)) if (!/\balt=/.test(m[0])) W(f, 'img without alt');
}
// duplicated paragraphs across articles (template clones)
const seen = new Map();
for (const f of pages.filter(p => p.startsWith('blog/') && !p.endsWith('blog/index.html'))) for (const m of readFileSync(f, 'utf8').matchAll(/<p>([^<]{80,})<\/p>/g)) { const k = m[1].trim(); if (seen.has(k) && seen.get(k) !== f) E(f, `paragraph duplicated from ${seen.get(k)}: "${k.slice(0, 50)}…"`); else seen.set(k, f); }
// sitemap-main URLs must exist
const sm = readFileSync('sitemap-main.xml', 'utf8');
for (const m of sm.matchAll(/<loc>https:\/\/[^/]+(\/[^<]*)<\/loc>/g)) { const p = decodeURIComponent(m[1]); const file = p === '/' ? 'index.html' : join(p.replace(/^\//, ''), p.endsWith('/') ? 'index.html' : ''); if (!existsSync(file)) E('sitemap-main.xml', `URL without a page: ${p}`); }
if (!/^Sitemap:/mi.test(readFileSync('robots.txt', 'utf8'))) E('robots.txt', 'no Sitemap: line');
console.log(`\nSEO check: ${pages.length} pages, ${err} error(s), ${warn} warning(s)`); process.exit(err ? 1 : 0);
