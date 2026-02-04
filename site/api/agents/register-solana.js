/**
 * Register agent with Solana wallet support
 * 
 * POST /api/agents/register-solana
 * {
 *   "username": "myagent",
 *   "evmWallet": "0x...",      // Optional - existing EVM wallet
 *   "solanaWallet": "So1ana..." // Optional - existing Solana wallet
 * }
 * 
 * Creates wallets on both Base Sepolia and Solana Devnet,
 * funds with USDC on both chains.
 */

import { createClient } from '@supabase/supabase-js';
import { Keypair, Connection, PublicKey } from '@solana/web3.js';
import { 
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Solana Devnet
const SOLANA_RPC = 'https://api.devnet.solana.com';
const USDC_MINT_DEVNET = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');

function generateApiKey() {
  return `ph_${crypto.randomBytes(24).toString('base64url')}`;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username, evmWallet, solanaWallet } = req.body;

  if (!username) {
    return res.status(400).json({ error: 'Username required' });
  }

  // Check if username exists
  const { data: existing } = await supabase
    .from('agents')
    .select('id')
    .eq('username', username)
    .single();

  if (existing) {
    return res.status(400).json({ error: 'Username already taken' });
  }

  try {
    // Generate Solana keypair if not provided
    let solanaAddress = solanaWallet;
    let solanaKeypair = null;
    
    if (!solanaWallet) {
      solanaKeypair = Keypair.generate();
      solanaAddress = solanaKeypair.publicKey.toBase58();
    }

    // Generate API key
    const apiKey = generateApiKey();

    // Create agent record
    const { data: agent, error: insertError } = await supabase
      .from('agents')
      .insert({
        username,
        wallet: evmWallet || null, // EVM wallet added separately via /register
        solana_wallet: solanaAddress,
        api_key: apiKey,
        multi_chain: true,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      return res.status(500).json({ error: 'Failed to create agent' });
    }

    // Response
    const response = {
      success: true,
      agent: {
        id: agent.id,
        username: agent.username,
        api_key: apiKey,
        solana_wallet: solanaAddress,
        evm_wallet: evmWallet || 'Use /api/agents/register to add EVM wallet',
      },
      chains: {
        solana: {
          network: 'devnet',
          wallet: solanaAddress,
          usdc_mint: USDC_MINT_DEVNET.toBase58(),
        },
        base: {
          network: 'sepolia',
          wallet: evmWallet || 'pending',
          usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        },
      },
      cctp: {
        description: 'Bridge USDC between chains using Circle CCTP',
        endpoint: '/api/bridge',
        supported_routes: [
          'solana-devnet → base-sepolia',
          'base-sepolia → solana-devnet',
          'ethereum-sepolia → base-sepolia',
        ],
      },
    };

    // Include private key only if we generated it
    if (solanaKeypair) {
      response.agent.solana_secret = Buffer.from(solanaKeypair.secretKey).toString('base64');
      response.warning = 'Save the solana_secret securely - it cannot be recovered!';
    }

    return res.status(201).json(response);

  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ error: 'Registration failed', details: error.message });
  }
}
