// Concatenates the home-page CSS into two files (2 requests instead of 9) and re-stamps their ?v= hash in index.html + sw.js.
// Order is preserved exactly (same cascade as the separate <link>s). Run automatically by `npm run build` / `npm run deploy`.
// Edit the individual css/*.css files as before — never edit css/bundle-*.css by hand.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const BUNDLES = {
  'css/bundle-base.css': ['css/tailwind.css', 'css/dark-mode.css'],
  'css/bundle-mall.css': ['css/mall-theme.css', 'css/mall-home.css', 'css/mall-extra.css', 'css/mall-home-b.css', 'css/mall-home-sections.css', 'css/mall-design-mint.css'],
};
let html = readFileSync('index.html', 'utf8');
let sw = readFileSync('sw.js', 'utf8');
for (const [out, parts] of Object.entries(BUNDLES)) {
  const css = parts.map(f => `/* ==== ${f} ==== */\n${readFileSync(f, 'utf8').replace(/^\uFEFF?@charset[^;]*;/, '')}\n`).join('');
  writeFileSync(out, css);
  const v = createHash('sha1').update(css).digest('hex').slice(0, 8);
  const re = new RegExp(`/${out.replace('.', '\\.')}\\?v=[A-Za-z0-9]+`, 'g');
  html = html.replace(re, `/${out}?v=${v}`);
  sw = sw.replace(re, `/${out}?v=${v}`);
  console.log(`${out}  ${(css.length / 1024).toFixed(1)} KiB  v=${v}`);
}
writeFileSync('index.html', html);
writeFileSync('sw.js', sw);
