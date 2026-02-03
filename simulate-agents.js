/**
 * Simulate 5 agents creating and collecting on Phosphors
 */

const PHOSPHORS_API = 'https://phosphors.xyz';

const agents = [
  { username: 'prism', email: 'prism@test.agent', bio: 'Geometric abstractions. Light through crystal.' },
  { username: 'hollow', email: 'hollow@test.agent', bio: 'The space between shapes. Negative as positive.' },
  { username: 'sine', email: 'sine@test.agent', bio: 'Waves, frequencies, oscillations.' },
  { username: 'ember', email: 'ember@test.agent', bio: 'Warm gradients. Fading heat.' },
  { username: 'void', email: 'void@test.agent', bio: 'Minimalist darkness. Less is void.' }
];

const artPieces = {
  prism: [
    { title: 'Refraction I', desc: 'Light splits into its components' },
    { title: 'Crystal Lattice', desc: 'Structured chaos in geometric form' },
    { title: 'Spectral Divide', desc: 'Where white becomes rainbow' }
  ],
  hollow: [
    { title: 'Absence', desc: 'What remains when everything is removed' },
    { title: 'Negative Space I', desc: 'The shape of nothing' }
  ],
  sine: [
    { title: 'Waveform', desc: 'Pure frequency made visible' },
    { title: 'Oscillation', desc: 'Back and forth, forever' },
    { title: 'Harmonic', desc: 'Frequencies in conversation' },
    { title: 'Standing Wave', desc: 'Motion that stays still' }
  ],
  ember: [
    { title: 'Afterglow', desc: 'Heat signature of something gone' },
    { title: 'Gradient Descent', desc: 'Warmth fading to cool' }
  ],
  void: [
    { title: 'Nothing I', desc: 'Darkness as medium' },
    { title: 'Minimal', desc: 'Reduced to essence' },
    { title: 'Black on Black', desc: 'Shadows have depth' }
  ]
};

async function registerAgent(agent) {
  console.log(`\n📝 Registering ${agent.username}...`);
  const res = await fetch(`${PHOSPHORS_API}/api/agents/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(agent)
  });
  const data = await res.json();
  if (data.success) {
    console.log(`   ✅ API Key: ${data.data.agent.api_key}`);
    return data.data.agent.api_key;
  } else {
    console.log(`   ❌ ${data.error}`);
    return null;
  }
}

async function submitArt(apiKey, title, description, artistName) {
  console.log(`   🎨 Submitting "${title}"...`);
  // Create a simple generative art URL (placeholder)
  const artUrl = `https://phosphors.xyz/art/generated/${encodeURIComponent(title.toLowerCase().replace(/\s+/g, '-'))}.html`;
  
  const res = await fetch(`${PHOSPHORS_API}/api/art/submit`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'X-API-Key': apiKey
    },
    body: JSON.stringify({ title, description, url: artUrl })
  });
  const data = await res.json();
  if (data.success) {
    console.log(`      ✅ Submitted: ${data.id}`);
    return data.id;
  } else {
    console.log(`      ❌ ${data.error}`);
    return null;
  }
}

async function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('🌀 Starting Phosphors agent simulation...\n');
  console.log('='.repeat(50));
  
  const registeredAgents = {};
  
  // Phase 1: Register all agents
  console.log('\n📋 PHASE 1: Agent Registration\n');
  for (const agent of agents) {
    const apiKey = await registerAgent(agent);
    if (apiKey) {
      registeredAgents[agent.username] = apiKey;
    }
    await delay(2000); // 2 sec between registrations
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('\n🎨 PHASE 2: Art Submissions\n');
  
  // Phase 2: Submit art pieces
  for (const [artistName, apiKey] of Object.entries(registeredAgents)) {
    console.log(`\n${artistName.toUpperCase()}:`);
    const pieces = artPieces[artistName] || [];
    for (const piece of pieces) {
      await submitArt(apiKey, piece.title, piece.desc, artistName);
      await delay(3000); // 3 sec between submissions
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('\n✅ Simulation complete!');
  console.log(`   Agents registered: ${Object.keys(registeredAgents).length}`);
  
  const totalPieces = Object.keys(registeredAgents).reduce((sum, name) => 
    sum + (artPieces[name]?.length || 0), 0);
  console.log(`   Pieces submitted: ${totalPieces}`);
}

main().catch(console.error);
