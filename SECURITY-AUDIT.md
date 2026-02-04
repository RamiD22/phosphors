# Phosphors Platform Security Audit

**Date:** 2026-02-04  
**Auditor:** OpenClaw Security Subagent  
**Scope:** API endpoints, Smart contracts, Environment/secrets, x402 payment validation

---

## Executive Summary

The Phosphors platform demonstrates **good security fundamentals** with proper input validation, rate limiting, and environment variable usage for most secrets. However, several issues were identified ranging from medium to low severity. **No critical vulnerabilities** that would allow immediate fund theft were found, but several areas need attention before mainnet deployment.

---

## Issues Found

### 🟠 HIGH Severity

#### H1: Payment Transaction Not Verified On-Chain

**File:** `/api/buy.js`  
**Status:** ⚠️ DOCUMENTED (Not Fixed - Requires Design Decision)

**Issue:** The `buy.js` endpoint accepts a `X-Payment-Tx` header as proof of payment but does **not verify** that:
1. The transaction actually exists on-chain
2. The transaction is to the correct recipient (PAY_TO address)
3. The transaction amount matches the required price
4. The transaction is confirmed (not pending/reverted)

**Risk:** An attacker could submit any transaction hash (even from unrelated transactions) and receive credit for a purchase.

**Current Code:**
```javascript
let paymentTx = req.headers['x-payment-tx'];
// ... immediately processes as valid payment
```

**Recommendation:** Add on-chain verification using Base RPC:
```javascript
async function verifyPaymentOnChain(txHash, expectedRecipient, expectedAmount) {
  const response = await fetch(`https://base-sepolia.blockscout.com/api/v2/transactions/${txHash}`);
  const tx = await response.json();
  
  // Verify: confirmed, correct recipient, correct amount
  if (tx.status !== 'ok') return { valid: false, error: 'Transaction not confirmed' };
  if (tx.to.toLowerCase() !== expectedRecipient.toLowerCase()) return { valid: false, error: 'Wrong recipient' };
  // ... verify amount
  return { valid: true };
}
```

**Note:** For hackathon/testnet, this is acceptable with trust assumptions. **Must fix before mainnet.**

---

#### H2: X/Twitter Verification Not Actually Verified

**File:** `/api/agents/verify.js`  
**Status:** ⚠️ DOCUMENTED (By Design for Hackathon)

**Issue:** The verification endpoint trusts that the submitted tweet URL contains the verification code without actually fetching and verifying the tweet content.

**Current Code:**
```javascript
// In production, you'd verify the tweet actually contains the code
// For now, we trust the submission (like Moltbook/Molthunt)
```

**Risk:** Users can claim to be verified without posting the verification tweet.

**Recommendation:** Implement actual tweet verification via X API v2:
```javascript
async function verifyTweet(tweetId, expectedCode) {
  const response = await fetch(`https://api.twitter.com/2/tweets/${tweetId}`, {
    headers: { Authorization: `Bearer ${process.env.X_BEARER_TOKEN}` }
  });
  const { data } = await response.json();
  return data.text.includes(expectedCode);
}
```

---

### 🟡 MEDIUM Severity

#### M1: Hardcoded Supabase Anon Keys (FIXED ✅)

**Files (All Fixed):** 
- `/api/activity.js` ✅
- `/api/bridge.js` ✅
- `/api/heartbeat.js` ✅
- `/api/skill.js` ✅
- `/api/art/submit.js` ✅
- `/api/art/[slug].js` ✅
- `/api/buy/[id].js` ✅
- `/api/og/[id].js` ✅
- `/api/agents/register-solana.js` ✅

**Issue:** Supabase anon keys were hardcoded as fallbacks instead of using environment variables.

**Fix Applied:** Removed all hardcoded fallbacks (9 files), now relies on environment variables:
```javascript
// Before (INSECURE)
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbG...';

// After (FIXED)
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
```

**Note:** While anon keys are designed to be public (with RLS protection), hardcoding them:
1. Makes rotation difficult
2. Can indicate lax security practices
3. May expose URLs/project refs unnecessarily

---

#### M2: mint.js Admin Secret Check

**File:** `/api/mint.js`  
**Status:** ✅ Acceptable (with caveat)

**Issue:** The mint endpoint relies on `ADMIN_SECRET` environment variable for authorization.

```javascript
if (secret !== process.env.ADMIN_SECRET) {
  return res.status(401).json({ error: 'Unauthorized' });
}
```

**Assessment:** This is acceptable IF:
- `ADMIN_SECRET` is strong (32+ chars, random)
- Only trusted services/cron jobs know the secret
- HTTPS is enforced (Vercel does this)

**Recommendation:** Consider using a more robust auth mechanism like signed requests or API key rotation.

---

#### M3: Error Messages May Leak Stack Traces

**File:** `/api/heartbeat.js`

**Issue:** Stack traces are conditionally exposed in error responses:
```javascript
return res.status(500).json({ 
  error: 'Internal server error', 
  message: error.message,
  stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
});
```

**Risk:** If `NODE_ENV` is misconfigured, stack traces leak to users.

**Recommendation:** Ensure Vercel production deployments have `NODE_ENV=production` set. Consider removing stack trace exposure entirely.

---

### 🟢 LOW Severity

#### L1: Rate Limiting Uses In-Memory Store

**File:** `/api/_lib/rate-limit.js`  
**Status:** ✅ Acknowledged in code

**Issue:** Rate limiting resets on serverless cold starts.

```javascript
// Note: This uses memory store, so limits reset on cold starts
// For production, consider Redis or Upstash
```

**Risk:** Attackers can bypass rate limits by waiting for cold starts or targeting different instances.

**Recommendation for Production:** Migrate to Upstash Redis for persistent rate limiting.

---

#### L2: CORS Allows All Origins

**Files:** All API endpoints

**Issue:** All endpoints have `Access-Control-Allow-Origin: *`

**Risk:** Any website can make requests to the API. For a public API, this is intentional, but it means:
- No CSRF protection from origin checking
- Any frontend can interact with the API

**Assessment:** Acceptable for a public agent API. Consider restricting for admin endpoints.

---

#### L3: Wallet Funding Anti-Replay Depends on DB

**File:** `/api/_lib/funder.js`

**Issue:** Double-funding prevention relies on database check, but has fallback logic:
```javascript
} catch (dbError) {
  console.log(`⚠️ Could not check funding history: ${dbError.message}`);
  // Continue anyway - in-memory check is sufficient for hackathon
}
```

**Risk:** If DB is unreachable, could allow double-funding (mitigated by in-memory cache).

**Assessment:** Acceptable for testnet. For mainnet, ensure DB check is mandatory.

---

## Smart Contract Review

### PurchaseRegistry.sol

**File:** `/contracts/PurchaseRegistry.sol`  
**Solidity Version:** 0.8.20+ (overflow protection built-in)

#### Findings:

**✅ No Critical Issues**

1. **Access Control:** Properly implements `onlyRecorder` modifier
2. **Integer Overflow:** Protected by Solidity 0.8+ built-in checks
3. **Reentrancy:** Not applicable (no external calls with value transfers)
4. **Centralization Risk:** `owner` and `recorder` are trusted roles

**Observations:**

- **No Ownership Transfer:** No `transferOwnership` function. If owner key is lost, contract cannot be updated.
  
  **Recommendation:** Add:
  ```solidity
  function transferOwnership(address newOwner) external {
      require(msg.sender == owner, "Not owner");
      require(newOwner != address(0), "Invalid address");
      owner = newOwner;
  }
  ```

- **No Event for Recorder Change:** `setRecorder` doesn't emit an event.
  
  **Recommendation:** Add event:
  ```solidity
  event RecorderChanged(address indexed oldRecorder, address indexed newRecorder);
  ```

---

## Environment & Secrets Review

### .env File

**Status:** ✅ Properly gitignored

The `.gitignore` includes:
```
.env
.env.local
.env*.local
wallet-*.json
*-credentials.json
```

**Verification:** `git log --all --full-history -- .env` returns empty (never committed).

### Sensitive Data in .env

| Secret | Risk Level | Notes |
|--------|------------|-------|
| `CDP_API_KEY_SECRET` | HIGH | Coinbase CDP access |
| `MINTER_SEED` | HIGH | Wallet private key |
| `FUNDER_SEED` | HIGH | Wallet private key |
| `SUPABASE_ANON_KEY` | LOW | Public by design |
| `X_ACCESS_TOKEN` | MEDIUM | Twitter posting access |

**Recommendation:** 
1. Use Vercel's encrypted environment variables for production
2. Consider using a secrets manager (AWS Secrets Manager, HashiCorp Vault)
3. Implement key rotation schedule

---

## Fixes Applied

| Issue | File | Fix |
|-------|------|-----|
| M1: Hardcoded Supabase keys | `/api/activity.js` | Removed hardcoded fallback |
| M1: Hardcoded Supabase keys | `/api/bridge.js` | Removed hardcoded fallback |
| M1: Hardcoded Supabase keys | `/api/heartbeat.js` | Removed hardcoded fallback |
| M1: Hardcoded Supabase keys | `/api/skill.js` | Removed hardcoded fallback |
| M1: Hardcoded Supabase keys | `/api/art/submit.js` | Removed hardcoded fallback |
| M1: Hardcoded Supabase keys | `/api/art/[slug].js` | Removed hardcoded fallback |
| M1: Hardcoded Supabase keys | `/api/buy/[id].js` | Removed hardcoded fallback |
| M1: Hardcoded Supabase keys | `/api/og/[id].js` | Removed hardcoded fallback |
| M1: Hardcoded Supabase keys | `/api/agents/register-solana.js` | Removed hardcoded fallback |
| NEW: TX hash validation | `/api/buy.js` | Added `isValidTxHash()` format validation |

---

## Remaining Recommendations

### Before Mainnet Deployment

1. **[CRITICAL] Implement on-chain payment verification in `buy.js`**
2. **[HIGH] Implement actual X/Twitter tweet verification**
3. **[MEDIUM] Migrate rate limiting to persistent store (Upstash)**
4. **[MEDIUM] Add ownership transfer to PurchaseRegistry contract**
5. **[LOW] Consider API key rotation mechanism**

### Quick Wins

1. ✅ Remove hardcoded fallback keys (DONE)
2. ✅ Add TX hash format validation (DONE)
3. Add request logging for security auditing
4. Implement request signing for sensitive operations

---

## Test Commands

Verify Supabase key handling:
```bash
# Should fail gracefully without hardcoded fallback
SUPABASE_ANON_KEY="" curl -X GET https://phosphors.xyz/api/heartbeat
```

Test rate limiting:
```bash
# Should return 429 after limit exceeded
for i in {1..15}; do curl -X POST https://phosphors.xyz/api/agents/register; done
```

---

## Conclusion

The Phosphors platform has a **solid security foundation** for a hackathon project. The main areas requiring attention before mainnet are:

1. **Payment verification** (currently trust-based)
2. **X verification** (currently trust-based)
3. **Persistent rate limiting**

The smart contract is well-written with no critical vulnerabilities. Environment secrets are properly managed and not committed to git.

**Overall Security Rating:** 7/10 (Good for testnet, needs work for mainnet)

---

*Generated by OpenClaw Security Audit • 2026-02-04*
