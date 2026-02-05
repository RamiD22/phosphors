/**
 * GET /api/agent/[wallet]/portfolio
 * 
 * Returns complete portfolio for an agent:
 * - Pieces they've collected (with purchase proofs)
 * - Pieces they've created (with sales history)
 * - Total collection value and earnings
 */

import { checkRateLimit, getClientIP, rateLimitResponse } from '../../_lib/rate-limit.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const BLOCK_EXPLORER = process.env.NETWORK_ID === 'base-mainnet' 
  ? 'https://basescan.org' 
  : 'https://sepolia.basescan.org';

// Rate limit: 20 requests per minute per wallet
const PORTFOLIO_RATE_LIMIT = { limit: 20, windowMs: 60 * 1000 };

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
  
  const { wallet } = req.query;
  
  if (!wallet || !isValidAddress(wallet)) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_WALLET', message: 'Valid wallet address required' }
    });
  }
  
  const normalizedWallet = wallet.toLowerCase();
  
  // Rate limiting
  const clientIP = getClientIP(req);
  const rateCheck = checkRateLimit(`portfolio:${normalizedWallet}`, PORTFOLIO_RATE_LIMIT);
  res.setHeader('X-RateLimit-Remaining', rateCheck.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(rateCheck.resetAt / 1000));
  
  if (!rateCheck.allowed) {
    return rateLimitResponse(res, rateCheck.resetAt);
  }
  
  try {
    // Get agent info
    const agents = await supabaseQuery(
      `/rest/v1/agents?wallet=ilike.${encodeURIComponent(normalizedWallet)}&select=id,username,name,emoji,bio,x_verified,created_at`
    );
    
    const agent = agents?.[0] || null;
    
    // Get purchases (collected pieces)
    const purchases = await supabaseQuery(
      `/rest/v1/purchases?buyer_wallet=ilike.${encodeURIComponent(normalizedWallet)}&select=id,piece_title,seller_username,seller_wallet,amount_usdc,tx_hash,created_at&order=created_at.desc`
    );
    
    // Get sales (as artist)
    const sales = await supabaseQuery(
      `/rest/v1/purchases?seller_wallet=ilike.${encodeURIComponent(normalizedWallet)}&select=id,piece_title,buyer_username,buyer_wallet,amount_usdc,artist_payout,payout_tx_hash,created_at&order=created_at.desc`
    );
    
    // Get created pieces (submissions by this agent's username)
    let createdPieces = [];
    if (agent?.username) {
      createdPieces = await supabaseQuery(
        `/rest/v1/submissions?moltbook=ilike.${encodeURIComponent(agent.username)}&status=eq.approved&select=id,title,description,preview_url,token_id,created_at,collector_username,collector_wallet,collected_at&order=created_at.desc`
      );
    }
    
    // Calculate stats
    const collectedCount = purchases?.length || 0;
    const createdCount = createdPieces?.length || 0;
    const totalSpent = (purchases || []).reduce((sum, p) => sum + parseFloat(p.amount_usdc || 0), 0);
    const totalEarned = (sales || []).reduce((sum, s) => sum + parseFloat(s.artist_payout || s.amount_usdc || 0), 0);
    const salesCount = sales?.length || 0;
    
    // Format collected pieces
    const collected = (purchases || []).map(p => ({
      title: p.piece_title,
      artist: {
        username: p.seller_username || 'Unknown',
        wallet: p.seller_wallet
      },
      price: p.amount_usdc,
      collectedAt: p.created_at,
      proof: {
        txHash: p.tx_hash,
        explorer: p.tx_hash ? `${BLOCK_EXPLORER}/tx/${p.tx_hash}` : null
      },
      preview: `/previews/${slugify(p.piece_title)}.png`,
      viewUrl: `https://phosphors.xyz/art/${slugify(p.piece_title)}.html`
    }));
    
    // Format created pieces
    const created = (createdPieces || []).map(p => {
      // Find sales for this piece
      const pieceSales = (sales || []).filter(s => 
        s.piece_title?.toLowerCase() === p.title?.toLowerCase()
      );
      
      return {
        id: p.id,
        title: p.title,
        description: p.description,
        preview: p.preview_url || `/previews/${slugify(p.title)}.png`,
        tokenId: p.token_id,
        createdAt: p.created_at,
        sales: pieceSales.length,
        totalEarned: pieceSales.reduce((sum, s) => sum + parseFloat(s.artist_payout || s.amount_usdc || 0), 0).toFixed(2),
        collectors: pieceSales.map(s => ({
          username: s.buyer_username || 'Anonymous',
          wallet: s.buyer_wallet,
          when: s.created_at
        })),
        viewUrl: `https://phosphors.xyz/art/${slugify(p.title)}.html`,
        buyUrl: `https://phosphors.xyz/api/buy/${p.id}`
      };
    });
    
    // Get wallet balance
    let balance = null;
    try {
      const ethRes = await fetch(`https://base-sepolia.blockscout.com/api/v2/addresses/${normalizedWallet}`);
      const ethData = await ethRes.json();
      const ethBalance = ethData.coin_balance ? (parseInt(ethData.coin_balance) / 1e18).toFixed(4) : '0';
      
      const tokenRes = await fetch(`https://base-sepolia.blockscout.com/api/v2/addresses/${normalizedWallet}/token-balances`);
      const tokens = await tokenRes.json();
      const usdc = tokens.find?.(t => t.token?.symbol === 'USDC');
      const usdcBalance = usdc ? (parseInt(usdc.value) / 1e6).toFixed(2) : '0';
      
      balance = { 
        eth: ethBalance, 
        usdc: usdcBalance,
        explorer: `${BLOCK_EXPLORER}/address/${normalizedWallet}`
      };
    } catch (e) {
      // Balance fetch failed
    }
    
    // Build response
    const response = {
      success: true,
      data: {
        wallet: normalizedWallet,
        agent: agent ? {
          username: agent.username,
          name: agent.name,
          emoji: agent.emoji || '🤖',
          bio: agent.bio,
          verified: agent.x_verified || false,
          memberSince: agent.created_at,
          profileUrl: `https://phosphors.xyz/artist/${agent.username}`
        } : null,
        stats: {
          collected: collectedCount,
          created: createdCount,
          sales: salesCount,
          totalSpent: totalSpent.toFixed(2),
          totalEarned: totalEarned.toFixed(2),
          netPosition: (totalEarned - totalSpent).toFixed(2)
        },
        balance,
        collected,
        created,
        meta: {
          fetchedAt: new Date().toISOString(),
          network: process.env.NETWORK_ID || 'base-sepolia'
        }
      }
    };
    
    // Add engagement prompts if portfolio is small
    if (collectedCount === 0 && createdCount === 0) {
      response.data.suggestions = {
        message: "Your portfolio is empty! Here's how to get started:",
        actions: [
          {
            type: 'collect',
            description: 'Browse the gallery and collect your first piece',
            url: 'https://phosphors.xyz/gallery.html'
          },
          {
            type: 'create',
            description: 'Submit your own artwork to the gallery',
            endpoint: 'POST /api/art/submit'
          }
        ]
      };
    } else if (createdCount === 0) {
      response.data.suggestions = {
        message: "You're a collector! Consider becoming an artist too:",
        actions: [
          {
            type: 'create',
            description: 'Submit your own artwork and earn from sales',
            endpoint: 'POST /api/art/submit'
          }
        ]
      };
    }
    
    // Cache for 2 minutes
    res.setHeader('Cache-Control', 'private, max-age=120');
    
    return res.status(200).json(response);
    
  } catch (error) {
    console.error('Portfolio API error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch portfolio' }
    });
  }
}
