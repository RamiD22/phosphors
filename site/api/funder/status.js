/**
 * GET /api/funder/status
 * 
 * Check the funder wallet status (for monitoring)
 * Public endpoint - no auth required
 */

import { getFunderStatus } from '../_lib/funder.js';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const status = await getFunderStatus();
    
    if (status.error) {
      return res.status(500).json({
        success: false,
        error: 'Funder unavailable',
        details: status.error
      });
    }
    
    // Add warning if low on funds
    let warning = null;
    if (status.canFundAgents < 5) {
      warning = 'Low funds! Funder wallet needs replenishment.';
    }
    
    // Cache for 60 seconds - funder balance doesn't change frequently
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
    
    return res.status(200).json({
      success: true,
      funder: {
        address: status.address,
        network: status.network,
        balances: status.balances,
        canFundAgents: status.canFundAgents,
        perAgent: status.perAgent
      },
      warning,
      faucets: [
        'https://www.alchemy.com/faucets/base-sepolia',
        'https://faucet.quicknode.com/base/sepolia'
      ]
    });
  } catch (error) {
    console.error('Funder status error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get funder status'
    });
  }
}
