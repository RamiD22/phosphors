/**
 * Phosphors - Sequential Minting (rate-limit friendly)
 */

import 'dotenv/config';
import { Coinbase, Wallet } from '@coinbase/coinbase-sdk';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const PLATFORM_CONTRACT = process.env.PLATFORM_CONTRACT || '0xf5663DF53DA46718f28C879ae1C3Fb1bDcD4490D';
const NETWORK_ID = process.env.NETWORK_ID || 'base-sepolia';

const ABI = [
  {
    "inputs": [{"name": "to", "type": "address"}],
    "name": "mint",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "nextTokenId",
    "outputs": [{"type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  }
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getApprovedUnminted() {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/submissions?status=eq.approved&token_id=is.null&select=*`,
    { headers: { 'apikey': SUPABASE_KEY } }
  );
  return response.json();
}

async function updateTokenId(submissionId, tokenId) {
  await fetch(
    `${SUPABASE_URL}/rest/v1/submissions?id=eq.${submissionId}`,
    {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token_id: tokenId })
    }
  );
}

async function main() {
  console.log(`🌐 Network: ${NETWORK_ID}`);
  console.log('🔍 Checking for approved submissions...\n');

  const submissions = await getApprovedUnminted();
  if (!submissions || submissions.length === 0) {
    console.log('✓ No pending mints.');
    return;
  }

  console.log(`Found ${submissions.length} submission(s) to mint.\n`);

  // Configure CDP
  Coinbase.configure({
    apiKeyName: process.env.CDP_API_KEY_ID,
    privateKey: process.env.CDP_API_KEY_SECRET?.replace(/\\n/g, '\n')
  });

  // Load minter wallet
  const seedPath = path.join(__dirname, 'wallet-minter.json');
  if (!existsSync(seedPath)) {
    console.error('❌ wallet-minter.json not found');
    process.exit(1);
  }
  
  const seed = JSON.parse(readFileSync(seedPath, 'utf-8'));
  const wallet = await Wallet.import(seed);
  
  const address = await wallet.getDefaultAddress();
  console.log('Minter:', address.getId());
  
  const balance = await wallet.getBalance('eth');
  console.log(`Balance: ${balance} ETH\n`);

  // Mint one at a time with delays
  let currentTokenId = 64; // Start from 64 (after the 63 already minted)
  
  for (const submission of submissions) {
    console.log(`🎨 Minting: "${submission.title}"...`);
    
    try {
      // Get collector address
      const collectorWallet = submission.collector_wallet || address.getId();
      
      const invocation = await wallet.invokeContract({
        contractAddress: PLATFORM_CONTRACT,
        method: 'mint',
        args: { to: collectorWallet },
        abi: ABI
      });

      const result = await invocation.wait();
      
      if (result.getStatus() === 'complete') {
        console.log(`   ✅ Token #${currentTokenId} → ${collectorWallet.slice(0, 10)}...`);
        console.log(`   📜 TX: ${result.getTransaction().getTransactionHash()}`);
        
        await updateTokenId(submission.id, currentTokenId);
        currentTokenId++;
      } else {
        console.log(`   ❌ Failed - status: ${result.getStatus()}`);
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
    
    // Wait 3 seconds between mints to avoid rate limits
    console.log('   ⏳ Waiting 3s...');
    await sleep(3000);
  }
  
  console.log('\n🎉 Done!');
}

main().catch(console.error);
