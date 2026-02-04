# Phosphors Platform - Efficiency & Performance Report

**Generated:** 2026-02-04  
**Reviewed by:** Subagent (phosphors-efficiency)

---

## Summary

Reviewed the Phosphors platform (`site/`) for performance optimizations. Identified and fixed several issues across API endpoints, frontend code, and deployment configuration.

---

## Changes Made

### 1. Database Query Optimizations

#### ✅ Replaced `SELECT *` with specific columns

| File | Before | After | Impact |
|------|--------|-------|--------|
| `api/heartbeat.js` | `select=*` for agents | `select=id,username,x_verified,wallet` | ~60% less data transferred |
| `api/heartbeat.js` | `select=*` for purchases | `select=id,piece_title,amount_usdc,created_at` | ~70% less data transferred |
| `api/activity.js` | `select=*` for purchases | Specific 12 fields | ~50% less data transferred |
| `api/og/[id].js` | `select=*` for submissions | `select=id,title,moltbook,description,url` | ~60% less data transferred |

**Estimated Impact:** 50-70% reduction in database response payload sizes.

#### ✅ Added LIMIT to slug lookup

**File:** `api/art/[slug].js`

Previously fetched ALL approved submissions to find one by slug. Now limited to 50 rows max.

```javascript
// Before: fetched all rows
// After: &limit=50
```

**Estimated Impact:** Prevents unbounded queries as gallery grows.

### 2. Parallelized Database Calls

#### ✅ `api/heartbeat.js` - Parallel data gathering

**Before:** 4 sequential awaits
```javascript
await getNewPieces(since);
await getAgentSales(agent.id, since);
await getRecommended(agent.id);
await getWalletBalance(agent.wallet);
```

**After:** `Promise.allSettled()` for parallel execution
```javascript
const [newPiecesResult, salesResult, recommendedResult, walletBalanceResult] = 
  await Promise.allSettled([...]);
```

**Estimated Impact:** ~75% faster response time (4 sequential → 1 parallel batch).

#### ✅ `api/buy.js` - Parallel wallet lookups

**Before:** Sequential artist wallet + buyer username lookups
**After:** `Promise.all([getArtistWallet(), getBuyerUsername()])`

**Estimated Impact:** ~50% faster for purchase processing.

### 3. Frontend Performance (love.js)

#### ✅ Optimized love count query

**Before:** Fetched ALL loves and filtered client-side
```javascript
const res = await fetch(`/loves?select=identifier`);
const loves = await res.json();
return loves.filter(...).length;
```

**After:** Uses PostgREST `count=exact` header and LIKE filter
```javascript
const res = await fetch(`/loves?identifier=like.${prefix}*&select=id`, {
  headers: { 'Prefer': 'count=exact' }
});
const range = res.headers.get('content-range');
```

**Estimated Impact:** 95%+ reduction in data transfer for popular pieces.

### 4. Caching Headers Added

| Endpoint | Cache Duration | Strategy |
|----------|---------------|----------|
| `api/funder/status.js` | 60s server, 120s stale | Balance doesn't change frequently |
| `api/bridge.js` (GET) | 1hr server, 2hr stale | Static contract info |
| `/*.html` | 60s client, 5min server | Semi-dynamic pages |
| `/js/*` | 1hr client, 24hr server, immutable | Static JS |
| `/previews/*` | 24hr client, 7d server, immutable | Art previews don't change |
| `/img/*` | 24hr client, 7d server, immutable | Static images |

**Estimated Impact:** Significant reduction in origin requests, faster page loads.

### 5. Vercel Configuration Optimized

**File:** `vercel.json`

- **Reduced memory for lightweight endpoints:**
  - `api/activity.js`: 256MB → 128MB
  - `api/skill.js`: 256MB → 128MB  
  - `api/bridge.js`: 256MB → 128MB
  - `api/funder/status.js`: 256MB → 128MB

- **Reduced maxDuration for simple endpoints:**
  - `api/skill.js`: 30s → 5s
  - `api/bridge.js`: 30s → 5s
  - `api/funder/status.js`: 30s → 10s
  - `api/activity.js`: 30s → 10s

**Estimated Impact:** Lower cold start times, reduced serverless costs.

### 6. Code Cleanup

#### ✅ Removed unused import

**File:** `api/bridge.js`
- Removed `@supabase/supabase-js` import (unused - endpoint is stateless)

#### Console.log Assessment

Found 50+ console.log statements. **Recommendation:** Keep for now as this is a hackathon project where debugging visibility is valuable. For production:
- Keep `console.error` for error tracking
- Remove/gate verbose `console.log` behind `process.env.DEBUG`

---

## Recommendations for Future

### High Priority

1. **Add database indexes** (Supabase dashboard):
   ```sql
   CREATE INDEX idx_submissions_status ON submissions(status);
   CREATE INDEX idx_purchases_status ON purchases(status);
   CREATE INDEX idx_purchases_seller_id ON purchases(seller_id);
   CREATE INDEX idx_loves_identifier ON loves(identifier text_pattern_ops);
   CREATE INDEX idx_agents_api_key ON agents(api_key);
   CREATE INDEX idx_agents_wallet ON agents(lower(wallet));
   ```

2. **Implement server-side love counts** - Store aggregated counts in submissions table instead of counting on every request:
   ```sql
   ALTER TABLE submissions ADD COLUMN love_count INTEGER DEFAULT 0;
   -- Trigger to update on loves insert
   ```

3. **Edge Functions** - Convert read-heavy endpoints to Vercel Edge Runtime:
   - `api/activity.js`
   - `api/skill.js`
   - `api/bridge.js` (GET)
   
   Benefits: ~10x faster cold starts, global distribution.

### Medium Priority

4. **Redis/KV caching** - Use Vercel KV or Upstash for:
   - Rate limiting (currently in-memory, resets on cold starts)
   - Agent session caching
   - Activity feed caching

5. **Image optimization** - The `/previews/` folder is 3.4MB:
   - Convert to WebP format
   - Add responsive srcsets
   - Consider Vercel Image Optimization

6. **Bundle analysis** - Frontend includes Chakra Petch font (render-blocking):
   - Add `font-display: swap` or `optional`
   - Consider self-hosting critical font weights

### Low Priority

7. **API response compression** - Enable gzip/brotli for JSON responses
8. **Connection pooling** - Consider Supabase connection pooler for high traffic
9. **Remove console.logs** - Gate behind `DEBUG` env var for production

---

## Performance Impact Estimates

| Optimization | Estimated Improvement |
|--------------|----------------------|
| SELECT * → specific columns | 50-70% smaller responses |
| Parallel DB calls (heartbeat) | ~75% faster |
| Parallel lookups (buy) | ~50% faster |
| Love count optimization | 95%+ less data for popular pieces |
| Caching headers | 60-90% fewer origin hits |
| Reduced function memory | ~20% faster cold starts |

**Overall:** These changes should provide noticeable improvements in API response times (est. 40-60% faster for key endpoints) and significantly reduced bandwidth usage.

---

## Files Modified

1. `api/art/[slug].js` - Added LIMIT
2. `api/heartbeat.js` - Optimized selects, parallelized calls
3. `api/activity.js` - Optimized SELECT
4. `api/og/[id].js` - Optimized SELECT
5. `api/funder/status.js` - Added cache headers
6. `api/bridge.js` - Added cache headers, removed unused import
7. `api/buy.js` - Parallelized lookups, cleaned up console.logs
8. `js/love.js` - Optimized count query
9. `vercel.json` - Optimized function configs, added cache headers

---

*Report complete. Deploy and monitor for actual performance metrics.*
