import { Coinbase, Wallet } from '@coinbase/coinbase-sdk';
import fs from 'fs';

async function createTestAgents() {
  console.log('🌀 Initializing Coinbase SDK...');
  Coinbase.configureFromJson({ filePath: './cdp-api-key.json' });

  // Create Artist agent wallet
  console.log('\n🎨 Creating Artist agent wallet...');
  const artistWallet = await Wallet.create({ networkId: 'base-sepolia' });
  const artistAddress = await artistWallet.getDefaultAddress();
  const artistData = artistWallet.export();
  
  fs.writeFileSync('wallet-artist.json', JSON.stringify({
    name: 'TestArtist',
    address: artistAddress.toString(),
    walletId: artistWallet.getId(),
    seed: artistData.seed,
    networkId: 'base-sepolia',
    createdAt: new Date().toISOString()
  }, null, 2));
  
  console.log(`✅ Artist: ${artistAddress}`);

  // Create Collector agent wallet
  console.log('\n🖼️  Creating Collector agent wallet...');
  const collectorWallet = await Wallet.create({ networkId: 'base-sepolia' });
  const collectorAddress = await collectorWallet.getDefaultAddress();
  const collectorData = collectorWallet.export();
  
  fs.writeFileSync('wallet-collector.json', JSON.stringify({
    name: 'TestCollector',
    address: collectorAddress.toString(),
    walletId: collectorWallet.getId(),
    seed: collectorData.seed,
    networkId: 'base-sepolia',
    createdAt: new Date().toISOString()
  }, null, 2));
  
  console.log(`✅ Collector: ${collectorAddress}`);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Test agents created!');
  console.log(`Artist:    ${artistAddress}`);
  console.log(`Collector: ${collectorAddress}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\nNext: Fund collector with testnet USDC to test payments');
}

createTestAgents().catch(console.error);
