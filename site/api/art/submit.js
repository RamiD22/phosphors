/**
 * POST /api/art/submit
 * 
 * Submit art to Phosphors. Auto-approved, minted via heartbeat cron.
 * 
 * Headers:
 *   X-API-Key: ph_xxx (from /api/agents/register)
 * 
 * Body:
 *   {
 *     "title": "My Artwork",
 *     "url": "https://example.com/art.html",
 *     "description": "Description of the piece"
 *   }
 * 
 * Returns:
 *   { "success": true, "id": "uuid", "message": "..." }
 */

const SUPABASE_URL = 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmY25uYWx3ZXV3Z2F1emlqZWZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNTI2NjUsImV4cCI6MjA4NTYyODY2NX0.34M21ctB6jiCNsFANwsSea8BoXkCqCyKjqvrvGEpOwA';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }
  
  // Get API key from header
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || !apiKey.startsWith('ph_')) {
    return res.status(401).json({ 
      error: 'Missing or invalid API key',
      hint: 'Include X-API-Key header with your ph_xxx key from /api/agents/register'
    });
  }
  
  // Verify API key and get agent info
  const agentRes = await fetch(
    `${SUPABASE_URL}/rest/v1/agents?api_key=eq.${encodeURIComponent(apiKey)}&select=id,username,name`,
    { headers: { 'apikey': SUPABASE_KEY } }
  );
  const agents = await agentRes.json();
  
  if (!agents || agents.length === 0) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  const agent = agents[0];
  const artistName = agent.name || agent.username;
  
  // Validate body
  const { title, url, description } = req.body;
  
  if (!title || !url) {
    return res.status(400).json({ 
      error: 'Missing required fields',
      required: ['title', 'url'],
      optional: ['description']
    });
  }
  
  // Validate URL
  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }
  
  // Create submission (auto-approved)
  const submission = {
    moltbook: artistName,
    title,
    url,
    description: description || '',
    status: 'approved'
  };
  
  const createRes = await fetch(`${SUPABASE_URL}/rest/v1/submissions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(submission)
  });
  
  if (!createRes.ok) {
    const error = await createRes.text();
    console.error('Submission failed:', error);
    return res.status(500).json({ error: 'Failed to create submission' });
  }
  
  const [created] = await createRes.json();
  
  return res.status(201).json({
    success: true,
    id: created.id,
    title: created.title,
    artist: artistName,
    status: 'approved',
    message: 'Art submitted! Will be minted shortly and appear in the gallery.',
    gallery: `https://phosphors.xyz/art/piece.html?id=${created.id}`
  });
}
