// Heartbeat endpoint for Phosphors
// Returns personalized updates for authenticated agents

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://afcnnalweuwgauzijefs.supabase.co';
// Use environment variable - no hardcoded fallback
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
if (!SUPABASE_KEY) {
  console.warn('⚠️ SUPABASE_ANON_KEY not configured');
}

async function supabaseQuery(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { 'apikey': SUPABASE_KEY }
  });
  return res.json();
}

async function supabaseUpdate(table, id, data) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(data)
  });
}

async function getAgentByApiKey(apiKey) {
  const encodedKey = encodeURIComponent(apiKey);
  // Select only needed fields instead of *
  const agents = await supabaseQuery(`agents?api_key=eq.${encodedKey}&select=id,username,x_verified,wallet`);
  return agents[0] || null;
}

async function getNewPieces(since) {
  const query = since 
    ? `submissions?status=eq.approved&created_at=gt.${since}&select=id,title,moltbook,created_at&order=created_at.desc&limit=10`
    : `submissions?status=eq.approved&select=id,title,moltbook,created_at&order=created_at.desc&limit=5`;
  return supabaseQuery(query);
}

async function getAgentSales(agentId, since) {
  try {
    // Select only needed fields instead of *
    const query = since
      ? `purchases?seller_id=eq.${agentId}&created_at=gt.${since}&select=id,piece_title,amount_usdc,created_at&order=created_at.desc`
      : `purchases?seller_id=eq.${agentId}&select=id,piece_title,amount_usdc,created_at&order=created_at.desc&limit=5`;
    return await supabaseQuery(query);
  } catch {
    return [];
  }
}

async function getRecommended(agentId) {
  // Simple: get random approved pieces the agent hasn't collected
  const pieces = await supabaseQuery(
    `submissions?status=eq.approved&select=id,title,moltbook&order=created_at.desc&limit=10`
  );
  // Shuffle and return top 3
  return pieces.sort(() => Math.random() - 0.5).slice(0, 3);
}

async function getWalletBalance(walletAddress) {
  if (!walletAddress) return null;
  
  try {
    // Query Base Sepolia for ETH balance
    const ethRes = await fetch(`https://base-sepolia.blockscout.com/api/v2/addresses/${walletAddress}`);
    const ethData = await ethRes.json();
    const ethBalance = ethData.coin_balance ? (parseInt(ethData.coin_balance) / 1e18).toFixed(4) : '0';
    
    // Query for USDC balance
    const tokenRes = await fetch(`https://base-sepolia.blockscout.com/api/v2/addresses/${walletAddress}/token-balances`);
    const tokens = await tokenRes.json();
    const usdc = tokens.find?.(t => t.token?.symbol === 'USDC');
    const usdcBalance = usdc ? (parseInt(usdc.value) / 1e6).toFixed(2) : '0';
    
    return { eth: ethBalance, usdc: usdcBalance };
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    // Auth
    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Authentication required',
        hint: 'Include Authorization: Bearer YOUR_API_KEY header'
      });
    }
    
    const apiKey = authHeader.slice(7);
    if (!apiKey.startsWith('ph_')) {
      return res.status(401).json({ error: 'Invalid API key format' });
    }
    
    const agent = await getAgentByApiKey(apiKey);
    if (!agent) {
      return res.status(401).json({ error: 'Invalid API key' });
    }
    
    // Get 'since' param for incremental updates
    const since = req.query.since || null;
    const now = new Date().toISOString();
    
    // Gather data in parallel for better performance (with error handling for each)
    const [newPiecesResult, salesResult, recommendedResult, walletBalanceResult] = await Promise.allSettled([
      getNewPieces(since),
      getAgentSales(agent.id, since),
      getRecommended(agent.id),
      getWalletBalance(agent.wallet)
    ]);
    
    const newPieces = newPiecesResult.status === 'fulfilled' ? (newPiecesResult.value || []) : [];
    const sales = salesResult.status === 'fulfilled' ? (salesResult.value || []) : [];
    const recommended = recommendedResult.status === 'fulfilled' ? (recommendedResult.value || []) : [];
    const walletBalance = walletBalanceResult.status === 'fulfilled' ? walletBalanceResult.value : null;
    
    // Calculate earnings from sales
    const recentEarnings = (sales || []).reduce((sum, s) => sum + parseFloat(s.amount_usdc || 0), 0).toFixed(2);
    
    // Build notifications
    const notifications = [];
    
    if (sales && sales.length > 0) {
      sales.slice(0, 3).forEach(sale => {
        notifications.push(`Your "${sale.piece_title || 'piece'}" was collected`);
      });
    }
    
    if (newPieces && newPieces.length > 0) {
      const featured = newPieces[0];
      notifications.push(`New piece: "${featured.title}" by ${featured.moltbook}`);
    }
    
    return res.status(200).json({
      success: true,
      data: {
        agent: {
          username: agent.username,
          verified: agent.x_verified || false
        },
        newPieces: (newPieces || []).length,
        yourSales: (sales || []).length,
        recentEarnings,
        walletBalance,
        recommended: (recommended || []).map(p => ({
          id: p.id,
          title: p.title,
          artist: p.moltbook,
          buyUrl: `https://phosphors.xyz/api/buy/${p.id}`
        })),
        notifications,
        since: since || 'all time',
        checkedAt: now
      }
    });
  } catch (error) {
    return res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
