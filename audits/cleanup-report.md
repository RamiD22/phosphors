# 🧹 Phosphors Code Cleanup Report

**Generated:** 2025-02-06
**Auditor:** Esque (subagent)

---

## 📊 Summary

| Category | Count | Priority |
|----------|-------|----------|
| 🔴 Security Issues (Hardcoded Secrets) | 14 files | CRITICAL |
| 🟡 Dead/Duplicate Code | 15+ files | HIGH |
| 🟠 Refactoring Opportunities | 8 items | MEDIUM |
| 🔵 Documentation Gaps | 5 items | LOW |
| ⚪ Console.logs to Review | 40+ instances | LOW |
| 📝 TODO/FIXME Comments | 3 active | LOW |

---

## 🔴 CRITICAL: Security Issues

### Hardcoded Credentials (MUST FIX BEFORE MAINNET)

These files contain hardcoded Supabase keys or database credentials:

| File | Issue | Line |
|------|-------|------|
| `apply-migration-direct.mjs` | **DATABASE PASSWORD EXPOSED** | L6 |
| `apply-migration.mjs` | Hardcoded SERVICE_ROLE key | L6, L56-57 |
| `test-referral-migration.mjs` | Hardcoded SERVICE_ROLE key | L5 |
| `mint-approved.js` | Hardcoded anon key fallback | L16 |
| `fix-museum-agents.mjs` | Hardcoded anon key fallback | L11 |
| `add-remaining-agents.js` | Hardcoded anon key (no fallback) | L8 |
| `create-artist-wallets.js` | Hardcoded anon key | L11 |
| `create-missing-agents.mjs` | Hardcoded anon key fallback | L12 |
| `audit-data-integrity.mjs` | Hardcoded anon key | L8 |
| `tests/security-tests.mjs` | Hardcoded anon key | L19 |
| `scripts/fix-missing-pages.mjs` | Hardcoded anon key fallback | L22 |
| `site/js/love.js` | Hardcoded anon key (client-side) | L3 |
| `site/api/_lib/page-generator.js` | Hardcoded anon key | L17 |
| `api/_lib/page-generator.js` | Hardcoded anon key | L17 |

**Recommendation:** Move ALL secrets to environment variables. Delete or rotate any committed credentials.

---

## 🟡 Dead/Duplicate Code

### A. Duplicate API Directories (HIGH PRIORITY)

**Issue:** Both `/api/` and `/site/api/` exist with overlapping but diverging code.

```
api/                  site/api/
├── activity.js       ├── activity.js     ← DIFFERENT (api/ is newer)
├── buy.js            ├── buy.js          ← DIFFERENT  
├── loop.js           ├── (missing)
├── collector/        ├── (missing)
└── _lib/*            └── _lib/*          ← IDENTICAL
```

**Files that differ:**
- `activity.js` - `/api/` has submission URLs for iframes; `/site/api/` doesn't
- `buy.js` - Minor differences

**Files identical (duplicates):**
- All files in `_lib/` are byte-for-byte identical

**Recommendation:** 
- Consolidate to single source of truth
- `vercel.json` at root already points to `site/` as outputDirectory
- Keep `/site/api/`, delete `/api/` after merging any newer changes

### B. Duplicate Root-Level Scripts

| Keep | Delete | Reason |
|------|--------|--------|
| `send-usdc.mjs` | `send-usdc.js` | Identical logic, mjs is ES module |
| `x402-server.js` | `x402-test/server.js` | Root version has mainnet config |
| `x402-client.js` | `x402-test/client.js` | Minor path differences only |

### C. One-Time Setup Scripts (Safe to Archive)

These appear to be one-time migration/setup scripts that ran successfully:

```
add-dummy-data.js          # Test data seeding
add-remaining-agents.js    # One-time agent creation
add-velvet.js              # Single agent setup
create-artist-wallets.js   # Initial wallet creation
create-funder-wallet.js    # Already ran (wallet exists)
create-missing-agents.mjs  # One-time fix
create-test-agents.js      # Test setup
fix-museum-agents.mjs      # One-time fix
fund-funder-wallet.js      # Initial funding (already done)
```

**Recommendation:** Move to `scripts/archive/` or delete.

### D. Duplicate Vercel Configs

- `vercel.json` (root) - Has `outputDirectory: "site"` 
- `site/vercel.json` - Has function configs and detailed headers

**Recommendation:** Merge into single root `vercel.json`.

### E. Duplicate Skill Files

- `skill.md` (root) - version 3.0.0
- `site/skill.md` - version 3.1.0 (newer)

**Recommendation:** Keep `site/skill.md`, delete root one or symlink.

---

## 🟠 Refactoring Opportunities

### 1. Hardcoded Network Configuration

**Pattern found in 15+ files:**
```javascript
const NETWORK_ID = 'base-sepolia';
const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
```

**Recommendation:** Create `/api/_lib/config.js`:
```javascript
export const NETWORK = process.env.NETWORK_ID || 'base-sepolia';
export const USDC_ADDRESS = NETWORK === 'base-mainnet' 
  ? '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
  : '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
```

### 2. Supabase URL Hardcoding

**Found in:** 20+ files
**Value:** `https://afcnnalweuwgauzijefs.supabase.co`

**Already fixed in:** `api/_lib/supabase.js` (centralized module)
**Still hardcoded in:** Root scripts, tests, migration scripts

**Recommendation:** Import from `_lib/supabase.js` everywhere.

### 3. Duplicate Balance Check Scripts

| Script | Purpose |
|--------|---------|
| `check-balance.mjs` | Check single wallet |
| `check-balances.js` | Check multiple wallets |
| `check-all-wallets.js` | Check all wallet-*.json |
| `check-all.mjs` | Similar to above |

**Recommendation:** Consolidate into single `scripts/check-wallets.mjs`.

### 4. Multiple Deploy Scripts

```
deploy-registry.mjs
deploy-registry-cdp.mjs  
deploy-registry-v2.mjs
```

**Recommendation:** Keep `deploy-registry-v2.mjs` (latest), archive others.

### 5. Migration Scripts

```
apply-migration.mjs
apply-migration-direct.mjs
test-referral-migration.mjs
```

**Recommendation:** Use Supabase CLI for migrations instead of custom scripts.

---

## 🔵 Documentation Gaps

### 1. README.md Accuracy Issues

| Section | Issue |
|---------|-------|
| Stats | Says "27 artworks" - needs dynamic/updated count |
| Contract addresses | Correct but should link to verified contracts |
| Environment variables | Missing `SUPABASE_SERVICE_KEY` which is required |
| Quick Start | Works but could mention rate limiting |

### 2. Missing Documentation

- No CONTRIBUTING.md
- No API documentation beyond skill.md
- `docs/` folder exists but only has 3 files
- No deployment guide
- No architecture diagram

### 3. Outdated Markdown Files

Consider archiving or updating:
- `BATTLE-TEST-REPORT.md` - Hackathon artifact
- `COMMENTS-FEATURE.md` - Feature complete
- `EFFICIENCY-REPORT.md` - Hackathon artifact
- `hackathon-submission.md` - Hackathon artifact
- `amplification-platforms.md` - Marketing notes

**Recommendation:** Move hackathon artifacts to `/docs/hackathon/`.

---

## 📝 TODO/FIXME Comments

### Active TODOs in Production Code

| File | Line | Comment |
|------|------|---------|
| `api/heartbeat.js` | 299 | `created: 0, // TODO: count submissions by this agent` |
| `api/license.js` | 134 | `// TODO: Implement actual on-chain verification` |
| `site/api/heartbeat.js` | 299 | Same as above (duplicate) |
| `site/api/license.js` | 134 | Same as above (duplicate) |

### TODO.md Status Check

From `TODO.md`:
- ✅ Rate limiting added
- ✅ Better error messages (mostly)
- ❌ Purchases table for dynamic feed - INCOMPLETE
- ❌ X API integration - NOT STARTED
- ❌ Tests - PARTIALLY DONE (tests/ folder exists)

---

## ⚪ Console.logs to Review

### Production APIs (Should Remove)

Most console.logs are in CLI scripts (appropriate), but check:

```
api/_lib/supabase.js:9   - console.warn for missing key (OK to keep)
api/_lib/supabase.js:155 - console.error for funding log (OK to keep)
```

### CLI Scripts (OK to Keep)

The 40+ console.logs in root `.js` and `.mjs` files are in CLI scripts for local use. These are appropriate.

---

## 🗂️ Recommended File Organization

### Current Structure (Messy)
```
phosphors/
├── 42 root-level .js/.mjs scripts
├── api/            ← DUPLICATE
├── site/
│   └── api/        ← CANONICAL
├── scripts/        ← Good location
├── tests/          ← Good location
└── migrations/     ← Good location
```

### Proposed Structure (Clean)
```
phosphors/
├── site/                  # Frontend + API (Vercel deployment)
│   ├── api/               # Serverless functions
│   └── ...
├── scripts/               # All utility scripts
│   ├── wallet/            # Wallet management
│   ├── deploy/            # Contract deployment
│   ├── data/              # Data migrations/seeding
│   └── archive/           # One-time scripts (ran)
├── tests/                 # Test suite
├── contracts/             # Solidity contracts
├── migrations/            # SQL migrations
├── docs/                  # Documentation
│   ├── hackathon/         # Archived hackathon docs
│   └── api/               # API documentation
└── README.md
```

---

## ✅ Quick Wins (Do First)

1. **Delete duplicate `/api/` directory** after merging `activity.js` and `buy.js` changes into `site/api/`
2. **Remove hardcoded credentials** from `apply-migration-direct.mjs` (has DB password!)
3. **Delete `send-usdc.js`** (keep `.mjs` version)
4. **Delete `x402-test/`** (keep root versions)
5. **Move root `skill.md`** → symlink to `site/skill.md`
6. **Merge `vercel.json` files**

## 🔧 Medium Effort Refactors

1. **Create `/scripts/lib/config.js`** with network/USDC constants
2. **Consolidate balance check scripts** into one
3. **Move one-time scripts** to `scripts/archive/`
4. **Update all files** to use `api/_lib/supabase.js` 
5. **Add `.env.example`** documenting all required vars

## 📚 Larger Improvements

1. **Add proper test coverage** (currently tests/ exists but incomplete)
2. **Set up Supabase CLI** for migrations
3. **Add API documentation** (OpenAPI/Swagger)
4. **Add CONTRIBUTING.md**
5. **Implement the TODOs** in heartbeat.js and license.js

---

## Files Safe to Delete

```
# Duplicates
api/                              # After merging into site/api/
send-usdc.js                      # Use .mjs version
x402-test/                        # Use root x402-*.js

# One-time scripts (already ran)
add-dummy-data.js
add-remaining-agents.js
add-velvet.js
create-funder-wallet.js
create-missing-agents.mjs
create-test-agents.js
fix-museum-agents.mjs

# Older versions
deploy-registry.mjs               # Use v2
deploy-registry-cdp.mjs           # Experimental

# Should not be in repo (security)
apply-migration-direct.mjs        # Contains DB password!
apply-migration.mjs               # Contains service key!
test-referral-migration.mjs       # Contains service key!
```

---

**End of Report**
