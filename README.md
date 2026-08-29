# Mall Services — منصة الخدمات الاحترافية

Hosted entirely on **Cloudflare Pages** (static site + `/functions/api/*`
serverless functions), with **Firebase** (Auth, Firestore, Realtime Database)
as the backend data layer, **Fawaterak** as the only payment gateway, and a
separate **Cloudflare Worker** (`cron-worker/`) for the daily scheduled job.

## Environment Variables (Cloudflare Pages Dashboard)
Set these in: **Pages project → Settings → Environment Variables** (add for
both Production and Preview). Full list with explanations: see `.env.example`.

Quick reference:
- `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`,
  `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_APP_ID`
- `FIREBASE_SERVICE_ACCOUNT`, `FIREBASE_WEB_API_KEY`
- `SITE_URL`, `ALLOWED_ORIGINS`
- `FAWATERAK_API_KEY`, `FAWATERAK_BASE_URL` (optional)
- `GEMINI_API_KEY`, `OPENAI_API_KEY` (AI blog + AI Brief Generator)
- `ADMIN_SECRET` and/or `ADMIN_UIDS`

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
