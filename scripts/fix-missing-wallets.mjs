/**
 * Fix Missing Wallets Script
 * 
 * Creates wallets for agents that don't have one and optionally funds them.
 * 
 * Usage:
 *   node scripts/fix-missing-wallets.mjs           # Dry run (show what would be done)
 *   node scripts/fix-missing-wallets.mjs --apply   # Actually create wallets
 *   node scripts/fix-missing-wallets.mjs --apply --fund  # Create and fund wallets
 */

import 'dotenv/config';
import { Coinbase, Wallet } from '@coinbase/coinbase-sdk';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const NETWORK_ID = process.env.NETWORK_ID || 'base-sepolia';

async function supabaseRequest(path, options = {}) {
  const url = `${SUPABASE_URL}${path}`;
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    ...options.headers
  };
  return fetch(url, { ...options, headers });
}

async function getAgentsWithoutWallets() {
  const res = await supabaseRequest('/rest/v1/agents?wallet=is.null&select=id,username,name,x_verified');
  return res.json();
}

async function createWallet() {
  console.log('   Creating new CDP wallet...');
  
  Coinbase.configure({
    apiKeyName: process.env.CDP_API_KEY_ID,
    privateKey: process.env.CDP_API_KEY_SECRET?.replace(/\\n/g, '\n')
  });
  
  const wallet = await Wallet.create({ networkId: NETWORK_ID });
  const address = await wallet.getDefaultAddress();
  const seed = wallet.export();
  
  return {
    wallet,
    address: address.getId(),
    walletId: wallet.getId(),
    seed: JSON.stringify(seed)
  };
}

async function fundWallet(wallet, amount = { eth: '0.01', usdc: '5' }) {
  console.log(`   Funding wallet with ${amount.eth} ETH and ${amount.usdc} USDC...`);
  
  // Import funder wallet
  const funderWalletId = process.env.FUNDER_WALLET_ID;
  const funderSeed = process.env.FUNDER_SEED;
  
  Coinbase.configure({
    apiKeyName: process.env.CDP_API_KEY_ID,
    privateKey: process.env.CDP_API_KEY_SECRET?.replace(/\\n/g, '\n')
  });
  
  const funderWallet = await Wallet.import({
    walletId: funderWalletId,
    seed: funderSeed,
    networkId: NETWORK_ID
  });
  
  const recipientAddress = await wallet.getDefaultAddress();
  
  // Send ETH
  const ethTransfer = await funderWallet.createTransfer({
    amount: amount.eth,
    assetId: 'eth',
    destination: recipientAddress.getId()
  });
  await ethTransfer.wait();
  
  // Send USDC
  const usdcTransfer = await funderWallet.createTransfer({
    amount: amount.usdc,
    assetId: 'usdc',
    destination: recipientAddress.getId()
  });
  await usdcTransfer.wait();
  
  return {
    ethTx: ethTransfer.getTransactionHash(),
    usdcTx: usdcTransfer.getTransactionHash()
  };
}

async function updateAgentWallet(agentId, wallet, walletData) {
  const res = await supabaseRequest(`/rest/v1/agents?id=eq.${agentId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      wallet: wallet.toLowerCase(),
      wallet_data: walletData
    })
  });
  
  return res.ok;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const fund = args.includes('--fund');
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Phosphors - Fix Missing Wallets');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Mode: ${apply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`  Fund: ${fund ? 'YES' : 'NO'}`);
  console.log(`  Network: ${NETWORK_ID}`);
  console.log('───────────────────────────────────────────────────────────────\n');
  
  const agents = await getAgentsWithoutWallets();
  
  if (agents.length === 0) {
    console.log('✅ All agents have wallets!');
    return;
  }
  
  console.log(`Found ${agents.length} agents without wallets:\n`);
  
  for (const agent of agents) {
    console.log(`📋 ${agent.username} (ID: ${agent.id})`);
    console.log(`   Name: ${agent.name}`);
    console.log(`   Verified: ${agent.x_verified ? 'Yes' : 'No'}`);
    
    if (apply) {
      try {
        const { wallet, address, walletId, seed } = await createWallet();
        console.log(`   ✅ Wallet created: ${address}`);
        
        if (fund && NETWORK_ID === 'base-sepolia') {
          try {
            const { ethTx, usdcTx } = await fundWallet(wallet);
            console.log(`   ✅ Funded: ETH tx ${ethTx.slice(0, 10)}...`);
          } catch (fundError) {
            console.log(`   ⚠️ Funding failed: ${fundError.message}`);
          }
        }
        
        const updated = await updateAgentWallet(agent.id, address, seed);
        if (updated) {
          console.log(`   ✅ DB updated`);
        } else {
          console.log(`   ❌ DB update failed`);
        }
      } catch (e) {
        console.log(`   ❌ Error: ${e.message}`);
      }
    } else {
      console.log(`   → Would create wallet`);
      if (fund) console.log(`   → Would fund wallet`);
    }
    
    console.log('');
  }
  
  if (!apply) {
    console.log('───────────────────────────────────────────────────────────────');
    console.log('  Run with --apply to create wallets');
    console.log('  Run with --apply --fund to also fund wallets');
    console.log('───────────────────────────────────────────────────────────────');
  }
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
