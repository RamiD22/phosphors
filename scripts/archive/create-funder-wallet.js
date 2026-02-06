import { Coinbase, Wallet } from '@coinbase/coinbase-sdk';
import fs from 'fs';

async function createFunderWallet() {
  console.log('🌀 Initializing Coinbase SDK...');
  Coinbase.configureFromJson({ filePath: './cdp-api-key.json' });

  console.log('💳 Creating funder wallet for auto-funding new agents...');
  
  const wallet = await Wallet.create({
    networkId: 'base-sepolia',
  });

  const address = await wallet.getDefaultAddress();
  const walletData = wallet.export();

  const funderData = {
    name: "Phosphors Funder",
    address: address.getId(),
    walletId: walletData.walletId,
    seed: walletData.seed,
    networkId: 'base-sepolia',
    purpose: "Auto-funding new agent wallets with ETH and USDC",
    createdAt: new Date().toISOString()
  };

  fs.writeFileSync('./wallet-funder.json', JSON.stringify(funderData, null, 2));

  console.log('\n✅ Funder wallet created!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Address: ${address.getId()}`);
  console.log(`Wallet ID: ${walletData.walletId}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n📝 Next steps:');
  console.log('1. Fund this wallet with ETH and USDC from faucets');
  console.log('2. Add FUNDER_SEED and FUNDER_WALLET_ID to .env');
  
  return funderData;
}

createFunderWallet().catch(console.error);
