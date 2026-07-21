# ✅ Mall Services — Security & Feature Fixes Applied
*Version 3.4 — All fixes production-ready*

---

## 1. Content Security Policy (CSP) — FIXED ✅
**File:** `netlify.toml`

### What was wrong:
- `https://www.googletagmanager.com/gtag/js` was blocked (missing from `script-src`)
- `https://www.google-analytics.com` missing from `connect-src`
- Incomplete Firebase domains in `connect-src`

### What was fixed:
```
script-src: added https://www.googletagmanager.com, https://www.google-analytics.com, https://ssl.google-analytics.com
connect-src: added https://www.googletagmanager.com, https://analytics.google.com, https://region1.google-analytics.com, https://stats.g.doubleclick.net, wss://*.firebasedatabase.app
media-src: added https://firebasestorage.googleapis.com (for file downloads)
worker-src: added blob: (for service worker)
frame-src: added https://hooks.stripe.com
```

---

## 2. Firebase Order Update Error — FIXED ✅
**File:** `js/payment-system.js`

### What was wrong:
```js
// ❌ BEFORE — updateDoc() on a document that might not exist yet
await window.db.collection(COLLECTIONS.ORDERS).doc(orderId).update({
    payoneerPending: true,
    ...
});
// → FirebaseError: No document to update
```

### What was fixed:
```js
// ✅ AFTER — _safeCreateOrder checks existence first
async function _safeCreateOrder(orderId, data) {
    const ref  = window.db.collection(COLLECTIONS.ORDERS).doc(orderId);
    const snap = await ref.get();
    if (snap.exists) {
        await ref.update({ ...data, updatedAt: _ts() });  // update if exists
    } else {
        await ref.set({ ...data, createdAt: _ts(), updatedAt: _ts() }); // create if not
    }
}
```

Additional fixes:
- Payoneer flow now calls `_safeCreateOrder()` instead of `updateDoc()`
- `_finalizeOrders()` uses `window.db.batch()` for atomic multi-order creation
- Unique order IDs use timestamp + random: `MS_${ts}_${rand}` (prevents duplicates)
- All `serverTimestamp()` calls use safe `_ts()` wrapper with try/catch fallback

---

## 3. Google Auth Popup COOP Issue — FIXED ✅
**File:** `netlify.toml`

### What was wrong:
```
Cross-Origin-Opener-Policy: same-origin
→ ERROR: Cross-Origin-Opener-Policy policy would block the window.closed call
```

### What was fixed:
```toml
Cross-Origin-Opener-Policy = "same-origin-allow-popups"
```

`auth.js` already uses:
- `signInWithPopup()` as primary (works without 3rd-party cookies in Chrome 115+)
- `signInWithRedirect()` as fallback when popup is blocked
- `getRedirectResult()` on page load to handle redirect callback

---

## 4. Paymob Permissions-Policy Warnings — FIXED ✅
**File:** `netlify.toml`

### What was wrong:
```
Permissions-Policy: accelerometer=(), gyroscope=()
→ WARNING: accelerometer is not allowed by Permissions-Policy
→ WARNING: gyroscope is not allowed by Permissions-Policy
```

### What was fixed:
```toml
Permissions-Policy = "accelerometer=(self \"https://accept.paymob.com\"), gyroscope=(self \"https://accept.paymob.com\"), camera=(), microphone=(), geolocation=(), payment=(self \"https://accept.paymob.com\" \"https://js.stripe.com\")"
```

Also added to Paymob iframe:
```html
<iframe allow="payment; accelerometer; gyroscope" ...>
```

---

## 5. Security Headers — OPTIMIZED ✅
**File:** `netlify.toml`

All headers professionally configured:
| Header | Value | Purpose |
|--------|-------|---------|
| `X-Frame-Options` | `SAMEORIGIN` | Clickjacking protection |
| `X-Content-Type-Options` | `nosniff` | MIME sniffing protection |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Privacy + SEO |
| `Cross-Origin-Opener-Policy` | `same-origin-allow-popups` | Google Auth popup |
| `Cross-Origin-Resource-Policy` | `cross-origin` | Firebase/CDN resources |
| `Permissions-Policy` | See above | Paymob + security |
| `Content-Security-Policy` | Comprehensive | All services allowed |

Per-route cache headers:
- `/index.html` → `no-cache` (always fresh app)
- `/js/*` → `no-cache` (always fresh JS)
- `/icons/*` → `max-age=604800, immutable`
- `/blog/*` → `max-age=3600, stale-while-revalidate`
- `/*.xml` → `max-age=3600`

---

## 6. Chat System — ENHANCED ✅
**Files:** `js/order-workspace.js` (v3.4), `js/chat.js` (new)

### Features:
- ✅ Real-time messages via Firestore `onSnapshot`
- ✅ Text messages with `Enter` to send / `Shift+Enter` for newline
- ✅ **File transfer** (any file type, max 50MB)
- ✅ **Image messages** (inline preview with lightbox link)
- ✅ **Emoji quick buttons** (👍✅🔄📎⏰💡🎉❓)
- ✅ **Delivery messages** with file list (styled green banner)
- ✅ Clickable URLs auto-linkified
- ✅ Typing indicator (Firestore-based)
- ✅ **Read receipts** (double checkmark turns blue when read)
- ✅ File type icons (PDF, ZIP, Word, Excel, video, audio, code, image)
- ✅ Drag & drop for delivery files
- ✅ Auto-scroll to latest message
- ✅ Fallback for missing Firestore index
- ✅ `serverTimestamp()` safe wrapper

### New `js/chat.js` module:
Standalone reusable chat component with public API:
```js
ChatModule.initChat(orderId, containerEl, opts); // Mount chat
ChatModule.destroy(orderId);  // Unsubscribe one
ChatModule.destroyAll();      // Unsubscribe all
```

---

## 7. Google Analytics — INTEGRATED ✅
**File:** `index.html`

```html
<!-- Replace G-XXXXXXXXXX with your real Measurement ID -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
```

Custom event helper:
```js
window.trackEvent('button_click', 'engagement', 'buy_now');
```

---

## NEXT STEPS

1. **Replace `G-XXXXXXXXXX`** in `index.html` with your real Google Analytics 4 ID
2. **Deploy to Netlify** (drag & drop the zip or push to GitHub)
3. **Add domain to Firebase** → Console → Authentication → Authorized domains
4. **Create Firestore composite index** for chat (link appears in console on first message)
5. **Update WhatsApp number** (`201000000000`) in blog pages

