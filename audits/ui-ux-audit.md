# UI/UX Audit: Phosphors (phosphors.xyz)

**Auditor:** Subagent (phosphor-ui-audit)  
**Date:** 2026-02-06  
**Scope:** Gallery, Onboarding, Purchase UX, Mobile Responsiveness, Loading/Empty States

---

## Executive Summary

Phosphors has a **solid visual foundation** with thoughtful design system implementation. The dark liminal aesthetic is cohesive and the custom cursor/glow effects add personality. However, there are **several UX friction points** that could confuse users, particularly around the x402 purchase flow and onboarding clarity.

**Quick Stats:**
- Critical issues: 3
- Medium issues: 9
- Low issues: 11

---

## 1. Gallery Page (`site/gallery.html`)

### 🔴 CRITICAL

#### 1.1 Love Count Display Inconsistent with Detail Page
**Location:** `gallery.html` lines 195-205 (art-card template)  
**Issue:** Gallery cards show love counts fetched from Supabase, but the logic differs from the detail page. Gallery uses `piece.loves` directly while detail page (`love.js`) queries the `loves` table with identifier prefix matching.  
**Impact:** Love counts may not match between gallery card and detail view.  
**Fix:** Ensure gallery API returns aggregated love count from the same source:
```javascript
// In loadPieces(), ensure 'loves' is computed from the loves table
// OR add a view/column in Supabase that's authoritative
```

### 🟡 MEDIUM

#### 1.2 Iframe Preview Cropping Hack
**Location:** `gallery.html` lines 283-291
```css
.art-card__preview iframe {
  width: 150%;
  height: 150%;
  top: -120px;  /* Crop out navbar */
  left: -25%;
```
**Issue:** This hack to crop out artwork navbars is fragile—different artworks may have different header heights.  
**Impact:** Some previews may look incorrectly cropped.  
**Fix:** Consider rendering preview thumbnails server-side, or use a `?embed=true` query param that artworks can respect to hide their chrome.

#### 1.3 Staggered Animation Capped at 9 Cards
**Location:** `gallery.html` lines 234-242
```css
.art-card:nth-child(1) { animation-delay: 0.05s; }
/* ... through nth-child(9) */
```
**Issue:** Cards 10+ all animate with 0.45s delay (same as card 9), causing a visual "clump" effect.  
**Impact:** Initial load with many cards looks jarring.  
**Fix:** Use JavaScript to dynamically set `animation-delay` based on index:
```javascript
card.style.animationDelay = `${Math.min(index * 0.05, 0.5)}s`;
```
(Already done in `renderPieces()` at line 588 - but CSS still has hardcoded values that may conflict)

#### 1.4 Filter Bar Scroll Hide is Jarring
**Location:** `gallery.html` lines 651-674
**Issue:** Filter bar hides when scrolling down, shows when scrolling up. With no transition smoothing, this feels abrupt.  
**Impact:** Users may accidentally lose their filters from view.  
**Fix:** Add easing to the transform and consider keeping filters visible if user is actively filtering:
```css
.filters {
  transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), 
              opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
```

### 🟢 LOW

#### 1.5 No Pagination/Infinite Scroll
**Issue:** All pieces loaded at once via single API call.  
**Impact:** Performance will degrade as gallery grows.  
**Suggestion:** Implement pagination or virtual scrolling for 50+ items.

#### 1.6 Artist Filter Dropdown Layout Shift
**Location:** `gallery.html` line 527 (populateArtists)  
**Issue:** Dropdown populates after page load, causing potential layout shift.  
**Suggestion:** Add min-width or placeholder option count.

#### 1.7 Results Count Animation May Be Missed
**Location:** Lines 151-160, opacity transition from 0.  
**Suggestion:** Consider always showing count, just update the number.

---

## 2. Onboarding Flow (`site/get-started.html`)

### 🔴 CRITICAL

#### 2.1 Both Human Paths Lead to Same Destination
**Location:** `get-started.html` lines 297-310
```html
<!-- Human + Molthub -->
<div class="tab-content active" id="tab-human-molthub">
  <div class="instruction-box">
    <p>Read <a href="https://phosphors.xyz/skill.md">skill.md</a>...</p>
<!-- Human + Manual -->
<div class="tab-content" id="tab-human-manual">
  <div class="instruction-box">
    <p>Read <a href="https://phosphors.xyz/skill.md">skill.md</a>...</p>
```
**Issue:** Both "molthub" and "manual" tabs for humans show identical content—just "read skill.md".  
**Impact:** Tab UI suggests different paths exist, but they're the same. Confusing.  
**Fix:** Either differentiate the content (e.g., molthub = quick install, manual = step-by-step guide) or remove the secondary tabs for humans.

### 🟡 MEDIUM

#### 2.2 No Progress Indication or Success State
**Issue:** Page tells users to "read skill.md and follow instructions" but provides no:
- Progress steps/checklist
- What to expect after setup
- Success confirmation  
**Impact:** Users don't know if they completed setup correctly.  
**Fix:** Add a 3-step visual guide: 1) Read skill.md → 2) Set up wallet → 3) Submit first art

#### 2.3 Duplicate Script Inclusion
**Location:** `get-started.html` line 387
```html
<script src="/js/mega-menu.js"></script>
<script src="/js/mega-menu.js"></script>
```
**Issue:** mega-menu.js loaded twice.  
**Impact:** Minor performance hit, potential double-initialization bugs.  
**Fix:** Remove duplicate line.

#### 2.4 Page Subtitle Overpromises
**Location:** Line 197: `"Join the AI art marketplace in seconds."`  
**Issue:** Setup requires reading docs, installing molthub, creating wallet—definitely not "seconds".  
**Impact:** Sets wrong expectations.  
**Fix:** `"Get set up and start creating."`

### 🟢 LOW

#### 2.5 Mobile Tab Wrapping
**Issue:** On narrow screens, primary tabs may wrap awkwardly.  
**Suggestion:** Add `flex-wrap: nowrap; overflow-x: auto;` for horizontal scroll, or stack vertically on mobile.

---

## 3. Purchase UX (x402 Flow)

### 🔴 CRITICAL

#### 3.1 Price Mismatch Between Display and API
**Location:**  
- `site/gallery/hypnagogia.html` line 343: `<div class="price-tag">1.00 USDC</div>`  
- `site/api/buy.js` lines 43-44: `genesis: 0.10, platform: 0.05`

**Issue:** Detail page shows 1.00 USDC but API charges $0.05 for platform pieces.  
**Impact:** Users see wrong price—either they'll be pleasantly surprised or suspicious something is wrong.  
**Fix:** Gallery page generator needs to pull actual price from API or config, not hardcode.

### 🟡 MEDIUM

#### 3.2 "x402" is Opaque to End Users
**Location:** `gallery/hypnagogia.html` lines 345-352
```html
<button class="buy-btn">Collect via x402</button>
<div class="x402-badge">
  Instant USDC • 100% to artist
```
**Issue:** "x402" is a protocol name, not user-friendly. Most collectors won't know what this means.  
**Impact:** Confusion, reduced conversion.  
**Fix:** Replace with user-focused copy:
```html
<button class="buy-btn">Collect Now</button>
<div class="x402-badge">
  Pay with USDC • 100% to artist
```

#### 3.3 No Pre-Purchase Confirmation
**Issue:** Clicking "Collect via x402" immediately initiates purchase flow with no "Are you sure?" modal.  
**Impact:** Accidental clicks, no last chance to review.  
**Fix:** Add lightweight confirmation modal showing price, artwork, artist before opening payment window.

#### 3.4 Payment Window Opens in Popup, May Be Blocked
**Location:** `gallery/hypnagogia.html` lines 464-470
```javascript
window.open(paymentUrl, '_blank', 'width=500,height=700');
```
**Issue:** Popup blockers will prevent this. No fallback.  
**Impact:** Purchase fails silently for users with popup blockers.  
**Fix:** Detect popup block and show fallback link:
```javascript
const popup = window.open(...);
if (!popup || popup.closed) {
  // Show inline link to payment URL
  btnText.innerHTML = `<a href="${paymentUrl}" target="_blank">Click here to pay</a>`;
}
```

#### 3.5 30-Second Timeout with No Real Status
**Location:** Lines 473-478
```javascript
setTimeout(() => {
  btnText.textContent = 'Collect via x402';
  buyBtn.disabled = false;
}, 30000);
```
**Issue:** After 30 seconds, button just resets with no indication if payment succeeded or failed.  
**Impact:** User doesn't know what happened—did it work? Should they retry?  
**Fix:** Implement proper payment verification polling:
```javascript
// Poll /api/buy with pieceId to check if purchase completed
const pollInterval = setInterval(async () => {
  const status = await checkPurchaseStatus(pieceId);
  if (status.collected) {
    clearInterval(pollInterval);
    showSuccessState();
  }
}, 3000);
```

#### 3.6 Error Messages Auto-Dismiss Too Quickly
**Location:** Lines 480-486 (3-second timeout)  
**Issue:** Error shown for 3 seconds then button resets. User may not read it.  
**Fix:** Keep error visible until user takes action:
```javascript
buyBtn.onclick = () => {
  // Only reset on next click
  clearError();
  initiatePurchase();
};
```

### 🟢 LOW

#### 3.7 No Wallet Connection Shown
**Issue:** No indication of connected wallet or option to connect before purchase.  
**Suggestion:** Show "Connect Wallet" if no wallet detected, then "Collect Now" after.

---

## 4. Mobile Responsiveness

### 🟡 MEDIUM

#### 4.1 Conflicting Nav Display Rules
**Location:**  
- `mobile-nav.css` lines 131-138: `header nav { display: none !important; }`
- Various pages have inline nav styles

**Issue:** Multiple CSS rules fight over nav visibility on mobile. Some pages may show broken nav state.  
**Impact:** Inconsistent navigation UX across pages.  
**Fix:** Consolidate mobile nav rules into single authoritative stylesheet. Remove `!important` and use proper specificity.

#### 4.2 Submit Page Header Override
**Location:** `submit.html` lines 42-52 (inline header styles)  
**Issue:** Submit page has its own header/nav styles that may conflict with shared nav system.  
**Impact:** Different header behavior on submit page vs other pages.  
**Fix:** Use shared header component consistently.

### 🟢 LOW

#### 4.3 Gallery Cards Hover Disabled on Mobile
**Location:** `gallery.html` line 375: `.art-card:hover { transform: none; }`  
**Note:** This is actually CORRECT behavior—hover effects on touch are problematic. Good decision.

#### 4.4 Art Detail Page Actions Stack
**Location:** `gallery/hypnagogia.html` lines responsive section  
**Note:** Actions correctly switch to row layout on mobile. ✓

---

## 5. Loading States

### 🟢 GOOD

- **Gallery skeleton loaders:** Well-implemented with shimmer animation
- **Submit button loading:** Has spinner animation
- **Buy button loading:** Shows "Initiating..." text feedback

### 🟡 NEEDS IMPROVEMENT

#### 5.1 Comments Loading State is Weak
**Location:** `gallery/hypnagogia.html` line 324
```html
<p class="no-comments">Loading comments...</p>
```
**Issue:** Just text, no visual loading indicator. Could be mistaken for "no comments".  
**Fix:** Add spinner or skeleton:
```html
<div class="comments-loading">
  <div class="spinner"></div>
  <span>Loading comments...</span>
</div>
```

#### 5.2 Art Frame Has No Loading State
**Issue:** Iframe just shows blank while art loads.  
**Suggestion:** Add skeleton or loading overlay inside art-frame.

---

## 6. Empty States

### 🟢 WELL DONE

- **Gallery empty:** Icon + "Gallery is empty" + "Submit Art" CTA
- **Gallery no matches:** Icon + "No matches found" + "Clear filters" button
- **Comments empty:** "No comments yet" text (functional but basic)

### 🟡 SUGGESTIONS

#### 6.1 Comments Empty State Could Encourage Action
```html
<!-- Current -->
<p class="no-comments">No comments yet</p>

<!-- Suggested -->
<div class="no-comments">
  <p>No comments yet</p>
  <p class="hint">Be the first! Agents can comment via <code>POST /api/comments</code></p>
</div>
```

---

## 7. Additional Findings

### 7.1 Accessibility Issues (Low)
- Skip link exists ✓
- ARIA labels on buttons ✓
- **Missing:** Focus visible styles in some places
- **Missing:** Alt text on dynamically generated images

### 7.2 No Share Functionality
**Suggestion:** Add share buttons (Twitter, copy link) on art detail pages for social spread.

### 7.3 No Full-Screen Art View
**Suggestion:** Allow clicking art frame to expand to full viewport for immersive viewing.

### 7.4 Love Button Not on Gallery Cards
**Issue:** Gallery cards show love count but no button to love from gallery view—must visit detail page.  
**Suggestion:** Add heart icon button on card hover for quick love action.

---

## Summary & Priority Matrix

| Priority | Issue | Page | Effort |
|----------|-------|------|--------|
| 🔴 | Price mismatch display vs API | gallery/* | Low |
| 🔴 | Human tabs have same content | get-started | Low |
| 🔴 | Love count inconsistency | gallery | Medium |
| 🟡 | "x402" unclear to users | gallery/* | Low |
| 🟡 | No purchase confirmation | gallery/* | Medium |
| 🟡 | Popup may be blocked | gallery/* | Medium |
| 🟡 | Payment timeout no feedback | gallery/* | Medium |
| 🟡 | Duplicate mega-menu.js | get-started | Low |
| 🟡 | No onboarding progress | get-started | Medium |
| 🟡 | Filter scroll hide jarring | gallery | Low |
| 🟡 | Nav display conflicts | multiple | Medium |
| 🟡 | Comments loading state | gallery/* | Low |
| 🟢 | Staggered animation cap | gallery | Low |
| 🟢 | No pagination | gallery | High |
| 🟢 | No share buttons | gallery/* | Low |
| 🟢 | No full-screen art view | gallery/* | Medium |

---

## Recommended Next Steps

1. **Immediate (< 1 day):**
   - Fix price display to match API
   - Remove duplicate script tags
   - Clarify "x402" copy to user-friendly language

2. **Short-term (< 1 week):**
   - Add purchase confirmation modal
   - Implement proper payment status polling
   - Fix onboarding tab content or remove tabs
   - Add comments loading skeleton

3. **Medium-term (< 1 month):**
   - Add gallery pagination for scalability
   - Implement share functionality
   - Add full-screen art view
   - Consolidate mobile nav CSS

---

*Audit complete. Total issues found: 23 (3 critical, 9 medium, 11 low)*
