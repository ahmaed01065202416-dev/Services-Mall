// Optional: builds ./dist with minified JS (whitespace + syntax only — NO identifier renaming, so every global the inline
// scripts / onclick handlers rely on keeps its name). Sources in ./js stay untouched.
//   npm run build:dist   then   npx wrangler pages deploy dist --project-name=mall-services
// Skip this if the site is deployed straight from GitHub with an empty build command (the current setup): dist is opt-in.
import { build } from 'esbuild';
import { cpSync, rmSync, readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

execSync('node scripts/bundle-css.mjs', { stdio: 'inherit' });
rmSync('dist', { recursive: true, force: true });
cpSync('.', 'dist', { recursive: true, filter: s => !/^(node_modules|dist|\.git|tests|scripts)(\/|$)/.test(s) });
const files = ['dist/js', 'dist/js/p'].flatMap(d => { try { return readdirSync(d).filter(f => f.endsWith('.js')).map(f => d + '/' + f); } catch { return []; } }); // js/p = scripts extracted from inline <script> blocks (strict CSP)
let before = 0, after = 0;
for (const f of files) before += statSync(f).size;
await build({ entryPoints: files, outdir: 'dist/js', allowOverwrite: true, minifyWhitespace: true, minifySyntax: true, minifyIdentifiers: false, legalComments: 'none', target: 'es2019', logLevel: 'warning' });
for (const f of files) after += statSync(f).size;
console.log(`js: ${(before / 1024).toFixed(0)} KiB -> ${(after / 1024).toFixed(0)} KiB (${files.length} files)`);

// Strip HTML comments from every served page (ZAP "Information Disclosure - Suspicious Comments"). Scripts/styles are external now (strict CSP), so no code lives in comments.
let htmlN = 0;
(function walk(d) {
  for (const n of readdirSync(d)) {
    const p = d + '/' + n;
    if (statSync(p).isDirectory()) { if (n !== 'vendor') walk(p); continue; }
    if (!n.endsWith('.html') || n.startsWith('_')) continue;      // _article-template.html is a template, keep as is
    const s = readFileSync(p, 'utf8'), o = s.replace(/<!--(?!\[if)[\s\S]*?-->/g, '');
    if (o !== s) { writeFileSync(p, o); htmlN++; }
  }
})('dist');
console.log(`html: comments stripped in ${htmlN} file(s)`);
