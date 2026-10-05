# Ads system + live counters (added in this version)

## Deploy checklist (in this order)
1. `npm run build:css`            (the shipped css/tailwind.css was already rebuilt)
2. Publish **firestore.rules** (new: `ad_placements`, `ads`) — see DEPLOY_RULES.md
3. Deploy Pages (`wrangler pages deploy .`) — new routes: /api/ads, /api/ads-feed, /api/ratings, /api/home-stats (rewritten)
4. Redeploy the cron worker (`cd cron-worker && npx wrangler deploy`) — it now also runs the ads sweep + ratings sync daily
5. Admin → تبويب **الإعلانات → الأماكن والأسعار → "إضافة الأماكن الافتراضية"** (prices are placeholders, edit them)
6. Run once: `POST /api/ratings {"action":"syncAll"}` with header `X-Admin-Token` to correct the ratings that were stuck at 0/5 before.

## Behaviour
- Payment per placement is OPTIONAL (checkbox "الدفع إلزامي"); price 0 or unchecked ⇒ goes straight to review. "موافقة تلقائية" skips review.
- Reject / seller-cancel of a PAID ad ⇒ refunded to the seller's wallet minus ONLY the gateway fee (Settings: % + fixed). It is a wallet refund, not a card refund (Fawaterak refund API unconfirmed).
- Ads end by themselves: the public feed + browser check `endAt` (exact), the daily cron marks them `expired`, and notifies the seller `ADS_REMINDER_DAYS` (default 3) before the end (daily cron ⇒ the reminder lands within ~24h of that mark).
- "Ads anywhere": a placement may carry a CSS selector + position; `js/ads-embed.js` injects the slot there on any page that loads it (index.html and all blog pages do).
- Counters (users / active services / completed orders / reviews + true average) are live COUNT/AVG queries, refreshed every 60s on the home page, edge-cached 30s. Ratings on cards come only from real reviews; no reviews ⇒ "جديد".

## Files
New: functions/api/ads.js, ads-feed.js, ratings.js · js/ads-embed.js, ads-system.js
Changed: functions/api/home-stats.js, fawaterak-webhook.js, _shared/gcp.js (fsAggregate) · cron-worker/index.js · firestore.rules · index.html · js/{services,dashboard,seller-dashboard,order-workspace,i18n}.js · blog/**/index.html · sw.js (cache v3.15) · css/tailwind.css · seed.js (no fake ratings)
