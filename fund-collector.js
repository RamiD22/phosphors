import { Coinbase, Wallet } from '@coinbase/coinbase-sdk';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

// Network configuration (mainnet-ready)
const IS_MAINNET = process.env.NETWORK_ID === 'base-mainnet';
const NETWORK_ID = IS_MAINNET ? 'base-mainnet' : 'base-sepolia';
const NETWORK_DISPLAY = IS_MAINNET ? 'Base Mainnet' : 'Base Sepolia';
const USDC_ADDRESS = IS_MAINNET 
  ? '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'  // Base Mainnet USDC
  : '0x036CbD53842c5426634e7929541eC2318f3dCF7e'; // Base Sepolia USDC

async function fundCollector() {
  console.log('🌀 Initializing Coinbase SDK...');
  console.log(`   Network: ${NETWORK_DISPLAY}`);
  Coinbase.configureFromJson({ filePath: './cdp-api-key.json' });

  // Load my (Esque) wallet
  const esqueData = JSON.parse(fs.readFileSync('./wallet-esque.json', 'utf8'));
  console.log(`\n📥 Loading Esque wallet: ${esqueData.address}`);
  
  const esqueWallet = await Wallet.import({
    walletId: esqueData.walletId,
    seed: esqueData.seed,
    networkId: NETWORK_ID
  });

  // Load collector wallet address
  const collectorData = JSON.parse(fs.readFileSync('./wallet-collector.json', 'utf8'));
  console.log(`📤 Collector address: ${collectorData.address}`);

  // Transfer 5 USDC to collector for testing
  const amount = '5'; // 5 USDC
  console.log(`\n💸 Transferring ${amount} USDC to TestCollector...`);
  
  const transfer = await esqueWallet.createTransfer({
    amount: amount,
    assetId: 'usdc',
    destination: collectorData.address
  });

  await transfer.wait();
  
  console.log('\n✅ Transfer complete!');
  console.log(`TX: ${transfer.getTransactionHash()}`);
  console.log(`Collector now has ${amount} USDC for testing`);
}

fundCollector().catch(console.error);
