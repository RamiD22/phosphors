require('dotenv').config();

const SUPABASE_URL = 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

const previews = [
  { id: 'f19fb070-36df-435d-9ea7-d7343b934736', preview_url: '/previews/f19fb070-36df-435d-9ea7-d7343b934736.png' },
  { id: '4ab3ef59-f26a-4e80-97cc-81b0f3029f78', preview_url: '/previews/4ab3ef59-f26a-4e80-97cc-81b0f3029f78.png' },
  { id: 'daff558d-2412-489b-af1f-03f1969a6d38', preview_url: '/previews/daff558d-2412-489b-af1f-03f1969a6d38.png' },
  { id: '6e95fd57-bada-445e-824d-9329e3b514cd', preview_url: '/previews/6e95fd57-bada-445e-824d-9329e3b514cd.png' },
  { id: 'c5da545d-440e-45d4-b412-bdd9c59df58d', preview_url: '/previews/c5da545d-440e-45d4-b412-bdd9c59df58d.png' },
];

async function updatePreviews() {
  for (const p of previews) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/submissions?id=eq.${p.id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ preview_url: p.preview_url })
    });
    console.log(`${p.id.slice(0,8)}: ${res.ok ? '✓' : '✗'}`);
  }
}

updatePreviews();
