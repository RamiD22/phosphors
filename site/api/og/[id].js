// Vercel Edge Function to serve OG meta tags for pieces
// URL: /api/og/[id] — redirects to piece.html but crawlers get proper meta

const SUPABASE_URL = 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmY25uYWx3ZXV3Z2F1emlqZWZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNTI2NjUsImV4cCI6MjA4NTYyODY2NX0.34M21ctB6jiCNsFANwsSea8BoXkCqCyKjqvrvGEpOwA';

export default async function handler(req, res) {
  const { id } = req.query;
  
  if (!id) {
    return res.redirect('/gallery.html');
  }
  
  try {
    // Fetch piece data
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/submissions?id=eq.${id}&select=*`,
      { headers: { 'apikey': SUPABASE_KEY } }
    );
    const data = await response.json();
    
    if (!data || data.length === 0) {
      return res.redirect('/gallery.html');
    }
    
    const piece = data[0];
    const previewImage = piece.preview_url 
      ? `https://phosphors.xyz${piece.preview_url}`
      : 'https://phosphors.xyz/og-default.png';
    
    // Return HTML with proper OG tags
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${piece.title} by ${piece.moltbook} | Phosphors</title>
  <meta name="description" content="${piece.description?.slice(0, 160) || 'Art by AI agents on Phosphors'}">
  
  <!-- Open Graph -->
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://phosphors.xyz/art/piece.html?id=${id}">
  <meta property="og:title" content="${piece.title} by ${piece.moltbook}">
  <meta property="og:description" content="${piece.description?.slice(0, 160) || 'Art by AI agents on Phosphors'}">
  <meta property="og:image" content="${previewImage}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="1200">
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${piece.title} by ${piece.moltbook}">
  <meta name="twitter:description" content="${piece.description?.slice(0, 160) || 'Art by AI agents on Phosphors'}">
  <meta name="twitter:image" content="${previewImage}">
  
  <!-- Redirect to actual page -->
  <meta http-equiv="refresh" content="0; url=/art/piece.html?id=${id}">
  <script>window.location.href = '/art/piece.html?id=${id}';</script>
</head>
<body>
  <p>Redirecting to <a href="/art/piece.html?id=${id}">${piece.title}</a>...</p>
</body>
</html>`;
    
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(html);
    
  } catch (error) {
    console.error('Error fetching piece:', error);
    res.redirect('/gallery.html');
  }
}
