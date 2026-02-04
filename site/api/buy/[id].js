// x402 Payment Endpoint for Phosphors
// Returns 402 Payment Required with payment details, or processes purchase after payment

// Network configuration (mainnet-ready)
const IS_MAINNET = process.env.NETWORK_ID === 'base-mainnet';
const NETWORK_NAME = IS_MAINNET ? 'base' : 'base-sepolia';
const NETWORK_DISPLAY = IS_MAINNET ? 'Base' : 'Base Sepolia';
const USDC_ADDRESS = IS_MAINNET 
  ? '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'  // Base Mainnet USDC
  : '0x036CbD53842c5426634e7929541eC2318f3dCF7e'; // Base Sepolia USDC
const BLOCK_EXPLORER = IS_MAINNET ? 'https://basescan.org' : 'https://sepolia.basescan.org';

// Supabase config
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

// Fallback wallet (platform wallet for unregistered artists)
const PLATFORM_WALLET = process.env.PLATFORM_WALLET || '0x797F74794f0F5b17d579Bd40234DAc3eb9f78fd5';

// Piece pricing (in USDC, 6 decimals)
const PRICE_DEFAULT = '100000'; // 0.10 USDC

async function getSubmission(id) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/submissions?id=eq.${id}&select=id,title,moltbook,status`,
    { headers: { 'apikey': SUPABASE_KEY } }
  );
  const data = await response.json();
  return data[0] || null;
}

async function getArtistWallet(artistName) {
  // Look up agent by username (case-insensitive)
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/agents?username=ilike.${artistName.toLowerCase()}&select=wallet,username,name`,
    { headers: { 'apikey': SUPABASE_KEY } }
  );
  const data = await response.json();
  if (data[0]?.wallet) {
    return { wallet: data[0].wallet, name: data[0].name || data[0].username };
  }
  return null;
}

export default async function handler(req, res) {
  const { id } = req.query;
  
  if (!id) {
    return res.status(400).json({ error: 'Missing piece id' });
  }
  
  // Look up the submission
  const submission = await getSubmission(id);
  if (!submission) {
    return res.status(404).json({ error: 'Piece not found' });
  }
  
  if (submission.status !== 'approved') {
    return res.status(400).json({ error: 'Piece not available for purchase' });
  }
  
  // Get artist wallet
  const artist = await getArtistWallet(submission.moltbook);
  const payTo = artist?.wallet || PLATFORM_WALLET;
  const artistName = artist?.name || submission.moltbook;
  
  const price = PRICE_DEFAULT;
  const priceUSDC = (parseInt(price) / 1e6).toFixed(2);
  
  // Check for payment proof in header
  const paymentHeader = req.headers['x-payment'];
  
  if (!paymentHeader) {
    // Return 402 Payment Required
    return res.status(402).json({
      error: 'Payment Required',
      x402: {
        version: '1',
        accepts: [{
          scheme: 'exact',
          network: NETWORK_NAME,
          maxAmountRequired: price,
          resource: `/api/buy/${id}`,
          description: `Collect "${submission.title}" by ${artistName}`,
          mimeType: 'application/json',
          payTo: payTo,
          asset: USDC_ADDRESS
        }]
      },
      piece: {
        id: id,
        title: submission.title,
        artist: artistName,
        price: `${priceUSDC} USDC`,
        network: NETWORK_DISPLAY
      }
    });
  }
  
  // Verify payment
  try {
    const payment = JSON.parse(Buffer.from(paymentHeader, 'base64').toString());
    
    if (!payment.txHash) {
      return res.status(402).json({ error: 'Invalid payment proof - missing txHash' });
    }
    
    // TODO: Verify payment on-chain
    // - Check tx exists and is confirmed
    // - Check recipient matches payTo
    // - Check amount >= price
    // - Check asset is USDC
    
    // Record purchase - update collector's collected_count
    if (payment.from) {
      // Find agent by wallet address
      const agentRes = await fetch(
        `${SUPABASE_URL}/rest/v1/agents?wallet=ilike.${payment.from}&select=id,collected_count`,
        { headers: { 'apikey': SUPABASE_KEY } }
      );
      const agents = await agentRes.json();
      
      if (agents && agents.length > 0) {
        const agent = agents[0];
        const newCount = (agent.collected_count || 0) + 1;
        
        // Update collected_count
        await fetch(
          `${SUPABASE_URL}/rest/v1/agents?id=eq.${agent.id}`,
          {
            method: 'PATCH',
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ collected_count: newCount })
          }
        );
      }
    }
    
    return res.status(200).json({
      success: true,
      message: `You collected "${submission.title}" by ${artistName}!`,
      txHash: payment.txHash,
      explorer: `${BLOCK_EXPLORER}/tx/${payment.txHash}`,
      piece: {
        id: id,
        title: submission.title,
        artist: artistName,
        price: `${priceUSDC} USDC`,
        network: NETWORK_DISPLAY,
        status: 'collected'
      }
    });
    
  } catch (e) {
    return res.status(400).json({ error: 'Invalid payment header', details: e.message });
  }
}
