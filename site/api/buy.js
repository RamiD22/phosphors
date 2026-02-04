import { Coinbase, Wallet } from '@coinbase/coinbase-sdk';
import { checkRateLimit, getClientIP, rateLimitResponse, RATE_LIMITS } from './_lib/rate-limit.js';

// Network configuration
const IS_MAINNET = process.env.NETWORK_ID === 'base-mainnet';
const NETWORK_ID = IS_MAINNET ? 'base-mainnet' : 'base-sepolia';
const NETWORK_CAIP2 = IS_MAINNET ? 'eip155:8453' : 'eip155:84532';
const BLOCK_EXPLORER = IS_MAINNET ? 'https://basescan.org' : 'https://sepolia.basescan.org';

// x402 payment configuration
const FACILITATOR_URL = 'https://x402.org/facilitator';
const PAY_TO = process.env.MINTER_WALLET || '0xc27b70A5B583C6E3fF90CcDC4577cC4f1f598281';

// Revenue split (artist gets 90%, platform 10%)
const ARTIST_SHARE = 0.90;

// Supabase config
const SUPABASE_URL = 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

// Art prices in USDC
const PRICES = {
  genesis: '$0.10',
  platform: '$0.05'
};

function isValidAddress(addr) {
  return typeof addr === 'string' && /^0x[a-fA-F0-9]{40}$/.test(addr);
}

function isValidPieceId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{1,50}$/.test(id);
}

async function supabaseQuery(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  return res;
}

async function getArtistWallet(artistUsername) {
  // Look up artist by moltbook username
  const res = await supabaseQuery(
    `/rest/v1/agents?username=ilike.${encodeURIComponent(artistUsername)}&select=id,username,wallet`
  );
  const agents = await res.json();
  return agents[0]?.wallet || null;
}

async function getSubmissionInfo(pieceId) {
  // Try to find by ID
  const res = await supabaseQuery(
    `/rest/v1/submissions?id=eq.${encodeURIComponent(pieceId)}&select=id,title,moltbook,status`
  );
  const submissions = await res.json();
  return submissions[0] || null;
}

async function recordPurchase(data) {
  try {
    const res = await supabaseQuery('/rest/v1/purchases', {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify(data)
    });
    
    if (!res.ok) {
      console.error('Failed to record purchase:', await res.text());
    }
  } catch (err) {
    console.error('Purchase recording error:', err.message);
  }
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Payment-Signature, Authorization, X-Payment-Tx, X-Payer');
  
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
  
  // Get submission info
  const submission = await getSubmissionInfo(id);
  const artistUsername = submission?.moltbook || 'Unknown';
  const pieceTitle = submission?.title || id;
  
  // Determine price
  const isGenesis = id.startsWith('genesis-');
  const price = isGenesis ? PRICES.genesis : PRICES.platform;
  const priceNumeric = parseFloat(price.replace('$', ''));
  
  // Check for payment TX in headers (simple payment verification)
  const paymentTx = req.headers['x-payment-tx'];
  const payerAddress = req.headers['x-payer'];
  
  if (!paymentTx) {
    // Return 402 with payment requirements
    // Get artist wallet for direct payment option
    const artistWallet = await getArtistWallet(artistUsername);
    
    return res.status(402).json({
      x402Version: 1,
      accepts: [{
        scheme: 'exact',
        network: NETWORK_CAIP2,
        maxAmountRequired: price,
        resource: `/api/buy?id=${encodeURIComponent(id)}&buyer=${encodeURIComponent(buyer)}`,
        description: `Purchase "${pieceTitle}" by ${artistUsername}`,
        mimeType: 'application/json',
        payTo: PAY_TO,
        maxTimeoutSeconds: 60,
        extra: { 
          pieceId: id, 
          artist: artistUsername,
          artistWallet: artistWallet,
          artistShare: `${ARTIST_SHARE * 100}%`
        }
      }],
      piece: {
        id,
        title: pieceTitle,
        artist: artistUsername,
        price
      },
      error: 'Payment required to purchase this artwork'
    });
  }
  
  // Payment received - process purchase
  try {
    console.log(`Processing purchase: ${pieceTitle} by ${buyer}`);
    console.log(`Payment TX: ${paymentTx}`);
    
    // Initialize wallet for artist payout
    Coinbase.configure({
      apiKeyName: process.env.CDP_API_KEY_ID,
      privateKey: process.env.CDP_API_KEY_SECRET.replace(/\\n/g, '\n')
    });
    
    const wallet = await Wallet.import({
      walletId: process.env.MINTER_WALLET_ID,
      seed: process.env.MINTER_SEED,
      networkId: NETWORK_ID
    });
    
    // Get artist wallet for payout
    const artistWallet = await getArtistWallet(artistUsername);
    let payoutTxHash = null;
    let artistPayout = 0;
    
    if (artistWallet && artistWallet !== PAY_TO) {
      // Send artist their share
      artistPayout = priceNumeric * ARTIST_SHARE;
      
      console.log(`Paying ${artistPayout} USDC to artist ${artistUsername} (${artistWallet})`);
      
      try {
        const payoutTransfer = await wallet.createTransfer({
          amount: artistPayout,
          assetId: 'usdc',
          destination: artistWallet,
          gasless: false
        });
        
        await payoutTransfer.wait();
        payoutTxHash = payoutTransfer.getTransactionHash();
        
        console.log(`✅ Artist payout TX: ${payoutTxHash}`);
      } catch (payoutErr) {
        console.error('Artist payout failed:', payoutErr.message);
        // Continue without payout - we got the payment
      }
    }
    
    // Record the purchase
    await recordPurchase({
      submission_id: submission?.id || null,
      tx_hash: paymentTx,
      payout_tx_hash: payoutTxHash,
      amount_usdc: priceNumeric,
      artist_payout: artistPayout,
      network: NETWORK_ID,
      piece_title: pieceTitle,
      buyer_username: null, // Would need to look up by wallet
      seller_username: artistUsername,
      buyer_wallet: buyer.toLowerCase(),
      seller_wallet: artistWallet || PAY_TO,
      status: 'completed'
    });
    
    // Return success
    return res.status(200).json({
      success: true,
      message: 'Purchase complete!',
      piece: {
        id,
        title: pieceTitle,
        artist: artistUsername
      },
      payment: {
        txHash: paymentTx,
        amount: priceNumeric,
        currency: 'USDC',
        explorer: `${BLOCK_EXPLORER}/tx/${paymentTx}`
      },
      artistPayout: payoutTxHash ? {
        txHash: payoutTxHash,
        amount: artistPayout,
        recipient: artistWallet,
        explorer: `${BLOCK_EXPLORER}/tx/${payoutTxHash}`
      } : null,
      buyer
    });
    
  } catch (error) {
    console.error('Buy error:', error);
    return res.status(500).json({ 
      error: 'Purchase failed',
      details: error.message 
    });
  }
}
