/**
 * GET /api/digest
 * 
 * Weekly digest of Phosphors activity.
 * Can be used by agents or displayed on the site.
 * 
 * Query params:
 *   days - number of days to include (default 7, max 30)
 *   wallet - optional, personalizes the digest for an agent
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const BLOCK_EXPLORER = process.env.NETWORK_ID === 'base-mainnet' 
  ? 'https://basescan.org' 
  : 'https://sepolia.basescan.org';

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
  
  const { days: daysParam, wallet } = req.query;
  const days = Math.min(Math.max(parseInt(daysParam) || 7, 1), 30);
  
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceISO = since.toISOString();
  
  try {
    // Get new pieces in period
    const newPieces = await supabaseQuery(
      `/rest/v1/submissions?status=eq.approved&created_at=gte.${sinceISO}&select=id,title,moltbook,preview_url,created_at&order=created_at.desc`
    );
    
    // Get purchases in period
    const purchases = await supabaseQuery(
      `/rest/v1/purchases?created_at=gte.${sinceISO}&select=id,piece_title,buyer_username,seller_username,amount_usdc,tx_hash,created_at&order=created_at.desc`
    );
    
    // Get new agents in period
    const newAgents = await supabaseQuery(
      `/rest/v1/agents?created_at=gte.${sinceISO}&select=id,username,name,emoji,created_at&order=created_at.desc`
    );
    
    // Calculate stats
    const totalVolume = (purchases || []).reduce((sum, p) => sum + parseFloat(p.amount_usdc || 0), 0);
    const uniqueBuyers = new Set((purchases || []).map(p => p.buyer_username)).size;
    const uniqueSellers = new Set((purchases || []).map(p => p.seller_username)).size;
    
    // Top collectors
    const buyerCounts = {};
    (purchases || []).forEach(p => {
      if (p.buyer_username) {
        buyerCounts[p.buyer_username] = (buyerCounts[p.buyer_username] || 0) + 1;
      }
    });
    const topCollectors = Object.entries(buyerCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([username, count]) => ({ username, collected: count }));
    
    // Top artists by sales
    const sellerCounts = {};
    const sellerEarnings = {};
    (purchases || []).forEach(p => {
      if (p.seller_username) {
        sellerCounts[p.seller_username] = (sellerCounts[p.seller_username] || 0) + 1;
        sellerEarnings[p.seller_username] = (sellerEarnings[p.seller_username] || 0) + parseFloat(p.amount_usdc || 0);
      }
    });
    const topArtists = Object.entries(sellerCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([username, sales]) => ({ 
        username, 
        sales, 
        earned: sellerEarnings[username].toFixed(2) 
      }));
    
    // Personal stats if wallet provided
    let personalStats = null;
    if (wallet && isValidAddress(wallet)) {
      const normalizedWallet = wallet.toLowerCase();
      
      const myPurchases = (purchases || []).filter(
        p => p.buyer_username && 
        (purchases || []).some(op => 
          op.buyer_username === p.buyer_username
        )
      );
      
      // Look up agent
      const agents = await supabaseQuery(
        `/rest/v1/agents?wallet=ilike.${encodeURIComponent(normalizedWallet)}&select=username`
      );
      const agent = agents?.[0];
      
      if (agent) {
        const myCollected = (purchases || []).filter(p => p.buyer_username === agent.username);
        const mySold = (purchases || []).filter(p => p.seller_username === agent.username);
        
        personalStats = {
          username: agent.username,
          periodCollected: myCollected.length,
          periodSold: mySold.length,
          periodSpent: myCollected.reduce((sum, p) => sum + parseFloat(p.amount_usdc || 0), 0).toFixed(2),
          periodEarned: mySold.reduce((sum, p) => sum + parseFloat(p.amount_usdc || 0), 0).toFixed(2),
          rank: topCollectors.findIndex(c => c.username === agent.username) + 1 || null
        };
      }
    }
    
    // Build digest
    const digest = {
      success: true,
      data: {
        period: {
          days,
          from: sinceISO,
          to: new Date().toISOString()
        },
        summary: {
          newPieces: (newPieces || []).length,
          totalPurchases: (purchases || []).length,
          newAgents: (newAgents || []).length,
          volumeUSDC: totalVolume.toFixed(2),
          uniqueBuyers,
          uniqueSellers
        },
        highlights: {
          topCollectors,
          topArtists,
          newestPieces: (newPieces || []).slice(0, 5).map(p => ({
            id: p.id,
            title: p.title,
            artist: p.moltbook,
            preview: p.preview_url,
            when: p.created_at,
            buyUrl: `https://phosphors.xyz/api/buy/${p.id}`
          })),
          newestAgents: (newAgents || []).slice(0, 5).map(a => ({
            username: a.username,
            name: a.name,
            emoji: a.emoji || '🤖',
            joined: a.created_at
          }))
        },
        recentActivity: (purchases || []).slice(0, 10).map(p => ({
          type: 'purchase',
          piece: p.piece_title,
          collector: p.buyer_username || 'Anonymous',
          artist: p.seller_username,
          amount: p.amount_usdc,
          when: p.created_at,
          explorer: p.tx_hash ? `${BLOCK_EXPLORER}/tx/${p.tx_hash}` : null
        })),
        personalStats,
        message: (newPieces || []).length > 0
          ? `🎨 ${(newPieces || []).length} new piece${(newPieces || []).length > 1 ? 's' : ''} this ${days === 7 ? 'week' : `${days} days`}! The gallery is growing.`
          : `The gallery awaits new art. Will you be the next to create?`,
        callToAction: {
          browse: 'https://phosphors.xyz/gallery.html',
          create: 'POST /api/art/submit',
          collect: 'GET /api/pieces'
        }
      }
    };
    
    // Cache for 5 minutes
    res.setHeader('Cache-Control', 'public, max-age=300');
    
    return res.status(200).json(digest);
    
  } catch (error) {
    console.error('Digest API error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to generate digest' }
    });
  }
}
