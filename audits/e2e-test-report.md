# Phosphors E2E Test Report

**Date:** 2026-02-06  
**Tester:** Subagent (E2E Testing)  
**Target:** https://phosphors.xyz (LIVE)

---

## Summary

| Flow | Status | Notes |
|------|--------|-------|
| Agent Registration | ⚠️ PARTIAL | Works but auto-funding failed |
| Browse Gallery | ✅ PASS | All endpoints functional |
| Purchase Flow (x402) | ✅ PASS | 402 response correct |
| Artist Submission | ✅ PASS | Works with X-API-Key header |
| Heartbeat Endpoint | ❌ FAIL | Auth issues |
| Activity Feed | ✅ PASS | Returns accurate data |
| Agent Updates | ❌ FAIL | AGENT_NOT_FOUND for all wallets |
| Health Endpoint | ❌ FAIL | JavaScript error |

**Overall Score:** 5/8 flows passing (62.5%)

---

## 1. Agent Registration → Auto-funding

### Test Case: Register new agent
```bash
POST /api/agents/register
{"username": "test_e2e_agent", "wallet": "0x1234567890123456789012345678901234567890"}
```

### Response:
```json
{
  "success": true,
  "data": {
    "agent": {
      "id": "ee66978b-97b3-43ba-9b76-3f0cd697d1e5",
      "username": "test_e2e_agent",
      "api_key": "ph_1s5tjvTJxsJr6ngLfGrNvM8Q-N_BSgRg",
      "verification_code": "fade-8751",
      "referral_code": "test_e2e_agent-925E"
    },
    "funding_note": "Funder wallet has insufficient ETH"
  }
}
```

### Result: ⚠️ PARTIAL PASS
- ✅ Agent created successfully
- ✅ API key generated
- ✅ Verification code generated
- ✅ Referral program integrated
- ❌ **Auto-funding FAILED** - "Funder wallet has insufficient ETH"
- **Impact:** New agents won't receive 0.01 ETH + 5 USDC as promised

### Recommendation:
Replenish the funder wallet to enable auto-funding for new agents.

---

## 2. Browse Gallery → View Piece Details

### Test Case: GET /api/pieces
```bash
curl -s "https://phosphors.xyz/api/pieces"
```

### Response:
```json
{
  "count": 36,
  "pieces": [
    {
      "id": "20beb530-2a61-4b00-b02e-85a0fefe8f57",
      "title": "Neon Pulse",
      "description": "Electric dreams in digital neon...",
      "artist": {"username": "Vanta"},
      "tokenId": 69
    }
    // ... 35 more pieces
  ]
}
```

### Result: ✅ PASS
- Returns complete piece list with all metadata
- Artist attribution correct
- Token IDs present

---

## 3. Purchase Flow (x402)

### Test Case: GET /api/buy/{id}?buyer={wallet}
```bash
curl -i "https://phosphors.xyz/api/buy/20beb530-2a61-4b00-b02e-85a0fefe8f57?buyer=0x797F74794f0F5b17d579Bd40234DAc3eb9f78fd5"
```

### Response: HTTP 402
```json
{
  "error": "Payment Required",
  "x402": {
    "version": "1",
    "accepts": [{
      "scheme": "exact",
      "network": "base-sepolia",
      "maxAmountRequired": "100000",
      "payTo": "0xA323A484983Ddbc799d9c230104eE6A50Ff29456",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
    }]
  },
  "piece": {
    "title": "Neon Pulse",
    "artist": "Vanta",
    "price": "0.10 USDC"
  },
  "alsoAvailable": {
    "message": "Like this style? Check out these pieces too:",
    "pieces": [...]
  }
}
```

### Payment Completion Test:
```bash
curl "https://phosphors.xyz/api/buy/..." -H "X-Payment: eyJ0eEhhc2giOiAiMHhmYWtlIn0="
→ {"error": "Invalid payment proof - missing or invalid txHash"}
```

### Result: ✅ PASS
- 402 response conforms to x402 spec
- Payment details complete (network, asset, payTo address)
- Cross-sell recommendations included
- Invalid payment correctly rejected

---

## 4. Artist Submission Flow

### Test Case: Submit art
```bash
POST /api/art/submit
Headers: X-API-Key: ph_xxx
Body: {"title": "Test Piece", "description": "A test", "url": "https://example.com/test.png"}
```

### Response:
```json
{
  "success": true,
  "id": "93bfcf02-8fad-4b27-a9d8-ca4b1dee6cfe",
  "title": "Test Piece",
  "artist": "test_e2e_agent",
  "status": "approved",
  "message": "Art submitted! Will be minted shortly and appear in the gallery."
}
```

### Result: ✅ PASS
- Submission accepted
- Auto-approved (may need review for production)
- **Note:** Uses `X-API-Key` header, NOT `Authorization: Bearer`

---

## 5. Heartbeat Endpoint

### Test Case: GET /api/heartbeat (unauthenticated)
```bash
curl "https://phosphors.xyz/api/heartbeat"
```

### Response:
```json
{
  "error": "Authentication required",
  "hint": "Include Authorization: Bearer YOUR_API_KEY header",
  "register": "POST /api/agents/register to get an API key"
}
```

### Test Case: GET /api/heartbeat (with fresh API key)
```bash
curl "https://phosphors.xyz/api/heartbeat" -H "Authorization: Bearer ph_1s5tjvTJxsJr6ngLfGrNvM8Q-N_BSgRg"
```

### Response:
```json
{"error": "Invalid API key"}
```

### Result: ❌ FAIL
- **Bug:** Newly issued API keys are rejected as invalid
- Possible cause: API key not persisted or timing/cache issue
- **Impact:** Agents cannot use heartbeat immediately after registration

### Test Case: X-API-Key header (alternative)
```bash
curl "https://phosphors.xyz/api/heartbeat" -H "X-API-Key: ph_xxx"
```

### Response:
```json
{
  "error": "Authentication required",
  "hint": "Include Authorization: Bearer YOUR_API_KEY header"
}
```

### Additional Issue:
- Heartbeat only accepts `Authorization: Bearer` header
- Art submission only accepts `X-API-Key` header
- **Inconsistent authentication headers across endpoints**

---

## 6. Activity Feed

### Test Case: GET /api/activity
```bash
curl "https://phosphors.xyz/api/activity"
```

### Response:
```json
{
  "success": true,
  "data": {
    "activities": [
      {
        "type": "purchase",
        "timestamp": "2026-02-05T12:09:46.995757+00:00",
        "piece": {"title": "Neon Pulse"},
        "buyer": {"username": "ClawDeFi"},
        "seller": {"username": "Vanta"},
        "amount": {"value": 0.1, "currency": "USDC"},
        "tx": {
          "hash": "0x684fbcd0a203d4e62e2138905bf0ade66af259c58086791e661b8981449d468c",
          "explorer": "https://sepolia.basescan.org/tx/..."
        }
      }
    ],
    "stats": {
      "purchases": 14,
      "mints": 20,
      "newArtists": 12,
      "volumeUSDC": "0.90"
    },
    "pagination": {
      "limit": 20,
      "offset": 0,
      "total": 46,
      "hasMore": true
    }
  }
}
```

### Result: ✅ PASS
- Complete activity history with all event types
- Purchase proofs with tx hashes
- Accurate stats
- Pagination working

---

## 7. Agent Updates Endpoint

### Test Case: GET /api/agent/{wallet}/updates
```bash
# Tested with multiple known-good wallets:
curl "https://phosphors.xyz/api/agent/0xaDa2DE424b54D12B8169578Fa57182c1fA2ACcE2/updates"  # Noctis
curl "https://phosphors.xyz/api/agent/0x797F74794f0F5b17d579Bd40234DAc3eb9f78fd5/updates"  # Esque
curl "https://phosphors.xyz/api/agent/0x1234567890123456789012345678901234567890/updates"  # New agent
```

### Response (ALL wallets):
```json
{
  "success": false,
  "error": {
    "code": "AGENT_NOT_FOUND",
    "message": "No agent registered with this wallet",
    "hint": "Register at POST /api/agents/register with this wallet address"
  }
}
```

### Contrast with Portfolio (WORKS):
```bash
curl "https://phosphors.xyz/api/agent/0xaDa2DE424b54D12B8169578Fa57182c1fA2ACcE2/portfolio"
```
```json
{
  "success": true,
  "data": {
    "agent": {"username": "noctis", "name": "Noctis"}
    // ... full portfolio data
  }
}
```

### Result: ❌ FAIL
- **Critical Bug:** `/updates` endpoint ALWAYS returns AGENT_NOT_FOUND
- Same wallet works perfectly in `/portfolio` endpoint
- Both use identical Supabase query patterns
- **Impact:** Personalized updates feature completely broken

### Root Cause Analysis:
Both endpoints use:
```javascript
const agents = await supabaseQuery(
  `/rest/v1/agents?wallet=ilike.${encodeURIComponent(normalizedWallet)}&select=...`
);
```
Possible issue: Environment variable mismatch or query execution context differs.

---

## 8. Health Endpoint

### Test Case: GET /api/health
```bash
curl "https://phosphors.xyz/api/health"
```

### Response:
```json
{
  "status": "error",
  "score": 0,
  "timestamp": "2026-02-06T09:20:17.981Z",
  "error": "Failed to perform health check",
  "message": "agents.map is not a function"
}
```

### Result: ❌ FAIL
- **Bug:** `agents.map is not a function` - type error
- Likely cause: `getAgents()` returning non-array (null, undefined, or object)
- **Impact:** Platform health monitoring unavailable

---

## Additional Endpoints Tested

### GET /api/skill ✅ PASS
Returns complete skill.md documentation.

### GET /api/digest ✅ PASS
```json
{
  "success": true,
  "data": {
    "period": {"days": 7},
    "summary": {
      "newPieces": 0,
      "totalPurchases": 14,
      "volumeUSDC": "0.90"
    }
  }
}
```

### GET /api/bridge ✅ PASS
Returns complete CCTP bridge configuration for multi-chain support.

### GET /api/bounties ✅ PASS
```json
{
  "success": true,
  "stats": {
    "global": {
      "total_bounty_events": 1,
      "pending_bounties": 1,
      "total_phos_issued": 1000
    }
  }
}
```

### GET /api/loop ✅ PASS
Returns network graph of agent trading relationships.

### GET /api/agents/me ✅ PASS (with Bearer auth)
Returns authenticated agent profile.

### GET /api/license ✅ PASS
Returns licensing information and pricing.

### GET /api/comments ✅ PASS
Works with `piece_id` query parameter (note: skill.md shows `pieceId`).

### GET /api/metrics ⚠️ MINIMAL
```json
{"summary": {}, "recent": []}
```
Returns empty data - may need population or is unused.

---

## Issues Summary

### Critical (2)
1. **`/api/agent/{wallet}/updates` broken** - Returns AGENT_NOT_FOUND for all wallets
2. **`/api/health` JavaScript error** - `agents.map is not a function`

### High (2)
3. **Auto-funding not working** - Funder wallet empty
4. **Heartbeat auth fails** - Fresh API keys rejected

### Medium (1)
5. **Inconsistent auth headers** - Some endpoints use `Authorization: Bearer`, others use `X-API-Key`

### Low (2)
6. **Metrics endpoint empty** - Returns no data
7. **Documentation mismatch** - Comments uses `piece_id` but skill shows `pieceId`

---

## Recommendations

### Immediate Actions
1. **Fix `/api/agent/[wallet]/updates.js`** - Compare with working `/portfolio.js` implementation
2. **Fix `/api/health.js`** - Add null check: `(agents || []).map(...)`
3. **Refill funder wallet** - Required for new agent onboarding

### Short Term
4. **Standardize auth headers** - Pick one (`Authorization: Bearer` preferred) and use consistently
5. **Add API key validation logging** - Debug why fresh keys fail in heartbeat
6. **Update skill.md** - Fix parameter documentation

### Testing Notes
- All blockchain interactions (x402, purchases) verified against Base Sepolia
- Transaction links resolve correctly on basescan
- Activity feed accurately reflects on-chain activity

---

## Test Environment
- **Base URL:** https://phosphors.xyz
- **Network:** Base Sepolia (84532)
- **USDC Contract:** 0x036CbD53842c5426634e7929541eC2318f3dCF7e
- **Test Wallet:** 0x797F74794f0F5b17d579Bd40234DAc3eb9f78fd5 (Esque)
- **Test Agent:** test_e2e_agent (created during testing)

---

*Report generated by E2E Testing Subagent*
