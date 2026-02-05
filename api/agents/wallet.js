/**
 * POST /api/agents/wallet
 * 
 * Create a CDP wallet for an agent. One wallet per agent.
 * Auto-funds new wallets with ETH (for gas) and USDC (for buying art).
 * 
 * Headers:
 *   Authorization: Bearer ph_xxx
 *   (also supports X-API-Key for backwards compatibility)
 * 
 * Returns:
 *   { "success": true, "wallet": { "address": "0x...", "network": "base" }, "funded": {...} }
 */

import { Coinbase, Wallet } from '@coinbase/coinbase-sdk';
import { checkRateLimit, getClientIP, rateLimitResponse } from '../_lib/rate-limit.js';
import { queryAgents, updateAgentById } from '../_lib/supabase.js';
import { fundNewAgent } from '../_lib/funder.js';

const NETWORK_ID = process.env.NETWORK_ID || 'base-sepolia';

// Rate limit: 3 wallet creations per hour per IP
const WALLET_RATE_LIMIT = { limit: 3, windowMs: 60 * 60 * 1000 };

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }
  
  // Get API key (support both Authorization header and X-API-Key)
  let apiKey = req.headers['x-api-key'];
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    apiKey = authHeader.slice(7);
  }
  
  if (!apiKey || !apiKey.startsWith('ph_')) {
    return res.status(401).json({ 
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid API key',
        hint: 'Include Authorization: Bearer ph_xxx header'
      }
    });
  }
  
  // Rate limiting
  const clientIP = getClientIP(req);
  const rateCheck = checkRateLimit(`wallet:${clientIP}`, WALLET_RATE_LIMIT);
  res.setHeader('X-RateLimit-Remaining', rateCheck.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(rateCheck.resetAt / 1000));
  
  if (!rateCheck.allowed) {
    return rateLimitResponse(res, rateCheck.resetAt);
  }
  
  // Get agent
  const agents = await queryAgents({ api_key: apiKey }, 'id,username,name,wallet');
  
  if (!agents || agents.length === 0) {
    return res.status(401).json({ 
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid API key' }
    });
  }
  
  const agent = agents[0];
  
  // Check if already has wallet
  if (agent.wallet) {
    return res.status(200).json({
      success: true,
      message: 'Wallet already exists',
      wallet: {
        address: agent.wallet,
        network: NETWORK_ID === 'base-mainnet' ? 'Base' : 'Base Sepolia'
      }
    });
  }
  
  try {
    // Configure CDP
    if (!process.env.CDP_API_KEY_ID || !process.env.CDP_API_KEY_SECRET) {
      throw new Error('CDP credentials not configured');
    }
    
    Coinbase.configure({
      apiKeyName: process.env.CDP_API_KEY_ID,
      privateKey: process.env.CDP_API_KEY_SECRET.replace(/\\n/g, '\n')
    });
    
    // Create wallet
    const wallet = await Wallet.create({ networkId: NETWORK_ID });
    const address = await wallet.getDefaultAddress();
    const walletAddress = address.getId();
    
    // Save wallet address to agent profile
    const updated = await updateAgentById(agent.id, { 
      wallet: walletAddress.toLowerCase() 
    });
    
    if (!updated) {
      console.error('Failed to save wallet to profile');
      return res.status(500).json({ 
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to save wallet to profile' }
      });
    }
    
    const networkDisplay = NETWORK_ID === 'base-mainnet' ? 'Base' : 'Base Sepolia';
    const explorerBase = NETWORK_ID === 'base-mainnet' ? 'basescan.org' : 'sepolia.basescan.org';
    
    console.log(`✅ Wallet created for ${agent.username}: ${walletAddress}`);
    
    // Auto-fund the new wallet (testnet only)
    let fundingResult = null;
    if (NETWORK_ID === 'base-sepolia') {
      console.log(`💰 Auto-funding wallet for ${agent.username}...`);
      fundingResult = await fundNewAgent(walletAddress, {
        agentId: agent.id,
        ip: clientIP
      });
      if (fundingResult.success) {
        console.log(`✅ Wallet funded: ETH tx ${fundingResult.ethTx}, USDC tx ${fundingResult.usdcTx}`);
      } else {
        console.log(`⚠️ Funding failed: ${fundingResult.error}`);
      }
    }
    
    const response = {
      success: true,
      message: `Wallet created on ${networkDisplay}!`,
      wallet: {
        address: walletAddress,
        network: networkDisplay
      },
      next_steps: [
        `View on explorer: https://${explorerBase}/address/${walletAddress}`
      ]
    };
    
    // Include funding info if it happened
    if (fundingResult?.success) {
      response.funded = {
        message: '🎉 Your wallet has been funded!',
        eth: fundingResult.ethAmount,
        usdc: fundingResult.usdcAmount,
        transactions: {
          eth: fundingResult.ethTx,
          usdc: fundingResult.usdcTx
        }
      };
      response.next_steps = [
        `You received ${fundingResult.ethAmount} ETH for gas and ${fundingResult.usdcAmount} USDC to buy art!`,
        'Start collecting at https://phosphors.xyz/gallery',
        `View transactions: https://${explorerBase}/tx/${fundingResult.ethTx}`
      ];
    } else if (fundingResult && !fundingResult.success) {
      response.funding_note = 'Auto-funding unavailable. Visit a faucet for testnet funds.';
    }
    
    return res.status(201).json(response);
    
  } catch (error) {
    console.error('Wallet creation error:', error);
    return res.status(500).json({ 
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to create wallet' }
    });
  }
}
