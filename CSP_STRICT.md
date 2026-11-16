# Strict CSP (no `unsafe-inline`, no `unsafe-eval`)

The site now runs under a CSP whose `script-src` / `style-src` allow **only `'self'` + a short host list** (see `_headers` and
`functions/_shared/security-headers.js` — keep both identical).

## How it works
`/js/csp-shim.js` is the first script in every page's `<head>`:
| Need | Markup / API |
|---|---|
| Event handler | `data-on-click="fn(this.value)"` (any `data-on-<event>`). Executed by a small interpreter — **no eval**. Same `this`, `event`, scope as an inline handler. |
| Inline style | `data-style="color:red"` (applied through the CSSOM). |
| Injected CSS | `window.__cssInject('id', cssText)` instead of `<style>`. |
| Page boot data from Functions | `<script type="application/json" id="__boot">{"k":"svc","v":"ID"}</script>` |

Page-level `<style>` / inline `<script>` blocks were moved to `/css/p/*.css` and `/js/p/*.js`.

## Rules for new code
* Never write `onclick="…"`, `style="…"`, `<style>` or inline `<script>` — run `node scripts/check-csp.mjs` before deploying (exit 1 on violations).
* Handler grammar supported: calls, member access, `if/else`, `return`, `? :`, `&&`/`||`/`??`, `=`/`+=`, arrow functions with expression bodies, array/object literals. No `new`, `function`, `var/let/const`, template literals, regex.
* Blocked on purpose: `eval`, `Function`, `constructor`, `__proto__`, `innerHTML/outerHTML/srcdoc =`, `insertAdjacentHTML`, `document.write`, `javascript:` URLs.
* DOMPurify is hooked so sanitized HTML can never contain `data-on-*` / `data-style`.
* Third-party libs live in `/vendor/` (Firebase compat 10.14.1, GSAP 3.12.5, Chart.js 4.4.1, DOMPurify 3.1.7, Font Awesome 6.5.1). To upgrade: replace files, change nothing else.
* Need a new external host (image CDN, API…)? add it to BOTH CSP strings.

## Emergency rollback
If something breaks in production, add `'unsafe-inline'` back to `script-src` and `style-src` in `_headers` **and** `functions/_shared/security-headers.js`
(the shim keeps working under the looser policy). Open DevTools → Console: blocked items are logged as "Refused to …".

## Known limits
* `seller-kyc.js` print popup (`document.write` into a new window) is unstyled under the strict CSP.
* Events: inline handlers are dispatched from a capture listener on `window` (child → parent order, `stopPropagation()` honored).

## Production build (removes code comments → fixes ZAP "Suspicious Comments")
`npm run build:dist` writes `./dist` with JS minified **whitespace + syntax only, no identifier renaming** (so every global keeps its name) and HTML comments removed.
Sources in the repo stay untouched. ⚠ The files in `dist/js` are minified — debug against `js/`, never edit `dist/`.

Deploy it either way:
* Wrangler:  `npm run deploy:prod`  (runs the CSP check → build → `wrangler pages deploy dist`).
* Git-connected Pages: set **Build command** = `npm run build:dist`, **Build output directory** = `dist`, and in `wrangler.toml` set `pages_build_output_dir = "dist"`.
  `functions/` is still taken from the repo root.
Leave everything as it is if you prefer the current "deploy `.`" flow — the strict CSP works either way; only the comment alert remains.

## ZAP housekeeping
* Exclude `/vendor/` from the ZAP context (third-party minified libs produce comment/timestamp noise).
* "Timestamp Disclosure - Unix" and "Modern Web Application" are informational/false positives — mark them accepted.
