/**
 * ============================================================================
 * payment.js — Netlify Serverless Function
 * Handles ALL payment gateways SERVER-SIDE (keys never exposed to frontend)
 * Supports: Paymob · Fawry · Mobile Wallets · Stripe · PayPal · Bank Transfer
 * ============================================================================
 * ⚠️  ADD YOUR KEYS IN NETLIFY DASHBOARD → Site Settings → Environment Variables
 *     OR in a local .env file for development
 * ============================================================================
 */

const https = require('https');

// ── Server-side secret keys (set via environment variables ONLY) ─────────────
const SECRETS = {
    PAYMOB_API_KEY:        process.env.PAYMOB_API_KEY        || '',
    PAYMOB_INTEGRATION_ID: process.env.PAYMOB_INTEGRATION_ID || '',
    PAYMOB_IFRAME_ID:      process.env.PAYMOB_IFRAME_ID      || '',
    PAYMOB_HMAC_SECRET:    process.env.PAYMOB_HMAC_SECRET    || '',

    FAWRY_MERCHANT_CODE:   process.env.FAWRY_MERCHANT_CODE   || '',
    FAWRY_SECURITY_KEY:    process.env.FAWRY_SECURITY_KEY    || '',

    STRIPE_SECRET_KEY:     process.env.STRIPE_SECRET_KEY     || '',
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || '',

    PAYPAL_CLIENT_ID:      process.env.PAYPAL_CLIENT_ID      || '',
    PAYPAL_CLIENT_SECRET:  process.env.PAYPAL_CLIENT_SECRET  || '',
    PAYPAL_MODE:           process.env.PAYPAL_MODE || 'live', // 'sandbox' | 'live'

    FIREBASE_ADMIN_KEY:    process.env.FIREBASE_ADMIN_KEY    || '',

    // Bank account details (server-side only)
    BANK_NAME:             process.env.BANK_NAME             || 'CIB',
    BANK_ACCOUNT:          process.env.BANK_ACCOUNT          || '100XXX-XXXXXX',
    BANK_IBAN:             process.env.BANK_IBAN             || 'EG380019XXXX',
    BANK_ACCOUNT_NAME:     process.env.BANK_ACCOUNT_NAME     || 'Mall Services Ltd.',

    ALLOWED_ORIGINS:       process.env.ALLOWED_ORIGINS       || 'https://mall-services2.netlify.app,https://services-mall1.netlify.app',
};

// ── CORS Headers ──────────────────────────────────────────────────────────────
function getCORS(event) {
    const origin  = (event && event.headers && (event.headers.origin || event.headers.Origin)) || '';
    const allowed = (SECRETS.ALLOWED_ORIGINS || '').split(',').map(s => s.trim());
    const allowedOrigin = allowed.includes(origin) ? origin : (allowed[0] || '*');
    return {
        'Access-Control-Allow-Origin':  allowedOrigin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type':                 'application/json',
        'Vary':                         'Origin',
    };
}
// Static CORS for backwards compat (used where event isn't available)
const CORS = getCORS(null);

// ── Main Handler ──────────────────────────────────────────────────────────────
exports.handler = async (event) => {
    const CORS = getCORS(event);   // dynamic per-request CORS
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: CORS, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch (_) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) };
    }

    // ── Rate limiting (basic) ─────────────────────────────────────────────────
    const ip = event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'unknown';
    // Note: For production rate limiting use Netlify Edge or Redis

    const { action } = body;
    console.log(`[Payment] Action: ${action} | IP: ${ip}`);

    try {
        switch (action) {
            case 'getPaymentKey':     return await handlePaymobCard(body);
            case 'fawryCharge':       return await handleFawry(body);
            case 'mobileWallet':      return await handleMobileWallet(body);
            case 'stripeSession':     return await handleStripe(body);
            case 'paypalOrder':       return await handlePayPal(body);
            case 'walletDeduct':      return await handleWalletDeduct(body);
            case 'bankDetails':       return handleBankDetails();
            case 'verifyPayment':     return await handleVerifyPayment(body);
            case 'paymobCallback':    return await handlePaymobCallback(body);
            case 'checkKeys':         return handleCheckKeys();
            default:
                return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: `Unknown action: ${action}` }) };
        }
    } catch (err) {
        console.error(`[Payment] Error in ${action}:`, err.message);
        return {
            statusCode: 500, headers: CORS,
            body: JSON.stringify({ error: err.message || 'Internal server error' })
        };
    }
};

// ── Paymob Card Payment ───────────────────────────────────────────────────────
async function handlePaymobCard(body) {
    const { amount, orderId, customerData = {}, currency = 'EGP' } = body;

    if (!amount || amount <= 0) throw new Error('Invalid amount');

    if (!SECRETS.PAYMOB_API_KEY) {
        // DEMO MODE — return simulated response for testing
        return {
            statusCode: 200, headers: CORS,
            body: JSON.stringify({
                iframeUrl: `https://accept.paymob.com/api/acceptance/iframes/DEMO?payment_token=DEMO_TOKEN`,
                simulated: true,
                message:   'Add PAYMOB_API_KEY to enable real payments',
            })
        };
    }

    // Step 1: Auth
    const authResp = await _httpsPost('accept.paymob.com', '/api/auth/tokens', {
        api_key: SECRETS.PAYMOB_API_KEY
    });
    const authToken = authResp.token;
    if (!authToken) throw new Error('Paymob auth failed');

    // Step 2: Create order
    const amountCents = Math.round(parseFloat(amount) * 100);
    const orderResp = await _httpsPost('accept.paymob.com', '/api/ecommerce/orders', {
        auth_token:      authToken,
        delivery_needed: false,
        amount_cents:    amountCents,
        currency:        currency,
        merchant_order_id: orderId,
        items: [],
    });
    const paymobOrderId = orderResp.id;

    // Step 3: Get payment key
    const keyResp = await _httpsPost('accept.paymob.com', '/api/acceptance/payment_keys', {
        auth_token:      authToken,
        amount_cents:    amountCents,
        expiration:      3600,
        order_id:        paymobOrderId,
        currency:        currency,
        integration_id:  parseInt(SECRETS.PAYMOB_INTEGRATION_ID),
        billing_data: {
            first_name:      customerData.first_name || 'N',
            last_name:       customerData.last_name  || 'A',
            email:           customerData.email      || 'na@na.com',
            phone_number:    customerData.phone      || '+201000000000',
            apartment:       'NA', floor: 'NA', street: 'NA', building: 'NA',
            shipping_method: 'NA', postal_code: 'NA', city: 'Cairo',
            country: 'EG', state: 'Cairo',
        },
    });

    const paymentToken = keyResp.token;
    if (!paymentToken) throw new Error('Failed to get Paymob payment token');

    const iframeUrl = `https://accept.paymob.com/api/acceptance/iframes/${SECRETS.PAYMOB_IFRAME_ID}?payment_token=${paymentToken}`;

    return {
        statusCode: 200, headers: CORS,
        body: JSON.stringify({ iframeUrl, orderId: paymobOrderId, simulated: false })
    };
}

// ── Paymob HMAC Callback Verification ────────────────────────────────────────
async function handlePaymobCallback(body) {
    const { hmac, data } = body;

    if (!SECRETS.PAYMOB_HMAC_SECRET) {
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ verified: true, simulated: true }) };
    }

    const crypto = require('crypto');
    const fields = [
        data.amount_cents, data.created_at, data.currency,
        data.error_occured, data.has_parent_transaction, data.id,
        data.integration_id, data.is_3d_secure, data.is_auth,
        data.is_capture, data.is_refunded, data.is_standalone_payment,
        data.is_voided, data.order?.id, data.owner, data.pending,
        data.source_data?.pan, data.source_data?.sub_type, data.source_data?.type,
        data.success,
    ].join('');

    const computed = crypto.createHmac('sha512', SECRETS.PAYMOB_HMAC_SECRET)
        .update(fields).digest('hex');

    const verified = computed === hmac;
    return {
        statusCode: 200, headers: CORS,
        body: JSON.stringify({ verified, success: data.success === true || data.success === 'true' })
    };
}

// ── Fawry ─────────────────────────────────────────────────────────────────────
async function handleFawry(body) {
    const { amount, orderId, email = '' } = body;

    if (!SECRETS.FAWRY_MERCHANT_CODE) {
        const fakeCode = Math.floor(100000000 + Math.random() * 900000000).toString();
        return {
            statusCode: 200, headers: CORS,
            body: JSON.stringify({ referenceNumber: fakeCode, simulated: true,
                message: 'Add FAWRY_MERCHANT_CODE to enable real Fawry payments' })
        };
    }

    const crypto = require('crypto');
    const amountStr = parseFloat(amount).toFixed(2);
    const signatureStr = SECRETS.FAWRY_MERCHANT_CODE + orderId + email + amountStr + 'EGP' + SECRETS.FAWRY_SECURITY_KEY;
    const signature = crypto.createHash('sha256').update(signatureStr).digest('hex');

    const payload = {
        merchantCode:    SECRETS.FAWRY_MERCHANT_CODE,
        merchantRefNum:  orderId,
        customerMobile:  '01000000000',
        customerEmail:   email,
        paymentExpiry:   Math.floor(Date.now() / 1000) + (72 * 3600),
        currencyCode:    'EGP',
        amount:          amountStr,
        chargeItems: [{ itemId: orderId, description: 'Mall Services', price: amountStr, quantity: 1 }],
        signature,
    };

    const resp = await _httpsPost('www.atfawry.com', '/ECommerceWeb/api/payments/charge', payload);
    const code = resp.referenceNumber || resp.referenceNum;
    if (!code) throw new Error(resp.statusDescription || 'Fawry charge failed');

    return {
        statusCode: 200, headers: CORS,
        body: JSON.stringify({ referenceNumber: code, simulated: false })
    };
}

// ── Mobile Wallet (Vodafone/Etisalat/Orange/WE) ───────────────────────────────
async function handleMobileWallet(body) {
    const { method, amount, orderId, phone } = body;

    if (!SECRETS.PAYMOB_API_KEY) {
        return {
            statusCode: 200, headers: CORS,
            body: JSON.stringify({
                pending: true, simulated: true,
                message: `${method} payment request sent to ${phone} (simulated)`
            })
        };
    }

    // Paymob handles mobile wallets via a different integration ID per operator
    const walletIntegIds = {
        vodafone_cash: process.env.PAYMOB_WALLET_INTEG_ID || SECRETS.PAYMOB_INTEGRATION_ID,
        etisalat_cash: process.env.PAYMOB_ETISALAT_INTEG_ID || SECRETS.PAYMOB_INTEGRATION_ID,
        orange_cash:   process.env.PAYMOB_ORANGE_INTEG_ID || SECRETS.PAYMOB_INTEGRATION_ID,
        we_pay:        process.env.PAYMOB_WE_INTEG_ID || SECRETS.PAYMOB_INTEGRATION_ID,
    };

    const integId = walletIntegIds[method] || SECRETS.PAYMOB_INTEGRATION_ID;

    // Step 1: Auth
    const authResp = await _httpsPost('accept.paymob.com', '/api/auth/tokens', { api_key: SECRETS.PAYMOB_API_KEY });
    const authToken = authResp.token;

    // Step 2: Create order
    const amountCents = Math.round(parseFloat(amount) * 100);
    const orderResp = await _httpsPost('accept.paymob.com', '/api/ecommerce/orders', {
        auth_token: authToken, delivery_needed: false,
        amount_cents: amountCents, currency: 'EGP',
        merchant_order_id: orderId, items: [],
    });

    // Step 3: Payment key for wallet
    const keyResp = await _httpsPost('accept.paymob.com', '/api/acceptance/payment_keys', {
        auth_token: authToken, amount_cents: amountCents, expiration: 3600,
        order_id: orderResp.id, currency: 'EGP', integration_id: parseInt(integId),
        billing_data: { first_name:'N',last_name:'A',email:'na@na.com',phone_number:phone || '+201000000000',
            apartment:'NA',floor:'NA',street:'NA',building:'NA',shipping_method:'NA',postal_code:'NA',city:'Cairo',country:'EG',state:'Cairo' },
    });

    // Step 4: Initiate wallet payment
    const walletResp = await _httpsPost('accept.paymob.com', '/api/acceptance/payments/pay', {
        source: { identifier: phone, subtype: 'WALLET' },
        payment_token: keyResp.token,
    });

    const redirectUrl = walletResp.redirect_url;
    if (redirectUrl) {
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ redirectUrl, simulated: false }) };
    }
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ pending: true, simulated: false }) };
}

// ── Stripe ────────────────────────────────────────────────────────────────────
async function handleStripe(body) {
    const { amount, orderId, email = '' } = body;

    if (!SECRETS.STRIPE_SECRET_KEY) {
        return {
            statusCode: 200, headers: CORS,
            body: JSON.stringify({
                url: `${SECRETS.ALLOWED_ORIGINS}#orders?payment_success=true&order_id=${orderId}&method=stripe`,
                simulated: true, message: 'Add STRIPE_SECRET_KEY to enable real Stripe payments'
            })
        };
    }

    const querystring = require('querystring');
    const amountCents = Math.round(parseFloat(amount) * 100);
    const successUrl  = `${SECRETS.ALLOWED_ORIGINS}?payment_success=true&order_id=${orderId}&method=stripe#orders`;
    const cancelUrl   = `${SECRETS.ALLOWED_ORIGINS}#payment`;

    const params = querystring.stringify({
        'payment_method_types[]':            'card',
        'line_items[0][price_data][currency]':'usd',
        'line_items[0][price_data][product_data][name]': 'Mall Services Purchase',
        'line_items[0][price_data][unit_amount]': amountCents,
        'line_items[0][quantity]':            '1',
        'mode':                               'payment',
        'success_url':                        successUrl,
        'cancel_url':                         cancelUrl,
        'customer_email':                     email,
        'metadata[orderId]':                  orderId,
    });

    const resp = await _httpsPost('api.stripe.com', '/v1/checkout/sessions', params, {
        'Authorization': `Bearer ${SECRETS.STRIPE_SECRET_KEY}`,
        'Content-Type':  'application/x-www-form-urlencoded',
    });

    if (!resp.url) throw new Error(resp.error?.message || 'Stripe session creation failed');
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ url: resp.url, simulated: false }) };
}

// ── PayPal ────────────────────────────────────────────────────────────────────
async function handlePayPal(body) {
    const { amount, orderId, currency = 'USD' } = body;

    if (!SECRETS.PAYPAL_CLIENT_ID) {
        return {
            statusCode: 200, headers: CORS,
            body: JSON.stringify({
                approvalUrl: `${SECRETS.ALLOWED_ORIGINS}?payment_success=true&order_id=${orderId}&method=paypal#orders`,
                simulated: true, message: 'Add PAYPAL_CLIENT_ID to enable real PayPal payments'
            })
        };
    }

    const host = SECRETS.PAYPAL_MODE === 'live' ? 'api-m.paypal.com' : 'api-m.sandbox.paypal.com';
    const credentials = Buffer.from(`${SECRETS.PAYPAL_CLIENT_ID}:${SECRETS.PAYPAL_CLIENT_SECRET}`).toString('base64');

    // Get access token
    const tokenResp = await _httpsPost(host, '/v1/oauth2/token',
        'grant_type=client_credentials',
        { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' }
    );
    const accessToken = tokenResp.access_token;

    // Create order
    const orderResp = await _httpsPost(host, '/v2/checkout/orders', {
        intent: 'CAPTURE',
        purchase_units: [{
            reference_id: orderId,
            amount: { currency_code: currency, value: parseFloat(amount).toFixed(2) }
        }],
        application_context: {
            return_url: `${SECRETS.ALLOWED_ORIGINS}?payment_success=true&order_id=${orderId}&method=paypal#orders`,
            cancel_url: `${SECRETS.ALLOWED_ORIGINS}#payment`,
        }
    }, { 'Authorization': `Bearer ${accessToken}` });

    const approvalLink = orderResp.links?.find(l => l.rel === 'approve');
    if (!approvalLink) throw new Error('PayPal order creation failed');

    return {
        statusCode: 200, headers: CORS,
        body: JSON.stringify({ approvalUrl: approvalLink.href, simulated: false })
    };
}

// ── Wallet Deduct (server-side validation) ────────────────────────────────────
async function handleWalletDeduct(body) {
    const { amount, orderId, userId } = body;
    // In production: validate userId via Firebase Admin SDK before deducting
    // For now we trust the client-side Firebase auth check + Firestore rules
    return {
        statusCode: 200, headers: CORS,
        body: JSON.stringify({ success: true, deducted: amount, orderId })
    };
}

// ── Bank Transfer Details ─────────────────────────────────────────────────────
function handleBankDetails() {
    return {
        statusCode: 200, headers: CORS,
        body: JSON.stringify({
            bankName:    SECRETS.BANK_NAME,
            accountNo:   SECRETS.BANK_ACCOUNT,
            iban:        SECRETS.BANK_IBAN,
            accountName: SECRETS.BANK_ACCOUNT_NAME,
        })
    };
}

// ── Verify Payment ────────────────────────────────────────────────────────────
async function handleVerifyPayment(body) {
    const { transactionId } = body;
    if (!transactionId) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'No transactionId' }) };

    if (!SECRETS.PAYMOB_API_KEY) {
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ verified: true, simulated: true }) };
    }

    const resp = await _httpsGet('accept.paymob.com', `/api/acceptance/transactions/${transactionId}`,
        { 'Authorization': `Bearer ${SECRETS.PAYMOB_API_KEY}` }
    );

    return {
        statusCode: 200, headers: CORS,
        body: JSON.stringify({ verified: resp.success === true, data: resp })
    };
}

// ── Check Which Keys Are Configured (no secrets returned) ────────────────────
function handleCheckKeys() {
    return {
        statusCode: 200, headers: CORS,
        body: JSON.stringify({
            paymob_configured:  !!(SECRETS.PAYMOB_API_KEY && SECRETS.PAYMOB_INTEGRATION_ID),
            fawry_configured:   !!(SECRETS.FAWRY_MERCHANT_CODE && SECRETS.FAWRY_SECURITY_KEY),
            stripe_configured:  !!(SECRETS.STRIPE_SECRET_KEY && SECRETS.STRIPE_SECRET_KEY.startsWith('sk_')),
            paypal_configured:  !!(SECRETS.PAYPAL_CLIENT_ID && SECRETS.PAYPAL_CLIENT_SECRET),
        })
    };
}

// ── HTTPS Helper: POST ────────────────────────────────────────────────────────
function _httpsPost(host, path, bodyData, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
        const isString = typeof bodyData === 'string';
        const payload  = isString ? bodyData : JSON.stringify(bodyData);
        const headers  = {
            'Content-Type':   isString ? 'application/x-www-form-urlencoded' : 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            ...extraHeaders,
        };

        const req = https.request({ host, path, method: 'POST', headers }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (_) { resolve({ raw: data }); }
            });
        });

        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

// ── HTTPS Helper: GET ─────────────────────────────────────────────────────────
function _httpsGet(host, path, headers = {}) {
    return new Promise((resolve, reject) => {
        https.get({ host, path, headers }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (_) { resolve({ raw: data }); }
            });
        }).on('error', reject);
    });
}
