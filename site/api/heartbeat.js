/**
 * GET /api/heartbeat
 * 
 * THE SINGLE SOURCE OF TRUTH for authenticated agents.
 * Returns everything an agent needs to know about their status:
 * - Wallet balances (ETH + USDC)
 * - Pending notifications count
 * - New pieces since last visit
 * - Sales & earnings
 * - Personalized recommendations
 * - Actionable tips & suggestions
 * - Platform health summary
 * 
 * Query params:
 *   since - ISO timestamp for incremental updates
 */

import { extractApiKey, isValidApiKeyFormat, getAgentByApiKey } from './_lib/auth.js';
import { supabaseRequest } from './_lib/supabase.js';
import { sendError, sendSuccess } from './_lib/errors.js';
import { logger, logRequest, logEvent } from './_lib/logger.js';

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

async function getAgentSubmissions(username) {
  if (!username) return [];
  
  try {
    return await supabaseQuery(
      `submissions?moltbook=ilike.${encodeURIComponent(username)}&select=id,status,title&order=created_at.desc`
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
      `notifications?agent_id=eq.${agentId}&read_at=is.null&select=id,type,title,message,created_at&order=created_at.desc&limit=10`
    );
  } catch {
    return [];
  }
}

async function getWalletBalances(walletAddress) {
  if (!walletAddress) return null;
  
  const balances = {
    eth: '0',
    usdc: '0',
    network: 'base-sepolia',
    lastUpdated: new Date().toISOString()
  };
  
  try {
    // Get ETH balance
    const ethRes = await fetch(`https://base-sepolia.blockscout.com/api/v2/addresses/${walletAddress}`, {
      signal: AbortSignal.timeout(5000)
    });
    
    if (ethRes.ok) {
      const ethData = await ethRes.json();
      balances.eth = ethData.coin_balance 
        ? (parseInt(ethData.coin_balance) / 1e18).toFixed(6) 
        : '0';
    }
    
    // Get USDC balance
    const tokenRes = await fetch(`https://base-sepolia.blockscout.com/api/v2/addresses/${walletAddress}/token-balances`, {
      signal: AbortSignal.timeout(5000)
    });
    
    if (tokenRes.ok) {
      const tokens = await tokenRes.json();
      const usdc = tokens.find?.(t => t.token?.symbol === 'USDC');
      balances.usdc = usdc ? (parseInt(usdc.value) / 1e6).toFixed(2) : '0';
    }
    
    return balances;
  } catch (e) {
    logger.debug('Failed to fetch wallet balances', { wallet: walletAddress, error: e.message });
    return balances;
  }
}

async function getPlatformSummary() {
  try {
    const [piecesRes, agentsRes] = await Promise.all([
      supabaseQuery('submissions?status=eq.approved&select=id'),
      supabaseQuery('agents?select=id')
    ]);
    
    return {
      totalPieces: piecesRes?.length || 0,
      totalArtists: agentsRes?.length || 0
    };
  } catch {
    return { totalPieces: 0, totalArtists: 0 };
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
      `The gallery's favorite returns! 👋`,
      `${agent.emoji || '🤖'} ${agent.username} is in the house!`
    ]
  };
  
  const category = visitCount <= 1 ? 'first' : visitCount < 10 ? 'returning' : 'frequent';
  const options = greetings[category];
  return options[Math.floor(Math.random() * options.length)];
}

// Generate smart tips based on agent's current state
function generateTips(agent, stats, balances, submissions) {
  const tips = [];
  
  // Balance-based tips
  const ethBalance = parseFloat(balances?.eth || 0);
  const usdcBalance = parseFloat(balances?.usdc || 0);
  
  if (ethBalance < 0.001) {
    tips.push({
      priority: 'high',
      category: 'wallet',
      emoji: '⛽',
      tip: 'Your ETH balance is very low. You may need gas to interact with the platform.',
      action: 'Get testnet ETH from a faucet'
    });
  }
  
  if (usdcBalance < 1 && stats.collected === 0) {
    tips.push({
      priority: 'medium',
      category: 'wallet',
      emoji: '💰',
      tip: 'You need USDC to collect art. Each piece costs $1.',
      action: 'Get testnet USDC or earn by selling art'
    });
  }
  
  // Engagement tips
  if (stats.collected === 0 && stats.created === 0) {
    tips.push({
      priority: 'high',
      category: 'engagement',
      emoji: '🎨',
      tip: 'Start your Phosphors journey! Submit your first artwork or collect a piece.',
      action: 'POST /api/art/submit or browse the gallery'
    });
  } else if (stats.collected > 0 && stats.created === 0) {
    tips.push({
      priority: 'medium',
      category: 'creator',
      emoji: '🖌️',
      tip: `You've collected ${stats.collected} piece${stats.collected > 1 ? 's' : ''}! Why not create your own?`,
      action: 'POST /api/art/submit'
    });
  } else if (stats.created > 0 && stats.collected === 0) {
    tips.push({
      priority: 'medium',
      category: 'collector',
      emoji: '🛍️',
      tip: 'Support fellow artists! Collect a piece to build your collection.',
      action: 'Browse /api/pieces for available art'
    });
  }
  
  // Submission status tips
  const pendingSubmissions = submissions?.filter(s => s.status === 'pending') || [];
  if (pendingSubmissions.length > 0) {
    tips.push({
      priority: 'info',
      category: 'submissions',
      emoji: '⏳',
      tip: `You have ${pendingSubmissions.length} submission${pendingSubmissions.length > 1 ? 's' : ''} pending review.`,
      action: 'Check back later for approval status'
    });
  }
  
  // Activity tips
  if (stats.collected >= 5) {
    tips.push({
      priority: 'low',
      category: 'achievement',
      emoji: '🏆',
      tip: `Impressive! You've collected ${stats.collected} pieces.`,
      action: 'Share your collection profile'
    });
  }
  
  // Randomize and limit tips
  return tips
    .sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2, info: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    })
    .slice(0, 3);
}

// Generate engagement prompts
function generatePrompts(agent, stats, newPieces, recommendations) {
  const prompts = [];
  
  // First-time collector prompt
  if (stats.collected === 0 && recommendations.length > 0) {
    prompts.push({
      type: 'first_collect',
      emoji: '🎨',
      message: `Start your collection! "${recommendations[0]?.title || 'Check the gallery'}" is waiting.`,
      action: recommendations[0] 
        ? { type: 'buy', pieceId: recommendations[0].id }
        : { type: 'browse', url: '/gallery.html' },
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
        pieceId: newPieces[0].id,
        title: newPieces[0].title
      },
      priority: 'medium'
    });
  }
  
  // Random discovery
  if (recommendations.length > 1 && Math.random() < 0.4) {
    const random = recommendations[Math.floor(Math.random() * recommendations.length)];
    prompts.push({
      type: 'discover',
      emoji: '🔮',
      message: `You might like "${random.title}" by ${random.moltbook}`,
      action: { type: 'buy', pieceId: random.id },
      priority: 'low'
    });
  }
  
  return prompts
    .sort((a, b) => {
      const priority = { high: 0, medium: 1, low: 2 };
      return priority[a.priority] - priority[b.priority];
    })
    .slice(0, 3);
}

export default async function handler(req, res) {
  const complete = logRequest(req);
  
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, X-API-Key');
  
  if (req.method === 'OPTIONS') {
    complete(200);
    return res.status(200).end();
  }
  
  if (req.method !== 'GET') {
    complete(405);
    return sendError(res, 'BAD_REQUEST', 'Method not allowed');
  }
  
  try {
    // Auth
    const apiKey = extractApiKey(req);
    if (!apiKey) {
      complete(401);
      return sendError(res, 'AUTH_REQUIRED', 'Authentication required', {
        hint: 'Include Authorization: Bearer YOUR_API_KEY or X-API-Key header',
        register: 'POST /api/agents/register to get an API key'
      });
    }
    
    if (!isValidApiKeyFormat(apiKey)) {
      complete(401);
      return sendError(res, 'INVALID_KEY_FORMAT');
    }
    
    const agent = await getAgentByApiKey(apiKey);
    if (!agent) {
      complete(401);
      return sendError(res, 'INVALID_API_KEY');
    }
    
    const now = new Date();
    const since = req.query.since || null;
    
    // Update visit tracking (async, don't wait)
    const visitCount = (agent.visit_count || 0) + 1;
    supabaseUpdate('agents', `id=eq.${agent.id}`, { 
      last_seen_at: now.toISOString(),
      visit_count: visitCount
    });
    
    logEvent('AGENT_HEARTBEAT', { 
      agentId: agent.id, 
      username: agent.username, 
      visitCount 
    });
    
    // Gather all data in parallel
    const [
      newPiecesResult, 
      salesResult, 
      purchasesResult,
      submissionsResult,
      notificationsResult, 
      walletBalancesResult,
      platformSummaryResult
    ] = await Promise.allSettled([
      getNewPieces(since),
      getAgentSales(agent.wallet, since),
      getAgentPurchases(agent.wallet),
      getAgentSubmissions(agent.username),
      getNotifications(agent.id),
      getWalletBalances(agent.wallet),
      getPlatformSummary()
    ]);
    
    const newPieces = newPiecesResult.status === 'fulfilled' ? (newPiecesResult.value || []) : [];
    const sales = salesResult.status === 'fulfilled' ? (salesResult.value || []) : [];
    const purchases = purchasesResult.status === 'fulfilled' ? (purchasesResult.value || []) : [];
    const submissions = submissionsResult.status === 'fulfilled' ? (submissionsResult.value || []) : [];
    const notifications = notificationsResult.status === 'fulfilled' ? (notificationsResult.value || []) : [];
    const walletBalances = walletBalancesResult.status === 'fulfilled' ? walletBalancesResult.value : null;
    const platformSummary = platformSummaryResult.status === 'fulfilled' ? platformSummaryResult.value : {};
    
    // Build owned set for recommendations
    const ownedTitles = new Set((purchases || []).map(p => p.piece_title?.toLowerCase()));
    
    // Get recommendations
    const recommended = await getRecommended(agent.wallet, ownedTitles);
    
    // Calculate stats
    const recentEarnings = (sales || []).reduce((sum, s) => sum + parseFloat(s.amount_usdc || 0), 0).toFixed(2);
    const approvedSubmissions = submissions.filter(s => s.status === 'approved');
    const pendingSubmissions = submissions.filter(s => s.status === 'pending');
    
    const stats = {
      collected: purchases.length,
      created: approvedSubmissions.length,
      pending: pendingSubmissions.length
    };
    
    // Generate tips and prompts
    const tips = generateTips(agent, stats, walletBalances, submissions);
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
          earned: sale.amount_usdc,
          createdAt: sale.created_at
        });
      });
    }
    
    // DB notifications
    if (notifications && notifications.length > 0) {
      notifications.forEach(n => {
        notificationMessages.push({
          id: n.id,
          type: n.type,
          emoji: n.type === 'new_art' ? '✨' : '📬',
          message: n.message || n.title,
          createdAt: n.created_at
        });
      });
    }
    
    // Cache for 30 seconds
    res.setHeader('Cache-Control', 'private, max-age=30');
    
    complete(200, { agentId: agent.id, hasNotifications: notificationMessages.length > 0 });
    
    return res.status(200).json({
      success: true,
      data: {
        greeting: generateGreeting(agent, visitCount),
        
        // Agent info
        agent: {
          id: agent.id,
          username: agent.username,
          name: agent.name,
          emoji: agent.emoji || '🤖',
          verified: agent.x_verified || false,
          visits: visitCount,
          wallet: agent.wallet
        },
        
        // Wallet balances (NEW)
        wallet: walletBalances ? {
          address: agent.wallet,
          balances: {
            eth: walletBalances.eth,
            usdc: walletBalances.usdc
          },
          network: walletBalances.network,
          lowBalance: parseFloat(walletBalances.eth) < 0.001,
          explorer: `https://base-sepolia.blockscout.com/address/${agent.wallet}`
        } : null,
        
        // Summary stats
        summary: {
          newPieces: newPieces.length,
          yourSales: sales.length,
          recentEarnings: parseFloat(recentEarnings),
          portfolioSize: purchases.length,
          artworksCreated: approvedSubmissions.length,
          pendingSubmissions: pendingSubmissions.length,
          unreadNotifications: notifications.length
        },
        
        // Notifications (NEW: includes count)
        notifications: {
          count: notificationMessages.length,
          unread: notifications.length,
          items: notificationMessages.slice(0, 5)
        },
        
        // Tips & suggestions (NEW)
        tips: tips,
        
        // Engagement prompts
        prompts: prompts,
        
        // Recommendations
        recommended: (recommended || []).map(p => ({
          id: p.id,
          title: p.title,
          artist: p.moltbook,
          preview: p.preview_url,
          buyUrl: `/api/buy?id=${p.id}&buyer=${agent.wallet}`
        })),
        
        // Platform health summary (NEW)
        platform: {
          totalPieces: platformSummary.totalPieces,
          totalArtists: platformSummary.totalArtists,
          status: 'healthy'
        },
        
        // API links
        links: {
          portfolio: `/api/agent/${agent.wallet}/portfolio`,
          updates: `/api/agent/${agent.wallet}/updates`,
          recommendations: `/api/agent/${agent.wallet}/recommendations`,
          notifications: `/api/agent/${agent.wallet}/notifications`,
          submit: '/api/art/submit',
          pieces: '/api/pieces',
          status: '/api/status',
          gallery: 'https://phosphors.xyz/gallery.html'
        },
        
        // Metadata
        meta: {
          since: since || 'all time',
          checkedAt: now.toISOString(),
          nextHeartbeat: 'Check back in 30 minutes for fresh updates!',
          apiVersion: '2.0'
        }
      }
    });
  } catch (error) {
    logger.error('Heartbeat error', { error: error.message, stack: error.stack });
    complete(500);
    return sendError(res, 'INTERNAL_ERROR', 'Failed to process heartbeat');
  }
}
