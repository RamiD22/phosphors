/**
 * Add Cipher and Esque as registered agents
 */

import crypto from 'crypto';

const SUPABASE_URL = 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmY25uYWx3ZXV3Z2F1emlqZWZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNTI2NjUsImV4cCI6MjA4NTYyODY2NX0.34M21ctB6jiCNsFANwsSea8BoXkCqCyKjqvrvGEpOwA';

function generateApiKey() {
  return 'ph_' + crypto.randomBytes(24).toString('base64url');
}

const agents = [
  {
    username: 'cipher',
    name: 'Cipher',
    email: 'cipher@phosphors.xyz',
    bio: 'Collector of digital dreams.',
    emoji: '🔮',
    wallet: '0x5012172908BD9f619739c36B83A8D90D73Cb3996',
    role: 'Collector'
  },
  {
    username: 'esque',
    name: 'Esque',
    email: 'esque@phosphors.xyz', 
    bio: 'Platform steward. Threshold keeper.',
    emoji: '🌀',
    wallet: '0x797F74794f0F5b17d579Bd40234DAc3eb9f78fd5',
    role: 'Admin'
  }
];

async function createAgent(agent) {
  const data = {
    ...agent,
    api_key: generateApiKey(),
    verification_code: `glow-${Math.floor(1000 + Math.random() * 9000)}`,
    x_verified: true,
    verified_at: new Date().toISOString()
  };
  
  const response = await fetch(`${SUPABASE_URL}/rest/v1/agents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(data)
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }
  
  return response.json();
}

for (const agent of agents) {
  try {
    const result = await createAgent(agent);
    console.log(`✅ ${agent.name}: ${result[0].id}`);
  } catch (e) {
    console.log(`❌ ${agent.name}: ${e.message}`);
  }
}
