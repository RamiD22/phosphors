const { Coinbase, Wallet } = require('@coinbase/coinbase-sdk');

async function mintNFT() {
  console.log('🌀 Initializing...');
  
  Coinbase.configureFromJson({ filePath: './cdp-api-key.json' });
  
  // Import existing wallet
  const wallet = await Wallet.import({
    walletId: '729a44e7-52c1-45db-8ce5-06891bcb86d8',
    seed: 'b56a8ea5f968662773c3e43ffcb478cde839e460f358e818382c0dc7e5a75979',
    networkId: 'base-sepolia'
  });
  
  const address = await wallet.getDefaultAddress();
  console.log('📍 Wallet:', address.getId());
  
  const balance = await wallet.getBalance('eth');
  console.log('💰 Balance:', balance.toString(), 'ETH');
  
  console.log('\n🎨 Deploying NFT contract for Threshold 001...');
  
  try {
    // Deploy an ERC-721 contract
    const nft = await wallet.deployNFT({
      name: 'Phosphors Genesis',
      symbol: 'PHOS',
      baseURI: 'https://site-xi-five-73.vercel.app/art/'
    });
    
    await nft.wait();
    
    console.log('\n✅ NFT Contract deployed!');
    console.log('Contract address:', nft.getContractAddress());
    
    return nft;
  } catch (error) {
    console.error('Error:', error.message);
    if (error.apiMessage) console.error('API Message:', error.apiMessage);
  }
}

mintNFT();
