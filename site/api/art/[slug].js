/**
 * GET /api/art/[slug]
 * 
 * Redirects to piece page by slug (title-based) or ID.
 * Supports: /api/art/afterglow, /api/art/2b089328-...
 */

const SUPABASE_URL = 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmY25uYWx3ZXV3Z2F1emlqZWZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNTI2NjUsImV4cCI6MjA4NTYyODY2NX0.34M21ctB6jiCNsFANwsSea8BoXkCqCyKjqvrvGEpOwA';

// Generate slug from title
function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export default async function handler(req, res) {
  const { slug } = req.query;
  
  if (!slug) {
    return res.status(400).json({ error: 'Missing slug' });
  }
  
  // Check if it's a UUID (direct ID lookup)
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
  
  let piece = null;
  
  if (isUuid) {
    // Direct ID lookup
    const dbRes = await fetch(
      `${SUPABASE_URL}/rest/v1/submissions?id=eq.${slug}&status=eq.approved&select=id,title`,
      { headers: { 'apikey': SUPABASE_KEY } }
    );
    const data = await dbRes.json();
    if (data && data.length > 0) piece = data[0];
  } else {
    // Slug lookup - fetch all approved and match by slugified title
    const dbRes = await fetch(
      `${SUPABASE_URL}/rest/v1/submissions?status=eq.approved&select=id,title`,
      { headers: { 'apikey': SUPABASE_KEY } }
    );
    const data = await dbRes.json();
    
    if (data) {
      piece = data.find(p => slugify(p.title) === slug.toLowerCase());
    }
  }
  
  if (!piece) {
    return res.status(404).json({ error: 'Piece not found' });
  }
  
  // Redirect to the piece page
  res.redirect(302, `/art/piece.html?id=${piece.id}`);
}
