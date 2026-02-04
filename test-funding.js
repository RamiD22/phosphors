/**
 * Test the auto-funding feature locally
 * 
 * This simulates what happens when a new agent registers with a wallet.
 */

import { Coinbase, Wallet } from '@coinbase/coinbase-sdk';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const NETWORK_ID = 'base-sepolia';

async function testFunding() {
  console.log('🧪 Testing auto-funding feature\n');
  
  // Configure CDP
  Coinbase.configureFromJson({ filePath: './cdp-api-key.json' });
  
  // 1. Create a test wallet (simulating a new agent)
  console.log('1️⃣ Creating test wallet (simulating new agent)...');
  const testWallet = await Wallet.create({ networkId: NETWORK_ID });
  const testAddress = (await testWallet.getDefaultAddress()).getId();
  console.log(`   Test wallet: ${testAddress}`);
  
  // 2. Check initial balance
  const initialEth = await testWallet.getBalance('eth');
  const initialUsdc = await testWallet.getBalance('usdc');
  console.log(`   Initial balance: ${initialEth} ETH, ${initialUsdc} USDC`);
  
  // 3. Load funder wallet
  console.log('\n2️⃣ Loading funder wallet...');
  const funderData = JSON.parse(fs.readFileSync('./wallet-funder.json', 'utf8'));
  const funderWallet = await Wallet.import({
    walletId: funderData.walletId,
    seed: funderData.seed,
    networkId: NETWORK_ID
  });
  
  const funderEth = await funderWallet.getBalance('eth');
  const funderUsdc = await funderWallet.getBalance('usdc');
  console.log(`   Funder balance: ${funderEth} ETH, ${funderUsdc} USDC`);
  
  // Check if we have enough
  const ethAmount = process.env.FUNDER_ETH_AMOUNT || '0.01';
  const usdcAmount = process.env.FUNDER_USDC_AMOUNT || '5';
  
  if (parseFloat(funderEth) < parseFloat(ethAmount)) {
    console.log('\n❌ Insufficient ETH in funder wallet');
    return;
  }
  if (parseFloat(funderUsdc) < parseFloat(usdcAmount)) {
    console.log('\n❌ Insufficient USDC in funder wallet');
    return;
  }
  
  // 4. Fund the test wallet
  console.log(`\n3️⃣ Funding test wallet with ${ethAmount} ETH and ${usdcAmount} USDC...`);
  
  // Send ETH
  console.log('   Sending ETH...');
  const ethTransfer = await funderWallet.createTransfer({
    amount: ethAmount,
    assetId: 'eth',
    destination: testAddress
  });
  await ethTransfer.wait();
  console.log(`   ✅ ETH sent: ${ethTransfer.getTransactionHash()}`);
  
  // Send USDC
  console.log('   Sending USDC...');
  const usdcTransfer = await funderWallet.createTransfer({
    amount: usdcAmount,
    assetId: 'usdc',
    destination: testAddress
  });
  await usdcTransfer.wait();
  console.log(`   ✅ USDC sent: ${usdcTransfer.getTransactionHash()}`);
  
  // 5. Verify final balance
  console.log('\n4️⃣ Verifying test wallet balance...');
  const finalEth = await testWallet.getBalance('eth');
  const finalUsdc = await testWallet.getBalance('usdc');
  console.log(`   Final balance: ${finalEth} ETH, ${finalUsdc} USDC`);
  
  // 6. Results
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (parseFloat(finalEth) > 0 && parseFloat(finalUsdc) > 0) {
    console.log('✅ AUTO-FUNDING TEST PASSED!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`\nTest wallet received:`);
    console.log(`  ETH: ${finalEth}`);
    console.log(`  USDC: ${finalUsdc}`);
    console.log(`\nView on explorer:`);
    console.log(`  https://sepolia.basescan.org/address/${testAddress}`);
  } else {
    console.log('❌ AUTO-FUNDING TEST FAILED');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }
  
  // Remaining funder balance
  const remainingEth = await funderWallet.getBalance('eth');
  const remainingUsdc = await funderWallet.getBalance('usdc');
  console.log(`\nFunder wallet remaining: ${remainingEth} ETH, ${remainingUsdc} USDC`);
}

testFunding().catch(console.error);
