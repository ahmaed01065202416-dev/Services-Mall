// Optional: builds ./dist with minified JS (whitespace + syntax only — NO identifier renaming, so every global the inline
// scripts / onclick handlers rely on keeps its name). Sources in ./js stay untouched.
//   npm run build:dist   then   npx wrangler pages deploy dist --project-name=mall-services
// Skip this if the site is deployed straight from GitHub with an empty build command (the current setup): dist is opt-in.
import { build } from 'esbuild';
import { cpSync, rmSync, readdirSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';

execSync('node scripts/bundle-css.mjs', { stdio: 'inherit' });
rmSync('dist', { recursive: true, force: true });
cpSync('.', 'dist', { recursive: true, filter: s => !/^(node_modules|dist|\.git|tests|scripts)(\/|$)/.test(s) });
const files = readdirSync('dist/js').filter(f => f.endsWith('.js')).map(f => 'dist/js/' + f);
let before = 0, after = 0;
for (const f of files) before += statSync(f).size;
await build({ entryPoints: files, outdir: 'dist/js', allowOverwrite: true, minifyWhitespace: true, minifySyntax: true, minifyIdentifiers: false, legalComments: 'none', target: 'es2019', logLevel: 'warning' });
for (const f of files) after += statSync(f).size;
console.log(`js: ${(before / 1024).toFixed(0)} KiB -> ${(after / 1024).toFixed(0)} KiB (${files.length} files)`);
