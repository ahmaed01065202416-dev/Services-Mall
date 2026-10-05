# Dropshipping + listing-edit/photos fixes (v7)

## Deploy (in order)
1. Publish **firestore.rules** (new: suppliers, supplier_products, dropship_orders; orders/services hardened) — see DEPLOY_RULES.md
2. `npm run build:css` (css/tailwind.css in this zip is already rebuilt)
3. Deploy Pages — new routes: /api/dropship, /api/ad-image (plus /api/ads, /api/ads-feed, /api/ratings from v6)
4. Redeploy the cron worker (adds the supplier "late to ship" reminder)
5. Admin → تبويب **دروبشيبنج → إعدادات** to review the defaults (min margin 10%, commission on margin, ship SLA 3 days, auto-approve suppliers ON)

## Flow
supplier registers (auto-active) → adds products at WHOLESALE price (≤5 photos) → a seller imports one from "كتالوج الموردين",
sets his selling price (never below wholesale + min margin) → buyer pays ONLINE through the gateway into escrow →
supplier ships (carrier + tracking number, from "طلبات الشحن") and marks delivered → buyer confirms →
supplier gets wholesale, reseller gets margin − commission, platform gets commission. Refund/dispute-refund returns everything to the buyer.

## Safety rules (all enforced server-side / in firestore.rules)
- cost price + supplier of record are re-read from supplier_products at payment time, never from the order the browser wrote
- out of stock / supplier suspended / price below cost ⇒ the purchase is refused and every reseller listing is auto-paused (and re-opened on restock)
- the reseller can't drive shipping/delivery of a dropship order; marker + tracking fields on orders are server-only
- dropship listings can't be created by clients and can't be priced below the floor
- no cash-on-delivery: online payment only

## Edit / photos fixes
- Editing a listing now opens it pre-filled and UPDATES it (the navigateTo wrapper in index.html was dropping the listing data; the form now also loads the full document from Firestore)
- Products take up to 5 photos in one pick (first = cover, ★ makes another the cover, × removes); services take 1.
  All photos live inside the listing document (Firestore limit 1 MiB), so they share a budget and are auto-compressed to fit; if they can't fit the user gets a clear message instead of a failed save.

---
# v8 — Fees per side + no returns after receipt

## Who pays the commission (admin → الإعدادات → "على مين تُحسب العمولة؟")
- **Buyer fee** on/off — added on top of the price at checkout.
- **Seller commission** on/off — deducted from the seller's payout, only when the escrow is released.
- Each side can have its **own %** (empty = use the main commission settings: type / % / fixed / min / max / tiers).
- Default = both ON with the old 5% → behaviour unchanged until you change it.
- Checkout hides the fee line when the buyer pays nothing; the admin revenue cards now count buyer fee + seller commission.
- Side effects to know: affiliate commission is computed from the SELLER commission only (buyer-only mode ⇒ no affiliate payout);
  the main "نسبة العمولة" box now accepts 0 (it used to silently turn 0 into 5); the browser fee preview now applies FEE_MIN/FEE_MAX like the server does.
- Dropship: the commission comes out of the reseller's margin only (base is switchable), never out of the supplier's wholesale price.

## Money timing + returns
- Money stays in escrow after payment — nothing reaches the seller's/supplier's wallet until the BUYER confirms receipt (or an admin resolves a dispute).
- Once the buyer confirms: funds are released for good, **returns are closed** (client eligibility + firestore.rules on `returns` + any still-pending return request is auto-closed by the server). The confirm dialog says so.
- Returns/disputes remain possible only while the product is "delivered" and not yet confirmed — the refund comes straight out of escrow, so there is no manual refund path any more.
- There is NO automatic release: a buyer who never confirms leaves the money in escrow; after AUTO_DISPUTE_DAYS the order is flagged as a dispute for admin review (existing behaviour, unchanged).

Redeploy: firestore.rules (new returns rule) → Pages → `npm run build:css` is already applied.
