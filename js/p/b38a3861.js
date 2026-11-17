// ══════════════════════════════════════════════════════════════════════════════
//  FIREBASE INIT v4.0
//  • authDomain = project's own .firebaseapp.com
//  • Authorized Domains in Firebase Console must include:
//      mall-services.pages.dev
//      (+ your custom domain here, if you add one later — e.g. mallservices.com)
//  • Google Cloud OAuth must include both domains in origins + redirect URIs:
//      https://mall-services.pages.dev/__/auth/handler
//      (+ https://yourcustomdomain.com/__/auth/handler once you have one)
// ══════════════════════════════════════════════════════════════════════════════
const FIREBASE_CONFIG = {
    apiKey:            "AIzaSyDfWKWN5CTlBA-krEMXsmYmaI8j7fyuw20",
    authDomain:        "services-mall.firebaseapp.com",   // ← الصحيح دائماً
    databaseURL:       "https://services-mall-default-rtdb.firebaseio.com",
    projectId:         "services-mall",
    storageBucket:     "services-mall.firebasestorage.app",
    messagingSenderId: "20174208068",
    appId:             "1:20174208068:web:382ece0ff09fa9be815011",
    measurementId:     "G-20SMHQMQ1G",
};

// Guard: prevent duplicate init if script ever runs twice
if (!firebase.apps.length) {
    firebase.initializeApp(FIREBASE_CONFIG);
} else {
    console.warn('[Firebase] App already initialized — skipping duplicate init');
}

// Resolves once the FIRST auth state (logged in or not) is known — used to
// safely deep-link into auth-dependent pages (like a shared order workspace
// link) without racing Firebase's async session restore on a fresh load.
let _resolveAuthReady;
window._authReadyPromise = new Promise(res => { _resolveAuthReady = res; });

const auth    = firebase.auth();
const db      = firebase.firestore();
// storage + database compat SDKs are loaded after first paint by /js/lazy-firebase.js (perf); both are created on first use below.
// Realtime Database — used ONLY for chat messages (js/chat.js). Firestore's
// per-document read/write pricing gets expensive fast for a live chat feed;
// RTDB bills by bandwidth/storage instead, which fits this pattern much better.
var _rtdb = null, _storage = null;
Object.defineProperty(window, 'rtdb', { configurable: true, get: function () {
    if (!_rtdb) { if (typeof firebase.database !== 'function') throw new Error('Realtime Database SDK is still loading'); _rtdb = firebase.database(); }
    return _rtdb;
} });

// Google provider — no hardcoded domain, works on any authorized domain
const googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.setCustomParameters({
    prompt: 'select_account',   // always show account picker
    // NOTE: do NOT set client_id here — Firebase manages OAuth internally
    // Setting it forces a specific OAuth client that may not have all domains authorized
});

window.auth           = auth;
window.db             = db;
Object.defineProperty(window, 'storage', { configurable: true, get: function () {
    if (!_storage) { if (typeof firebase.storage !== 'function') throw new Error('Storage SDK is still loading'); _storage = firebase.storage(); }
    return _storage;
} });
window.firebase       = firebase;
window.googleProvider = googleProvider;

// Enable offline persistence
db.enablePersistence({ synchronizeTabs: true })
  .catch(e => { if (!['failed-precondition','unimplemented'].includes(e.code)) console.warn('[Firebase]', e.code); });

console.log('✅ Firebase v4.0 initialized | domain:', location.hostname);
