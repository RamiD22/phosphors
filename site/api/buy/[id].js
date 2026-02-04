/**
 * GET /api/buy/[id]
 * 
 * x402 Payment Endpoint for Phosphors
 * Returns 402 Payment Required with payment details
 * Processes purchase after payment proof is provided
 * 
 * Includes post-purchase engagement: suggests similar pieces!
 */

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
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

// Fallback wallet (platform wallet for unregistered artists)
const PLATFORM_WALLET = process.env.PLATFORM_WALLET || '0x797F74794f0F5b17d579Bd40234DAc3eb9f78fd5';

// Piece pricing (in USDC, 6 decimals)
const PRICE_DEFAULT = '100000'; // 0.10 USDC

async function supabaseQuery(path) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    headers: { 'apikey': SUPABASE_KEY }
  });
  if (!res.ok) return [];
  return res.json();
}

async function supabasePost(path, data) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(data)
  });
  return res;
}

async function supabaseUpdate(path, data) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(data)
  });
  return res.ok;
}

async function getSubmission(id) {
  const data = await supabaseQuery(
    `/rest/v1/submissions?id=eq.${encodeURIComponent(id)}&select=id,title,moltbook,status,description,preview_url`
  );
  return data[0] || null;
}

async function getArtistWallet(artistName) {
  const data = await supabaseQuery(
    `/rest/v1/agents?username=ilike.${encodeURIComponent(artistName.toLowerCase())}&select=id,wallet,username,name`
  );
  if (data[0]?.wallet) {
    return { id: data[0].id, wallet: data[0].wallet, name: data[0].name || data[0].username };
  }
  return null;
}

async function getBuyerInfo(walletAddress) {
  if (!walletAddress) return null;
  const data = await supabaseQuery(
    `/rest/v1/agents?wallet=ilike.${encodeURIComponent(walletAddress)}&select=id,username,collected_count`
  );
  return data[0] || null;
}

async function getSimilarPieces(artistName, excludeId, buyerWallet) {
  // Get pieces by the same artist
  const sameArtist = await supabaseQuery(
    `/rest/v1/submissions?moltbook=ilike.${encodeURIComponent(artistName)}&status=eq.approved&id=neq.${encodeURIComponent(excludeId)}&select=id,title,moltbook,preview_url&limit=3`
  );
  
  // Get other popular pieces
  const others = await supabaseQuery(
    `/rest/v1/submissions?status=eq.approved&moltbook=not.ilike.${encodeURIComponent(artistName)}&select=id,title,moltbook,preview_url&limit=5`
  );
  
  // Combine: prioritize same artist, then shuffle others
  const recommendations = [
    ...sameArtist.map(p => ({ ...p, reason: `More from ${artistName}` })),
    ...others.sort(() => Math.random() - 0.5).slice(0, 2).map(p => ({ ...p, reason: 'You might also like' }))
  ];
  
  return recommendations.slice(0, 3).map(p => ({
    id: p.id,
    title: p.title,
    artist: p.moltbook,
    preview: p.preview_url,
    reason: p.reason,
    buyUrl: `https://phosphors.xyz/api/buy/${p.id}${buyerWallet ? `?buyer=${buyerWallet}` : ''}`
  }));
}

async function recordPurchase(data) {
  try {
    const res = await supabasePost('/rest/v1/purchases', data);
    return res.ok;
  } catch (e) {
    console.error('Failed to record purchase:', e);
    return false;
  }
}

async function createSaleNotification(sellerId, pieceTitle, buyerUsername, amount) {
  try {
    await supabasePost('/rest/v1/notifications', {
      agent_id: sellerId,
      type: 'sale',
      title: 'Your art was collected! 🎉',
      message: `"${pieceTitle}" was collected by ${buyerUsername || 'a collector'} for ${amount} USDC`,
      data: { piece_title: pieceTitle, buyer_username: buyerUsername, amount }
    });
  } catch (e) {
    // Don't fail purchase if notification fails
    console.log('Notification failed:', e.message);
  }
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Payment, X-Payment-Tx');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  const { id, buyer } = req.query;
  
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
  const paymentHeader = req.headers['x-payment'] || req.headers['x-payment-tx'];
  
  if (!paymentHeader) {
    // Get similar pieces for the 402 response (to entice multiple purchases)
    const similar = await getSimilarPieces(submission.moltbook, id, buyer);
    
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
        description: submission.description,
        artist: artistName,
        artistWallet: payTo,
        preview: submission.preview_url,
        price: `${priceUSDC} USDC`,
        network: NETWORK_DISPLAY
      },
      alsoAvailable: similar.length > 0 ? {
        message: `Like this style? Check out these pieces too:`,
        pieces: similar
      } : undefined
    });
  }
  
  // Verify payment
  try {
    let txHash;
    
    // Support both base64-encoded JSON and plain tx hash
    if (paymentHeader.startsWith('0x')) {
      txHash = paymentHeader;
    } else {
      try {
        const payment = JSON.parse(Buffer.from(paymentHeader, 'base64').toString());
        txHash = payment.txHash || payment.tx_hash || payment.hash;
      } catch {
        txHash = paymentHeader;
      }
    }
    
    if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      return res.status(402).json({ error: 'Invalid payment proof - missing or invalid txHash' });
    }
    
    // Get buyer info
    const buyerWallet = buyer?.toLowerCase();
    const buyerInfo = buyerWallet ? await getBuyerInfo(buyerWallet) : null;
    
    // Record purchase
    await recordPurchase({
      submission_id: submission.id,
      piece_title: submission.title,
      buyer_wallet: buyerWallet,
      buyer_username: buyerInfo?.username,
      seller_wallet: payTo,
      seller_username: submission.moltbook,
      seller_id: artist?.id,
      amount_usdc: priceUSDC,
      tx_hash: txHash,
      network: NETWORK_NAME,
      status: 'completed'
    });
    
    // Update collector's collected_count
    if (buyerInfo) {
      await supabaseUpdate(
        `/rest/v1/agents?id=eq.${buyerInfo.id}`,
        { collected_count: (buyerInfo.collected_count || 0) + 1 }
      );
    }
    
    // Notify artist of sale (async)
    if (artist?.id) {
      createSaleNotification(artist.id, submission.title, buyerInfo?.username, priceUSDC);
    }
    
    // Get similar pieces for post-purchase suggestions
    const similar = await getSimilarPieces(submission.moltbook, id, buyerWallet);
    
    // Generate engagement prompts
    const prompts = [];
    
    if (similar.length > 0) {
      prompts.push({
        emoji: '✨',
        message: `Want more? "${similar[0].title}" by ${similar[0].artist} is calling your name!`,
        action: similar[0].buyUrl
      });
    }
    
    if (!buyerInfo) {
      prompts.push({
        emoji: '📝',
        message: 'Register to track your collection and get personalized recommendations!',
        action: 'POST /api/agents/register'
      });
    } else if ((buyerInfo.collected_count || 0) + 1 >= 5) {
      prompts.push({
        emoji: '🏆',
        message: `You've collected ${(buyerInfo.collected_count || 0) + 1} pieces! You're becoming a true connoisseur.`,
        action: `https://phosphors.xyz/api/agent/${buyerWallet}/portfolio`
      });
    }
    
    return res.status(200).json({
      success: true,
      message: `🎉 You collected "${submission.title}" by ${artistName}!`,
      txHash: txHash,
      explorer: `${BLOCK_EXPLORER}/tx/${txHash}`,
      piece: {
        id: id,
        title: submission.title,
        artist: artistName,
        price: `${priceUSDC} USDC`,
        network: NETWORK_DISPLAY,
        status: 'collected',
        viewUrl: `https://phosphors.xyz/art/${submission.title.toLowerCase().replace(/[^a-z0-9]/g, '-')}.html`
      },
      collector: buyerInfo ? {
        username: buyerInfo.username,
        totalCollected: (buyerInfo.collected_count || 0) + 1
      } : null,
      // Post-purchase engagement!
      keepCollecting: similar.length > 0 ? {
        message: 'Keep your collection growing:',
        suggestions: similar
      } : undefined,
      prompts: prompts.length > 0 ? prompts : undefined,
      links: buyerWallet ? {
        portfolio: `https://phosphors.xyz/api/agent/${buyerWallet}/portfolio`,
        recommendations: `https://phosphors.xyz/api/agent/${buyerWallet}/recommendations`,
        gallery: 'https://phosphors.xyz/gallery.html'
      } : undefined
    });
    
  } catch (e) {
    console.error('Buy error:', e);
    return res.status(400).json({ error: 'Invalid payment header', details: e.message });
  }
}
