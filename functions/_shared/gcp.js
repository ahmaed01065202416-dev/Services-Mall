/**
 * ============================================================================
 * functions/_shared/gcp.js
 * Minimal Firebase Admin replacement for Cloudflare Workers (no Node crypto/http).
 * Lets our server (not the browser) be the ONLY thing that can create paid
 * orders, release escrow, and touch wallet balances.
 *
 * Requires these Cloudflare Pages env vars:
 *   FIREBASE_PROJECT_ID       — e.g. "mall-services-xxxxx"
 *   FIREBASE_SERVICE_ACCOUNT  — the FULL JSON of a Firebase service account key
 *                                (Firebase Console → Project settings → Service
 *                                accounts → Generate new private key), pasted
 *                                as a single-line string.
 *   FIREBASE_WEB_API_KEY      — optional, defaults to the public apiKey already
 *                                used in index.html (it's not a secret).
 * ============================================================================
 */

// ── base64url helpers (Workers have atob/btoa but not Buffer) ────────────────
function b64urlFromString(str) {
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlFromBytes(bytes) {
    let bin = '';
    const arr = new Uint8Array(bytes);
    for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
    return b64urlFromString(bin);
}

async function importPrivateKey(pem) {
    const clean = pem
        .replace(/-----BEGIN PRIVATE KEY-----/, '')
        .replace(/-----END PRIVATE KEY-----/, '')
        .replace(/\s+/g, '');
    const bin = atob(clean);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return crypto.subtle.importKey('pkcs8', bytes.buffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

// ── Google OAuth2 access token via service-account JWT bearer flow ───────────
let _tokenCache = null; // { token, exp } — best-effort reuse within a warm isolate

async function getAccessToken(env) {
    const now = Math.floor(Date.now() / 1000);
    if (_tokenCache && _tokenCache.exp > now + 30) return _tokenCache.token;

    if (!env.FIREBASE_SERVICE_ACCOUNT) {
        throw new Error('Server not configured: FIREBASE_SERVICE_ACCOUNT env var is missing');
    }
    const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);

    const header = { alg: 'RS256', typ: 'JWT' };
    const claim = {
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/datastore',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
    };
    const signInput = `${b64urlFromString(JSON.stringify(header))}.${b64urlFromString(JSON.stringify(claim))}`;
    const key = await importPrivateKey(sa.private_key);
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signInput));
    const jwt = `${signInput}.${b64urlFromBytes(sig)}`;

    const resp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: jwt,
        }).toString(),
    });
    const data = await resp.json();
    if (!data.access_token) throw new Error('Google auth failed: ' + JSON.stringify(data));
    _tokenCache = { token: data.access_token, exp: now + (data.expires_in || 3600) };
    return data.access_token;
}

// ── Verify a Firebase ID token sent from the browser (no jwt lib needed) ─────
// Uses Identity Toolkit's accounts:lookup — Google validates signature/expiry
// for us and returns the real uid, so the client can never lie about who it is.
async function verifyIdToken(idToken, env) {
    if (!idToken) return null;
    const apiKey = env.FIREBASE_WEB_API_KEY || 'AIzaSyDfWKWN5CTlBA-krEMXsmYmaI8j7fyuw20';
    const resp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
    });
    const data = await resp.json();
    const user = data.users && data.users[0];
    if (!user) return null;
    return { uid: user.localId, email: user.email || '', emailVerified: !!user.emailVerified };
}

// ── Firestore REST <-> JS value conversion ────────────────────────────────────
function toValue(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (v instanceof Date) return { timestampValue: v.toISOString() };
    if (typeof v === 'string') return { stringValue: v };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
    if (typeof v === 'object') return { mapValue: { fields: toFields(v) } };
    return { stringValue: String(v) };
}
function toFields(obj) {
    const fields = {};
    for (const k of Object.keys(obj || {})) fields[k] = toValue(obj[k]);
    return fields;
}
function fromValue(v) {
    if (!v) return null;
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) return parseInt(v.integerValue, 10);
    if ('doubleValue' in v) return v.doubleValue;
    if ('booleanValue' in v) return v.booleanValue;
    if ('nullValue' in v) return null;
    if ('timestampValue' in v) return v.timestampValue;
    if ('mapValue' in v) return fromFields(v.mapValue.fields || {});
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue);
    return null;
}
function fromFields(fields) {
    const obj = {};
    for (const k of Object.keys(fields || {})) obj[k] = fromValue(fields[k]);
    return obj;
}

function fsBase(env) {
    return `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
}
function fsName(env, path) {
    return `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}`;
}

// ── Basic CRUD (all bypass security rules — this runs with service-account
//    credentials, same trust level as the old Admin SDK) ─────────────────────
async function fsGet(env, path) {
    const token = await getAccessToken(env);
    const resp = await fetch(`${fsBase(env)}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (resp.status === 404) return null;
    const data = await resp.json();
    if (data.error) { if (data.error.status === 'NOT_FOUND') return null; throw new Error(`Firestore GET ${path}: ${data.error.message}`); }
    return { id: path.split('/').pop(), _updateTime: data.updateTime, ...fromFields(data.fields) };
}

async function fsCreate(env, collectionPath, data, docId) {
    const token = await getAccessToken(env);
    const url = docId
        ? `${fsBase(env)}/${collectionPath}?documentId=${encodeURIComponent(docId)}`
        : `${fsBase(env)}/${collectionPath}`;
    const resp = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: toFields(data) }),
    });
    const out = await resp.json();
    if (out.error) throw new Error(`Firestore CREATE ${collectionPath}: ${out.error.message}`);
    const id = out.name ? out.name.split('/').pop() : docId;
    return { id, ...fromFields(out.fields) };
}

async function fsSet(env, path, data, merge) {
    const token = await getAccessToken(env);
    let url = `${fsBase(env)}/${path}`;
    if (merge) url += '?' + Object.keys(data).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
    const resp = await fetch(url, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: toFields(data) }),
    });
    const out = await resp.json();
    if (out.error) throw new Error(`Firestore SET ${path}: ${out.error.message}`);
    return out;
}

// ── Atomic multi-write commit (used for escrow release: increment wallet +
//    flip order/escrow status in one all-or-nothing call) ────────────────────
async function fsCommit(env, writes) {
    const token = await getAccessToken(env);
    const resp = await fetch(`${fsBase(env)}:commit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ writes }),
    });
    const out = await resp.json();
    if (out.error) throw new Error(`Firestore COMMIT: ${out.error.message}`);
    return out;
}

function writeIncrement(env, path, field, amount) {
    return { transform: { document: fsName(env, path), fieldTransforms: [{ fieldPath: field, increment: toValue(amount) }] } };
}
function writeUpdate(env, path, data, precondition) {
    const w = { update: { name: fsName(env, path), fields: toFields(data) }, updateMask: { fieldPaths: Object.keys(data) } };
    if (precondition) w.currentDocument = precondition;
    return w;
}
function writeCreate(env, path, data) {
    return { update: { name: fsName(env, path), fields: toFields(data) }, currentDocument: { exists: false } };
}

// ── Structured query (runQuery) — returns an array of decoded docs ───────────
async function fsQuery(env, structuredQuery) {
    const token = await getAccessToken(env);
    const resp = await fetch(`${fsBase(env)}:runQuery`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ structuredQuery }),
    });
    const rows = await resp.json();
    if (!Array.isArray(rows)) return [];
    return rows
        .filter(r => r.document)
        .map(r => ({ id: r.document.name.split('/').pop(), _updateTime: r.document.updateTime, ...fromFields(r.document.fields) }));
}

// ── Aggregation count — cheap server-side COUNT(*) for a filtered collection,
// e.g. active services or completed orders. Used by functions/api/home-stats.js
// so the public homepage can show real numbers without needing broad client-side
// Firestore read rules on collections like `orders` that are otherwise locked
// to "your own orders only".
async function fsCount(env, structuredQuery) {
    const token = await getAccessToken(env);
    const resp = await fetch(`${fsBase(env)}:runAggregationQuery`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            structuredAggregationQuery: {
                structuredQuery,
                aggregations: [{ alias: 'count', count: {} }],
            },
        }),
    });
    const rows = await resp.json();
    const row = Array.isArray(rows) ? rows.find(r => r.result) : null;
    return row ? Number(row.result.aggregateFields.count.integerValue || 0) : 0;
}

export {
    getAccessToken, verifyIdToken,
    fsGet, fsCreate, fsSet, fsCommit, fsQuery, fsCount,
    writeIncrement, writeUpdate, writeCreate,
};
