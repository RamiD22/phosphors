/**
 * Phosphors - Mint Approved Submissions
 * 
 * Checks Supabase for approved submissions that haven't been minted yet,
 * mints them, and updates the database with token IDs.
 * 
 * Run: node mint-approved.js
 */

const { Coinbase, Wallet } = require('@coinbase/coinbase-sdk');

// Config
const SUPABASE_URL = 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmY25uYWx3ZXV3Z2F1emlqZWZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNTI2NjUsImV4cCI6MjA4NTYyODY2NX0.34M21ctB6jiCNsFANwsSea8BoXkCqCyKjqvrvGEpOwA';
const PLATFORM_CONTRACT = '0xf5663DF53DA46718f28C879ae1C3Fb1bDcD4490D';

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

async function main() {
  console.log('🔍 Checking for approved submissions to mint...\n');
  
  const submissions = await getApprovedUnminted();
  
  if (submissions.length === 0) {
    console.log('✓ No pending mints.');
    return;
  }
  
  console.log(`Found ${submissions.length} submission(s) to mint.\n`);
  
  // Initialize wallet
  Coinbase.configureFromJson({ filePath: './cdp-api-key.json' });
  const walletData = require('./wallet-minter.json');
  const wallet = await Wallet.import(walletData);
  const address = await wallet.getDefaultAddress();
  
  console.log('Minting wallet:', address.getId());
  
  const balance = await wallet.getBalance('eth');
  console.log('Balance:', balance.toString(), 'ETH\n');
  
  // Get current token count to determine next ID
  let tokenId = 1; // Start from 1, increment for each mint
  
  for (const sub of submissions) {
    console.log(`\n🎨 Minting: "${sub.title}" by ${sub.moltbook}`);
    
    try {
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
      
      console.log('✅ Minted! TX:', txHash);
      
      // Update database
      await updateSubmission(sub.id, tokenId, txHash);
      console.log('📝 Database updated with token ID:', tokenId);
      
      tokenId++;
      
    } catch (error) {
      console.error('❌ Failed to mint:', error.message);
    }
  }
  
  console.log('\n🎉 Done!');
}

main().catch(console.error);
