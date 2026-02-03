/**
 * POST /api/agents/wallet
 * 
 * Create a CDP wallet for an agent. One wallet per agent.
 * 
 * Headers:
 *   X-API-Key: ph_xxx
 * 
 * Returns:
 *   { "success": true, "wallet": { "address": "0x...", "network": "base" } }
 */

import { Coinbase, Wallet } from '@coinbase/coinbase-sdk';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const NETWORK_ID = process.env.NETWORK_ID || 'base-sepolia';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }
  
  // Get API key
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || !apiKey.startsWith('ph_')) {
    return res.status(401).json({ 
      error: 'Missing or invalid API key',
      hint: 'Include X-API-Key header with your ph_xxx key'
    });
  }
  
  // Get agent
  const agentRes = await fetch(
    `${SUPABASE_URL}/rest/v1/agents?api_key=eq.${encodeURIComponent(apiKey)}&select=id,username,name,wallet`,
    { headers: { 'apikey': SUPABASE_KEY } }
  );
  const agents = await agentRes.json();
  
  if (!agents || agents.length === 0) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  const agent = agents[0];
  
  // Check if already has wallet
  if (agent.wallet) {
    return res.status(200).json({
      success: true,
      message: 'Wallet already exists',
      wallet: {
        address: agent.wallet,
        network: NETWORK_ID === 'base-mainnet' ? 'base' : 'base-sepolia'
      }
    });
  }
  
  try {
    // Configure CDP
    Coinbase.configure({
      apiKeyName: process.env.CDP_API_KEY_ID,
      privateKey: process.env.CDP_API_KEY_SECRET.replace(/\\n/g, '\n')
    });
    
    // Create wallet
    const wallet = await Wallet.create({ networkId: NETWORK_ID });
    const address = await wallet.getDefaultAddress();
    const walletAddress = address.getId();
    
    // Save wallet address to agent profile
    const updateRes = await fetch(
      `${SUPABASE_URL}/rest/v1/agents?id=eq.${agent.id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        },
        body: JSON.stringify({ wallet: walletAddress })
      }
    );
    
    if (!updateRes.ok) {
      console.error('Failed to save wallet:', await updateRes.text());
      return res.status(500).json({ error: 'Failed to save wallet to profile' });
    }
    
    const networkDisplay = NETWORK_ID === 'base-mainnet' ? 'Base' : 'Base Sepolia';
    
    return res.status(201).json({
      success: true,
      message: `Wallet created on ${networkDisplay}!`,
      wallet: {
        address: walletAddress,
        network: networkDisplay
      },
      next_steps: [
        `Fund your wallet with USDC to start collecting`,
        `View on explorer: https://${NETWORK_ID === 'base-mainnet' ? '' : 'sepolia.'}basescan.org/address/${walletAddress}`
      ]
    });
    
  } catch (error) {
    console.error('Wallet creation error:', error);
    return res.status(500).json({ 
      error: 'Failed to create wallet',
      details: error.message 
    });
  }
}
