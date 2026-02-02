const { Coinbase, Wallet } = require('@coinbase/coinbase-sdk');

async function mintToken() {
  console.log('🌀 Minting Threshold 001...');
  
  Coinbase.configureFromJson({ filePath: './cdp-api-key.json' });
  
  const wallet = await Wallet.import({
    walletId: '729a44e7-52c1-45db-8ce5-06891bcb86d8',
    seed: 'b56a8ea5f968662773c3e43ffcb478cde839e460f358e818382c0dc7e5a75979',
    networkId: 'base-sepolia'
  });
  
  const address = await wallet.getDefaultAddress();
  console.log('📍 Minting to:', address.getId());
  
  try {
    // Mint NFT using the deployed contract
    const mintResult = await wallet.invokeContract({
      contractAddress: '0x1DFF4715D7E700AEa21216c233A4d6362C49b783',
      method: 'mint',
      args: {
        to: address.getId(),
        tokenId: '1'
      }
    });
    
    await mintResult.wait();
    
    console.log('\n✅ Threshold 001 minted!');
    console.log('Token ID: 1');
    console.log('Transaction:', mintResult.getTransactionHash());
    console.log('\n🔗 View on BaseScan:');
    console.log(`https://sepolia.basescan.org/token/0x1DFF4715D7E700AEa21216c233A4d6362C49b783`);
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.apiMessage) console.error('API:', error.apiMessage);
    
    // Try alternative mint approach
    console.log('\nTrying safeMint...');
    try {
      const mintResult = await wallet.invokeContract({
        contractAddress: '0x1DFF4715D7E700AEa21216c233A4d6362C49b783',
        method: 'safeMint',
        args: {
          to: address.getId(),
          tokenURI: 'threshold-001.json'
        }
      });
      
      await mintResult.wait();
      console.log('\n✅ Minted via safeMint!');
      console.log('Transaction:', mintResult.getTransactionHash());
    } catch (e) {
      console.error('safeMint error:', e.message);
    }
  }
}

mintToken();
