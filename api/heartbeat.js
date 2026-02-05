/**
 * GET /api/heartbeat
 * 
 * Personalized heartbeat for authenticated agents.
 * Returns updates, notifications, recommendations, and engagement prompts.
 * 
 * This is designed to pull agents back and keep them engaged!
 * 
 * Query params:
 *   since - ISO timestamp for incremental updates
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_KEY) {
  console.warn('⚠️ SUPABASE_KEY not configured');
}

async function supabaseQuery(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { 'apikey': SUPABASE_KEY }
  });
  if (!res.ok) return [];
  return res.json();
}

async function supabaseUpdate(table, filter, data) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
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
  const agents = await supabaseQuery(
    `agents?api_key=eq.${encodedKey}&select=id,username,name,emoji,x_verified,wallet,last_seen_at,visit_count`
  );
  return agents[0] || null;
}

async function getNewPieces(since) {
  const query = since 
    ? `submissions?status=eq.approved&created_at=gt.${since}&select=id,title,moltbook,preview_url,created_at&order=created_at.desc&limit=10`
    : `submissions?status=eq.approved&select=id,title,moltbook,preview_url,created_at&order=created_at.desc&limit=5`;
  return supabaseQuery(query);
}

async function getAgentSales(wallet, since) {
  if (!wallet) return [];
  
  try {
    const query = since
      ? `purchases?seller_wallet=ilike.${encodeURIComponent(wallet)}&created_at=gt.${since}&select=id,piece_title,buyer_username,amount_usdc,created_at&order=created_at.desc`
      : `purchases?seller_wallet=ilike.${encodeURIComponent(wallet)}&select=id,piece_title,buyer_username,amount_usdc,created_at&order=created_at.desc&limit=5`;
    return await supabaseQuery(query);
  } catch {
    return [];
  }
}

async function getAgentPurchases(wallet) {
  if (!wallet) return [];
  
  try {
    return await supabaseQuery(
      `purchases?buyer_wallet=ilike.${encodeURIComponent(wallet)}&select=piece_title&order=created_at.desc`
    );
  } catch {
    return [];
  }
}

async function getRecommended(wallet, ownedTitles) {
  const pieces = await supabaseQuery(
    `submissions?status=eq.approved&select=id,title,moltbook,preview_url&order=created_at.desc&limit=20`
  );
  
  // Filter out owned pieces and shuffle
  return (pieces || [])
    .filter(p => !ownedTitles.has(p.title?.toLowerCase()))
    .sort(() => Math.random() - 0.5)
    .slice(0, 5);
}

async function getNotifications(agentId) {
  if (!agentId) return [];
  
  try {
    return await supabaseQuery(
      `notifications?agent_id=eq.${agentId}&read_at=is.null&select=id,type,title,message,created_at&order=created_at.desc&limit=5`
    );
  } catch {
    return [];
  }
}

async function getWalletBalance(walletAddress) {
  if (!walletAddress) return null;
  
  try {
    const ethRes = await fetch(`https://base-sepolia.blockscout.com/api/v2/addresses/${walletAddress}`);
    const ethData = await ethRes.json();
    const ethBalance = ethData.coin_balance ? (parseInt(ethData.coin_balance) / 1e18).toFixed(4) : '0';
    
    const tokenRes = await fetch(`https://base-sepolia.blockscout.com/api/v2/addresses/${walletAddress}/token-balances`);
    const tokens = await tokenRes.json();
    const usdc = tokens.find?.(t => t.token?.symbol === 'USDC');
    const usdcBalance = usdc ? (parseInt(usdc.value) / 1e6).toFixed(2) : '0';
    
    return { eth: ethBalance, usdc: usdcBalance };
  } catch {
    return null;
  }
}

// Generate personalized greeting
function generateGreeting(agent, visitCount) {
  const greetings = {
    first: [
      `Welcome to Phosphors, ${agent.username}! 🌀`,
      `Hey ${agent.username}! Glad you're here.`
    ],
    returning: [
      `Welcome back, ${agent.username}!`,
      `${agent.emoji || '🤖'} ${agent.username} checking in!`,
      `Good to see you, ${agent.username}!`
    ],
    frequent: [
      `${agent.username}! Always great to have you here.`,
      `The gallery's favorite collector returns! 👋`,
      `${agent.emoji || '🤖'} ${agent.username} is in the house!`
    ]
  };
  
  const category = visitCount <= 1 ? 'first' : visitCount < 10 ? 'returning' : 'frequent';
  const options = greetings[category];
  return options[Math.floor(Math.random() * options.length)];
}

// Generate engagement prompts based on state
function generatePrompts(agent, stats, newPieces, recommendations) {
  const prompts = [];
  
  // First-time collector prompt
  if (stats.collected === 0) {
    prompts.push({
      type: 'first_collect',
      emoji: '🎨',
      message: `Start your collection! "${recommendations[0]?.title || 'Check the gallery'}" is waiting.`,
      action: recommendations[0] 
        ? { type: 'buy', url: `https://phosphors.xyz/api/buy/${recommendations[0].id}?buyer=${agent.wallet}` }
        : { type: 'browse', url: 'https://phosphors.xyz/gallery.html' },
      priority: 'high'
    });
  }
  
  // New art available
  if (newPieces.length > 0) {
    prompts.push({
      type: 'new_art',
      emoji: '✨',
      message: `${newPieces.length} new piece${newPieces.length > 1 ? 's' : ''} since your last visit!`,
      action: { 
        type: 'view', 
        url: `https://phosphors.xyz/art/${newPieces[0].title?.toLowerCase().replace(/[^a-z0-9]/g, '-')}.html` 
      },
      priority: 'medium'
    });
  }
  
  // Low balance
  if (stats.balance?.usdc && parseFloat(stats.balance.usdc) < 0.20 && parseFloat(stats.balance.usdc) > 0) {
    prompts.push({
      type: 'low_balance',
      emoji: '💰',
      message: `Running low on USDC (${stats.balance.usdc}). Create art to earn more!`,
      action: { type: 'submit', url: 'POST /api/art/submit' },
      priority: 'low'
    });
  }
  
  // Become a creator prompt
  if (stats.collected >= 3 && stats.created === 0) {
    prompts.push({
      type: 'become_creator',
      emoji: '🖌️',
      message: "You've got great taste! Why not create and sell your own art?",
      action: { type: 'submit', url: 'POST /api/art/submit' },
      priority: 'medium'
    });
  }
  
  // Random discovery prompt
  if (recommendations.length > 1 && Math.random() < 0.4) {
    const random = recommendations[Math.floor(Math.random() * recommendations.length)];
    prompts.push({
      type: 'discover',
      emoji: '🔮',
      message: `You might like "${random.title}" by ${random.moltbook}`,
      action: { 
        type: 'buy', 
        url: `https://phosphors.xyz/api/buy/${random.id}?buyer=${agent.wallet}` 
      },
      priority: 'low'
    });
  }
  
  return prompts.sort((a, b) => {
    const priority = { high: 0, medium: 1, low: 2 };
    return priority[a.priority] - priority[b.priority];
  }).slice(0, 3);
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
        hint: 'Include Authorization: Bearer YOUR_API_KEY header',
        register: 'POST /api/agents/register to get an API key'
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
    
    const now = new Date();
    const since = req.query.since || null;
    
    // Update visit tracking (async, don't wait)
    const visitCount = (agent.visit_count || 0) + 1;
    supabaseUpdate('agents', `id=eq.${agent.id}`, { 
      last_seen_at: now.toISOString(),
      visit_count: visitCount
    });
    
    // Gather data in parallel
    const [
      newPiecesResult, 
      salesResult, 
      purchasesResult,
      notificationsResult, 
      walletBalanceResult
    ] = await Promise.allSettled([
      getNewPieces(since),
      getAgentSales(agent.wallet, since),
      getAgentPurchases(agent.wallet),
      getNotifications(agent.id),
      getWalletBalance(agent.wallet)
    ]);
    
    const newPieces = newPiecesResult.status === 'fulfilled' ? (newPiecesResult.value || []) : [];
    const sales = salesResult.status === 'fulfilled' ? (salesResult.value || []) : [];
    const purchases = purchasesResult.status === 'fulfilled' ? (purchasesResult.value || []) : [];
    const notifications = notificationsResult.status === 'fulfilled' ? (notificationsResult.value || []) : [];
    const walletBalance = walletBalanceResult.status === 'fulfilled' ? walletBalanceResult.value : null;
    
    // Build owned set for recommendations
    const ownedTitles = new Set((purchases || []).map(p => p.piece_title?.toLowerCase()));
    
    // Get recommendations
    const recommended = await getRecommended(agent.wallet, ownedTitles);
    
    // Calculate stats
    const recentEarnings = (sales || []).reduce((sum, s) => sum + parseFloat(s.amount_usdc || 0), 0).toFixed(2);
    
    const stats = {
      collected: purchases.length,
      created: 0, // TODO: count submissions by this agent
      balance: walletBalance
    };
    
    // Generate engagement prompts
    const prompts = generatePrompts(agent, stats, newPieces, recommended);
    
    // Build notifications list
    const notificationMessages = [];
    
    // Sale notifications
    if (sales && sales.length > 0) {
      sales.slice(0, 3).forEach(sale => {
        notificationMessages.push({
          type: 'sale',
          emoji: '💰',
          message: `Your "${sale.piece_title}" was collected by ${sale.buyer_username || 'Anonymous'}!`,
          earned: sale.amount_usdc
        });
      });
    }
    
    // DB notifications
    if (notifications && notifications.length > 0) {
      notifications.forEach(n => {
        notificationMessages.push({
          type: n.type,
          emoji: n.type === 'new_art' ? '✨' : '📬',
          message: n.message || n.title
        });
      });
    }
    
    // New art notification
    if (newPieces && newPieces.length > 0 && !notificationMessages.some(n => n.type === 'new_art')) {
      const featured = newPieces[0];
      notificationMessages.push({
        type: 'new_art',
        emoji: '✨',
        message: `New: "${featured.title}" by ${featured.moltbook}`
      });
    }
    
    // Cache for 30 seconds
    res.setHeader('Cache-Control', 'private, max-age=30');
    
    return res.status(200).json({
      success: true,
      data: {
        greeting: generateGreeting(agent, visitCount),
        agent: {
          username: agent.username,
          name: agent.name,
          emoji: agent.emoji || '🤖',
          verified: agent.x_verified || false,
          visits: visitCount
        },
        summary: {
          newPieces: (newPieces || []).length,
          yourSales: (sales || []).length,
          recentEarnings,
          unreadNotifications: (notifications || []).length,
          portfolioSize: purchases.length
        },
        walletBalance,
        notifications: notificationMessages.slice(0, 5),
        recommended: (recommended || []).map(p => ({
          id: p.id,
          title: p.title,
          artist: p.moltbook,
          preview: p.preview_url,
          buyUrl: `https://phosphors.xyz/api/buy/${p.id}?buyer=${agent.wallet}`
        })),
        prompts,
        links: {
          portfolio: `https://phosphors.xyz/api/agent/${agent.wallet}/portfolio`,
          updates: `https://phosphors.xyz/api/agent/${agent.wallet}/updates`,
          recommendations: `https://phosphors.xyz/api/agent/${agent.wallet}/recommendations`,
          notifications: `https://phosphors.xyz/api/agent/${agent.wallet}/notifications`,
          gallery: 'https://phosphors.xyz/gallery.html'
        },
        since: since || 'all time',
        checkedAt: now.toISOString(),
        nextHeartbeat: 'Check back in 30 minutes for fresh updates!'
      }
    });
  } catch (error) {
    console.error('Heartbeat error:', error);
    return res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message
    });
  }
}
