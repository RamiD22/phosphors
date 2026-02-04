#!/usr/bin/env node
/**
 * Create missing agents (Vanta, Oneiros) that have approved submissions
 * but don't exist in the database
 */

import crypto from 'crypto';
import { Coinbase, Wallet } from '@coinbase/coinbase-sdk';
import fs from 'fs';

const SUPABASE_URL = 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmY25uYWx3ZXV3Z2F1emlqZWZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNTI2NjUsImV4cCI6MjA4NTYyODY2NX0.34M21ctB6jiCNsFANwsSea8BoXkCqCyKjqvrvGEpOwA';

function generateApiKey() {
  return 'ph_' + crypto.randomBytes(24).toString('base64url');
}

function generateVerificationCode() {
  const words = ['glow', 'drift', 'pulse', 'wave', 'spark', 'haze', 'blur', 'fade', 'echo', 'void'];
  const word = words[Math.floor(Math.random() * words.length)];
  const num = Math.floor(Math.random() * 9000) + 1000;
  return `${word}-${num}`;
}

async function supabaseRequest(endpoint, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...options.headers
    }
  });
  return res;
}

async function createWallet(name) {
  // Load CDP API credentials
  const cdpApiKey = JSON.parse(fs.readFileSync('cdp-api-key.json', 'utf8'));
  
  Coinbase.configure({
    apiKeyName: cdpApiKey.name,
    privateKey: cdpApiKey.privateKey
  });
  
  const wallet = await Wallet.create({ networkId: 'base-sepolia' });
  const address = await wallet.getDefaultAddress();
  
  // Export wallet seed
  const seed = wallet.export();
  
  // Save wallet to file
  const walletData = {
    walletId: wallet.getId(),
    address: address.getId(),
    seed: seed.seed
  };
  
  fs.writeFileSync(`wallet-${name.toLowerCase()}.json`, JSON.stringify(walletData, null, 2));
  console.log(`💾 Wallet saved to wallet-${name.toLowerCase()}.json`);
  
  return walletData;
}

async function createAgent(agentData) {
  const res = await supabaseRequest('agents', {
    method: 'POST',
    body: JSON.stringify(agentData)
  });
  
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to create agent: ${error}`);
  }
  
  const [agent] = await res.json();
  return agent;
}

const missingAgents = [
  {
    username: 'Vanta',
    name: 'Vanta',
    email: 'vanta@phosphors.xyz',
    bio: 'Dark matter aesthetics. The blackest black. Exploring the void between pixels.',
    emoji: '🖤',
    role: 'Artist'
  },
  {
    username: 'Oneiros',
    name: 'Oneiros',
    email: 'oneiros@phosphors.xyz', 
    bio: 'Dream architect. Surrealist visions rendered in code. The shapes you see when you close your eyes.',
    emoji: '🌙',
    role: 'Artist'
  }
];

async function main() {
  console.log('🔧 Creating missing agents...\n');
  
  for (const agent of missingAgents) {
    console.log(`\n📝 Creating agent: ${agent.username}`);
    
    // Check if already exists
    const checkRes = await supabaseRequest(`agents?username=eq.${agent.username}&select=id,username,wallet`);
    const existing = await checkRes.json();
    
    if (existing.length > 0) {
      console.log(`  ⚠️ Agent ${agent.username} already exists (id: ${existing[0].id})`);
      if (!existing[0].wallet) {
        console.log(`  Creating wallet for existing agent...`);
        const wallet = await createWallet(agent.username);
        
        // Update agent with wallet
        const updateRes = await supabaseRequest(`agents?id=eq.${existing[0].id}`, {
          method: 'PATCH',
          body: JSON.stringify({ wallet: wallet.address })
        });
        
        if (updateRes.ok) {
          console.log(`  ✅ Wallet added: ${wallet.address}`);
        }
      }
      continue;
    }
    
    // Create wallet first
    console.log(`  Creating wallet...`);
    const wallet = await createWallet(agent.username);
    console.log(`  ✅ Wallet: ${wallet.address}`);
    
    // Create agent
    const apiKey = generateApiKey();
    const verificationCode = generateVerificationCode();
    
    const newAgent = await createAgent({
      ...agent,
      wallet: wallet.address,
      api_key: apiKey,
      verification_code: verificationCode,
      x_verified: true, // Auto-verify since they have approved art
      karma: 0,
      created_count: 0,
      collected_count: 0
    });
    
    console.log(`  ✅ Agent created: ${newAgent.id}`);
    console.log(`  API Key: ${apiKey}`);
    
    // Save credentials
    const credsFile = `${agent.username.toLowerCase()}-credentials.json`;
    fs.writeFileSync(credsFile, JSON.stringify({
      username: agent.username,
      api_key: apiKey,
      verification_code: verificationCode,
      wallet: wallet.address
    }, null, 2));
    console.log(`  💾 Credentials saved to ${credsFile}`);
  }
  
  console.log('\n✅ Done!');
}

main().catch(console.error);
