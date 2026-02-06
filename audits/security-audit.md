# 🔒 Phosphors Security Audit Report

**Date:** February 6, 2026  
**Auditor:** OpenClaw Security Subagent  
**Scope:** API security, input validation, auth flows, payment verification  
**Project:** phosphors.xyz (phosphor directory)

---

## Executive Summary

**Overall Security Posture: 5/10** ⚠️

The codebase shows good security awareness in some areas (input validation, sanitization, rate limiting concepts) but has critical gaps in implementation that could lead to financial loss. Given this handles real money (USDC), the following issues require immediate attention.

### Key Findings Summary

| Severity | Count | Status |
|----------|-------|--------|
| 🔴 Critical | 4 | Requires immediate fix |
| 🟠 High | 5 | Fix before production |
| 🟡 Medium | 6 | Fix soon |
| 🟢 Low | 4 | Address when convenient |

---

## 🔴 CRITICAL VULNERABILITIES

### CRIT-1: Secrets Exposed in .env File

**Location:** `/.env` (lines 1-47)  
**Risk:** Complete system compromise

The `.env` file contains production secrets that, if exposed, would allow:
- **Wallet drain:** `MINTER_SEED`, `FUNDER_SEED` expose private keys
- **API abuse:** `CDP_API_KEY_SECRET`, `REPLICATE_API_TOKEN`, X/Twitter tokens
- **Database takeover:** `SUPABASE_SERVICE_KEY` has full admin access
- **Admin impersonation:** `ADMIN_SECRET`, `SESSION_SECRET`

**Evidence:**
```env
MINTER_SEED=550b112b770c639c6a5aa5f64a9fce4cd5e7e854f186d1af24a7342253ae7760
FUNDER_SEED=550b112b770c639c6a5aa5f64a9fce4cd5e7e854f186d1af24a7342253ae7760
CDP_API_KEY_SECRET=erQWEJBpTIhwVay79ozrIV5OD8Z5CHrByxxQ6b7ljaSF14wBv6y5bpVmlwIvnjljGrQn7QLdrTZuYTFgpa6gvg==
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Fix:**
1. **IMMEDIATELY rotate ALL secrets** listed in .env
2. Use Vercel environment variables (Settings → Environment Variables)
3. Never store secrets in files, even gitignored ones
4. Verify .env is not in git history: `git log --all --full-history -- .env`
5. If found in history, use `git filter-repo` to remove

---

### CRIT-2: In-Memory Rate Limiting Ineffective on Serverless

**Location:** `/api/_lib/rate-limit.js` (lines 1-68)  
**Risk:** Rate limit bypass, DoS, abuse

The rate limiter uses a JavaScript `Map()` stored in memory:

```javascript
// api/_lib/rate-limit.js:7
const rateLimitStore = new Map();
```

**Problems:**
1. **Cold starts reset limits** - Vercel spins down functions after ~10 mins of inactivity
2. **No cross-instance sharing** - Multiple concurrent requests bypass limits
3. **Attacker can force cold start** - Wait 15 mins, limits are gone

**Impact:**
- Registration spam: 5/hour limit → unlimited with timing
- Buy endpoint abuse: 30/min limit → bypass
- Submit endpoint: 10/hour limit → flood NFT minting

**Fix:**
```javascript
// Use Upstash Redis for serverless-compatible rate limiting
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, "60 s"),
});

export async function checkRateLimit(identifier) {
  const { success, limit, remaining, reset } = await ratelimit.limit(identifier);
  return { allowed: success, remaining, resetAt: reset };
}
```

---

### CRIT-3: Transaction Replay Attack Possible

**Location:** `/api/_lib/payment-verify.js` (lines 101-120)  
**Risk:** Double-spend, purchase items multiple times with same payment

The `isTransactionUsed()` check has a race condition:

```javascript
// api/_lib/payment-verify.js:120
export async function verifyPurchasePayment(txHash, buyerAddress, amount) {
  // Step 1: Check if transaction was already used
  const alreadyUsed = await isTransactionUsed(txHash);  // ← Race condition here
  if (alreadyUsed) { ... }
  
  // Step 2: Verify on-chain
  const verification = await verifyPayment(txHash, {...});
```

**Attack Scenario:**
1. Attacker sends valid USDC payment
2. Attacker makes 10 parallel requests to `/api/buy` with same `txHash`
3. All 10 requests pass `isTransactionUsed()` check (DB not yet updated)
4. All 10 receive successful purchase response
5. Attacker gets 10 NFTs for price of 1

**Fix:**
```javascript
// Use database-level locking
export async function verifyPurchasePayment(txHash, buyerAddress, amount) {
  // Atomic check-and-insert using INSERT ... ON CONFLICT
  const res = await supabaseQuery('/rest/v1/purchase_locks', {
    method: 'POST',
    headers: { 
      'Prefer': 'resolution=ignore-duplicates,return=representation' 
    },
    body: JSON.stringify({ tx_hash: txHash })
  });
  
  const result = await res.json();
  if (result.length === 0) {
    // Insert failed due to conflict - tx already used
    return { valid: false, error: 'Transaction already used' };
  }
  
  // Continue with verification...
}
```

---

### CRIT-4: Payment Verification Simulated in License API

**Location:** `/api/license.js` (lines 143-161)  
**Risk:** Free commercial licenses, financial loss

The `verifyPhosPayment()` function is a STUB that always returns valid:

```javascript
// api/license.js:143
async function verifyPhosPayment(txHash, expectedAmount, fromWallet) {
  // TODO: Implement actual on-chain verification
  // For now, simulate verification
  if (!txHash || !txHash.startsWith('0x')) {
    return { valid: false, error: 'Invalid transaction hash' };
  }
  
  // Simulated success for development  ← DANGER!
  console.log(`[PHOS Payment] Simulating verification for ${txHash}`);
  return { 
    valid: true, 
    amount: expectedAmount,
    simulated: true 
  };
}
```

**Attack:** Any string starting with `0x` passes payment verification. Free commercial licenses.

**Fix:** Implement actual on-chain verification similar to `/api/_lib/payment-verify.js`:

```javascript
async function verifyPhosPayment(txHash, expectedAmount, fromWallet) {
  // Use the same pattern as USDC verification
  const verification = await verifyTokenTransfer(txHash, {
    from: fromWallet,
    amount: expectedAmount,
    token: PHOS_TOKEN,
    to: TREASURY_WALLET
  });
  return verification;
}
```

---

## 🟠 HIGH VULNERABILITIES

### HIGH-1: X Verification Bypass When API Not Configured

**Location:** `/api/agents/verify.js` (lines 106-127)  
**Risk:** Fake verified accounts, impersonation

```javascript
// api/agents/verify.js:106
if (!bearerToken) {
  // Fallback: trust the handle without verification ← BYPASS!
  console.warn('⚠️ X API credentials not configured, trusting handle without verification');
  
  const updated = await updateAgentById(agent.id, {
    x_verified: true,  // ← Marked as verified!
    x_handle: x_handle,
```

**Attack:** If X API keys expire or are misconfigured, any user can claim any X handle.

**Fix:**
```javascript
if (!bearerToken) {
  return res.status(503).json({
    success: false,
    error: { 
      code: 'SERVICE_UNAVAILABLE', 
      message: 'X verification temporarily unavailable. Please try later.' 
    }
  });
}
```

---

### HIGH-2: Admin Authentication Lacks 2FA/IP Restriction

**Location:** `/api/auth/admin.js` (lines 1-107)  
**Risk:** Admin compromise via brute force or credential leak

Issues:
1. Simple password comparison (single factor)
2. Session stored in memory (lost on restart)
3. No IP allowlisting
4. Rate limit resets on cold start (CRIT-2)

```javascript
// api/auth/admin.js:77
if (passwordBuffer.length !== secretBuffer.length || 
    !crypto.timingSafeEqual(passwordBuffer, secretBuffer)) {
```

**Fix:**
1. Add IP allowlisting via Vercel's edge config or check header
2. Implement TOTP (time-based one-time password)
3. Store sessions in Redis/Supabase
4. Add login attempt alerting

```javascript
// Example IP allowlist
const ADMIN_IPS = (process.env.ADMIN_ALLOWED_IPS || '').split(',');
const clientIP = getClientIP(req);

if (!ADMIN_IPS.includes(clientIP) && process.env.NODE_ENV === 'production') {
  await auditLog('ADMIN_LOGIN_BLOCKED', { ip: clientIP });
  return res.status(403).json({ error: 'Access denied' });
}
```

---

### HIGH-3: Wide-Open CORS on Sensitive Endpoints

**Location:** Multiple files  
**Risk:** Cross-site attacks, credential theft

Many endpoints use `Access-Control-Allow-Origin: *`:

| File | Line |
|------|------|
| `/api/auth/admin.js` | 35 |
| `/api/agents/register.js` | 60 |
| `/api/agents/verify.js` | 33 |
| `/api/agents/me.js` | 18 |
| `/api/agents/wallet.js` | 31 |
| `/api/activity.js` | 32 |
| `/api/heartbeat.js` | 176 |

**Risk:** Malicious website can make authenticated requests on behalf of logged-in users.

**Fix:** Use the CORS whitelist from security.js consistently:

```javascript
// In EVERY endpoint, replace:
res.setHeader('Access-Control-Allow-Origin', '*');

// With:
import { handleCors } from './_lib/security.js';
if (handleCors(req, res, { methods: 'GET, POST, OPTIONS' })) {
  return;
}
```

---

### HIGH-4: No CSRF Protection on State-Changing Endpoints

**Location:** All POST endpoints  
**Risk:** Forged requests from malicious sites

None of the POST endpoints validate a CSRF token:
- `/api/buy` - Could force purchases
- `/api/submit` - Could submit spam art
- `/api/comments` - Could post spam comments
- `/api/agents/register` - Could create accounts

**Fix:**
```javascript
// 1. Generate CSRF token on session creation
const csrfToken = crypto.randomBytes(32).toString('base64url');

// 2. Store in session
sessions.set(token, { ..., csrfToken });

// 3. Validate on POST requests
const providedCsrf = req.headers['x-csrf-token'];
if (providedCsrf !== session.csrfToken) {
  return res.status(403).json({ error: 'Invalid CSRF token' });
}
```

---

### HIGH-5: Supabase ANON Key Used for Sensitive Operations

**Location:** `/api/comments.js` (lines 11-12)  
**Risk:** Data exposure via RLS bypass

```javascript
// api/comments.js:11
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;  // ← Wrong key!
```

The anon key should only be used for public data. For agent verification and sensitive queries, use the service key.

**Affected Files:**
- `/api/comments.js:12` - Uses ANON key
- `/api/buy.js:29` - Falls back to ANON key
- `/api/heartbeat.js:7` - Falls back to ANON key

**Fix:**
```javascript
// For admin/sensitive operations, always use service key
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_KEY) {
  throw new Error('SUPABASE_SERVICE_KEY not configured');
}
```

---

## 🟡 MEDIUM VULNERABILITIES

### MED-1: Missing Wallet Ownership Verification

**Location:** `/api/buy.js`, `/api/comments.js`  
**Risk:** Actions on behalf of other wallets

The `buyer` parameter comes from query string without proving wallet ownership:

```javascript
// api/buy.js:77
const { id, buyer } = req.query;  // ← Attacker can specify any wallet
```

For comments:
```javascript
// api/comments.js:87
const { piece_id, agent_address } = body;  // ← No proof of ownership
```

**Fix:** Require signed message proving wallet ownership:

```javascript
// Add wallet signature verification
import { verifyMessage } from 'ethers';

const message = `Phosphors action: ${action} at ${timestamp}`;
const recoveredAddress = verifyMessage(message, signature);

if (recoveredAddress.toLowerCase() !== claimedAddress.toLowerCase()) {
  return badRequest(res, 'Invalid wallet signature');
}
```

---

### MED-2: Referral Code Enumeration

**Location:** `/api/_lib/bounties.js` (lines 14-22)  
**Risk:** Predictable referral codes, abuse

```javascript
// api/_lib/bounties.js:14
export function generateReferralCode(username) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${username.toLowerCase()}-${suffix}`;  // ← Only 32^4 = 1M possibilities
}
```

**Risk:** Attacker can enumerate referral codes by username.

**Fix:** Use longer, cryptographically random codes:

```javascript
export function generateReferralCode() {
  return crypto.randomBytes(16).toString('base64url'); // 128-bit random
}
```

---

### MED-3: EIP-55 Checksum Validation Uses SHA256

**Location:** `/api/_lib/security.js` (lines 24-38)  
**Risk:** Invalid addresses may pass validation

```javascript
// api/_lib/security.js:28
const hash = crypto.createHash('sha256').update(address.toLowerCase()).digest('hex');
```

EIP-55 specifies **Keccak-256**, not SHA-256. This may allow malformed addresses.

**Fix:**
```javascript
import { keccak256 } from 'ethers';

function isValidChecksumAddress(addr) {
  const address = addr.slice(2).toLowerCase();
  const hash = keccak256(Buffer.from(address)).slice(2);
  // ... rest of validation
}
```

---

### MED-4: Request Body Size Check After Parsing

**Location:** `/api/_lib/security.js` (lines 119-134)  
**Risk:** DoS via large payloads

```javascript
// api/_lib/security.js:127
const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

// Check parsed body size ← Already parsed!
const bodySize = JSON.stringify(body).length;
```

The body is already parsed when this runs (Vercel's bodyParser). A 100MB payload would already be in memory.

**Fix:** Configure Vercel's body size limit in vercel.json:

```json
{
  "functions": {
    "api/**/*.js": {
      "maxDuration": 10,
      "memory": 256
    }
  },
  "routes": [
    {
      "src": "/api/.*",
      "headers": {
        "x-content-type-options": "nosniff"
      }
    }
  ]
}
```

---

### MED-5: Bounty POST Endpoint Missing Auth

**Location:** `/api/bounties.js` (lines 71-92)  
**Risk:** Bounty manipulation

```javascript
// api/bounties.js:77
async function handlePost(req, res) {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  const internalKey = process.env.INTERNAL_API_KEY;
  
  // ✓ Good: Fails closed
  if (!internalKey || apiKey !== internalKey) {
```

Good: Fails closed. But `INTERNAL_API_KEY` is not in the provided .env, so this endpoint may be unprotected.

**Fix:** Ensure `INTERNAL_API_KEY` is set in Vercel env vars and is a strong random value.

---

### MED-6: Debug Logging May Expose Sensitive Data

**Location:** Multiple files  
**Risk:** Log leakage

```javascript
// api/_lib/funder.js:106
console.error('   Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error)));

// api/heartbeat.js:256
return res.status(500).json({ 
  error: 'Internal server error', 
  message: error.message  // ← Exposes internal details
});
```

**Fix:** Use structured logging, never expose error.message to clients:

```javascript
// In production, sanitize errors
return res.status(500).json({ 
  success: false,
  error: { code: 'INTERNAL_ERROR', message: 'An error occurred' }
});
```

---

## 🟢 LOW VULNERABILITIES

### LOW-1: Session Token Not HTTP-Only

**Location:** `/api/auth/admin.js`  
**Risk:** XSS can steal admin session

Sessions are returned in JSON response, likely stored in localStorage. If XSS exists, tokens can be stolen.

**Fix:** Set as HTTP-only cookie:

```javascript
res.setHeader('Set-Cookie', `session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=${SESSION_TTL_MS / 1000}`);
```

---

### LOW-2: Missing Security Headers

**Location:** All endpoints  
**Risk:** Clickjacking, MIME sniffing

While `security.js` sets some headers, they're not consistent:

```javascript
// api/_lib/security.js:99
res.setHeader('X-Content-Type-Options', 'nosniff');
res.setHeader('X-Frame-Options', 'DENY');
// Missing: Strict-Transport-Security, Content-Security-Policy
```

**Fix:** Add to vercel.json:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Strict-Transport-Security", "value": "max-age=31536000; includeSubDomains" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
      ]
    }
  ]
}
```

---

### LOW-3: No Request Signing on Most Endpoints

**Location:** `/api/_lib/security.js` (lines 202-233)  
**Risk:** Request tampering

The `verifyRequestSignature()` function exists but is only used by `/api/submit.js`.

**Recommendation:** Consider using it for all sensitive operations (buy, wallet creation, profile updates).

---

### LOW-4: Wallet Creation No Confirmation Step

**Location:** `/api/agents/wallet.js`  
**Risk:** Accidental wallet creation, resource exhaustion

No confirmation required to create a wallet and fund it with real testnet tokens.

**Recommendation:** Add a confirmation step or CAPTCHA for wallet creation.

---

## 📋 Recommendations Summary

### Immediate (Before Next Deploy)

1. **ROTATE ALL SECRETS** in .env - they're compromised
2. Move secrets to Vercel environment variables
3. Fix CORS to use whitelist on all endpoints
4. Implement proper $PHOS payment verification

### This Week

5. Switch to Upstash Redis for rate limiting
6. Add transaction locking to prevent replay attacks
7. Fail closed on X verification when API unavailable
8. Add CSRF tokens to state-changing endpoints

### This Month

9. Implement wallet signature verification
10. Add 2FA for admin authentication
11. Set up security monitoring/alerting
12. Conduct penetration testing

---

## Positive Security Practices ✅

Despite the issues, the codebase shows good security awareness:

- ✅ Input sanitization functions in `security.js`
- ✅ Constant-time password comparison in admin auth
- ✅ Wallet address validation with checksum
- ✅ Transaction hash format validation
- ✅ Audit logging for sensitive actions
- ✅ Body size limits (concept, needs proper implementation)
- ✅ Rate limiting (concept, needs proper implementation)
- ✅ Origin whitelist for CORS (exists, just not used everywhere)

---

## Appendix: Files Reviewed

| File | Lines | Security Focus |
|------|-------|----------------|
| `api/buy.js` | 290 | Payment verification, CORS |
| `api/submit.js` | 240 | API key auth, input validation |
| `api/comments.js` | 160 | Agent verification, sanitization |
| `api/auth/admin.js` | 107 | Authentication, sessions |
| `api/agents/register.js` | 340 | Registration, wallet creation |
| `api/agents/verify.js` | 170 | X verification |
| `api/agents/me.js` | 120 | Profile access |
| `api/agents/wallet.js` | 145 | Wallet creation |
| `api/heartbeat.js` | 260 | Agent authentication |
| `api/activity.js` | 170 | Public data access |
| `api/burn.js` | 165 | Admin-only actions |
| `api/license.js` | 340 | Payment verification |
| `api/bounties.js` | 180 | Internal API auth |
| `api/_lib/security.js` | 250 | Security utilities |
| `api/_lib/rate-limit.js` | 70 | Rate limiting |
| `api/_lib/payment-verify.js` | 145 | On-chain verification |
| `api/_lib/supabase.js` | 130 | Database access |
| `api/_lib/funder.js` | 190 | Wallet funding |
| `api/_lib/bounties.js` | 280 | Bounty system |
| `.env` | 47 | Secrets |
| `.gitignore` | 47 | File exclusions |

---

*Report generated by OpenClaw Security Audit*  
*For questions, contact the project maintainer*
