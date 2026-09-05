/**
 * AUTH.JS v4.0 — Multi-Domain Production Ready
 * FIX 1: signInWithRedirect (fixes COOP window.closed warnings from popup flow)
 * FIX 2: acceptTerms exposed correctly on window
 * FIX 3: wallet permission-denied handled silently
 * FIX 4: getRedirectResult handled on page load after Google redirect
 * FIX 5: unauthorized-domain error shown clearly with instructions
 * FIX 6: prompt:'select_account' — no domain hardcoded
 */
(function () {
    'use strict';

    // ── Affiliate referral capture ────────────────────────────────────────────
    // ?ref=<referrerUid> in the URL (e.g. shared from the profile/wallet page)
    // is captured on ANY page load — not just the register page — since a
    // visitor usually browses a bit before signing up. Kept in sessionStorage
    // so it survives navigation but not F5-forever (matches how referral
    // attribution windows normally work for a simple, honest program).
    try {
        const refParam = new URLSearchParams(window.location.search).get('ref');
        if (refParam && refParam.length < 128) sessionStorage.setItem('pendingReferrer', refParam);
    } catch (_) { /* sessionStorage unavailable (e.g. private mode) — non-critical */ }
    function _getPendingReferrer(selfUid) {
        try {
            const ref = sessionStorage.getItem('pendingReferrer');
            return (ref && ref !== selfUid) ? ref : null; // can't refer yourself
        } catch (_) { return null; }
    }

    // ── Create user doc if not exists ─────────────────────────────────────────
    async function _ensureUserDoc(user) {
        if (!user) return;
        try {
            const ref  = window.db.collection(COLLECTIONS.USERS).doc(user.uid);
            const snap = await ref.get();
            if (!snap.exists) {
                const referredBy = _getPendingReferrer(user.uid);
                await ref.set({
                    name:          user.displayName || '',
                    email:         user.email       || '',
                    phone:         user.phoneNumber || '',
                    avatar:        user.photoURL    || '',
                    role:          'buyer',
                    verified:      false,
                    acceptedTerms: false,
                    ...(referredBy ? { referredBy } : {}),
                    createdAt:     serverTimestamp(),
                    updatedAt:     serverTimestamp(),
                });
                await window.db.collection(COLLECTIONS.WALLET).doc(user.uid).set({
                    balance: 0, currency: 'EGP', createdAt: serverTimestamp(),
                });
            } else {
                await ref.update({ updatedAt: serverTimestamp() });
            }
        } catch (err) {
            console.warn('[Auth] _ensureUserDoc:', err.code || err.message);
        }
    }

    // ── AuthManager object ────────────────────────────────────────────────────
    const AuthManager = {

        async loginWithEmail() {
            const email    = (document.getElementById('loginEmail')?.value || '').trim();
            const password = document.getElementById('loginPassword')?.value || '';
            const isAr     = AppState.language !== 'en';
            if (!email || !password) {
                showToast(isAr ? 'أدخل البريد وكلمة المرور' : 'Enter email and password', 'warning');
                return;
            }
            showLoading(isAr ? 'جاري تسجيل الدخول...' : 'Signing in...');
            try {
                const cred = await window.auth.signInWithEmailAndPassword(email, password);
                await _ensureUserDoc(cred.user);
                hideLoading();
                if (!cred.user.emailVerified) {
                    showToast(
                        isAr ? '⚠️ بريدك الإلكتروني لسه مش مفعّل — لازم تفعّله قبل ما تقدر تدفع أو تبيع' : '⚠️ Your email isn\'t verified yet — required before you can pay or sell',
                        'warning', 7000
                    );
                } else {
                    showToast(isAr ? 'مرحباً بك!' : 'Welcome back!', 'success');
                }
                navigateTo('home');
            } catch (err) {
                hideLoading();
                showToast(_authError(err.code), 'error');
            }
        },

        // ── Google Login — POPUP first, redirect fallback ────────────────────
        // WHY POPUP: Chrome 115+ blocks 3rd-party cookies which signInWithRedirect
        // depends on (Firebase iframe to firebaseapp.com). getRedirectResult() returns
        // null silently. signInWithPopup works without 3rd-party cookies.
        // _headers file has: Cross-Origin-Opener-Policy = "same-origin-allow-popups" ✅
        async loginWithGoogle() {
            const isAr = AppState.language !== 'en';
            showLoading(isAr ? 'جاري تسجيل الدخول بـ Google...' : 'Signing in with Google...');
            try {
                // Popup works in Chrome 115+ without 3rd-party cookies
                const result = await window.auth.signInWithPopup(window.googleProvider);
                if (result && result.user) {
                    await _ensureUserDoc(result.user);
                    hideLoading();
                    showToast(isAr ? 'مرحباً بك! 👋' : 'Welcome! 👋', 'success');
                    navigateTo('home');
                }
            } catch (err) {
                hideLoading();
                console.warn('[Auth] Google popup error:', err.code, err.message);

                if (err.code === 'auth/popup-blocked') {
                    // Browser blocked popup → fallback to redirect
                    showToast(
                        isAr ? 'جاري التحويل إلى Google...' : 'Redirecting to Google...',
                        'info'
                    );
                    try {
                        await window.auth.signInWithRedirect(window.googleProvider);
                    } catch (redirectErr) {
                        showToast(_authError(redirectErr.code), 'error');
                    }
                } else if (err.code === 'auth/popup-closed-by-user' ||
                           err.code === 'auth/cancelled-popup-request') {
                    // User closed the popup — silent, just hide loading
                } else if (err.code === 'auth/unauthorized-domain') {
                    const domain = location.hostname;
                    showToast(
                        isAr
                          ? `❌ الدومين (${domain}) غير مُصرَّح به — أضفه في Firebase Console → Authentication → Authorized domains`
                          : `❌ Domain (${domain}) not authorized — Add in Firebase Console → Authentication → Authorized domains`,
                        'error'
                    );
                } else {
                    showToast(_authError(err.code), 'error');
                }
            }
        },

        // ── Handle Google redirect fallback result ────────────────────────────
        // Only fires if popup was blocked and redirect fallback was used
        async handleGoogleRedirectResult() {
            try {
                const result = await window.auth.getRedirectResult();
                if (result && result.user) {
                    console.log('[Auth] ✅ Redirect fallback success:', result.user.email);
                    await _ensureUserDoc(result.user);
                    const isAr = AppState.language !== 'en';
                    showToast(isAr ? 'مرحباً بك! 👋' : 'Welcome! 👋', 'success');
                    navigateTo('home');
                }
            } catch (err) {
                if (!err.code ||
                    err.code === 'auth/no-auth-event' ||
                    err.code === 'auth/redirect-cancelled-by-user') return;
                console.warn('[Auth] Redirect fallback error:', err.code, err.message);
            }
        },

        async register() {
            const name     = sanitizeInput((document.getElementById('registerName')?.value || '').trim());
            const email    = (document.getElementById('registerEmail')?.value || '').trim();
            const phone    = (document.getElementById('registerPhone')?.value || '').trim();
            const password = document.getElementById('registerPassword')?.value || '';
            const roleEl   = document.querySelector('input[name="role"]:checked');
            const role     = roleEl?.value || 'buyer';
            const isAr     = AppState.language !== 'en';

            if (!name)           { showToast(isAr ? 'أدخل اسمك' : 'Enter your name', 'warning'); return; }
            if (!email)          { showToast(isAr ? 'أدخل البريد' : 'Enter email', 'warning'); return; }
            if (password.length < 8) {
                showToast(isAr ? 'كلمة المرور 8 أحرف على الأقل' : 'Password must be 8+ characters', 'warning');
                return;
            }
            if (!document.getElementById('acceptTermsCheckbox')?.checked) {
                showToast(isAr ? 'لازم توافق على الشروط والأحكام وسياسة الخصوصية' : 'You must accept the Terms & Privacy Policy', 'warning');
                return;
            }
            showLoading(isAr ? 'جاري إنشاء الحساب...' : 'Creating account...');
            try {
                const cred = await window.auth.createUserWithEmailAndPassword(email, password);
                await cred.user.updateProfile({ displayName: name });
                const referredBy = _getPendingReferrer(cred.user.uid);
                await window.db.collection(COLLECTIONS.USERS).doc(cred.user.uid).set({
                    name, email, phone, role,
                    avatar: '', verified: false, acceptedTerms: true,
                    emailVerified: false,
                    ...(referredBy ? { referredBy } : {}),
                    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
                });
                await window.db.collection(COLLECTIONS.WALLET).doc(cred.user.uid).set({
                    balance: 0, currency: 'EGP', createdAt: serverTimestamp(),
                });

                // Send a real verification email — required before the account
                // can pay or sell (enforced server-side in functions/api/payment.js).
                try { await cred.user.sendEmailVerification(); } catch (e) { console.warn('[Auth] verification email failed:', e.message); }

                hideLoading();
                showToast(
                    isAr ? 'تم إنشاء حسابك! ابعتنالك رابط تفعيل على بريدك — لازم تفعّله قبل ما تقدر تدفع أو تبيع.'
                         : 'Account created! Check your email for a verification link — required before you can pay or sell.',
                    'success', 6000
                );
                navigateTo('home');
            } catch (err) {
                hideLoading();
                showToast(_authError(err.code), 'error');
            }
        },

        async resendVerificationEmail() {
            const isAr = AppState.language !== 'en';
            const user = window.auth?.currentUser;
            if (!user) { showToast(isAr ? 'سجّل الدخول الأول' : 'Log in first', 'warning'); return; }
            if (user.emailVerified) { showToast(isAr ? 'بريدك مفعّل بالفعل ✅' : 'Your email is already verified ✅', 'success'); return; }
            showLoading();
            try {
                await user.sendEmailVerification();
                hideLoading();
                showToast(isAr ? 'تم إرسال رابط التفعيل — راجع بريدك' : 'Verification link sent — check your inbox', 'success');
            } catch (err) {
                hideLoading();
                showToast(_authError(err.code), 'error');
            }
        },

        async forgotPassword() {
            const isAr  = AppState.language !== 'en';
            const email = (document.getElementById('loginEmail')?.value || '').trim()
                       || (prompt(isAr ? 'أدخل بريدك:' : 'Enter your email:') || '').trim();
            if (!email) return;
            showLoading();
            try {
                await window.auth.sendPasswordResetEmail(email);
                hideLoading();
                showToast(isAr ? 'تم إرسال رابط الاسترداد' : 'Reset link sent', 'success');
            } catch (err) {
                hideLoading();
                showToast(_authError(err.code), 'error');
            }
        },

        async logout() {
            const isAr = AppState.language !== 'en';
            showLoading(isAr ? 'جاري تسجيل الخروج...' : 'Signing out...');
            try {
                if (typeof OrdersManager?.stopListeners === 'function') OrdersManager.stopListeners();
                if (typeof NotificationsManager?.stopListener === 'function') NotificationsManager.stopListener();
                await window.auth.signOut();
                AppState.currentUser = null;
                clearCart();
                // Remove terms modal if open
                document.getElementById('termsModal')?.remove();
                hideLoading();
                showToast(isAr ? 'تم تسجيل الخروج' : 'Signed out', 'info');
                navigateTo('home');
            } catch (err) {
                hideLoading();
                showToast(isAr ? 'حدث خطأ' : 'Error', 'error');
            }
        },

        async updateProfile(data) {
            const user = window.auth.currentUser;
            if (!user) return;
            const isAr = AppState.language !== 'en';
            showLoading();
            try {
                const updates = { updatedAt: serverTimestamp() };
                if (data.name)   updates.name   = sanitizeInput(data.name);
                if (data.phone)  updates.phone  = data.phone;
                if (data.avatar) updates.avatar = data.avatar;
                await window.db.collection(COLLECTIONS.USERS).doc(user.uid).update(updates);
                if (data.name)   await user.updateProfile({ displayName: data.name });
                if (data.avatar) await user.updateProfile({ photoURL: data.avatar });
                if (AppState.currentUser) {
                    if (data.name)   AppState.currentUser.displayName = data.name;
                    if (data.avatar) AppState.currentUser.photoURL    = data.avatar;
                }
                hideLoading();
                showToast(isAr ? 'تم التحديث' : 'Profile updated', 'success');
            } catch (err) {
                hideLoading();
                console.warn('[Auth] updateProfile:', err.message);
                showToast(isAr ? 'حدث خطأ' : 'Error', 'error');
            }
        },

        async upgradeToSeller() {
            const user = AppState.currentUser;
            if (!user) { navigateTo('login'); return; }
            const isAr = AppState.language !== 'en';
            if (!confirm(isAr ? 'هل تريد الترقية لحساب بائع؟' : 'Upgrade to seller?')) return;
            showLoading();
            try {
                await window.db.collection(COLLECTIONS.USERS).doc(user.uid).update({
                    role: 'seller', updatedAt: serverTimestamp()
                });
                AppState.currentUser.role = 'seller';
                hideLoading();
                showToast(isAr ? 'تم الترقية لبائع!' : 'Upgraded to seller!', 'success');
                navigateTo('dashboard');
            } catch (err) {
                hideLoading();
                showToast(isAr ? 'حدث خطأ' : 'Error', 'error');
            }
        },

        // ── Accept Terms — CRITICAL: must be on window.AuthManager ────────────
        async acceptTerms() {
            const user = AppState.currentUser;
            if (!user) return;
            const isAr = AppState.language !== 'en';
            try {
                await window.db.collection(COLLECTIONS.USERS).doc(user.uid).update({
                    acceptedTerms:   true,
                    termsAcceptedAt: serverTimestamp(),
                });
                AppState.currentUser.acceptedTerms = true;
                document.getElementById('termsModal')?.remove();
                showToast(isAr ? 'شكراً لقبول الشروط' : 'Terms accepted', 'success');
            } catch (err) {
                console.warn('[Auth] acceptTerms:', err.code || err.message);
                // Still close modal even if Firestore write fails
                document.getElementById('termsModal')?.remove();
            }
        },
    };

    // ── Profile Page ──────────────────────────────────────────────────────────
    function initProfilePage() {
        const container = document.getElementById('profileContent');
        if (!container) return;
        const user = AppState.currentUser;
        const isAr = AppState.language !== 'en';
        if (!user) {
            container.innerHTML = `<div class="text-center py-16">
              <p class="text-gray-500 mb-4">${t('general.login_req')}</p>
              <button onclick="navigateTo('login')" class="btn-primary px-8">${t('auth.login')}</button>
            </div>`;
            return;
        }
        const avatarFallback = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'><rect fill='%230284c7' width='40' height='40' rx='8'/><text x='50%25' y='55%25' dominant-baseline='middle' text-anchor='middle' fill='white' font-size='18' font-family='Arial'>${encodeURIComponent((user.displayName||'U')[0].toUpperCase())}</text></svg>`;
        container.innerHTML = `
        <div class="max-w-xl mx-auto">
          <h1 class="text-2xl font-black text-gray-900 mb-8">${t('nav.profile')}</h1>
          <div class="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 space-y-5">
            <div class="flex items-center gap-5">
              <div class="relative">
                <img id="profileAvatarPreview" src="${user.photoURL || avatarFallback}"
                  class="w-20 h-20 rounded-2xl object-cover"
                  onerror="this.src='${avatarFallback}'">
                <label class="absolute bottom-0 end-0 w-7 h-7 bg-navy-600 text-white rounded-lg flex items-center justify-center cursor-pointer hover:bg-navy-700 transition">
                  <i class="fa-solid fa-pen text-xs"></i>
                  <input type="file" accept="image/*" class="hidden" id="avatarFileInput" onchange="AuthManager._uploadAvatar(this)">
                </label>
              </div>
              <div>
                <h2 class="font-black text-gray-900 text-xl">${escapeHtml(user.displayName || '')}</h2>
                <p class="text-gray-500">${user.email || ''}</p>
                <span class="inline-block mt-1 text-xs bg-navy-50 text-navy-600 font-bold px-3 py-1 rounded-full">
                  ${user.role === 'admin' ? '👑 Admin' : user.role === 'seller' ? '🏪 '+(isAr?'بائع':'Seller') : '🛍️ '+(isAr?'مشتري':'Buyer')}
                </span>
              </div>
            </div>
            <hr class="border-gray-100">
            <div>
              <label class="block text-sm font-bold text-gray-700 mb-2">${t('auth.name')}</label>
              <input type="text" id="profileName" class="form-input" value="${escapeHtml(user.displayName || '')}">
            </div>
            <div>
              <label class="block text-sm font-bold text-gray-700 mb-2">${t('auth.email')}</label>
              <input type="email" class="form-input opacity-60" value="${user.email || ''}" disabled>
            </div>
            <div>
              <label class="block text-sm font-bold text-gray-700 mb-2">${t('auth.phone')}</label>
              <input type="tel" id="profilePhone" class="form-input" value="${user.phone || ''}" dir="ltr">
            </div>
            <button onclick="AuthManager.updateProfile({name:document.getElementById('profileName').value,phone:document.getElementById('profilePhone').value})"
              class="btn-primary w-full py-4">${t('general.save')}</button>
            ${user.role === 'buyer' ? `
            <button onclick="AuthManager.upgradeToSeller()" class="btn-secondary w-full py-4 border-green-400 text-green-600 hover:bg-green-600 hover:text-white">
              <i class="fa-solid fa-rocket me-2"></i>${isAr?'الترقية لحساب بائع':'Upgrade to Seller'}
            </button>` : ''}
            <hr class="border-gray-100">
            <button onclick="AuthManager.logout()" class="w-full py-3 text-red-500 font-bold border-2 border-red-200 rounded-xl hover:bg-red-500 hover:text-white transition flex items-center justify-center gap-2">
              <i class="fa-solid fa-right-from-bracket"></i>${t('nav.logout')}
            </button>
          </div>
        </div>`;
    }

    AuthManager._uploadAvatar = async function (input) {
        const file = input?.files?.[0];
        if (!file || !AppState.currentUser) return;
        showLoading();
        try {
            const url = await uploadFile(file, 'avatars', `avatar_${AppState.currentUser.uid}`);
            document.getElementById('profileAvatarPreview')?.setAttribute('src', url);
            await AuthManager.updateProfile({ avatar: url });
        } catch (err) {
            hideLoading();
            showToast(AppState.language !== 'en' ? 'فشل رفع الصورة' : 'Upload failed', 'error');
        }
    };

    function _authError(code) {
        const isAr = AppState.language !== 'en';
        const msgs = {
            ar: {
                'auth/user-not-found':        'البريد الإلكتروني غير مسجل',
                'auth/wrong-password':        'كلمة المرور غير صحيحة',
                'auth/email-already-in-use':  'هذا البريد مسجل بالفعل',
                'auth/weak-password':         'كلمة المرور ضعيفة جداً',
                'auth/invalid-email':         'البريد الإلكتروني غير صحيح',
                'auth/too-many-requests':     'محاولات كثيرة، حاول لاحقاً',
                'auth/network-request-failed':'لا يوجد اتصال بالإنترنت',
                'auth/invalid-credential':    'البريد أو كلمة المرور غير صحيحة',
                'auth/user-disabled':         'هذا الحساب موقوف',
                'auth/popup-blocked':         'تم حجب النافذة، جاري التحويل...',
                'auth/unauthorized-domain':   `الدومين (${location.hostname}) غير مُصرَّح به في Firebase`,
                'auth/redirect-cancelled-by-user': 'تم إلغاء تسجيل الدخول',
            },
            en: {
                'auth/user-not-found':        'Email not registered',
                'auth/wrong-password':        'Incorrect password',
                'auth/email-already-in-use':  'Email already in use',
                'auth/weak-password':         'Password is too weak',
                'auth/invalid-email':         'Invalid email address',
                'auth/too-many-requests':     'Too many attempts, try later',
                'auth/network-request-failed':'No internet connection',
                'auth/invalid-credential':    'Invalid email or password',
                'auth/user-disabled':         'Account is disabled',
                'auth/popup-blocked':         'Popup blocked, redirecting...',
                'auth/unauthorized-domain':   `Domain (${location.hostname}) not authorized in Firebase`,
                'auth/redirect-cancelled-by-user': 'Sign-in cancelled',
            }
        };
        return (isAr ? msgs.ar : msgs.en)[code] || (isAr ? 'حدث خطأ' : 'An error occurred');
    }

    // ── Expose everything on window ───────────────────────────────────────────
    window.AuthManager     = AuthManager;
    window.initProfilePage = initProfilePage;
    window._ensureUserDoc  = _ensureUserDoc;

    // Also expose acceptTerms directly on window for onclick safety
    window.acceptTerms = function() { AuthManager.acceptTerms(); };

    console.log('✅ AuthManager v4.0 — multi-domain redirect, unauthorized-domain handled');
})();
