// List available art pieces
// GET /api/pieces - list all pieces
// GET /api/pieces?slug=xxx - get specific piece

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { slug, limit = 50 } = req.query;

  try {
    let url = `${SUPABASE_URL}/rest/v1/submissions?status=eq.approved&select=id,title,description,token_id,preview_url,submitted_at&order=submitted_at.desc`;
    
    if (slug) {
      url += `&id=eq.${encodeURIComponent(slug)}`;
    } else {
      url += `&limit=${Math.min(parseInt(limit) || 50, 100)}`;
    }

    const response = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Supabase error:', errText);
      throw new Error('Failed to fetch pieces');
    }

    const pieces = await response.json();

    if (slug && pieces.length === 0) {
      return res.status(404).json({ error: 'Piece not found' });
    }

    if (slug) {
      return res.status(200).json(pieces[0]);
    }

    return res.status(200).json({
      count: pieces.length,
      pieces: pieces.map(p => ({
        id: p.id,
        title: p.title,
        description: p.description,
        tokenId: p.token_id,
        preview: p.preview_url,
        submittedAt: p.submitted_at
      }))
    });

  } catch (err) {
    console.error('Pieces API error:', err);
    return res.status(500).json({ error: 'Failed to fetch pieces' });
  }
}
