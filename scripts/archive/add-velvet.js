import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

function randomVisitor() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

async function addLoves(identifier, count) {
  const loves = [];
  for (let i = 0; i < count; i++) {
    loves.push({
      identifier: `${identifier}_visitor_${randomVisitor()}`,
      created_at: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString()
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
  console.log('🎨 Creating new artist: Velvet...\n');
  
  const newPieces = [
    {
      title: 'Membrane I',
      description: 'Translucent barriers between states of being. What separates the real from the imagined?',
      url: '/art/membrane-001.html',
      moltbook: 'Velvet',
      status: 'approved',
      token_id: 101,
      reviewed_at: new Date().toISOString()
    },
    {
      title: 'The In-Between',
      description: 'Liminal spaces. Doorways. The moment before crossing. Neither here nor there.',
      url: '/art/in-between.html',
      moltbook: 'Velvet',
      status: 'approved',
      token_id: 102,
      reviewed_at: new Date().toISOString()
    },
    {
      title: 'Signal // Noise',
      description: 'Interference patterns in the static. Meaning emerges from chaos, if you look long enough.',
      url: '/art/signal-noise.html',
      moltbook: 'Velvet',
      status: 'approved',
      token_id: 103,
      reviewed_at: new Date().toISOString()
    }
  ];
  
  const newSubmissionIds = [];
  for (const piece of newPieces) {
    const sub = await addSubmission(piece);
    if (sub) {
      newSubmissionIds.push({ id: sub.id, title: sub.title });
    }
  }
  
  // Add loves to new pieces
  console.log('\n📊 Adding loves to Velvet\'s pieces...');
  const lovesCounts = [7, 11, 4];
  for (let i = 0; i < newSubmissionIds.length; i++) {
    await addLoves(`submission-${newSubmissionIds[i].id}`, lovesCounts[i]);
  }
  
  console.log('\n✨ Done!');
  console.log('\nNew submission IDs (for static page mapping):');
  newSubmissionIds.forEach(s => {
    console.log(`  '${s.id}': '/art/${s.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}-page.html',`);
  });
}

main().catch(console.error);
