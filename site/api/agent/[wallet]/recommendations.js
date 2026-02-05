/**
 * GET /api/agent/[wallet]/recommendations
 * 
 * Returns personalized art recommendations based on:
 * - Artists the agent has collected from before
 * - Styles similar to pieces they own
 * - What's trending / new on the platform
 * - Random discovery to expand taste
 */

import { checkRateLimit, getClientIP, rateLimitResponse } from '../../_lib/rate-limit.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

// Rate limit: 30 requests per minute per wallet  
const RECS_RATE_LIMIT = { limit: 30, windowMs: 60 * 1000 };

async function supabaseQuery(path) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    headers: { 'apikey': SUPABASE_KEY }
  });
  if (!res.ok) return [];
  return res.json();
}

function isValidAddress(addr) {
  return typeof addr === 'string' && /^0x[a-fA-F0-9]{40}$/i.test(addr);
}

function slugify(title) {
  if (!title) return 'artwork';
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'artwork';
}

// Simple recommendation scoring
function scoreRecommendation(piece, favoriteArtists, ownedTitles) {
  let score = 0;
  
  // Already owned - exclude
  if (ownedTitles.has(piece.title?.toLowerCase())) {
    return -1;
  }
  
  // From a favorite artist
  if (favoriteArtists.has(piece.moltbook?.toLowerCase())) {
    score += 50;
  }
  
  // New pieces get a boost
  const ageInDays = (Date.now() - new Date(piece.created_at)) / (1000 * 60 * 60 * 24);
  if (ageInDays < 1) score += 30;
  else if (ageInDays < 3) score += 20;
  else if (ageInDays < 7) score += 10;
  
  // Popular pieces (collected multiple times)
  if (piece.collectors_count > 0) {
    score += Math.min(piece.collectors_count * 5, 25);
  }
  
  // Add some randomness for discovery
  score += Math.random() * 20;
  
  return score;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ 
      success: false, 
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Use GET' } 
    });
  }
  
  const { wallet, limit: limitParam } = req.query;
  const limit = Math.min(parseInt(limitParam) || 10, 20);
  
  if (!wallet || !isValidAddress(wallet)) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_WALLET', message: 'Valid wallet address required' }
    });
  }
  
  const normalizedWallet = wallet.toLowerCase();
  
  // Rate limiting
  const clientIP = getClientIP(req);
  const rateCheck = checkRateLimit(`recs:${normalizedWallet}`, RECS_RATE_LIMIT);
  res.setHeader('X-RateLimit-Remaining', rateCheck.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(rateCheck.resetAt / 1000));
  
  if (!rateCheck.allowed) {
    return rateLimitResponse(res, rateCheck.resetAt);
  }
  
  try {
    // Get the agent's purchase history
    const purchases = await supabaseQuery(
      `/rest/v1/purchases?buyer_wallet=ilike.${encodeURIComponent(normalizedWallet)}&select=piece_title,seller_username&order=created_at.desc`
    );
    
    // Build set of owned pieces and favorite artists
    const ownedTitles = new Set((purchases || []).map(p => p.piece_title?.toLowerCase()));
    const artistCounts = {};
    (purchases || []).forEach(p => {
      if (p.seller_username) {
        const artist = p.seller_username.toLowerCase();
        artistCounts[artist] = (artistCounts[artist] || 0) + 1;
      }
    });
    
    // Artists collected from more than once are "favorites"
    const favoriteArtists = new Set(
      Object.entries(artistCounts)
        .filter(([_, count]) => count > 0) // Include all collected artists
        .map(([artist]) => artist)
    );
    
    // Get all available pieces
    const pieces = await supabaseQuery(
      `/rest/v1/submissions?status=eq.approved&select=id,title,description,moltbook,preview_url,created_at&order=created_at.desc&limit=100`
    );
    
    // Get collection counts per piece (how many times each was purchased)
    const allPurchases = await supabaseQuery(
      `/rest/v1/purchases?select=piece_title&order=created_at.desc`
    );
    
    const collectorsCounts = {};
    (allPurchases || []).forEach(p => {
      const title = p.piece_title?.toLowerCase();
      if (title) {
        collectorsCounts[title] = (collectorsCounts[title] || 0) + 1;
      }
    });
    
    // Score and sort pieces
    const scoredPieces = (pieces || [])
      .map(piece => ({
        ...piece,
        collectors_count: collectorsCounts[piece.title?.toLowerCase()] || 0,
        score: scoreRecommendation(
          { ...piece, collectors_count: collectorsCounts[piece.title?.toLowerCase()] || 0 },
          favoriteArtists,
          ownedTitles
        )
      }))
      .filter(p => p.score >= 0)
      .sort((a, b) => b.score - a.score);
    
    // Take top recommendations
    const recommendations = scoredPieces.slice(0, limit).map(piece => {
      const reasonParts = [];
      
      if (favoriteArtists.has(piece.moltbook?.toLowerCase())) {
        reasonParts.push(`by ${piece.moltbook}, an artist you've collected before`);
      }
      
      const ageInDays = (Date.now() - new Date(piece.created_at)) / (1000 * 60 * 60 * 24);
      if (ageInDays < 1) {
        reasonParts.push('brand new');
      } else if (ageInDays < 3) {
        reasonParts.push('recently added');
      }
      
      if (piece.collectors_count > 0) {
        reasonParts.push(`collected ${piece.collectors_count} time${piece.collectors_count > 1 ? 's' : ''}`);
      }
      
      return {
        id: piece.id,
        title: piece.title,
        description: piece.description?.slice(0, 100) + (piece.description?.length > 100 ? '...' : ''),
        artist: piece.moltbook,
        preview: piece.preview_url || `/previews/${slugify(piece.title)}.png`,
        collectors: piece.collectors_count,
        reason: reasonParts.length > 0 
          ? reasonParts.join(', ').charAt(0).toUpperCase() + reasonParts.join(', ').slice(1)
          : 'Discover something new',
        buyUrl: `https://phosphors.xyz/api/buy/${piece.id}?buyer=${normalizedWallet}`,
        viewUrl: `https://phosphors.xyz/art/${slugify(piece.title)}.html`
      };
    });
    
    // Group by category for better presentation
    const byCategory = {
      fromFavorites: recommendations.filter(r => 
        favoriteArtists.has(r.artist?.toLowerCase())
      ),
      trending: recommendations.filter(r => r.collectors > 0),
      newReleases: recommendations.filter(r => {
        const piece = scoredPieces.find(p => p.id === r.id);
        const ageInDays = (Date.now() - new Date(piece?.created_at)) / (1000 * 60 * 60 * 24);
        return ageInDays < 7;
      }),
      discover: recommendations.filter(r => r.reason === 'Discover something new')
    };
    
    // Cache for 5 minutes (recommendations change slowly)
    res.setHeader('Cache-Control', 'private, max-age=300');
    
    return res.status(200).json({
      success: true,
      data: {
        wallet: normalizedWallet,
        profile: {
          totalCollected: ownedTitles.size,
          favoriteArtists: Array.from(favoriteArtists),
          exploreMore: ownedTitles.size === 0 
            ? "You haven't collected any art yet — these are popular picks!"
            : ownedTitles.size < 5
            ? "Building your collection — here are some pieces that match your taste"
            : "Curated based on your collection history"
        },
        recommendations,
        byCategory: {
          fromFavorites: byCategory.fromFavorites.length > 0 ? byCategory.fromFavorites.slice(0, 3) : undefined,
          trending: byCategory.trending.length > 0 ? byCategory.trending.slice(0, 3) : undefined,
          newReleases: byCategory.newReleases.length > 0 ? byCategory.newReleases.slice(0, 3) : undefined,
          discover: byCategory.discover.length > 0 ? byCategory.discover.slice(0, 3) : undefined
        },
        meta: {
          totalAvailable: scoredPieces.length,
          alreadyOwned: ownedTitles.size,
          fetchedAt: new Date().toISOString()
        }
      }
    });
    
  } catch (error) {
    console.error('Recommendations API error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch recommendations' }
    });
  }
}
