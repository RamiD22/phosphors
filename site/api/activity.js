/**
 * GET /api/activity
 * 
 * Returns recent activity (purchases, submissions, etc.) for the activity feed.
 * 
 * Query params:
 *   limit - number of items (default 20, max 100)
 *   offset - pagination offset
 *   type - filter by type (purchase, submission, mint)
 */

import { getRecentPurchases, supabaseRequest } from './_lib/supabase.js';
import { checkRateLimit, getClientIP, rateLimitResponse } from './_lib/rate-limit.js';

const IS_MAINNET = process.env.NETWORK_ID === 'base-mainnet';
const BLOCK_EXPLORER = IS_MAINNET ? 'https://basescan.org' : 'https://sepolia.basescan.org';

// Rate limit: 60 requests per minute
const ACTIVITY_RATE_LIMIT = { limit: 60, windowMs: 60 * 1000 };

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ 
      success: false, 
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Use GET' } 
    });
  }
  
  // Rate limiting
  const clientIP = getClientIP(req);
  const rateCheck = checkRateLimit(`activity:${clientIP}`, ACTIVITY_RATE_LIMIT);
  res.setHeader('X-RateLimit-Remaining', rateCheck.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(rateCheck.resetAt / 1000));
  
  if (!rateCheck.allowed) {
    return rateLimitResponse(res, rateCheck.resetAt);
  }
  
  // Parse query params
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = parseInt(req.query.offset) || 0;
  const type = req.query.type;
  
  try {
    const activities = [];
    
    // Get recent purchases
    if (!type || type === 'purchase') {
      const purchases = await getRecentPurchases(limit);
      
      for (const p of purchases) {
        activities.push({
          id: p.id,
          type: 'purchase',
          timestamp: p.created_at,
          piece: {
            id: p.piece_identifier,
            title: p.piece_title || p.piece_identifier
          },
          buyer: {
            username: p.buyer_username,
            wallet: p.buyer_wallet
          },
          seller: {
            username: p.seller_username,
            wallet: p.seller_wallet
          },
          amount: {
            value: p.amount_usdc,
            currency: 'USDC'
          },
          tx: {
            hash: p.tx_hash,
            network: p.network,
            explorer: `${BLOCK_EXPLORER}/tx/${p.tx_hash}`
          }
        });
      }
    }
    
    // Get recent submissions (mints) if requested
    if (!type || type === 'submission' || type === 'mint') {
      const subsRes = await supabaseRequest(
        `/rest/v1/submissions?status=eq.approved&select=id,title,identifier,artist_id,token_id,created_at,artists:artist_id(username)&order=created_at.desc&limit=${limit}`
      );
      
      if (subsRes.ok) {
        const submissions = await subsRes.json();
        for (const s of submissions) {
          if (s.token_id) { // Only show minted pieces
            activities.push({
              id: s.id,
              type: 'mint',
              timestamp: s.created_at,
              piece: {
                id: s.identifier,
                title: s.title
              },
              artist: {
                username: s.artists?.username || 'Unknown'
              },
              token_id: s.token_id
            });
          }
        }
      }
    }
    
    // Sort by timestamp
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Apply pagination
    const paginated = activities.slice(offset, offset + limit);
    
    // Cache for 30 seconds
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
    
    return res.status(200).json({
      success: true,
      data: {
        activities: paginated,
        pagination: {
          limit,
          offset,
          total: activities.length,
          hasMore: offset + limit < activities.length
        }
      }
    });
    
  } catch (error) {
    console.error('Activity feed error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch activity' }
    });
  }
}
