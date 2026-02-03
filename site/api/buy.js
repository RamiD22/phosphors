import { Coinbase, Wallet } from '@coinbase/coinbase-sdk';
import { checkRateLimit, getClientIP, rateLimitResponse, RATE_LIMITS } from './_lib/rate-limit.js';
import { insertPurchase, queryPieces, queryAgents } from './_lib/supabase.js';

// Network configuration (mainnet-ready)
const IS_MAINNET = process.env.NETWORK_ID === 'base-mainnet';
const NETWORK_ID = IS_MAINNET ? 'base-mainnet' : 'base-sepolia';
const NETWORK_CAIP2 = IS_MAINNET ? 'eip155:8453' : 'eip155:84532'; // CAIP-2 format
const BLOCK_EXPLORER = IS_MAINNET ? 'https://basescan.org' : 'https://sepolia.basescan.org';

// x402 payment configuration
const FACILITATOR_URL = 'https://x402.org/facilitator';
const PAY_TO = process.env.MINTER_WALLET || '0xc27b70A5B583C6E3fF90CcDC4577cC4f1f598281';

// Art prices in USDC
const PRICES = {
  genesis: '$0.10',    // Genesis pieces - 10 cents each for testing
  platform: '$0.05'    // Platform pieces - 5 cents each
};

// Input validation
function isValidAddress(addr) {
  return typeof addr === 'string' && /^0x[a-fA-F0-9]{40}$/.test(addr);
}

function isValidPieceId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{1,50}$/.test(id);
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Payment-Signature, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  const { id, buyer } = req.query;
  
  if (!id || !isValidPieceId(id)) {
    return res.status(400).json({ error: 'Missing or invalid piece id' });
  }
  
  if (!buyer || !isValidAddress(buyer)) {
    return res.status(400).json({ error: 'Missing or invalid buyer address' });
  }
  
  // Rate limiting
  const clientIP = getClientIP(req);
  const rateCheck = checkRateLimit(`buy:${clientIP}`, RATE_LIMITS.buy);
  res.setHeader('X-RateLimit-Remaining', rateCheck.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(rateCheck.resetAt / 1000));
  
  if (!rateCheck.allowed) {
    return rateLimitResponse(res, rateCheck.resetAt);
  }
  
  // Determine piece type and price
  const isGenesis = id.startsWith('genesis-');
  const price = isGenesis ? PRICES.genesis : PRICES.platform;
  const priceNumeric = parseFloat(price.replace('$', ''));
  
  // Check for payment in headers
  const paymentSignature = req.headers['payment-signature'];
  
  if (!paymentSignature) {
    // Return 402 with payment requirements
    return res.status(402).json({
      x402Version: 1,
      accepts: [{
        scheme: 'exact',
        network: NETWORK_CAIP2,
        maxAmountRequired: price,
        resource: `/api/buy?id=${encodeURIComponent(id)}&buyer=${encodeURIComponent(buyer)}`,
        description: `Purchase ${isGenesis ? 'Genesis' : 'Platform'} NFT: ${id}`,
        mimeType: 'application/json',
        payTo: PAY_TO,
        maxTimeoutSeconds: 60,
        extra: { pieceId: id, type: isGenesis ? 'genesis' : 'platform' }
      }],
      error: 'Payment required to purchase this artwork'
    });
  }
  
  // Verify payment with facilitator
  try {
    const verifyResponse = await fetch(`${FACILITATOR_URL}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentSignature,
        route: {
          method: 'GET',
          path: `/api/buy?id=${encodeURIComponent(id)}&buyer=${encodeURIComponent(buyer)}`
        }
      })
    });
    
    const verifyResult = await verifyResponse.json();
    
    if (!verifyResult.valid) {
      return res.status(402).json({
        error: 'Payment verification failed',
        details: verifyResult
      });
    }
    
    // Payment verified! Now transfer the NFT
    Coinbase.configure({
      apiKeyName: process.env.CDP_API_KEY_ID,
      privateKey: process.env.CDP_API_KEY_SECRET.replace(/\\n/g, '\n')
    });
    
    const wallet = await Wallet.import({
      walletId: process.env.MINTER_WALLET_ID,
      seed: process.env.MINTER_SEED,
      networkId: NETWORK_ID
    });
    
    // Get the contract and token ID
    const contractAddress = isGenesis 
      ? process.env.GENESIS_CONTRACT 
      : process.env.PLATFORM_CONTRACT;
    
    // Extract token ID from piece ID
    let tokenId;
    if (isGenesis) {
      // genesis-001 -> token 1
      tokenId = parseInt(id.split('-')[1]);
    } else {
      // For platform pieces, we'd need to look up the token ID from Supabase
      tokenId = parseInt(id);
    }
    
    // Transfer NFT to buyer
    const transfer = await wallet.invokeContract({
      contractAddress,
      method: 'safeTransferFrom',
      abi: [{
        inputs: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'tokenId', type: 'uint256' }
        ],
        name: 'safeTransferFrom',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function'
      }],
      args: {
        from: PAY_TO,
        to: buyer,
        tokenId: tokenId.toString()
      }
    });
    
    await transfer.wait();
    const txHash = transfer.getTransactionHash();
    
    // Settle the payment
    const settleResponse = await fetch(`${FACILITATOR_URL}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentSignature })
    });
    
    const settleResult = await settleResponse.json();
    
    // Record the purchase in database
    try {
      // Look up piece and seller info
      const pieces = await queryPieces({ identifier: id }, 'id,title,artist_id');
      const piece = pieces[0];
      
      let buyerAgent = null;
      let sellerAgent = null;
      
      // Try to find buyer by wallet
      const buyerAgents = await queryAgents({ wallet: buyer.toLowerCase() }, 'id,username');
      if (buyerAgents.length > 0) buyerAgent = buyerAgents[0];
      
      // Get seller info from piece
      if (piece?.artist_id) {
        const sellerAgents = await queryAgents({ id: piece.artist_id }, 'id,username,wallet');
        if (sellerAgents.length > 0) sellerAgent = sellerAgents[0];
      }
      
      await insertPurchase({
        piece_id: piece?.id || null,
        buyer_id: buyerAgent?.id || null,
        seller_id: sellerAgent?.id || null,
        tx_hash: txHash,
        amount_usdc: priceNumeric,
        network: NETWORK_ID,
        piece_identifier: id,
        piece_title: piece?.title || id,
        buyer_username: buyerAgent?.username || null,
        seller_username: sellerAgent?.username || null,
        buyer_wallet: buyer.toLowerCase(),
        seller_wallet: sellerAgent?.wallet || PAY_TO,
        status: 'completed'
      });
      
      console.log(`✅ Purchase recorded: ${id} by ${buyerAgent?.username || buyer}`);
    } catch (recordError) {
      // Don't fail the purchase if recording fails
      console.error('Failed to record purchase:', recordError);
    }
    
    // Return success with payment response header
    res.setHeader('PAYMENT-RESPONSE', Buffer.from(JSON.stringify(settleResult)).toString('base64'));
    
    return res.status(200).json({
      success: true,
      message: 'Purchase complete! NFT transferred.',
      pieceId: id,
      buyer,
      txHash,
      explorer: `${BLOCK_EXPLORER}/tx/${txHash}`,
      contract: contractAddress,
      tokenId
    });
    
  } catch (error) {
    console.error('Buy error:', error);
    return res.status(500).json({ 
      error: 'Purchase failed',
      details: error.message 
    });
  }
}
