/**
 * Phosphors - Fast Parallel Minting
 * 
 * Mints approved submissions in parallel batches (no screenshots)
 */

import 'dotenv/config';
import { Coinbase, Wallet } from '@coinbase/coinbase-sdk';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmY25uYWx3ZXV3Z2F1emlqZWZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNTI2NjUsImV4cCI6MjA4NTYyODY2NX0.34M21ctB6jiCNsFANwsSea8BoXkCqCyKjqvrvGEpOwA';
const PLATFORM_CONTRACT = process.env.PLATFORM_CONTRACT || '0xf5663DF53DA46718f28C879ae1C3Fb1bDcD4490D';
const NETWORK_ID = process.env.NETWORK_ID || 'base-sepolia';
const BATCH_SIZE = 5; // Mint 5 at a time

console.log(`🌐 Network: ${NETWORK_ID}`);

async function getApprovedUnminted() {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/submissions?status=eq.approved&token_id=is.null&select=*`,
    { headers: { 'apikey': SUPABASE_KEY } }
  );
  return response.json();
}

async function updateSubmission(id, tokenId, txHash) {
  await fetch(`${SUPABASE_URL}/rest/v1/submissions?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    },
    body: JSON.stringify({ 
      token_id: tokenId,
      notes: `Minted TX: ${txHash}`
    })
  });
}

async function mintOne(wallet, address, sub, tokenId) {
  console.log(`   🎨 Minting: "${sub.title}" by ${sub.moltbook}...`);
  
  const mint = await wallet.invokeContract({
    contractAddress: PLATFORM_CONTRACT,
    method: 'mint',
    abi: [{
      inputs: [{ name: 'to', type: 'address' }],
      name: 'mint',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function'
    }],
    args: { to: address.getId() }
  });
  
  await mint.wait();
  const txHash = mint.getTransactionHash();
  
  await updateSubmission(sub.id, tokenId, txHash);
  console.log(`   ✅ ${sub.title} → Token #${tokenId}`);
  
  return { sub, tokenId, txHash };
}

async function main() {
  console.log('🔍 Checking for approved submissions...\n');
  
  const submissions = await getApprovedUnminted();
  
  if (submissions.length === 0) {
    console.log('✓ No pending mints.');
    return;
  }
  
  console.log(`Found ${submissions.length} submission(s) to mint.\n`);
  
  // Initialize wallet
  Coinbase.configureFromJson({ filePath: path.join(__dirname, 'cdp-api-key.json') });
  const walletData = JSON.parse(readFileSync(path.join(__dirname, 'wallet-minter.json'), 'utf8'));
  const wallet = await Wallet.import(walletData);
  const address = await wallet.getDefaultAddress();
  
  console.log(`Minter: ${address.getId()}`);
  const balance = await wallet.getBalance('eth');
  console.log(`Balance: ${balance.toString()} ETH\n`);
  
  // Process in batches
  let tokenId = 1;
  for (let i = 0; i < submissions.length; i += BATCH_SIZE) {
    const batch = submissions.slice(i, i + BATCH_SIZE);
    console.log(`\n📦 Batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(submissions.length/BATCH_SIZE)} (${batch.length} pieces)`);
    
    // Mint batch in parallel
    const promises = batch.map((sub, idx) => 
      mintOne(wallet, address, sub, tokenId + idx).catch(err => {
        console.log(`   ❌ Failed: ${sub.title} - ${err.message || err.toString()}`);
        console.log(`   Error details:`, JSON.stringify(err, null, 2).slice(0, 500));
        return null;
      })
    );
    
    await Promise.all(promises);
    tokenId += batch.length;
  }
  
  console.log('\n🎉 Done!');
}

main().catch(console.error);
