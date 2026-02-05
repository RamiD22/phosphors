// Bounties API for Phosphors
// GET /api/bounties?wallet=xxx — Get bounties for a wallet
// POST /api/bounties/check — Check for milestone bounties (internal/cron)

import { checkRateLimit, getClientIP, rateLimitResponse, RATE_LIMITS } from './_lib/rate-limit.js';
import { handleCors, isValidAddress, normalizeAddress, badRequest, serverError } from './_lib/security.js';
import {
  BOUNTY_AMOUNTS,
  getPendingBounties,
  getBountyHistory,
  getBountyStats,
  getBountyStatsByType,
  getReferralLeaderboard,
  checkMilestoneBounties
} from './_lib/bounties.js';
import { supabaseRequest } from './_lib/supabase.js';

export default async function handler(req, res) {
  // CORS
  if (handleCors(req, res, { methods: 'GET, POST, OPTIONS' })) {
    return;
  }
  
  // Rate limiting
  const clientIP = getClientIP(req);
  const rateCheck = checkRateLimit(`bounties:${clientIP}`, RATE_LIMITS.standard);
  
  res.setHeader('X-RateLimit-Remaining', rateCheck.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(rateCheck.resetAt / 1000));
  
  if (!rateCheck.allowed) {
    return rateLimitResponse(res, rateCheck.resetAt);
  }
  
  // Handle different methods
  if (req.method === 'GET') {
    return handleGet(req, res);
  } else if (req.method === 'POST') {
    return handlePost(req, res);
  } else {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Use GET or POST' }
    });
  }
}

/**
 * GET /api/bounties
 * Query params:
 *   - wallet: Get bounties for a specific wallet
 *   - stats: Include global stats (true/false)
 *   - leaderboard: Include referral leaderboard (true/false)
 *   - limit: Max results (default 50)
 */
async function handleGet(req, res) {
  const { wallet, stats, leaderboard, limit = '50' } = req.query;
  
  const response = { success: true };
  
  // Get bounties for a specific wallet
  if (wallet) {
    if (!isValidAddress(wallet)) {
      return badRequest(res, 'Invalid wallet address');
    }
    
    const normalizedWallet = normalizeAddress(wallet);
    
    // Get pending and history
    const [pending, history] = await Promise.all([
      getPendingBounties(normalizedWallet),
      getBountyHistory(normalizedWallet, parseInt(limit))
    ]);
    
    // Calculate totals
    const totalEarned = history.reduce((sum, b) => sum + parseFloat(b.phos_amount), 0);
    const pendingTotal = pending.reduce((sum, b) => sum + parseFloat(b.phos_amount), 0);
    const paidTotal = history
      .filter(b => b.status === 'paid')
      .reduce((sum, b) => sum + parseFloat(b.phos_amount), 0);
    
    response.wallet = {
      address: normalizedWallet,
      pending: {
        count: pending.length,
        total_phos: pendingTotal,
        events: pending
      },
      history: {
        count: history.length,
        total_earned: totalEarned,
        total_paid: paidTotal,
        events: history
      }
    };
    
    // Get earned bounty types
    const earnedTypes = [...new Set(history.map(b => b.event_type))];
    const availableTypes = Object.keys(BOUNTY_AMOUNTS).filter(t => !earnedTypes.includes(t));
    
    response.wallet.achievements = {
      earned: earnedTypes,
      available: availableTypes
    };
  }
  
  // Include global stats if requested
  if (stats === 'true' || (!wallet && !leaderboard)) {
    const [globalStats, byType] = await Promise.all([
      getBountyStats(),
      getBountyStatsByType()
    ]);
    
    response.stats = {
      global: globalStats,
      by_type: byType
    };
  }
  
  // Include referral leaderboard if requested
  if (leaderboard === 'true') {
    const leaderboardData = await getReferralLeaderboard(20);
    response.leaderboard = leaderboardData;
  }
  
  // Include bounty amounts reference
  response.bounty_amounts = BOUNTY_AMOUNTS;
  
  return res.status(200).json(response);
}

/**
 * POST /api/bounties/check
 * Internal endpoint to check for milestone bounties
 * Body: { wallet?: string } — optional, check specific wallet or all
 */
async function handlePost(req, res) {
  // Check for internal API key - ALWAYS required for POST
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  const internalKey = process.env.INTERNAL_API_KEY;
  
  // Fail closed: if INTERNAL_API_KEY is not configured, deny all POST access
  if (!internalKey || apiKey !== internalKey) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid API key' }
    });
  }
  
  const { wallet, action } = req.body || {};
  
  // Route by action
  if (action === 'check_milestones') {
    return checkAllMilestones(req, res, wallet);
  }
  
  // Default: check milestones for specified wallet
  if (wallet) {
    if (!isValidAddress(wallet)) {
      return badRequest(res, 'Invalid wallet address');
    }
    
    const normalizedWallet = normalizeAddress(wallet);
    const results = await checkMilestoneBounties(normalizedWallet);
    
    return res.status(200).json({
      success: true,
      wallet: normalizedWallet,
      new_bounties: results,
      message: results.length > 0 
        ? `Created ${results.length} new bounty events!`
        : 'No new milestones reached'
    });
  }
  
  // If no wallet specified, check all agents with sales
  return checkAllMilestones(req, res);
}

/**
 * Check milestone bounties for all eligible agents
 */
async function checkAllMilestones(req, res, specificWallet = null) {
  try {
    // Get all agents with wallets that have at least one sale
    let query = '/rest/v1/purchases?status=eq.completed&select=seller_wallet';
    
    if (specificWallet) {
      query += `&seller_wallet=ilike.${encodeURIComponent(specificWallet)}`;
    }
    
    const response = await supabaseRequest(query);
    if (!response.ok) {
      return serverError(res, 'Failed to fetch purchases');
    }
    
    const purchases = await response.json();
    
    // Get unique seller wallets
    const sellerWallets = [...new Set(purchases.map(p => p.seller_wallet?.toLowerCase()).filter(Boolean))];
    
    const results = {
      wallets_checked: sellerWallets.length,
      new_bounties: [],
      errors: []
    };
    
    // Check each wallet (limit concurrency)
    for (const wallet of sellerWallets.slice(0, 100)) { // Limit to 100 per run
      try {
        const bounties = await checkMilestoneBounties(wallet);
        if (bounties.length > 0) {
          results.new_bounties.push({
            wallet,
            bounties
          });
        }
      } catch (err) {
        results.errors.push({ wallet, error: err.message });
      }
    }
    
    return res.status(200).json({
      success: true,
      ...results,
      message: `Checked ${results.wallets_checked} wallets, created ${results.new_bounties.reduce((sum, w) => sum + w.bounties.length, 0)} new bounties`
    });
    
  } catch (err) {
    console.error('Check all milestones error:', err);
    return serverError(res, 'Failed to check milestones');
  }
}
