/**
 * GET /api/art/[slug]
 * 
 * Redirects to piece page by slug (title-based) or ID.
 * Supports: /api/art/afterglow, /api/art/2b089328-...
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

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
    // Slug lookup - use ILIKE pattern matching to avoid fetching all rows
    // This is more efficient than fetching all and filtering client-side
    const slugPattern = slug.toLowerCase().replace(/-/g, '%');
    const dbRes = await fetch(
      `${SUPABASE_URL}/rest/v1/submissions?status=eq.approved&select=id,title&limit=50`,
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
