// Replace the site's domain in every static file (canonical, og:url, JSON-LD, sitemaps, llms.txt, CSP, workers …).
//   node scripts/set-domain.mjs --from mall-services.pages.dev --to my-new-domain.com          (dry run: only lists)
//   node scripts/set-domain.mjs --from mall-services.pages.dev --to my-new-domain.com --apply  (writes the files)
// Domains are given WITHOUT https://. Then: set SITE_URL in Cloudflare (+ GitHub repo Variable SITE_URL), run `npm run build:dist`, deploy.
// Skips node_modules, .git, dist, tests (tests assert the default domain). Never touches binary files.
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';

const arg = (k) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : ''; };
const clean = (d) => String(d || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();
const from = clean(arg('--from')), to = clean(arg('--to')), apply = process.argv.includes('--apply');
if (!from || !to || from === to || /[^a-z0-9.-]/.test(from + to)) {
  console.error('usage: node scripts/set-domain.mjs --from old.example.com --to new.example.com [--apply]'); process.exit(1);
}
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'tests', '.wrangler']);
const EXT = new Set(['.html', '.xml', '.txt', '.json', '.js', '.mjs', '.md', '.toml', '.yml', '.yaml', '.webmanifest', '.css', '.example']);
const NAMES = new Set(['_headers', '_redirects']);

let files = 0, hits = 0; const touched = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name), st = statSync(p);
    if (st.isDirectory()) { if (!SKIP_DIRS.has(name)) walk(p); continue; }
    if (!(EXT.has(extname(name)) || NAMES.has(basename(name)))) continue;
    let txt; try { txt = readFileSync(p, 'utf8'); } catch { continue; }
    if (!txt.includes(from)) continue;
    const n = txt.split(from).length - 1; files++; hits += n; touched.push(`${String(n).padStart(3)}  ${p}`);
    if (apply) writeFileSync(p, txt.split(from).join(to), 'utf8');
  }
})('.');
console.log(touched.join('\n'));
console.log(`\n${apply ? 'REPLACED' : 'DRY RUN — would replace'} ${hits} occurrence(s) in ${files} file(s): ${from} → ${to}`);
if (!apply) console.log('Add --apply to write the changes.');
