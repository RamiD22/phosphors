/**
 * $PHOS Burn API
 * 
 * Monthly burn of accumulated protocol fees:
 * 1. Check accumulated USDC fees in treasury
 * 2. Swap USDC → $PHOS via DEX
 * 3. Burn the $PHOS
 * 4. Log the burn event
 * 
 * Protected endpoint - requires ADMIN_SECRET
 */

import { Coinbase, Wallet } from '@coinbase/coinbase-sdk';
import { auditLog, getClientIP } from './_lib/security.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const NETWORK_ID = process.env.NETWORK_ID || 'base-sepolia';

// $PHOS token address (Base)
const PHOS_TOKEN = process.env.PHOS_TOKEN_ADDRESS || '0x08f3e9972eb2f9f129f05b58db335d764ec9e471';

// Burn address (standard 0xdead)
const BURN_ADDRESS = '0x000000000000000000000000000000000000dEaD';

async function supabaseQuery(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  return res;
}

async function getTreasuryWallet() {
  if (!process.env.CDP_API_KEY_ID || !process.env.CDP_API_KEY_SECRET) {
    throw new Error('CDP credentials not configured');
  }
  
  Coinbase.configure({
    apiKeyName: process.env.CDP_API_KEY_ID.trim(),
    privateKey: process.env.CDP_API_KEY_SECRET.trim().replace(/\\n/g, '\n')
  });
  
  const wallet = await Wallet.import({
    walletId: process.env.MINTER_WALLET_ID?.trim(),
    seed: process.env.MINTER_SEED?.trim(),
    networkId: NETWORK_ID
  });
  
  return wallet;
}

async function getAccumulatedFees() {
  // Sum all protocol fees from purchases
  const res = await supabaseQuery(
    `/rest/v1/purchases?select=protocol_fee&protocol_fee=gt.0`
  );
  const purchases = await res.json();
  
  const totalFees = purchases.reduce((sum, p) => sum + (parseFloat(p.protocol_fee) || 0), 0);
  return totalFees;
}

async function logBurnEvent(data) {
  try {
    await supabaseQuery('/rest/v1/burn_events', {
      method: 'POST',
      body: JSON.stringify({
        usdc_amount: data.usdcAmount,
        phos_amount: data.phosAmount,
        swap_tx_hash: data.swapTxHash,
        burn_tx_hash: data.burnTxHash,
        network: NETWORK_ID,
        executed_at: new Date().toISOString()
      })
    });
  } catch (err) {
    console.error('Failed to log burn event:', err.message);
  }
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Secret');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Auth check - MUST have ADMIN_SECRET set and matching
  const adminSecret = req.headers['x-admin-secret'];
  const expectedSecret = process.env.ADMIN_SECRET;
  
  // Fail closed: if ADMIN_SECRET is not configured, deny all access
  if (!expectedSecret || adminSecret !== expectedSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // GET: Check burn status
  if (req.method === 'GET') {
    try {
      const wallet = await getTreasuryWallet();
      const address = await wallet.getDefaultAddress();
      const usdcBalance = await wallet.getBalance('usdc');
      const accumulatedFees = await getAccumulatedFees();
      
      // Audit log the status check
      await auditLog('BURN_STATUS_CHECK', {
        treasury: address.getId(),
        usdcBalance: usdcBalance.toString(),
        accumulatedFees: accumulatedFees.toFixed(6),
        ip: getClientIP(req)
      });
      
      return res.status(200).json({
        treasury: address.getId(),
        network: NETWORK_ID,
        balances: {
          usdc: usdcBalance.toString()
        },
        accumulatedFees: accumulatedFees.toFixed(6),
        phosToken: PHOS_TOKEN,
        burnAddress: BURN_ADDRESS,
        status: 'ready',
        note: 'POST to this endpoint to execute burn'
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
  
  // POST: Execute burn
  if (req.method === 'POST') {
    try {
      const wallet = await getTreasuryWallet();
      const usdcBalance = await wallet.getBalance('usdc');
      const usdcAmount = parseFloat(usdcBalance.toString());
      
      if (usdcAmount < 0.01) {
        return res.status(400).json({ 
          error: 'Insufficient USDC for burn',
          balance: usdcAmount,
          minimum: 0.01
        });
      }
      
      // For testnet/MVP: Log the intent, actual swap requires DEX integration
      // In production, this would:
      // 1. Swap USDC → $PHOS via Uniswap/Aerodrome
      // 2. Send $PHOS to burn address
      
      const burnEvent = {
        usdcAmount: usdcAmount,
        phosAmount: null, // Would be calculated from swap
        swapTxHash: null, // Would come from DEX swap
        burnTxHash: null, // Would come from burn transfer
        status: 'pending_implementation',
        note: 'DEX integration needed for production burns'
      };
      
      // Log the burn intent
      await logBurnEvent({
        usdcAmount: usdcAmount,
        phosAmount: 0,
        swapTxHash: 'pending',
        burnTxHash: 'pending'
      });
      
      // Audit log the burn execution
      await auditLog('BURN_EXECUTED', {
        usdcAmount: usdcAmount,
        status: 'pending_implementation',
        ip: getClientIP(req)
      });
      
      return res.status(200).json({
        success: true,
        message: 'Burn event logged',
        burn: burnEvent,
        nextSteps: [
          'Integrate with Uniswap/Aerodrome for USDC → $PHOS swap',
          'Execute burn transfer to 0xdead address',
          'Emit on-chain BurnCompleted event'
        ]
      });
      
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
  
  return res.status(405).json({ error: 'Method not allowed' });
}
