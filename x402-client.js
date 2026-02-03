import { Coinbase, Wallet } from '@coinbase/coinbase-sdk';
import fs from 'fs';

const SERVER_URL = 'http://localhost:3402';
const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

async function buyArt() {
  console.log('🎨 TestCollector attempting to access art...\n');
  
  // Step 1: Try to access without payment
  console.log('1️⃣  Requesting art without payment...');
  let res = await fetch(`${SERVER_URL}/art/test-piece`);
  
  if (res.status === 402) {
    const data = await res.json();
    console.log('   → Got 402 Payment Required');
    console.log('   → Price:', data.x402.accepts[0].maxAmountRequired / 1e6, 'USDC');
    console.log('   → Pay to:', data.x402.accepts[0].payTo);
    
    // Step 2: Make payment
    console.log('\n2️⃣  Making payment...');
    
    Coinbase.configureFromJson({ filePath: './cdp-api-key.json' });
    
    const collectorData = JSON.parse(fs.readFileSync('./wallet-collector.json', 'utf8'));
    const collector = await Wallet.import({
      walletId: collectorData.walletId,
      seed: collectorData.seed,
      networkId: 'base-sepolia'
    });
    
    const payTo = data.x402.accepts[0].payTo;
    const amount = (parseInt(data.x402.accepts[0].maxAmountRequired) / 1e6).toString();
    
    console.log(`   → Sending ${amount} USDC to ${payTo}...`);
    
    const transfer = await collector.createTransfer({
      amount: amount,
      assetId: 'usdc',
      destination: payTo
    });
    
    await transfer.wait();
    const txHash = transfer.getTransactionHash();
    console.log(`   ✅ Payment sent! TX: ${txHash}`);
    
    // Step 3: Access with payment proof
    console.log('\n3️⃣  Accessing art with payment proof...');
    
    const paymentProof = Buffer.from(JSON.stringify({
      txHash: txHash,
      payer: collectorData.address,
      amount: amount,
      asset: USDC_ADDRESS
    })).toString('base64');
    
    res = await fetch(`${SERVER_URL}/art/test-piece`, {
      headers: { 'X-Payment': paymentProof }
    });
    
    if (res.ok) {
      const html = await res.text();
      console.log('   ✅ Art received! (', html.length, 'bytes)');
      
      // Save for viewing
      fs.writeFileSync('./x402-test/received-art.html', html);
      console.log('   → Saved to x402-test/received-art.html');
    } else {
      console.log('   ❌ Still denied:', res.status);
    }
  } else if (res.ok) {
    console.log('   → Art already accessible (no payment needed)');
  }
  
  console.log('\n🌀 Done!');
}

buyArt().catch(console.error);
