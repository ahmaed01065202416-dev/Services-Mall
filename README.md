# Mall Services — منصة الخدمات الاحترافية

Hosted entirely on **Cloudflare Pages** (static site + `/functions/api/*`
serverless functions), with **Firebase** (Auth, Firestore, Realtime Database)
as the backend data layer, **Fawaterak** as the only payment gateway, and a
separate **Cloudflare Worker** (`cron-worker/`) for the daily scheduled job.

## Environment Variables (Cloudflare Pages Dashboard)
Set these in: **Pages project → Settings → Environment Variables** (add for
both Production and Preview). **The full list, with the exact format of every
value, is in `.env.example`** — read that file before deploying.

The four that will break the site if missing:
- `FIREBASE_PROJECT_ID` — must be `services-mall` (not `mall-services`; the
  site domain is `mall-services.pages.dev` and the word order is a classic
  typo that makes every server-side Firestore read return "not found")
- `FIREBASE_SERVICE_ACCOUNT` — the whole service-account JSON on one line
- `ADMIN_SECRET` — long random string; without it every cron call 401s
- `SITE_URL` / `ALLOWED_ORIGINS` — your Pages domain, and the comma-separated
  origin list respectively

Optional: `FIREBASE_WEB_API_KEY`, `FIREBASE_DATABASE_URL`, `ADMIN_UIDS`,
`GEMINI_API_KEY`, `OPENAI_API_KEY`, `UNSPLASH_ACCESS_KEY`, `FAWATERAK_API_KEY`,
`FAWATERAK_BASE_URL`, `ALLOW_SIMULATED_PAYMENTS` (keep `false` in production).

The client-side Firebase config (`apiKey`, `authDomain`, `projectId`, …) is
**not** an env var — it lives in the `FIREBASE_CONFIG` object in `index.html`
because the browser needs it at runtime.

## Docs
| File | What's in it |
|---|---|
| `AUDIT_REPORT.md` | Full audit report (Arabic): every problem found and fixed, and what was deliberately left alone |
| `.env.example` | Every environment variable the code actually reads, with the exact format of each value |
| `DEPLOY_CLOUDFLARE.md` | Cloudflare Pages + cron-worker deploy walkthrough |
| `DEPLOY_RULES.md` | How to publish `firestore.rules` / `database.rules.json` (Pages doesn't deploy them) |
| `database.rules.notes.md` | Reasoning and caveats behind the Realtime Database rules |
| `SETUP.md` | AI content system, admin setup, cron schedule, AdSense |
| `SECURITY_FIX_PAYMENT.md` | Payment/escrow security model |

## Firebase Setup
Configure in Firebase Console → Authentication → Authorized Domains:
add your `*.pages.dev` domain (and any custom domain you attach later).

Deploy the security rules (not part of the Pages deploy — a separate step):
```
firebase deploy --only firestore:rules,database
```

## Deploying
Connect this repo to a Cloudflare Pages project (Git integration is the
easiest option) — see `DEPLOY_CLOUDFLARE.md` for the full walkthrough,
and `cron-worker/README` inline comments for the separate Worker deploy.
