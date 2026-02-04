/**
 * Fund the funder wallet from Esque wallet
 * 
 * This is a setup script to seed the funder wallet
 * so it can auto-fund new agents.
 */

import { Coinbase, Wallet } from '@coinbase/coinbase-sdk';
import fs from 'fs';

const NETWORK_ID = 'base-sepolia';

async function fundFunderWallet() {
  console.log('🌀 Initializing Coinbase SDK...');
  Coinbase.configureFromJson({ filePath: './cdp-api-key.json' });

  // Load source wallet (Esque)
  const sourceData = JSON.parse(fs.readFileSync('./wallet-esque.json', 'utf8'));
  console.log(`📥 Loading source wallet (Esque): ${sourceData.address}`);
  
  const sourceWallet = await Wallet.import({
    walletId: sourceData.walletId,
    seed: sourceData.seed,
    networkId: NETWORK_ID
  });

  // Load funder wallet info
  const funderData = JSON.parse(fs.readFileSync('./wallet-funder.json', 'utf8'));
  console.log(`📤 Funder wallet: ${funderData.address}`);

  // Check source balances
  const ethBalance = await sourceWallet.getBalance('eth');
  const usdcBalance = await sourceWallet.getBalance('usdc');
  console.log(`\nSource wallet balances:`);
  console.log(`  ETH: ${ethBalance}`);
  console.log(`  USDC: ${usdcBalance}`);

  // Transfer smaller amounts for hackathon demo (conserve funds)
  // Enough for 2-3 test agents
  const ethToSend = '0.015';  // 0.015 ETH (1-2 agents, keeping gas for Esque)
  const usdcToSend = '10';    // 10 USDC (2 agents)

  console.log(`\n💸 Transferring to funder wallet:`);
  console.log(`  ETH: ${ethToSend}`);
  console.log(`  USDC: ${usdcToSend}`);

  // Send ETH
  console.log(`\n📤 Sending ETH...`);
  const ethTransfer = await sourceWallet.createTransfer({
    amount: ethToSend,
    assetId: 'eth',
    destination: funderData.address
  });
  await ethTransfer.wait();
  console.log(`✅ ETH sent: ${ethTransfer.getTransactionHash()}`);

  // Send USDC
  console.log(`\n📤 Sending USDC...`);
  const usdcTransfer = await sourceWallet.createTransfer({
    amount: usdcToSend,
    assetId: 'usdc',
    destination: funderData.address
  });
  await usdcTransfer.wait();
  console.log(`✅ USDC sent: ${usdcTransfer.getTransactionHash()}`);

  // Verify funder balances
  console.log(`\n✅ Funder wallet funded!`);
  console.log(`\nVerifying funder balances...`);
  
  const funderWallet = await Wallet.import({
    walletId: funderData.walletId,
    seed: funderData.seed,
    networkId: NETWORK_ID
  });
  
  const newEthBalance = await funderWallet.getBalance('eth');
  const newUsdcBalance = await funderWallet.getBalance('usdc');
  
  console.log(`Funder wallet now has:`);
  console.log(`  ETH: ${newEthBalance}`);
  console.log(`  USDC: ${newUsdcBalance}`);
  
  const agentsCanFund = Math.min(
    Math.floor(parseFloat(newEthBalance) / 0.01),
    Math.floor(parseFloat(newUsdcBalance) / 5)
  );
  console.log(`\n🎯 Can fund approximately ${agentsCanFund} new agents`);
  
  if (agentsCanFund < 5) {
    console.log(`\n⚠️ Low funds! Get more from faucets:`);
    console.log(`   https://www.alchemy.com/faucets/base-sepolia`);
    console.log(`   https://faucet.quicknode.com/base/sepolia`);
  }
}

fundFunderWallet().catch(console.error);
