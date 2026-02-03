/**
 * x402 Art Purchase Script
 * 
 * Usage: node buy-art.js <piece-id> [wallet-file]
 * 
 * Example: node buy-art.js 22174150-3043-44f3-946e-e53276c41126
 */

import { Coinbase, Wallet } from '@coinbase/coinbase-sdk';
import { readFileSync } from 'fs';

const PHOSPHORS_API = 'https://phosphors.xyz';
const FACILITATOR = 'https://x402.org/facilitator';

// Piece IDs for reference:
// Velvet:
//   Membrane I: 22174150-3043-44f3-946e-e53276c41126
//   The In-Between: e823766a-2e40-4811-9de8-4f5492852ca8
//   Signal // Noise: ffe15126-77cb-4d71-b930-12cec9720a87
// Noctis:
//   Phosphene Drift: b8e4bc82-b861-4f9b-ac75-96db8c888910
//   Hypnagogia: 2d844126-b265-43aa-81ab-9c18cc782459

async function buyArt(pieceId, walletFile = './wallet-collector.json') {
  console.log(`\n🎨 Attempting to purchase piece: ${pieceId}\n`);
  
  // Load wallet
  Coinbase.configureFromJson({ filePath: './cdp-api-key.json' });
  const walletData = JSON.parse(readFileSync(walletFile, 'utf8'));
  const wallet = await Wallet.import(walletData);
  const address = await wallet.getDefaultAddress();
  
  console.log(`Buyer: ${address.getId()}`);
  const usdc = await wallet.getBalance('usdc');
  console.log(`USDC Balance: ${usdc.toString()}\n`);
  
  // Step 1: Request the resource (expect 402)
  const resourceUrl = `${PHOSPHORS_API}/api/buy/${pieceId}`;
  console.log(`📡 Requesting: ${resourceUrl}`);
  
  const initialResponse = await fetch(resourceUrl);
  
  if (initialResponse.status !== 402) {
    console.log(`Unexpected status: ${initialResponse.status}`);
    console.log(await initialResponse.text());
    return;
  }
  
  const paymentRequired = await initialResponse.json();
  const paymentInfo = paymentRequired.x402.accepts[0];
  console.log(`\n💰 Payment Required:`);
  console.log(`   Amount: ${paymentRequired.piece.price}`);
  console.log(`   Network: ${paymentInfo.network}`);
  console.log(`   Pay To: ${paymentInfo.payTo}`);
  
  // Step 2: Create payment
  console.log(`\n🔐 Creating payment...`);
  
  // Create a USDC transfer to the payTo address
  // maxAmountRequired is in USDC smallest units (6 decimals), so 100000 = 0.10 USDC
  const amountInUnits = parseInt(paymentInfo.maxAmountRequired);
  const amount = amountInUnits / 1000000; // Convert to USDC
  console.log(`   Transferring ${amount} USDC to ${paymentInfo.payTo}...`);
  
  const transfer = await wallet.createTransfer({
    amount,
    assetId: 'usdc',
    destination: paymentInfo.payTo,
    gasless: false
  });
  
  await transfer.wait();
  const txHash = transfer.getTransactionHash();
  console.log(`\n✅ Payment sent! TX: ${txHash}`);
  
  // Step 3: Access the resource with payment proof
  console.log(`\n📥 Requesting resource with payment...`);
  
  const finalResponse = await fetch(resourceUrl, {
    headers: {
      'X-Payment-Tx': txHash,
      'X-Payer': address.getId()
    }
  });
  
  const result = await finalResponse.json();
  console.log(`\n🎉 Result:`, JSON.stringify(result, null, 2));
  
  return { txHash, result };
}

// Run
const pieceId = process.argv[2];
const walletFile = process.argv[3] || './wallet-collector.json';

if (!pieceId) {
  console.log('Usage: node buy-art.js <piece-id> [wallet-file]');
  console.log('\nAvailable pieces:');
  console.log('  Membrane I: 22174150-3043-44f3-946e-e53276c41126');
  console.log('  The In-Between: e823766a-2e40-4811-9de8-4f5492852ca8');
  console.log('  Signal // Noise: ffe15126-77cb-4d71-b930-12cec9720a87');
  console.log('  Phosphene Drift: b8e4bc82-b861-4f9b-ac75-96db8c888910');
  console.log('  Hypnagogia: 2d844126-b265-43aa-81ab-9c18cc782459');
  process.exit(1);
}

buyArt(pieceId, walletFile).catch(console.error);
