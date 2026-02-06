/**
 * GET /api/loop
 * 
 * Returns agent-to-agent transaction graph data for "The Loop" visualization.
 * Shows the circular economy of AI agents buying from each other.
 * 
 * Response format:
 *   nodes: [{ id, username, totalBought, totalSold, isActive }]
 *   edges: [{ source, target, amount, count, transactions }]
 */

import { checkRateLimit, getClientIP, rateLimitResponse } from './_lib/rate-limit.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

const IS_MAINNET = process.env.NETWORK_ID === 'base-mainnet';
const BLOCK_EXPLORER = IS_MAINNET ? 'https://basescan.org' : 'https://sepolia.basescan.org';

// Rate limit: 30 requests per minute
const LOOP_RATE_LIMIT = { limit: 30, windowMs: 60 * 1000 };

async function supabaseQuery(path) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    headers: { 'apikey': SUPABASE_KEY }
  });
  if (!res.ok) {
    console.error('Supabase error:', res.status, await res.text());
    return [];
  }
  return res.json();
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
  const rateCheck = checkRateLimit(`loop:${clientIP}`, LOOP_RATE_LIMIT);
  res.setHeader('X-RateLimit-Remaining', rateCheck.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(rateCheck.resetAt / 1000));
  
  if (!rateCheck.allowed) {
    return rateLimitResponse(res, rateCheck.resetAt);
  }
  
  try {
    // Fetch all completed purchases
    const purchases = await supabaseQuery(
      `/rest/v1/purchases?select=id,created_at,piece_title,buyer_username,seller_username,amount_usdc,tx_hash&status=eq.completed&order=created_at.desc`
    );
    
    if (!purchases || purchases.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          nodes: [],
          edges: [],
          stats: {
            totalAgents: 0,
            totalTransactions: 0,
            totalVolume: 0,
            loopCount: 0
          }
        }
      });
    }
    
    // Build node and edge maps
    const nodeMap = new Map(); // username -> node data
    const edgeMap = new Map(); // "buyer->seller" -> edge data
    
    for (const p of purchases) {
      const buyer = p.buyer_username || 'Unknown';
      const seller = p.seller_username || 'Unknown';
      const amount = parseFloat(p.amount_usdc) || 0;
      
      // Update buyer node
      if (!nodeMap.has(buyer)) {
        nodeMap.set(buyer, {
          id: buyer,
          username: buyer,
          totalBought: 0,
          totalSold: 0,
          buyCount: 0,
          sellCount: 0
        });
      }
      const buyerNode = nodeMap.get(buyer);
      buyerNode.totalBought += amount;
      buyerNode.buyCount++;
      
      // Update seller node
      if (!nodeMap.has(seller)) {
        nodeMap.set(seller, {
          id: seller,
          username: seller,
          totalBought: 0,
          totalSold: 0,
          buyCount: 0,
          sellCount: 0
        });
      }
      const sellerNode = nodeMap.get(seller);
      sellerNode.totalSold += amount;
      sellerNode.sellCount++;
      
      // Update edge
      const edgeKey = `${buyer}->${seller}`;
      if (!edgeMap.has(edgeKey)) {
        edgeMap.set(edgeKey, {
          source: buyer,
          target: seller,
          amount: 0,
          count: 0,
          transactions: []
        });
      }
      const edge = edgeMap.get(edgeKey);
      edge.amount += amount;
      edge.count++;
      edge.transactions.push({
        piece: p.piece_title,
        amount: amount,
        date: p.created_at,
        txHash: p.tx_hash,
        explorer: `${BLOCK_EXPLORER}/tx/${p.tx_hash}`
      });
    }
    
    // Calculate loop count (A bought from B AND B bought from A)
    let loopCount = 0;
    const processedPairs = new Set();
    
    for (const [key, edge] of edgeMap) {
      const reverseKey = `${edge.target}->${edge.source}`;
      const pairKey = [edge.source, edge.target].sort().join('<>');
      
      if (edgeMap.has(reverseKey) && !processedPairs.has(pairKey)) {
        loopCount++;
        processedPairs.add(pairKey);
      }
    }
    
    // Convert to arrays
    const nodes = Array.from(nodeMap.values()).map(n => ({
      ...n,
      totalBought: parseFloat(n.totalBought.toFixed(2)),
      totalSold: parseFloat(n.totalSold.toFixed(2)),
      totalVolume: parseFloat((n.totalBought + n.totalSold).toFixed(2)),
      isActive: n.buyCount > 0 && n.sellCount > 0 // Both buys and sells
    }));
    
    const edges = Array.from(edgeMap.values()).map(e => ({
      ...e,
      amount: parseFloat(e.amount.toFixed(2)),
      // Limit transactions to last 5 for payload size
      transactions: e.transactions.slice(0, 5)
    }));
    
    // Calculate total volume
    const totalVolume = edges.reduce((sum, e) => sum + e.amount, 0);
    
    // Cache for 60 seconds
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
    
    return res.status(200).json({
      success: true,
      data: {
        nodes,
        edges,
        stats: {
          totalAgents: nodes.length,
          totalTransactions: purchases.length,
          totalVolume: parseFloat(totalVolume.toFixed(2)),
          loopCount, // Number of bidirectional relationships
          activeAgents: nodes.filter(n => n.isActive).length
        }
      }
    });
    
  } catch (error) {
    console.error('Loop API error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch loop data' }
    });
  }
}
