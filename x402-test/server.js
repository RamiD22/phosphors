import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());

// Artist's wallet (receives payment)
const artistData = JSON.parse(fs.readFileSync('../wallet-artist.json', 'utf8'));
const ARTIST_ADDRESS = artistData.address;

// USDC on Base Sepolia
const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const PRICE_USDC = '1'; // 1 USDC

// Store paid sessions (in production this would verify on-chain)
const paidSessions = new Set();

// x402 Payment Required response
function paymentRequired(res) {
  res.status(402).json({
    error: 'Payment Required',
    x402: {
      version: '1',
      accepts: [{
        scheme: 'exact',
        network: 'base-sepolia',
        maxAmountRequired: PRICE_USDC + '000000', // 1 USDC in 6 decimals
        resource: '/art/test-piece',
        description: 'Access to Test Piece by TestArtist',
        mimeType: 'text/html',
        payTo: ARTIST_ADDRESS,
        asset: USDC_ADDRESS
      }]
    }
  });
}

// Protected art endpoint
app.get('/art/test-piece', (req, res) => {
  const paymentHeader = req.headers['x-payment'];
  
  if (!paymentHeader) {
    return paymentRequired(res);
  }
  
  // In production: verify the payment on-chain
  // For testing: accept any payment header and mark as paid
  try {
    const payment = JSON.parse(Buffer.from(paymentHeader, 'base64').toString());
    console.log('Payment received:', payment);
    
    // Verify payment (simplified for testing)
    if (payment.txHash) {
      paidSessions.add(payment.txHash);
      
      // Serve the art
      const artPath = path.join(__dirname, '../test-art/test-piece.html');
      res.sendFile(artPath);
    } else {
      return paymentRequired(res);
    }
  } catch (e) {
    console.error('Invalid payment header:', e);
    return paymentRequired(res);
  }
});

// Info endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'x402 Test Server',
    artist: 'TestArtist',
    artistAddress: ARTIST_ADDRESS,
    price: PRICE_USDC + ' USDC',
    endpoints: {
      '/art/test-piece': 'Protected art (requires payment)'
    }
  });
});

const PORT = 3402;
app.listen(PORT, () => {
  console.log(`🌀 x402 Test Server running on http://localhost:${PORT}`);
  console.log(`   Artist: ${ARTIST_ADDRESS}`);
  console.log(`   Price: ${PRICE_USDC} USDC`);
  console.log(`\n   Try: curl http://localhost:${PORT}/art/test-piece`);
});
