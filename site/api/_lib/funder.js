/**
 * Auto-funding library for new agent wallets
 * 
 * Sends ETH (for gas) and USDC (for buying art) to new agents
 */

import { Coinbase, Wallet } from '@coinbase/coinbase-sdk';
import { checkWalletFunded, logFunding } from './supabase.js';

// Default funding amounts (can be overridden via env)
const DEFAULT_ETH_AMOUNT = '0.01';   // 0.01 ETH for gas
const DEFAULT_USDC_AMOUNT = '5';     // 5 USDC (50 purchases at 0.10 each)

// Testnet network
const NETWORK_ID = 'base-sepolia';

// In-memory cache to prevent double-funding within same deployment
const recentlyFunded = new Map();
const FUNDING_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Initialize and return the funder wallet
 */
async function getFunderWallet() {
  const walletId = process.env.FUNDER_WALLET_ID;
  const seed = process.env.FUNDER_SEED;
  
  if (!walletId || !seed) {
    throw new Error('Funder wallet not configured (FUNDER_WALLET_ID, FUNDER_SEED)');
  }
  
  // Configure CDP SDK
  if (!process.env.CDP_API_KEY_ID || !process.env.CDP_API_KEY_SECRET) {
    throw new Error('CDP credentials not configured');
  }
  
  Coinbase.configure({
    apiKeyName: process.env.CDP_API_KEY_ID,
    privateKey: process.env.CDP_API_KEY_SECRET.replace(/\\n/g, '\n')
  });
  
  // Import the funder wallet
  const wallet = await Wallet.import({
    walletId,
    seed,
    networkId: NETWORK_ID
  });
  
  return wallet;
}

/**
 * Check if an address was recently funded (anti-spam)
 */
function wasRecentlyFunded(address) {
  const normalizedAddress = address.toLowerCase();
  const lastFunded = recentlyFunded.get(normalizedAddress);
  
  if (!lastFunded) return false;
  
  const elapsed = Date.now() - lastFunded;
  if (elapsed > FUNDING_COOLDOWN_MS) {
    recentlyFunded.delete(normalizedAddress);
    return false;
  }
  
  return true;
}

/**
 * Mark an address as funded
 */
function markAsFunded(address) {
  recentlyFunded.set(address.toLowerCase(), Date.now());
}

/**
 * Fund a new agent wallet with ETH and USDC
 * 
 * @param {string} recipientAddress - The wallet address to fund
 * @param {object} options - Optional overrides { ethAmount, usdcAmount, agentId, ip }
 * @returns {object} - { success, ethTx, usdcTx, error }
 */
export async function fundNewAgent(recipientAddress, options = {}) {
  const ethAmount = options.ethAmount || process.env.FUNDER_ETH_AMOUNT || DEFAULT_ETH_AMOUNT;
  const usdcAmount = options.usdcAmount || process.env.FUNDER_USDC_AMOUNT || DEFAULT_USDC_AMOUNT;
  
  // Validate address
  if (!recipientAddress || !/^0x[a-fA-F0-9]{40}$/.test(recipientAddress)) {
    return { success: false, error: 'Invalid recipient address' };
  }
  
  // Check in-memory cache (fast path)
  if (wasRecentlyFunded(recipientAddress)) {
    console.log(`⚠️ Address ${recipientAddress} was recently funded (cache), skipping`);
    return { 
      success: false, 
      error: 'Address was recently funded',
      cooldown: true 
    };
  }
  
  // Check database for persistent tracking
  try {
    const existingFunding = await checkWalletFunded(recipientAddress);
    if (existingFunding) {
      console.log(`⚠️ Address ${recipientAddress} already funded at ${existingFunding.funded_at}`);
      markAsFunded(recipientAddress); // Cache it
      return {
        success: false,
        error: 'Wallet was already funded',
        alreadyFunded: true,
        fundedAt: existingFunding.funded_at
      };
    }
  } catch (dbError) {
    console.log(`⚠️ Could not check funding history: ${dbError.message}`);
    // Continue anyway - in-memory check is sufficient for hackathon
  }
  
  try {
    console.log(`💰 Funding new agent: ${recipientAddress}`);
    console.log(`   ETH: ${ethAmount}, USDC: ${usdcAmount}`);
    
    const funderWallet = await getFunderWallet();
    const funderAddress = await funderWallet.getDefaultAddress();
    
    // Check funder balances
    const ethBalance = await funderWallet.getBalance('eth');
    const usdcBalance = await funderWallet.getBalance('usdc');
    
    console.log(`   Funder balance: ${ethBalance} ETH, ${usdcBalance} USDC`);
    
    if (parseFloat(ethBalance) < parseFloat(ethAmount)) {
      console.error('❌ Insufficient ETH in funder wallet');
      return { success: false, error: 'Funder wallet has insufficient ETH' };
    }
    
    if (parseFloat(usdcBalance) < parseFloat(usdcAmount)) {
      console.error('❌ Insufficient USDC in funder wallet');
      return { success: false, error: 'Funder wallet has insufficient USDC' };
    }
    
    // Send ETH
    console.log(`   Sending ${ethAmount} ETH...`);
    const ethTransfer = await funderWallet.createTransfer({
      amount: ethAmount,
      assetId: 'eth',
      destination: recipientAddress
    });
    await ethTransfer.wait();
    const ethTx = ethTransfer.getTransactionHash();
    console.log(`   ✅ ETH sent: ${ethTx}`);
    
    // Send USDC
    console.log(`   Sending ${usdcAmount} USDC...`);
    const usdcTransfer = await funderWallet.createTransfer({
      amount: usdcAmount,
      assetId: 'usdc',
      destination: recipientAddress
    });
    await usdcTransfer.wait();
    const usdcTx = usdcTransfer.getTransactionHash();
    console.log(`   ✅ USDC sent: ${usdcTx}`);
    
    // Mark as funded (in-memory)
    markAsFunded(recipientAddress);
    
    // Log to database for persistence
    try {
      await logFunding({
        agent_id: options.agentId || null,
        wallet_address: recipientAddress.toLowerCase(),
        eth_amount: ethAmount,
        eth_tx_hash: ethTx,
        usdc_amount: usdcAmount,
        usdc_tx_hash: usdcTx,
        funder_address: funderAddress.getId(),
        ip_address: options.ip || null
      });
    } catch (logError) {
      console.log(`⚠️ Failed to log funding: ${logError.message}`);
      // Don't fail - funding already happened
    }
    
    console.log(`✅ Agent funded successfully!`);
    
    return {
      success: true,
      ethTx,
      usdcTx,
      ethAmount,
      usdcAmount,
      funder: funderAddress.getId()
    };
    
  } catch (error) {
    console.error('❌ Funding error:', error.message);
    return { 
      success: false, 
      error: error.message || 'Failed to fund wallet'
    };
  }
}

/**
 * Get funder wallet status (for monitoring)
 */
export async function getFunderStatus() {
  try {
    const funderWallet = await getFunderWallet();
    const address = await funderWallet.getDefaultAddress();
    const ethBalance = await funderWallet.getBalance('eth');
    const usdcBalance = await funderWallet.getBalance('usdc');
    
    // Calculate how many agents we can fund
    const ethPerAgent = parseFloat(process.env.FUNDER_ETH_AMOUNT || DEFAULT_ETH_AMOUNT);
    const usdcPerAgent = parseFloat(process.env.FUNDER_USDC_AMOUNT || DEFAULT_USDC_AMOUNT);
    
    const agentsFromEth = Math.floor(parseFloat(ethBalance) / ethPerAgent);
    const agentsFromUsdc = Math.floor(parseFloat(usdcBalance) / usdcPerAgent);
    const canFundAgents = Math.min(agentsFromEth, agentsFromUsdc);
    
    return {
      address: address.getId(),
      network: NETWORK_ID,
      balances: {
        eth: ethBalance.toString(),
        usdc: usdcBalance.toString()
      },
      canFundAgents,
      perAgent: {
        eth: ethPerAgent,
        usdc: usdcPerAgent
      }
    };
  } catch (error) {
    return { error: error.message };
  }
}
