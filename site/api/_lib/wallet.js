/**
 * Wallet Management Library for Phosphors
 * 
 * Creates and manages MPC wallets via Coinbase Developer Platform (CDP) SDK.
 * CDP provides secure, non-custodial wallets without requiring users to manage
 * private keys directly.
 * 
 * ## Features:
 * - Create new wallets for agents during registration
 * - Import existing wallets from seed data
 * - Get platform wallets (minter, funder) for operations
 * - Check wallet balances
 * 
 * ## Security:
 * - Wallets are MPC (Multi-Party Computation) - keys are never exposed
 * - Seeds are encrypted and stored securely
 * - CDP handles signing operations server-side
 * 
 * @module wallet
 */

import { Coinbase, Wallet } from '@coinbase/coinbase-sdk';

/**
 * Network for wallet operations
 * @constant {string}
 */
const NETWORK_ID = process.env.NETWORK_ID || 'base-sepolia';

/**
 * Flag to track if CDP SDK has been configured
 * Prevents redundant configuration calls
 * @type {boolean}
 */
let cdpConfigured = false;

/**
 * Ensure CDP SDK is configured
 */
function ensureCdpConfigured() {
  if (cdpConfigured) return;
  
  if (!process.env.CDP_API_KEY_ID || !process.env.CDP_API_KEY_SECRET) {
    throw new Error('CDP credentials not configured (CDP_API_KEY_ID, CDP_API_KEY_SECRET)');
  }
  
  // Trim whitespace and handle escaped newlines (Vercel may add trailing newline)
  const apiKeyName = process.env.CDP_API_KEY_ID.trim();
  const privateKey = process.env.CDP_API_KEY_SECRET.trim().replace(/\\n/g, '\n');
  
  Coinbase.configure({
    apiKeyName,
    privateKey
  });
  
  cdpConfigured = true;
}

/**
 * Create a new wallet for an agent
 * 
 * @returns {object} - { success, wallet, address, walletId, seed, error }
 */
export async function createAgentWallet() {
  try {
    ensureCdpConfigured();
    
    console.log(`🔐 Creating new wallet on ${NETWORK_ID}...`);
    
    // Create new wallet
    const wallet = await Wallet.create({ networkId: NETWORK_ID });
    const address = await wallet.getDefaultAddress();
    const walletId = wallet.getId();
    
    // Export seed for storage
    const seed = wallet.export();
    
    console.log(`✅ Wallet created: ${address.getId()}`);
    
    return {
      success: true,
      wallet,
      address: address.getId(),
      walletId,
      seed: JSON.stringify(seed)
    };
    
  } catch (error) {
    console.error('❌ Wallet creation failed:', error.message);
    return {
      success: false,
      error: error.message || 'Failed to create wallet'
    };
  }
}

/**
 * Import an existing wallet from seed
 * 
 * @param {object} seedData - Wallet seed data { walletId, seed }
 * @returns {object} - { success, wallet, address, error }
 */
export async function importWallet(seedData) {
  try {
    ensureCdpConfigured();
    
    const wallet = await Wallet.import({
      walletId: seedData.walletId,
      seed: seedData.seed,
      networkId: NETWORK_ID
    });
    
    const address = await wallet.getDefaultAddress();
    
    return {
      success: true,
      wallet,
      address: address.getId()
    };
    
  } catch (error) {
    console.error('❌ Wallet import failed:', error.message);
    return {
      success: false,
      error: error.message || 'Failed to import wallet'
    };
  }
}

/**
 * Get minter wallet for platform operations
 */
export async function getMinterWallet() {
  const walletId = process.env.MINTER_WALLET_ID;
  const seed = process.env.MINTER_SEED;
  
  if (!walletId || !seed) {
    throw new Error('Minter wallet not configured (MINTER_WALLET_ID, MINTER_SEED)');
  }
  
  return importWallet({ walletId, seed });
}

/**
 * Get funder wallet for funding operations
 */
export async function getFunderWallet() {
  const walletId = process.env.FUNDER_WALLET_ID;
  const seed = process.env.FUNDER_SEED;
  
  if (!walletId || !seed) {
    throw new Error('Funder wallet not configured (FUNDER_WALLET_ID, FUNDER_SEED)');
  }
  
  return importWallet({ walletId, seed });
}

/**
 * Check wallet balance
 * 
 * @param {Wallet} wallet - CDP Wallet instance
 * @returns {object} - { eth, usdc }
 */
export async function getWalletBalances(wallet) {
  const eth = await wallet.getBalance('eth');
  const usdc = await wallet.getBalance('usdc');
  
  return {
    eth: eth.toString(),
    usdc: usdc.toString()
  };
}

export { NETWORK_ID };
