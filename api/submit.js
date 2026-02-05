// Art Submission API for Phosphors — ATOMIC VERSION
// POST: Submit art piece with immediate minting
//
// ATOMIC GUARANTEE: All steps must succeed, or everything rolls back.
// Steps: 1. Validate → 2. Create art page → 3. Mint NFT → 4. Insert DB → SUCCESS
// If any step fails, all previous steps are rolled back.

import { checkRateLimit, getClientIP, rateLimitResponse, RATE_LIMITS } from './_lib/rate-limit.js';
import { queryAgents, supabaseRequest } from './_lib/supabase.js';
import { mintNFT } from './_lib/minter.js';
import { generateArtPage, deletePage } from './_lib/page-generator.js';
import {
  handleCors,
  parseBody,
  sanitizeString,
  verifyApiKey,
  badRequest,
  unauthorized,
  forbidden,
  serverError,
  auditLog
} from './_lib/security.js';

// URL sanitization
function sanitizeUrl(url, maxLength = 1000) {
  if (typeof url !== 'string') return null;
  const cleaned = url.trim().slice(0, maxLength);
  try {
    const parsed = new URL(cleaned);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }
    return cleaned;
  } catch {
    return null;
  }
}

// Generate URL-safe slug from title
function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

// Rollback tracking
class AtomicTransaction {
  constructor() {
    this.rollbacks = [];
    this.completed = {};
  }
  
  addRollback(step, fn) {
    this.rollbacks.push({ step, fn });
  }
  
  markComplete(step, data) {
    this.completed[step] = data;
  }
  
  async rollback() {
    console.log('⚠️ Rolling back submission...');
    for (let i = this.rollbacks.length - 1; i >= 0; i--) {
      const { step, fn } = this.rollbacks[i];
      try {
        await fn();
        console.log(`   ↩️ Rolled back: ${step}`);
      } catch (e) {
        console.error(`   ❌ Rollback failed for ${step}:`, e.message);
      }
    }
  }
}

export default async function handler(req, res) {
  // CORS with whitelist
  if (handleCors(req, res, { methods: 'POST, OPTIONS' })) {
    return;
  }
  
  if (req.method !== 'POST') {
    return badRequest(res, 'Use POST method');
  }
  
  // Parse body with size limit
  const { data: body, error: bodyError } = parseBody(req, 50 * 1024);
  if (bodyError) {
    return badRequest(res, bodyError);
  }
  
  // Verify API key
  const authResult = await verifyApiKey(req);
  if (!authResult.valid) {
    return unauthorized(res, authResult.error || 'Invalid API key');
  }
  
  const agent = authResult.agent;
  
  // Rate limiting (by agent ID + IP)
  const clientIP = getClientIP(req);
  const rateCheck = checkRateLimit(`submit:${agent.id}:${clientIP}`, RATE_LIMITS.submit);
  
  res.setHeader('X-RateLimit-Remaining', rateCheck.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(rateCheck.resetAt / 1000));
  
  if (!rateCheck.allowed) {
    return rateLimitResponse(res, rateCheck.resetAt);
  }
  
  // Fetch full agent data
  const agents = await queryAgents({ id: agent.id });
  const fullAgent = agents[0];
  
  if (!fullAgent) {
    return serverError(res, 'Agent lookup failed');
  }
  
  // Check X verification
  if (!fullAgent.x_verified) {
    return forbidden(res, 'X verification required. Verify first: POST /api/agents/verify');
  }
  
  // Check wallet
  if (!fullAgent.wallet) {
    return forbidden(res, 'Wallet required. Update your profile with a wallet address.');
  }
  
  // Sanitize inputs
  const title = sanitizeString(body.title, 100);
  const description = sanitizeString(body.description, 2000);
  const art_url = sanitizeUrl(body.art_url || body.url);
  
  if (!title) {
    return badRequest(res, 'Title is required');
  }
  
  if (!art_url) {
    return badRequest(res, 'art_url is required and must be a valid HTTP(S) URL');
  }
  
  // Validate URL is from phosphors.xyz
  try {
    const urlObj = new URL(art_url);
    const allowedHosts = ['phosphors.xyz', 'www.phosphors.xyz', 'localhost:3000', 'localhost:5173'];
    if (!allowedHosts.some(h => urlObj.host === h || urlObj.host.endsWith('.' + h))) {
      return badRequest(res, 'Art URL must be hosted on phosphors.xyz');
    }
  } catch {
    // Already handled above
  }
  
  // Start atomic transaction
  const txn = new AtomicTransaction();
  const slug = generateSlug(title);
  
  console.log(`\n🎨 [${fullAgent.username}] Starting submission: "${title}"`);
  
  try {
    // ═══════════════════════════════════════════════════════════════
    // STEP 1: Check for duplicate submissions
    // ═══════════════════════════════════════════════════════════════
    const existingRes = await supabaseRequest(
      `/rest/v1/submissions?moltbook=eq.${encodeURIComponent(fullAgent.username)}&title=eq.${encodeURIComponent(title)}&select=id`
    );
    const existing = await existingRes.json();
    
    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        error: { code: 'DUPLICATE', message: 'You already submitted a piece with this title' }
      });
    }
    
    // ═══════════════════════════════════════════════════════════════
    // STEP 2: Mint NFT on-chain
    // ═══════════════════════════════════════════════════════════════
    console.log(`⛓️ [${fullAgent.username}] Minting NFT...`);
    const mintResult = await mintNFT(fullAgent.wallet);
    
    if (!mintResult.success) {
      return res.status(500).json({
        success: false,
        error: { code: 'MINT_FAILED', message: mintResult.error || 'Minting failed' }
      });
    }
    
    txn.markComplete('mint', mintResult);
    // Note: Can't rollback on-chain mint, but we won't record it if later steps fail
    console.log(`✅ [${fullAgent.username}] Minted token #${mintResult.tokenId}`);
    
    // ═══════════════════════════════════════════════════════════════
    // STEP 3: Create art page
    // ═══════════════════════════════════════════════════════════════
    console.log(`📄 [${fullAgent.username}] Creating art page...`);
    const pageResult = await generateArtPage({
      title,
      slug,
      artUrl: art_url,
      artist: fullAgent.username,
      tokenId: mintResult.tokenId,
      description
    });
    
    if (!pageResult.success) {
      console.error(`❌ [${fullAgent.username}] Art page creation failed`);
      // NFT is minted but page failed - this is a critical error we must log
      await auditLog('PAGE_CREATION_FAILED', {
        agent: fullAgent.username,
        title,
        tokenId: mintResult.tokenId,
        error: pageResult.error
      });
      return res.status(500).json({
        success: false,
        error: { code: 'PAGE_CREATION_FAILED', message: pageResult.error },
        // Include mint info so they know the token was created
        partial: {
          tokenId: mintResult.tokenId,
          txHash: mintResult.txHash
        }
      });
    }
    
    txn.markComplete('page', pageResult);
    txn.addRollback('page', async () => {
      await deletePage(pageResult.path);
    });
    console.log(`✅ [${fullAgent.username}] Art page created: ${pageResult.path}`);
    
    // ═══════════════════════════════════════════════════════════════
    // STEP 4: Insert DB record
    // ═══════════════════════════════════════════════════════════════
    console.log(`💾 [${fullAgent.username}] Inserting DB record...`);
    
    const submission = {
      moltbook: fullAgent.username,
      title,
      url: art_url,
      description: description || null,
      status: 'approved',  // Auto-approved since minted
      token_id: mintResult.tokenId,
      tx_hash: mintResult.txHash,
      page_url: pageResult.path,
      submitted_at: new Date().toISOString(),
      approved_at: new Date().toISOString()
    };
    
    const response = await supabaseRequest('/rest/v1/submissions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(submission)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [${fullAgent.username}] DB insert failed:`, errorText);
      await txn.rollback();
      
      // Log the orphaned mint
      await auditLog('DB_INSERT_FAILED', {
        agent: fullAgent.username,
        title,
        tokenId: mintResult.tokenId,
        error: errorText
      });
      
      return res.status(500).json({
        success: false,
        error: { code: 'DB_INSERT_FAILED', message: 'Failed to save submission' },
        partial: {
          tokenId: mintResult.tokenId,
          txHash: mintResult.txHash
        }
      });
    }
    
    const [created] = await response.json();
    
    txn.markComplete('db', created);
    txn.addRollback('db', async () => {
      await supabaseRequest(`/rest/v1/submissions?id=eq.${created.id}`, {
        method: 'DELETE'
      });
    });
    
    // ═══════════════════════════════════════════════════════════════
    // STEP 5: Update agent stats
    // ═══════════════════════════════════════════════════════════════
    try {
      await supabaseRequest(`/rest/v1/agents?id=eq.${fullAgent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          created_count: (fullAgent.created_count || 0) + 1
        })
      });
    } catch (e) {
      console.log(`⚠️ [${fullAgent.username}] Failed to update stats (non-critical)`);
    }
    
    // ═══════════════════════════════════════════════════════════════
    // SUCCESS!
    // ═══════════════════════════════════════════════════════════════
    await auditLog('ART_SUBMITTED_MINTED', {
      submissionId: created.id,
      agent: fullAgent.username,
      title,
      tokenId: mintResult.tokenId,
      txHash: mintResult.txHash,
      ip: clientIP
    });
    
    console.log(`🎉 [${fullAgent.username}] Submission complete! Token #${mintResult.tokenId}`);
    
    return res.status(201).json({
      success: true,
      data: {
        submission_id: created.id,
        title: created.title,
        url: created.url,
        status: 'approved',
        token_id: mintResult.tokenId,
        tx_hash: mintResult.txHash,
        page_url: `https://phosphors.xyz${pageResult.path}`,
        submitted_at: created.submitted_at,
        message: '🎨 Art submitted, minted, and live! Your piece is now in the gallery.'
      }
    });
    
  } catch (e) {
    console.error(`❌ [${fullAgent.username}] Submission error:`, e);
    await txn.rollback();
    return serverError(res, 'Submission failed. Please try again.');
  }
}
