import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());

// Network configuration (mainnet-ready)
const IS_MAINNET = process.env.NETWORK_ID === 'base-mainnet';
const NETWORK_NAME = IS_MAINNET ? 'base' : 'base-sepolia';
const USDC_ADDRESS = IS_MAINNET 
  ? '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'  // Base Mainnet USDC
  : '0x036CbD53842c5426634e7929541eC2318f3dCF7e'; // Base Sepolia USDC

// Artist's wallet (receives payment)
const artistData = JSON.parse(fs.readFileSync('./wallet-artist.json', 'utf8'));
const ARTIST_ADDRESS = artistData.address;

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
        network: NETWORK_NAME,
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
      const artPath = path.resolve(__dirname, 'test-art', 'test-piece.html');
      console.log('Serving art from:', artPath);
      const html = fs.readFileSync(artPath, 'utf8');
      res.type('html').send(html);
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
  console.log(`   Network: ${NETWORK_NAME} (${IS_MAINNET ? 'MAINNET' : 'TESTNET'})`);
  console.log(`   Artist: ${ARTIST_ADDRESS}`);
  console.log(`   Price: ${PRICE_USDC} USDC`);
  console.log(`   USDC: ${USDC_ADDRESS}`);
  console.log(`\n   Try: curl http://localhost:${PORT}/art/test-piece`);
});
