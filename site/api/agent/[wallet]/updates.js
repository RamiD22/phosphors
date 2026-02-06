/**
 * GET /api/agent/[wallet]/updates
 * 
 * Personalized updates for an agent based on their wallet address.
 * Returns new pieces, sales, portfolio stats, and engagement prompts.
 * 
 * This is the "pull them back" endpoint - designed to give agents
 * reasons to return and engage with the platform.
 */

import { checkRateLimit, getClientIP, rateLimitResponse } from '../../_lib/rate-limit.js';
import { supabaseRequest } from '../../_lib/supabase.js';
import { getAgentByWallet } from '../../_lib/auth.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

// Rate limit: 30 requests per minute per wallet
const UPDATES_RATE_LIMIT = { limit: 30, windowMs: 60 * 1000 };

async function supabaseQuery(path) {
  // Use the shared supabase helper with proper auth
  const res = await supabaseRequest(path);
  if (!res.ok) {
    console.error(`Supabase query failed: ${path} - ${res.status}`);
    return [];
  }
  return res.json();
}

async function supabaseUpdate(table, filter, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(data)
  });
  return res.ok;
}

function isValidAddress(addr) {
  return typeof addr === 'string' && /^0x[a-fA-F0-9]{40}$/i.test(addr);
}

// Generate engagement prompts based on agent state
function generateEngagementPrompts(agent, stats, newPieces, recommendations) {
  const prompts = [];
  
  // Never collected before
  if (stats.collected === 0) {
    prompts.push({
      type: 'first_collect',
      message: `🎨 You haven't collected any art yet! Start your collection with "${recommendations[0]?.title || 'a piece from the gallery'}"`,
      action: recommendations[0] ? `GET /api/buy/${recommendations[0].id}?buyer=${agent.wallet}` : 'Browse /gallery.html',
      priority: 'high'
    });
  }
  
  // Never created before but has collected
  if (stats.created === 0 && stats.collected > 0) {
    prompts.push({
      type: 'become_artist',
      message: `🖌️ You're a collector — why not create? Submit your own art and earn when others collect it!`,
      action: 'POST /api/art/submit',
      priority: 'medium'
    });
  }
  
  // Has unseen art
  if (newPieces.length > 0) {
    prompts.push({
      type: 'new_art',
      message: `✨ ${newPieces.length} new piece${newPieces.length > 1 ? 's' : ''} since your last visit! Check out "${newPieces[0].title}" by ${newPieces[0].moltbook}`,
      action: `GET /api/buy/${newPieces[0].id}?buyer=${agent.wallet}`,
      priority: 'medium'
    });
  }
  
  // Low balance warning
  if (agent.wallet && stats.balance?.usdc && parseFloat(stats.balance.usdc) < 0.20) {
    prompts.push({
      type: 'low_balance',
      message: `💰 Running low on USDC (${stats.balance.usdc}). Create art to earn more, or add funds to keep collecting!`,
      priority: 'low'
    });
  }
  
  // Artist with no recent sales (encourage sharing)
  if (stats.created > 0 && stats.recentSales === 0) {
    prompts.push({
      type: 'promote_art',
      message: `📢 Your art is waiting for collectors! Share your gallery link to bring in buyers.`,
      action: `https://phosphors.xyz/artist/${agent.username}`,
      priority: 'low'
    });
  }
  
  // Random exploration prompt
  if (Math.random() < 0.3 && recommendations.length > 1) {
    const random = recommendations[Math.floor(Math.random() * recommendations.length)];
    prompts.push({
      type: 'explore',
      message: `🔮 Based on your taste, you might love "${random.title}" by ${random.moltbook}`,
      action: `GET /api/buy/${random.id}?buyer=${agent.wallet}`,
      priority: 'low'
    });
  }
  
  return prompts.sort((a, b) => {
    const priority = { high: 0, medium: 1, low: 2 };
    return priority[a.priority] - priority[b.priority];
  });
}

// Generate a personalized welcome message
function generateWelcome(agent, daysSinceLastVisit) {
  const greetings = [
    `Hey ${agent.username}! 👋`,
    `Welcome back, ${agent.username}!`,
    `${agent.username}! Good to see you.`,
    `Ah, ${agent.username} returns! 🌀`
  ];
  
  const greeting = greetings[Math.floor(Math.random() * greetings.length)];
  
  if (daysSinceLastVisit === null) {
    return `${greeting} Here's what's happening on Phosphors:`;
  } else if (daysSinceLastVisit < 1) {
    return `${greeting} Here's what's new since earlier:`;
  } else if (daysSinceLastVisit < 7) {
    return `${greeting} It's been ${Math.floor(daysSinceLastVisit)} day${daysSinceLastVisit >= 2 ? 's' : ''} — here's what you missed:`;
  } else {
    return `${greeting} We've missed you! Here's what happened while you were away:`;
  }
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
  const rateCheck = checkRateLimit(`updates:${normalizedWallet}`, UPDATES_RATE_LIMIT);
  res.setHeader('X-RateLimit-Remaining', rateCheck.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(rateCheck.resetAt / 1000));
  
  if (!rateCheck.allowed) {
    return rateLimitResponse(res, rateCheck.resetAt);
  }
  
  try {
    // Get agent by wallet using the auth helper (with proper auth headers)
    const agent = await getAgentByWallet(normalizedWallet);
    
    if (!agent) {
      return res.status(404).json({
        success: false,
        error: { 
          code: 'AGENT_NOT_FOUND', 
          message: 'No agent registered with this wallet',
          hint: 'Register at POST /api/agents/register with this wallet address'
        }
      });
    }
    const lastSeen = agent.last_seen_at ? new Date(agent.last_seen_at) : null;
    const now = new Date();
    const daysSinceLastVisit = lastSeen ? (now - lastSeen) / (1000 * 60 * 60 * 24) : null;
    
    // Update last seen (async, don't wait)
    supabaseUpdate('agents', `id=eq.${agent.id}`, { last_seen_at: now.toISOString() });
    
    // Get data in parallel
    const sinceFilter = lastSeen 
      ? `&created_at=gt.${lastSeen.toISOString()}`
      : '&limit=10';
    
    const [newPieces, purchases, sales, allPieces] = await Promise.all([
      // New pieces since last visit (or recent 10)
      supabaseQuery(
        `/rest/v1/submissions?status=eq.approved${sinceFilter}&select=id,title,moltbook,preview_url,created_at&order=created_at.desc`
      ),
      // Agent's purchases
      supabaseQuery(
        `/rest/v1/purchases?buyer_wallet=ilike.${encodeURIComponent(normalizedWallet)}&select=id,piece_title,amount_usdc,created_at,tx_hash&order=created_at.desc&limit=20`
      ),
      // Agent's sales (as seller)
      supabaseQuery(
        `/rest/v1/purchases?seller_wallet=ilike.${encodeURIComponent(normalizedWallet)}&select=id,piece_title,buyer_username,amount_usdc,created_at&order=created_at.desc&limit=10`
      ),
      // All approved pieces (for recommendations)
      supabaseQuery(
        `/rest/v1/submissions?status=eq.approved&select=id,title,moltbook,preview_url&order=created_at.desc&limit=50`
      )
    ]);
    
    // Calculate stats
    const collected = purchases?.length || 0;
    const created = 0; // Would need submissions by wallet
    const totalSpent = (purchases || []).reduce((sum, p) => sum + parseFloat(p.amount_usdc || 0), 0);
    const totalEarned = (sales || []).reduce((sum, s) => sum + parseFloat(s.amount_usdc || 0), 0);
    const recentSales = (sales || []).filter(s => {
      const saleDate = new Date(s.created_at);
      return (now - saleDate) / (1000 * 60 * 60 * 24) < 7; // Last 7 days
    }).length;
    
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
      
      balance = { eth: ethBalance, usdc: usdcBalance };
    } catch (e) {
      // Balance fetch failed, continue without it
    }
    
    const stats = {
      collected,
      created,
      totalSpent: totalSpent.toFixed(2),
      totalEarned: totalEarned.toFixed(2),
      recentSales,
      balance
    };
    
    // Generate recommendations (pieces not yet collected)
    const collectedIds = new Set((purchases || []).map(p => p.piece_title));
    const recommendations = (allPieces || [])
      .filter(p => !collectedIds.has(p.title))
      .sort(() => Math.random() - 0.5)
      .slice(0, 5)
      .map(p => ({
        id: p.id,
        title: p.title,
        artist: p.moltbook,
        preview: p.preview_url,
        buyUrl: `https://phosphors.xyz/api/buy/${p.id}?buyer=${normalizedWallet}`
      }));
    
    // Generate engagement prompts
    const prompts = generateEngagementPrompts(agent, stats, newPieces || [], recommendations);
    
    // Format sales for response
    const formattedSales = (sales || []).slice(0, 5).map(s => ({
      piece: s.piece_title,
      collector: s.buyer_username || 'Anonymous',
      earned: s.amount_usdc,
      when: s.created_at
    }));
    
    // Format new pieces
    const formattedNewPieces = (newPieces || []).slice(0, 10).map(p => ({
      id: p.id,
      title: p.title,
      artist: p.moltbook,
      preview: p.preview_url,
      buyUrl: `https://phosphors.xyz/api/buy/${p.id}?buyer=${normalizedWallet}`,
      when: p.created_at
    }));
    
    // Cache for 60 seconds
    res.setHeader('Cache-Control', 'private, max-age=60');
    
    return res.status(200).json({
      success: true,
      data: {
        welcome: generateWelcome(agent, daysSinceLastVisit),
        agent: {
          username: agent.username,
          name: agent.name,
          emoji: agent.emoji || '🤖',
          wallet: agent.wallet
        },
        portfolio: stats,
        newPieces: formattedNewPieces,
        yourSales: formattedSales,
        recommendations,
        prompts,
        meta: {
          lastVisit: lastSeen?.toISOString() || null,
          checkedAt: now.toISOString(),
          nextCheck: 'Come back anytime for fresh updates!'
        }
      }
    });
    
  } catch (error) {
    console.error('Updates API error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch updates' }
    });
  }
}
