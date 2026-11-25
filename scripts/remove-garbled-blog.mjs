// The blog/ folder contains folders whose Arabic names got corrupted on upload (e.g. "#U256a#U062f…").
// They duplicate the good folders, can't be opened by URL (# starts a URL fragment), and cause SEO "duplicate content" errors.
//   node scripts/remove-garbled-blog.mjs            → lists them (dry run)
//   node scripts/remove-garbled-blog.mjs --apply    → deletes them   (then: git add -A && git commit -m "remove corrupted blog folders")
import { readdirSync, rmSync, statSync } from 'node:fs';
const apply = process.argv.includes('--apply');
const bad = readdirSync('blog').filter(n => n.includes('#U') && statSync('blog/' + n).isDirectory());
for (const n of bad) { console.log((apply ? 'deleted  ' : 'would delete  ') + 'blog/' + n); if (apply) rmSync('blog/' + n, { recursive: true, force: true }); }
console.log(`\n${bad.length} folder(s) ${apply ? 'removed' : 'found'}.` + (apply ? '' : ' Add --apply to delete.'));
