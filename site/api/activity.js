/**
 * GET /api/activity
 * 
 * Returns recent activity (purchases, mints) for the activity feed.
 * Shows real on-chain transactions with Base Sepolia links.
 * 
 * Query params:
 *   limit - number of items (default 20, max 100)
 *   offset - pagination offset
 *   type - filter by type (purchase, mint, all)
 */

import { checkRateLimit, getClientIP, rateLimitResponse } from './_lib/rate-limit.js';

const SUPABASE_URL = 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

const IS_MAINNET = process.env.NETWORK_ID === 'base-mainnet';
const BLOCK_EXPLORER = IS_MAINNET ? 'https://basescan.org' : 'https://sepolia.basescan.org';

// Rate limit: 60 requests per minute
const ACTIVITY_RATE_LIMIT = { limit: 60, windowMs: 60 * 1000 };

async function supabaseQuery(path) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    headers: { 'apikey': SUPABASE_KEY }
  });
  if (!res.ok) return [];
  return res.json();
}

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
  const type = req.query.type || 'all';
  
  try {
    const activities = [];
    
    // Get purchases if table exists
    if (type === 'all' || type === 'purchase') {
      try {
        const purchases = await supabaseQuery(
          `/rest/v1/purchases?select=*&status=eq.completed&order=created_at.desc&limit=${limit}`
        );
        
        for (const p of purchases) {
          activities.push({
            id: p.id,
            type: 'purchase',
            timestamp: p.created_at,
            piece: {
              title: p.piece_title || 'Unknown'
            },
            buyer: {
              username: p.buyer_username || 'Anonymous',
              wallet: p.buyer_wallet
            },
            seller: {
              username: p.seller_username || 'Artist',
              wallet: p.seller_wallet
            },
            amount: {
              value: p.amount_usdc,
              currency: 'USDC'
            },
            artistPayout: p.artist_payout ? {
              value: p.artist_payout,
              currency: 'USDC',
              txHash: p.payout_tx_hash,
              explorer: p.payout_tx_hash ? `${BLOCK_EXPLORER}/tx/${p.payout_tx_hash}` : null
            } : null,
            tx: {
              hash: p.tx_hash,
              network: p.network,
              explorer: `${BLOCK_EXPLORER}/tx/${p.tx_hash}`
            }
          });
        }
      } catch (e) {
        // Purchases table might not exist yet, continue
        console.log('Purchases query failed:', e.message);
      }
    }
    
    // Get mints from submissions (these have real TX hashes)
    if (type === 'all' || type === 'mint') {
      const submissions = await supabaseQuery(
        `/rest/v1/submissions?status=eq.approved&select=id,title,moltbook,notes,token_id,submitted_at&order=submitted_at.desc&limit=${limit}`
      );
      
      for (const s of submissions) {
        if (s.token_id && s.notes) {
          // Extract TX hash from notes
          const txMatch = s.notes.match(/0x[a-fA-F0-9]{64}/);
          const txHash = txMatch ? txMatch[0] : null;
          
          if (txHash) {
            activities.push({
              id: s.id,
              type: 'mint',
              timestamp: s.submitted_at,
              piece: {
                title: s.title
              },
              artist: {
                username: s.moltbook || 'Unknown'
              },
              tokenId: s.token_id,
              tx: {
                hash: txHash,
                network: IS_MAINNET ? 'base-mainnet' : 'base-sepolia',
                explorer: `${BLOCK_EXPLORER}/tx/${txHash}`
              }
            });
          }
        }
      }
    }
    
    // Sort by timestamp
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Calculate stats
    const purchaseCount = activities.filter(a => a.type === 'purchase').length;
    const mintCount = activities.filter(a => a.type === 'mint').length;
    const totalVolume = activities
      .filter(a => a.type === 'purchase')
      .reduce((sum, a) => sum + parseFloat(a.amount?.value || 0), 0);
    
    // Get unique artists
    const uniqueArtists = new Set(activities.map(a => a.seller?.username || a.artist?.username).filter(Boolean));
    
    // Apply pagination
    const paginated = activities.slice(offset, offset + limit);
    
    // Cache for 30 seconds
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
    
    return res.status(200).json({
      success: true,
      data: {
        activities: paginated,
        stats: {
          purchases: purchaseCount,
          mints: mintCount,
          volumeUSDC: totalVolume.toFixed(2),
          artistsPaid: uniqueArtists.size
        },
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
