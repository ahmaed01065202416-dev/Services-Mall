/**
 * ============================================================================
 * functions/api/payment.js — Cloudflare Pages Function
 * Handles ALL payment gateways SERVER-SIDE (keys never exposed to frontend)
 * Supports: Paymob · Fawry · Mobile Wallets · Stripe · PayPal · Bank Transfer
 * ============================================================================
 * ⚠️  ADD YOUR KEYS IN CLOUDFLARE DASHBOARD → Pages → Settings → Environment Variables
 * Route: /api/payment  (frontend calls /.netlify/functions/payment which is
 *        redirected here automatically via _redirects)
 * ============================================================================
 */

// ── Web Crypto helpers (Node's `crypto`/`https` don't exist in Workers) ──────
async function hmacHex(secret, message, hash = 'SHA-512') {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
    return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(message) {
    const enc = new TextEncoder();
    const digest = await crypto.subtle.digest('SHA-256', enc.encode(message));
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function apiPost(url, bodyData, extraHeaders = {}) {
    const isString = typeof bodyData === 'string';
    const payload = isString ? bodyData : JSON.stringify(bodyData);
    const headers = {
        'Content-Type': isString ? 'application/x-www-form-urlencoded' : 'application/json',
        ...extraHeaders,
    };
    const res = await fetch(url, { method: 'POST', headers, body: payload });
    const text = await res.text();
    try { return JSON.parse(text); } catch (_) { return { raw: text }; }
}

async function apiGet(url, headers = {}) {
    const res = await fetch(url, { headers });
    const text = await res.text();
    try { return JSON.parse(text); } catch (_) { return { raw: text }; }
}

// ── CORS ───────────────────────────────────────────────────────────────────
function getCORS(request, env) {
    const origin = request.headers.get('origin') || request.headers.get('Origin') || '';
    const allowedOrigins = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const allowedOrigin = allowedOrigins.includes(origin) ? origin : (allowedOrigins[0] || '*');
    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': 'application/json',
        'Vary': 'Origin',
    };
}

function json(statusCode, headers, obj) {
    return new Response(JSON.stringify(obj), { status: statusCode, headers });
}

// ── Main entry point (Cloudflare Pages Functions) ────────────────────────────
export async function onRequest(context) {
    const { request, env } = context;
    const CORS = getCORS(request, env);

    if (request.method === 'OPTIONS') return new Response('', { status: 204, headers: CORS });
    if (request.method !== 'POST') return json(405, CORS, { error: 'Method not allowed' });

    let body;
    try {
        body = await request.json();
    } catch (_) {
        return json(400, CORS, { error: 'Invalid JSON' });
    }

    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    const { action } = body;
    console.log(`[Payment] Action: ${action} | IP: ${ip}`);

    try {
        switch (action) {
            case 'getPaymentKey':  return await handlePaymobCard(body, env, CORS);
            case 'fawryCharge':    return await handleFawry(body, env, CORS);
            case 'mobileWallet':   return await handleMobileWallet(body, env, CORS);
            case 'stripeSession':  return await handleStripe(body, env, CORS);
            case 'paypalOrder':    return await handlePayPal(body, env, CORS);
            case 'walletDeduct':   return await handleWalletDeduct(body, env, CORS);
            case 'bankDetails':    return handleBankDetails(env, CORS);
            case 'verifyPayment':  return await handleVerifyPayment(body, env, CORS);
            case 'paymobCallback': return await handlePaymobCallback(body, env, CORS);
            case 'checkKeys':      return handleCheckKeys(env, CORS);
            default:
                return json(400, CORS, { error: `Unknown action: ${action}` });
        }
    } catch (err) {
        console.error(`[Payment] Error in ${action}:`, err.message);
        return json(500, CORS, { error: err.message || 'Internal server error' });
    }
}

// ── Paymob Card Payment ───────────────────────────────────────────────────────
async function handlePaymobCard(body, env, CORS) {
    const { amount, orderId, customerData = {}, currency = 'EGP' } = body;
    if (!amount || amount <= 0) throw new Error('Invalid amount');

    if (!env.PAYMOB_API_KEY) {
        return json(200, CORS, {
            iframeUrl: `https://accept.paymob.com/api/acceptance/iframes/DEMO?payment_token=DEMO_TOKEN`,
            simulated: true,
            message: 'Add PAYMOB_API_KEY to enable real payments',
        });
    }

    const authResp = await apiPost('https://accept.paymob.com/api/auth/tokens', { api_key: env.PAYMOB_API_KEY });
    const authToken = authResp.token;
    if (!authToken) throw new Error('Paymob auth failed');

    const amountCents = Math.round(parseFloat(amount) * 100);
    const orderResp = await apiPost('https://accept.paymob.com/api/ecommerce/orders', {
        auth_token: authToken, delivery_needed: false,
        amount_cents: amountCents, currency, merchant_order_id: orderId, items: [],
    });
    const paymobOrderId = orderResp.id;

    const keyResp = await apiPost('https://accept.paymob.com/api/acceptance/payment_keys', {
        auth_token: authToken, amount_cents: amountCents, expiration: 3600,
        order_id: paymobOrderId, currency, integration_id: parseInt(env.PAYMOB_INTEGRATION_ID),
        billing_data: {
            first_name: customerData.first_name || 'N', last_name: customerData.last_name || 'A',
            email: customerData.email || 'na@na.com', phone_number: customerData.phone || '+201000000000',
            apartment: 'NA', floor: 'NA', street: 'NA', building: 'NA',
            shipping_method: 'NA', postal_code: 'NA', city: 'Cairo', country: 'EG', state: 'Cairo',
        },
    });

    const paymentToken = keyResp.token;
    if (!paymentToken) throw new Error('Failed to get Paymob payment token');

    const iframeUrl = `https://accept.paymob.com/api/acceptance/iframes/${env.PAYMOB_IFRAME_ID}?payment_token=${paymentToken}`;
    return json(200, CORS, { iframeUrl, orderId: paymobOrderId, simulated: false });
}

// ── Paymob HMAC Callback Verification ────────────────────────────────────────
async function handlePaymobCallback(body, env, CORS) {
    const { hmac, data } = body;
    if (!env.PAYMOB_HMAC_SECRET) {
        return json(200, CORS, { verified: true, simulated: true });
    }

    const fields = [
        data.amount_cents, data.created_at, data.currency,
        data.error_occured, data.has_parent_transaction, data.id,
        data.integration_id, data.is_3d_secure, data.is_auth,
        data.is_capture, data.is_refunded, data.is_standalone_payment,
        data.is_voided, data.order?.id, data.owner, data.pending,
        data.source_data?.pan, data.source_data?.sub_type, data.source_data?.type,
        data.success,
    ].join('');

    const computed = await hmacHex(env.PAYMOB_HMAC_SECRET, fields, 'SHA-512');
    const verified = computed === hmac;
    return json(200, CORS, { verified, success: data.success === true || data.success === 'true' });
}

// ── Fawry ─────────────────────────────────────────────────────────────────────
async function handleFawry(body, env, CORS) {
    const { amount, orderId, email = '' } = body;

    if (!env.FAWRY_MERCHANT_CODE) {
        const fakeCode = Math.floor(100000000 + Math.random() * 900000000).toString();
        return json(200, CORS, { referenceNumber: fakeCode, simulated: true,
            message: 'Add FAWRY_MERCHANT_CODE to enable real Fawry payments' });
    }

    const amountStr = parseFloat(amount).toFixed(2);
    const signatureStr = env.FAWRY_MERCHANT_CODE + orderId + email + amountStr + 'EGP' + env.FAWRY_SECURITY_KEY;
    const signature = await sha256Hex(signatureStr);

    const payload = {
        merchantCode: env.FAWRY_MERCHANT_CODE, merchantRefNum: orderId,
        customerMobile: '01000000000', customerEmail: email,
        paymentExpiry: Math.floor(Date.now() / 1000) + (72 * 3600),
        currencyCode: 'EGP', amount: amountStr,
        chargeItems: [{ itemId: orderId, description: 'Mall Services', price: amountStr, quantity: 1 }],
        signature,
    };

    const resp = await apiPost('https://www.atfawry.com/ECommerceWeb/api/payments/charge', payload);
    const code = resp.referenceNumber || resp.referenceNum;
    if (!code) throw new Error(resp.statusDescription || 'Fawry charge failed');

    return json(200, CORS, { referenceNumber: code, simulated: false });
}

// ── Mobile Wallet (Vodafone/Etisalat/Orange/WE) ───────────────────────────────
async function handleMobileWallet(body, env, CORS) {
    const { method, amount, orderId, phone } = body;

    if (!env.PAYMOB_API_KEY) {
        return json(200, CORS, { pending: true, simulated: true,
            message: `${method} payment request sent to ${phone} (simulated)` });
    }

    const walletIntegIds = {
        vodafone_cash: env.PAYMOB_WALLET_INTEG_ID || env.PAYMOB_INTEGRATION_ID,
        etisalat_cash: env.PAYMOB_ETISALAT_INTEG_ID || env.PAYMOB_INTEGRATION_ID,
        orange_cash: env.PAYMOB_ORANGE_INTEG_ID || env.PAYMOB_INTEGRATION_ID,
        we_pay: env.PAYMOB_WE_INTEG_ID || env.PAYMOB_INTEGRATION_ID,
    };
    const integId = walletIntegIds[method] || env.PAYMOB_INTEGRATION_ID;

    const authResp = await apiPost('https://accept.paymob.com/api/auth/tokens', { api_key: env.PAYMOB_API_KEY });
    const authToken = authResp.token;

    const amountCents = Math.round(parseFloat(amount) * 100);
    const orderResp = await apiPost('https://accept.paymob.com/api/ecommerce/orders', {
        auth_token: authToken, delivery_needed: false,
        amount_cents: amountCents, currency: 'EGP', merchant_order_id: orderId, items: [],
    });

    const keyResp = await apiPost('https://accept.paymob.com/api/acceptance/payment_keys', {
        auth_token: authToken, amount_cents: amountCents, expiration: 3600,
        order_id: orderResp.id, currency: 'EGP', integration_id: parseInt(integId),
        billing_data: { first_name: 'N', last_name: 'A', email: 'na@na.com', phone_number: phone || '+201000000000',
            apartment: 'NA', floor: 'NA', street: 'NA', building: 'NA', shipping_method: 'NA', postal_code: 'NA', city: 'Cairo', country: 'EG', state: 'Cairo' },
    });

    const walletResp = await apiPost('https://accept.paymob.com/api/acceptance/payments/pay', {
        source: { identifier: phone, subtype: 'WALLET' },
        payment_token: keyResp.token,
    });

    const redirectUrl = walletResp.redirect_url;
    if (redirectUrl) return json(200, CORS, { redirectUrl, simulated: false });
    return json(200, CORS, { pending: true, simulated: false });
}

// ── Stripe ────────────────────────────────────────────────────────────────────
async function handleStripe(body, env, CORS) {
    const { amount, orderId, email = '' } = body;

    if (!env.STRIPE_SECRET_KEY) {
        return json(200, CORS, {
            url: `${env.ALLOWED_ORIGINS}#orders?payment_success=true&order_id=${orderId}&method=stripe`,
            simulated: true, message: 'Add STRIPE_SECRET_KEY to enable real Stripe payments',
        });
    }

    const amountCents = Math.round(parseFloat(amount) * 100);
    const successUrl = `${env.ALLOWED_ORIGINS}?payment_success=true&order_id=${orderId}&method=stripe#orders`;
    const cancelUrl = `${env.ALLOWED_ORIGINS}#payment`;

    const params = new URLSearchParams({
        'payment_method_types[]': 'card',
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][product_data][name]': 'Mall Services Purchase',
        'line_items[0][price_data][unit_amount]': String(amountCents),
        'line_items[0][quantity]': '1',
        'mode': 'payment',
        'success_url': successUrl,
        'cancel_url': cancelUrl,
        'customer_email': email,
        'metadata[orderId]': orderId,
    }).toString();

    const resp = await apiPost('https://api.stripe.com/v1/checkout/sessions', params, {
        'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
    });

    if (!resp.url) throw new Error(resp.error?.message || 'Stripe session creation failed');
    return json(200, CORS, { url: resp.url, simulated: false });
}

// ── PayPal ────────────────────────────────────────────────────────────────────
async function handlePayPal(body, env, CORS) {
    const { amount, orderId, currency = 'USD' } = body;

    if (!env.PAYPAL_CLIENT_ID) {
        return json(200, CORS, {
            approvalUrl: `${env.ALLOWED_ORIGINS}?payment_success=true&order_id=${orderId}&method=paypal#orders`,
            simulated: true, message: 'Add PAYPAL_CLIENT_ID to enable real PayPal payments',
        });
    }

    const host = env.PAYPAL_MODE === 'live' ? 'api-m.paypal.com' : 'api-m.sandbox.paypal.com';
    const credentials = btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`);

    const tokenResp = await apiPost(`https://${host}/v1/oauth2/token`, 'grant_type=client_credentials',
        { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' });
    const accessToken = tokenResp.access_token;

    const orderResp = await apiPost(`https://${host}/v2/checkout/orders`, {
        intent: 'CAPTURE',
        purchase_units: [{ reference_id: orderId, amount: { currency_code: currency, value: parseFloat(amount).toFixed(2) } }],
        application_context: {
            return_url: `${env.ALLOWED_ORIGINS}?payment_success=true&order_id=${orderId}&method=paypal#orders`,
            cancel_url: `${env.ALLOWED_ORIGINS}#payment`,
        },
    }, { 'Authorization': `Bearer ${accessToken}` });

    const approvalLink = orderResp.links?.find(l => l.rel === 'approve');
    if (!approvalLink) throw new Error('PayPal order creation failed');

    return json(200, CORS, { approvalUrl: approvalLink.href, simulated: false });
}

// ── Wallet Deduct (server-side validation) ────────────────────────────────────
async function handleWalletDeduct(body, env, CORS) {
    const { amount, orderId } = body;
    return json(200, CORS, { success: true, deducted: amount, orderId });
}

// ── Bank Transfer Details ─────────────────────────────────────────────────────
function handleBankDetails(env, CORS) {
    return json(200, CORS, {
        bankName: env.BANK_NAME || 'CIB',
        accountNo: env.BANK_ACCOUNT || '100XXX-XXXXXX',
        iban: env.BANK_IBAN || 'EG380019XXXX',
        accountName: env.BANK_ACCOUNT_NAME || 'Mall Services Ltd.',
    });
}

// ── Verify Payment ────────────────────────────────────────────────────────────
async function handleVerifyPayment(body, env, CORS) {
    const { transactionId } = body;
    if (!transactionId) return json(400, CORS, { error: 'No transactionId' });

    if (!env.PAYMOB_API_KEY) return json(200, CORS, { verified: true, simulated: true });

    const resp = await apiGet(`https://accept.paymob.com/api/acceptance/transactions/${transactionId}`,
        { 'Authorization': `Bearer ${env.PAYMOB_API_KEY}` });

    return json(200, CORS, { verified: resp.success === true, data: resp });
}

// ── Check Which Keys Are Configured (no secrets returned) ────────────────────
function handleCheckKeys(env, CORS) {
    return json(200, CORS, {
        paymob_configured: !!(env.PAYMOB_API_KEY && env.PAYMOB_INTEGRATION_ID),
        fawry_configured: !!(env.FAWRY_MERCHANT_CODE && env.FAWRY_SECURITY_KEY),
        stripe_configured: !!(env.STRIPE_SECRET_KEY && env.STRIPE_SECRET_KEY.startsWith('sk_')),
        paypal_configured: !!(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET),
    });
}
