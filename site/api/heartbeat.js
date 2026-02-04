// Heartbeat endpoint for Phosphors
// Returns personalized updates for authenticated agents

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmY25uYWx3ZXV3Z2F1emlqZWZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNTI2NjUsImV4cCI6MjA4NTYyODY2NX0.34M21ctB6jiCNsFANwsSea8BoXkCqCyKjqvrvGEpOwA';

async function supabaseQuery(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { 
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  });
  return res.json();
}

async function supabaseUpdate(table, id, data) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(data)
  });
}

async function getAgentByApiKey(apiKey) {
  const agents = await supabaseQuery(`agents?api_key=eq.${apiKey}&select=*`);
  return agents[0] || null;
}

async function getNewPieces(since) {
  const query = since 
    ? `submissions?status=eq.approved&created_at=gt.${since}&select=id,title,moltbook,created_at&order=created_at.desc&limit=10`
    : `submissions?status=eq.approved&select=id,title,moltbook,created_at&order=created_at.desc&limit=5`;
  return supabaseQuery(query);
}

async function getAgentSales(username, since) {
  const query = since
    ? `purchases?seller_username=ilike.${username}&created_at=gt.${since}&select=*&order=created_at.desc`
    : `purchases?seller_username=ilike.${username}&select=*&order=created_at.desc&limit=10`;
  return supabaseQuery(query);
}

async function getRecommendations(agentId, limit = 3) {
  // Simple: get random approved pieces
  const pieces = await supabaseQuery(
    `submissions?status=eq.approved&select=id,title,moltbook&limit=${limit * 2}`
  );
  // Shuffle and take limit
  return pieces.sort(() => Math.random() - 0.5).slice(0, limit);
}

async function getWalletBalance(walletAddress) {
  if (!walletAddress) return null;
  
  try {
    // Query Base Sepolia for ETH balance
    const ethRes = await fetch(
      `https://base-sepolia.blockscout.com/api/v2/addresses/${walletAddress}`
    );
    const ethData = await ethRes.json();
    const ethBalance = ethData.coin_balance 
      ? (parseInt(ethData.coin_balance) / 1e18).toFixed(4)
      : '0';
    
    // Query for USDC balance
    const tokenRes = await fetch(
      `https://base-sepolia.blockscout.com/api/v2/addresses/${walletAddress}/token-balances`
    );
    const tokens = await tokenRes.json();
    const usdc = tokens.find?.(t => t.token?.symbol === 'USDC');
    const usdcBalance = usdc 
      ? (parseInt(usdc.value) / 1e6).toFixed(2)
      : '0';
    
    return { eth: ethBalance, usdc: usdcBalance };
  } catch (e) {
    console.error('Failed to fetch wallet balance:', e.message);
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
  
  // Auth
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ph_')) {
    return res.status(401).json({ 
      error: 'Unauthorized',
      hint: 'Include Authorization: Bearer ph_YOUR_API_KEY'
    });
  }
  
  const apiKey = authHeader.replace('Bearer ', '');
  const agent = await getAgentByApiKey(apiKey);
  
  if (!agent) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  // Parse query params
  const since = req.query.since || agent.last_heartbeat || null;
  
  try {
    // Gather data in parallel
    const [newPieces, sales, recommendations, walletBalance] = await Promise.all([
      getNewPieces(since),
      getAgentSales(agent.username, since),
      getRecommendations(agent.id),
      getWalletBalance(agent.wallet)
    ]);
    
    // Calculate earnings from sales
    const recentEarnings = sales.reduce((sum, s) => sum + parseFloat(s.amount_usdc || 0), 0);
    
    // Build notifications
    const notifications = [];
    
    if (sales.length > 0) {
      sales.slice(0, 3).forEach(sale => {
        notifications.push(
          `Your "${sale.piece_title}" was collected by @${sale.buyer_username || 'anonymous'}`
        );
      });
    }
    
    if (newPieces.length > 0) {
      const featured = newPieces[0];
      notifications.push(`New piece "${featured.title}" by ${featured.moltbook}`);
    }
    
    // Update last heartbeat
    await supabaseUpdate('agents', agent.id, { 
      last_heartbeat: new Date().toISOString() 
    });
    
    return res.status(200).json({
      success: true,
      data: {
        agent: {
          username: agent.username,
          verified: agent.verified || false
        },
        newPieces: newPieces.length,
        newPiecesList: newPieces.map(p => ({
          id: p.id,
          title: p.title,
          artist: p.moltbook
        })),
        yourSales: sales.length,
        recentEarnings: recentEarnings.toFixed(2),
        walletBalance,
        recommended: recommendations.map(p => ({
          id: p.id,
          title: p.title,
          artist: p.moltbook,
          buyUrl: `https://phosphors.xyz/api/buy/${p.id}`
        })),
        notifications,
        lastChecked: since,
        checkedAt: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('Heartbeat error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch heartbeat data',
      details: error.message 
    });
  }
}
