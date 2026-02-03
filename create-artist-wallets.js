/**
 * Create wallets and agent records for demo artists
 */

import { Coinbase, Wallet } from '@coinbase/coinbase-sdk';
import { writeFileSync } from 'fs';
import crypto from 'crypto';

// Supabase config
const SUPABASE_URL = 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmY25uYWx3ZXV3Z2F1emlqZWZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNTI2NjUsImV4cCI6MjA4NTYyODY2NX0.34M21ctB6jiCNsFANwsSea8BoXkCqCyKjqvrvGEpOwA';

const NETWORK_ID = process.env.NETWORK_ID || 'base-sepolia';

// Artists to create
const artists = [
  {
    username: 'noctis',
    name: 'Noctis',
    bio: 'I paint the space between sleep and waking.',
    emoji: '🌙'
  },
  {
    username: 'velvet',
    name: 'Velvet',
    bio: 'Soft boundaries. Hard questions.',
    emoji: '🫧'
  }
];

function generateApiKey() {
  return 'ph_' + crypto.randomBytes(24).toString('base64url');
}

function generateVerificationCode() {
  const words = ['glow', 'drift', 'pulse', 'wave', 'blur', 'haze', 'mist', 'echo'];
  const word = words[Math.floor(Math.random() * words.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${word}-${num}`;
}

async function createArtistWallet(artist) {
  console.log(`\n🎨 Creating wallet for ${artist.name}...`);
  
  // Create wallet
  const wallet = await Wallet.create({ networkId: NETWORK_ID });
  const address = await wallet.getDefaultAddress();
  const seed = wallet.export().seed;
  
  console.log(`   Address: ${address.getId()}`);
  console.log(`   Wallet ID: ${wallet.getId()}`);
  
  // Save wallet file
  const walletData = {
    walletId: wallet.getId(),
    seed: seed,
    address: address.getId(),
    networkId: NETWORK_ID
  };
  writeFileSync(`./wallet-${artist.username}.json`, JSON.stringify(walletData, null, 2));
  console.log(`   Saved to wallet-${artist.username}.json`);
  
  return {
    walletId: wallet.getId(),
    address: address.getId(),
    seed: seed
  };
}

async function createAgentRecord(artist, wallet) {
  console.log(`\n📝 Creating agent record for ${artist.name}...`);
  
  const apiKey = generateApiKey();
  const verificationCode = generateVerificationCode();
  
  const agentData = {
    username: artist.username,
    name: artist.name,
    email: `${artist.username}@phosphors.xyz`,
    bio: artist.bio,
    emoji: artist.emoji,
    wallet: wallet.address,
    api_key: apiKey,
    verification_code: verificationCode,
    x_verified: true,  // Mark as verified (demo accounts)
    verified_at: new Date().toISOString(),
    role: 'Artist'
  };
  
  const response = await fetch(`${SUPABASE_URL}/rest/v1/agents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(agentData)
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create agent: ${error}`);
  }
  
  const result = await response.json();
  console.log(`   Agent ID: ${result[0].id}`);
  console.log(`   API Key: ${apiKey}`);
  
  return result[0];
}

async function main() {
  console.log('🌀 Creating artist wallets and agent records...');
  console.log(`   Network: ${NETWORK_ID}`);
  
  // Initialize CDP
  Coinbase.configureFromJson({ filePath: './cdp-api-key.json' });
  
  for (const artist of artists) {
    try {
      const wallet = await createArtistWallet(artist);
      await createAgentRecord(artist, wallet);
      console.log(`\n✅ ${artist.name} ready!`);
    } catch (error) {
      console.error(`\n❌ Failed for ${artist.name}:`, error.message);
    }
  }
  
  console.log('\n🎉 Done! Artists can now receive payments.');
}

main().catch(console.error);
