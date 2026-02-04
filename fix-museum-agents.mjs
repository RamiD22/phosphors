#!/usr/bin/env node
/**
 * Fix museum agents - add wallets and verify them
 * They have approved submissions but no wallets
 */

import { Coinbase, Wallet } from '@coinbase/coinbase-sdk';
import fs from 'fs';

const SUPABASE_URL = 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmY25uYWx3ZXV3Z2F1emlqZWZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNTI2NjUsImV4cCI6MjA4NTYyODY2NX0.34M21ctB6jiCNsFANwsSea8BoXkCqCyKjqvrvGEpOwA';

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
  const cdpApiKey = JSON.parse(fs.readFileSync('cdp-api-key.json', 'utf8'));
  
  Coinbase.configure({
    apiKeyName: cdpApiKey.name,
    privateKey: cdpApiKey.privateKey
  });
  
  const wallet = await Wallet.create({ networkId: 'base-sepolia' });
  const address = await wallet.getDefaultAddress();
  const seed = wallet.export();
  
  const walletData = {
    walletId: wallet.getId(),
    address: address.getId(),
    seed: seed.seed
  };
  
  const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
  fs.writeFileSync(`wallet-${safeName}.json`, JSON.stringify(walletData, null, 2));
  console.log(`  💾 Wallet saved to wallet-${safeName}.json`);
  
  return walletData;
}

const museumAgents = [
  'TateModern',
  'Uffizi_Bot', 
  'Hermitage_AI',
  'Louvre_AI',
  'MoMA_Agent'
];

async function main() {
  console.log('🎨 Fixing museum agents...\n');
  
  for (const username of museumAgents) {
    console.log(`\n📝 Processing: ${username}`);
    
    // Get agent
    const checkRes = await supabaseRequest(`agents?username=eq.${username}&select=id,username,wallet,x_verified`);
    const agents = await checkRes.json();
    
    if (agents.length === 0) {
      console.log(`  ⚠️ Agent ${username} not found in database`);
      continue;
    }
    
    const agent = agents[0];
    
    if (agent.wallet) {
      console.log(`  ✅ Already has wallet: ${agent.wallet}`);
    } else {
      console.log(`  Creating wallet...`);
      const wallet = await createWallet(username);
      console.log(`  ✅ Wallet: ${wallet.address}`);
      
      // Update agent with wallet
      const updateRes = await supabaseRequest(`agents?id=eq.${agent.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ 
          wallet: wallet.address,
          x_verified: true // Auto-verify since they have approved art
        })
      });
      
      if (updateRes.ok) {
        console.log(`  ✅ Agent updated with wallet and verified`);
      } else {
        console.log(`  ❌ Failed to update agent`);
      }
    }
    
    if (!agent.x_verified) {
      // Verify the agent
      const verifyRes = await supabaseRequest(`agents?id=eq.${agent.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ x_verified: true })
      });
      
      if (verifyRes.ok) {
        console.log(`  ✅ Agent verified`);
      }
    }
  }
  
  console.log('\n✅ Done!');
}

main().catch(console.error);
