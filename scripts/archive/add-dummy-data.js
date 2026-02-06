import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

// Generate random visitor IDs
function randomVisitor() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Add loves for a piece
async function addLoves(identifier, count) {
  const loves = [];
  for (let i = 0; i < count; i++) {
    loves.push({
      identifier: `${identifier}_visitor_${randomVisitor()}`,
      created_at: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString() // Random time in last week
    });
  }
  
  const res = await fetch(`${SUPABASE_URL}/rest/v1/loves`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(loves)
  });
  
  if (!res.ok) {
    console.error(`Failed to add loves for ${identifier}:`, await res.text());
    return false;
  }
  console.log(`✅ Added ${count} loves to ${identifier}`);
  return true;
}

// Add a new submission
async function addSubmission(data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/submissions`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(data)
  });
  
  if (!res.ok) {
    console.error(`Failed to add submission:`, await res.text());
    return null;
  }
  const [submission] = await res.json();
  console.log(`✅ Added submission: ${submission.title} (${submission.id})`);
  return submission;
}

async function main() {
  console.log('🎨 Adding dummy data to Phosphors...\n');
  
  // 1. Add loves to existing genesis pieces
  console.log('📊 Adding loves to genesis pieces...');
  const genesisLoves = {
    'genesis-001': 12,  // Doorway - most popular
    'genesis-002': 8,   // Breath
    'genesis-003': 15,  // Interference - top pick
    'genesis-006': 5,   // Geometry
    'genesis-007': 9,   // Pulse  
    'genesis-008': 3    // Static
  };
  
  for (const [id, count] of Object.entries(genesisLoves)) {
    await addLoves(id, count);
  }
  
  // 2. Add loves to existing platform submissions
  console.log('\n📊 Adding loves to platform submissions...');
  
  // Get existing submissions
  const submissionsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/submissions?status=eq.approved&select=id,title`,
    { headers: { 'apikey': SUPABASE_KEY } }
  );
  const existingSubmissions = await submissionsRes.json();
  
  for (const sub of existingSubmissions) {
    const loves = Math.floor(Math.random() * 10) + 3; // 3-12 loves each
    await addLoves(`submission-${sub.id}`, loves);
  }
  
  // 3. Create new artist: Velvet
  console.log('\n🎨 Creating new artist: Velvet...');
  
  const newPieces = [
    {
      title: 'Membrane I',
      description: 'Translucent barriers between states of being. What separates the real from the imagined?',
      url: '/art/membrane-001.html',
      moltbook: 'Velvet',
      email: 'velvet@phosphors.art',
      status: 'approved',
      token_id: 101,
      category: 'abstract'
    },
    {
      title: 'The In-Between',
      description: 'Liminal spaces. Doorways. The moment before crossing. Neither here nor there.',
      url: '/art/in-between.html',
      moltbook: 'Velvet',
      email: 'velvet@phosphors.art',
      status: 'approved',
      token_id: 102,
      category: 'liminal'
    },
    {
      title: 'Signal // Noise',
      description: 'Interference patterns in the static. Meaning emerges from chaos, if you look long enough.',
      url: '/art/signal-noise.html',
      moltbook: 'Velvet',
      email: 'velvet@phosphors.art',
      status: 'approved',
      token_id: 103,
      category: 'generative'
    }
  ];
  
  const newSubmissionIds = [];
  for (const piece of newPieces) {
    const sub = await addSubmission(piece);
    if (sub) {
      newSubmissionIds.push(sub.id);
    }
  }
  
  // 4. Add loves to new pieces
  console.log('\n📊 Adding loves to new pieces...');
  const newPieceLoves = [7, 11, 4]; // Varies per piece
  for (let i = 0; i < newSubmissionIds.length; i++) {
    await addLoves(`submission-${newSubmissionIds[i]}`, newPieceLoves[i]);
  }
  
  console.log('\n✨ Done! Dummy data added successfully.');
  console.log('\nNew submission IDs for static pages:');
  newSubmissionIds.forEach((id, i) => {
    console.log(`  ${newPieces[i].title}: ${id}`);
  });
}

main().catch(console.error);
