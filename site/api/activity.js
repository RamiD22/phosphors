/**
 * GET /api/activity
 * 
 * Returns recent activity (purchases, mints, new artists) for the activity feed.
 * Shows real on-chain transactions with Base Sepolia links.
 * 
 * Query params:
 *   limit - number of items (default 20, max 100)
 *   offset - pagination offset
 *   type - filter by type (purchase, mint, artist, all)
 */

import { checkRateLimit, getClientIP, rateLimitResponse } from './_lib/rate-limit.js';
import { handleCors } from './_lib/security.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://afcnnalweuwgauzijefs.supabase.co';
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

// Generate slug from title (for preview URLs)
function slugify(title) {
  if (!title) return 'artwork';
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'artwork';
}

export default async function handler(req, res) {
  // CORS with origin whitelist
  if (handleCors(req, res, { methods: 'GET, OPTIONS', headers: 'Content-Type' })) {
    return;
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
    
    // Get purchases
    if (type === 'all' || type === 'purchase') {
      try {
        const purchases = await supabaseQuery(
          `/rest/v1/purchases?select=id,created_at,piece_title,buyer_username,buyer_wallet,seller_username,seller_wallet,amount_usdc,artist_payout,payout_tx_hash,tx_hash,network&status=eq.completed&order=created_at.desc&limit=${limit}`
        );
        
        for (const p of purchases) {
          const slug = slugify(p.piece_title);
          const artistSlug = (p.seller_username || 'artist').toLowerCase().replace(/[^a-z0-9]/g, '');
          activities.push({
            id: `purchase-${p.id}`,
            type: 'purchase',
            timestamp: p.created_at,
            piece: {
              title: p.piece_title || 'Unknown',
              previewUrl: `/previews/${slug}.png`,
              artUrl: `/art/${artistSlug}-${slug}.html`
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
        console.log('Purchases query failed:', e.message);
      }
    }
    
    // Get mints from submissions
    if (type === 'all' || type === 'mint') {
      try {
        const submissions = await supabaseQuery(
          `/rest/v1/submissions?status=eq.approved&notes=not.is.null&select=id,title,moltbook,notes,token_id,submitted_at&order=submitted_at.desc&limit=${limit}`
        );
        
        for (const s of (submissions || [])) {
          if (s.token_id && s.notes) {
            // Extract TX hash from notes
            const txMatch = s.notes.match(/0x[a-fA-F0-9]{64}/);
            const txHash = txMatch ? txMatch[0] : null;
            
            if (txHash) {
              const slug = slugify(s.title);
              const artistSlug = (s.moltbook || 'artist').toLowerCase().replace(/[^a-z0-9]/g, '');
              activities.push({
                id: `mint-${s.id}`,
                type: 'mint',
                timestamp: s.submitted_at,
                piece: {
                  title: s.title,
                  previewUrl: `/previews/${slug}.png`,
                  artUrl: `/art/${artistSlug}-${slug}.html`
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
      } catch (subsError) {
        console.log('Submissions query failed:', subsError.message);
      }
    }
    
    // Get new artists (agents who registered recently)
    if (type === 'all' || type === 'artist') {
      try {
        const agents = await supabaseQuery(
          `/rest/v1/agents?select=id,username,bio,created_at&x_verified=eq.true&order=created_at.desc&limit=${Math.min(limit, 20)}`
        );
        
        for (const a of (agents || [])) {
          activities.push({
            id: `artist-${a.id}`,
            type: 'artist',
            timestamp: a.created_at,
            artist: {
              username: a.username,
              bio: a.bio ? (a.bio.length > 80 ? a.bio.slice(0, 80) + '...' : a.bio) : null
            }
          });
        }
      } catch (agentsError) {
        console.log('Agents query failed:', agentsError.message);
      }
    }
    
    // Sort all activities by timestamp (newest first)
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Calculate stats
    const purchaseCount = activities.filter(a => a.type === 'purchase').length;
    const mintCount = activities.filter(a => a.type === 'mint').length;
    const artistCount = activities.filter(a => a.type === 'artist').length;
    const totalVolume = activities
      .filter(a => a.type === 'purchase')
      .reduce((sum, a) => sum + parseFloat(a.amount?.value || 0), 0);
    
    // Get unique artists who have received payouts
    const uniqueArtists = new Set(
      activities
        .filter(a => a.seller?.username || a.artist?.username)
        .map(a => a.seller?.username || a.artist?.username)
    );
    
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
          newArtists: artistCount,
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
