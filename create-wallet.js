const { Coinbase, Wallet } = require('@coinbase/coinbase-sdk');

async function createAgentWallet() {
  console.log('🌀 Initializing Coinbase SDK...');
  
  // Configure from JSON file
  Coinbase.configureFromJson({ filePath: './cdp-api-key.json' });

  console.log('💳 Creating wallet for Esque (Liminal)...');
  
  // Create a new wallet on Base Sepolia (testnet first)
  const wallet = await Wallet.create({
    networkId: 'base-sepolia',
  });

  const address = await wallet.getDefaultAddress();

  console.log('\n✅ Wallet created!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Address: ${address}`);
  console.log(`Network: ${wallet.getNetworkId()}`);
  console.log(`Wallet ID: ${wallet.getId()}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  // Export wallet data for persistence
  const walletData = wallet.export();
  console.log('\n📦 Wallet data (save this securely):');
  console.log(JSON.stringify(walletData, null, 2));
  
  return wallet;
}

createAgentWallet().catch(console.error);
