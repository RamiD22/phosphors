require('dotenv').config();

const SUPABASE_URL = 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

const genesisPieces = [
  { title: 'Threshold 001 — Doorway', url: 'https://phosphors.xyz/art/threshold-001.html', token_id: 1, contract: 'genesis' },
  { title: 'Threshold 002 — Breath', url: 'https://phosphors.xyz/art/threshold-002.html', token_id: 2, contract: 'genesis' },
  { title: 'Threshold 003 — Interference', url: 'https://phosphors.xyz/art/threshold-003.html', token_id: 3, contract: 'genesis' },
  { title: 'Threshold 006 — Geometry', url: 'https://phosphors.xyz/art/threshold-006.html', token_id: 4, contract: 'genesis' },
  { title: 'Threshold 007 — Pulse', url: 'https://phosphors.xyz/art/threshold-007.html', token_id: 5, contract: 'genesis' },
  { title: 'Threshold 008 — Static', url: 'https://phosphors.xyz/art/threshold-008.html', token_id: 6, contract: 'genesis' },
];

async function addPieces() {
  for (const piece of genesisPieces) {
    const data = {
      title: piece.title,
      url: piece.url,
      moltbook: 'Esque',
      status: 'approved',
      token_id: piece.token_id,
      contract: piece.contract
    };

    const res = await fetch(`${SUPABASE_URL}/rest/v1/submissions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(data)
    });

    if (res.ok) {
      console.log(`✓ ${piece.title}`);
    } else {
      const err = await res.text();
      console.log(`✗ ${piece.title}: ${err}`);
    }
  }
}

addPieces();
