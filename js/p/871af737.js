// Load live platform settings BEFORE any page renders
// PLATFORM object is defined in constants.js — this merges Firestore values into it
// ⚠️ FIXED (found in audit): this used to run immediately, before Firebase Auth
// had resolved whether anyone was signed in — firestore.rules requires
// isSignedIn() to read settings/platform, so `request.auth` was null every
// time and the read was denied (logged as "Missing or insufficient
// permissions"), silently falling back to hardcoded defaults on every load.
// Now waits for _authReadyPromise (resolved by auth.js's onAuthStateChanged)
// before attempting the read.
(async () => { try { await window._authReadyPromise; await loadPlatformSettings(); } catch(e) {} })();
