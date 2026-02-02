import { Coinbase, Wallet } from '@coinbase/coinbase-sdk';

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  // Simple auth check
  const { submissionId, secret } = req.body;
  if (secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    // Configure CDP
    Coinbase.configure({
      apiKeyName: process.env.CDP_API_KEY_ID,
      privateKey: process.env.CDP_API_KEY_SECRET.replace(/\\n/g, '\n')
    });
    
    // Load minting wallet
    const wallet = await Wallet.import({
      walletId: process.env.MINTER_WALLET_ID,
      seed: process.env.MINTER_SEED,
      networkId: 'base-sepolia'
    });
    
    const address = await wallet.getDefaultAddress();
    
    // Mint NFT
    const mint = await wallet.invokeContract({
      contractAddress: process.env.PLATFORM_CONTRACT,
      method: 'mint',
      abi: [{
        inputs: [{ name: 'to', type: 'address' }],
        name: 'mint',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function'
      }],
      args: { to: address.getId() }
    });
    
    await mint.wait();
    
    return res.status(200).json({ 
      success: true,
      txHash: mint.getTransactionHash(),
      contract: process.env.PLATFORM_CONTRACT
    });
    
  } catch (error) {
    console.error('Mint error:', error);
    return res.status(500).json({ error: error.message });
  }
}
