/**
 * GET /api/collector/:username
 * 
 * Returns collector profile data including:
 * - Purchases (pieces owned)
 * - Total spent in USDC
 * - Wallet address
 * - Purchase history with dates
 */

import { checkRateLimit, getClientIP, rateLimitResponse } from '../_lib/rate-limit.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

const IS_MAINNET = process.env.NETWORK_ID === 'base-mainnet';
const BLOCK_EXPLORER = IS_MAINNET ? 'https://basescan.org' : 'https://sepolia.basescan.org';

// Rate limit: 60 requests per minute
const COLLECTOR_RATE_LIMIT = { limit: 60, windowMs: 60 * 1000 };

async function supabaseQuery(path) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    headers: { 'apikey': SUPABASE_KEY }
  });
  if (!res.ok) return [];
  return res.json();
}

// Generate slug from title (for gallery/preview URLs)
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
  const rateCheck = checkRateLimit(`collector:${clientIP}`, COLLECTOR_RATE_LIMIT);
  res.setHeader('X-RateLimit-Remaining', rateCheck.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(rateCheck.resetAt / 1000));
  
  if (!rateCheck.allowed) {
    return rateLimitResponse(res, rateCheck.resetAt);
  }
  
  // Get username from URL
  const { username } = req.query;
  
  if (!username) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_USERNAME', message: 'Username is required' }
    });
  }
  
  // Normalize username (remove @ prefix if present)
  const normalizedUsername = username.replace(/^@/, '').toLowerCase();
  
  try {
    // Fetch all completed purchases where buyer_username matches
    const purchases = await supabaseQuery(
      `/rest/v1/purchases?select=id,created_at,piece_title,buyer_username,buyer_wallet,seller_username,amount_usdc,tx_hash,network&buyer_username=ilike.${encodeURIComponent(normalizedUsername)}&status=eq.completed&order=created_at.desc`
    );
    
    if (!purchases || purchases.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'COLLECTOR_NOT_FOUND', message: `No purchases found for @${normalizedUsername}` }
      });
    }
    
    // Calculate stats
    const totalSpent = purchases.reduce((sum, p) => sum + parseFloat(p.amount_usdc || 0), 0);
    const walletAddress = purchases[0]?.buyer_wallet || null;
    const displayUsername = purchases[0]?.buyer_username || normalizedUsername;
    
    // Get unique pieces owned
    const uniquePieces = new Map();
    for (const p of purchases) {
      const key = p.piece_title?.toLowerCase();
      if (key && !uniquePieces.has(key)) {
        uniquePieces.set(key, {
          title: p.piece_title,
          slug: slugify(p.piece_title),
          purchasedAt: p.created_at,
          amountPaid: p.amount_usdc,
          seller: p.seller_username,
          txHash: p.tx_hash,
          explorer: p.tx_hash ? `${BLOCK_EXPLORER}/tx/${p.tx_hash}` : null
        });
      }
    }
    
    // Build purchase history
    const history = purchases.map(p => ({
      id: p.id,
      piece: {
        title: p.piece_title,
        slug: slugify(p.piece_title),
        galleryUrl: `/gallery/${slugify(p.piece_title)}.html`,
        previewUrl: `/previews/${slugify(p.piece_title)}.png`
      },
      amount: {
        value: p.amount_usdc,
        currency: 'USDC'
      },
      seller: p.seller_username,
      purchasedAt: p.created_at,
      tx: {
        hash: p.tx_hash,
        network: p.network || (IS_MAINNET ? 'base-mainnet' : 'base-sepolia'),
        explorer: p.tx_hash ? `${BLOCK_EXPLORER}/tx/${p.tx_hash}` : null
      }
    }));
    
    // Get unique artists collected from
    const artistsCollected = [...new Set(purchases.map(p => p.seller_username).filter(Boolean))];
    
    // Cache for 60 seconds
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
    
    return res.status(200).json({
      success: true,
      data: {
        collector: {
          username: displayUsername,
          wallet: walletAddress,
          walletExplorer: walletAddress ? `${BLOCK_EXPLORER}/address/${walletAddress}` : null
        },
        stats: {
          totalPieces: uniquePieces.size,
          totalSpentUSDC: totalSpent.toFixed(2),
          totalPurchases: purchases.length,
          artistsCollected: artistsCollected.length
        },
        collection: Array.from(uniquePieces.values()),
        history,
        artistsCollected
      }
    });
    
  } catch (error) {
    console.error('Collector profile error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch collector data' }
    });
  }
}
