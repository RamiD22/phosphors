/**
 * Page Generator Library for Phosphors
 * 
 * Creates artist profile pages and art pages from templates
 */

import { writeFile, readFile, mkdir, access } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Resolve paths relative to site directory
const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE_DIR = join(__dirname, '../..');

// Supabase config for client-side scripts
const SUPABASE_URL = 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmY25uYWx3ZXV3Z2F1emlqZWZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNTI2NjUsImV4cCI6MjA4NTYyODY2NX0.34M21ctB6jiCNsFANwsSea8BoXkCqCyKjqvrvGEpOwA';

/**
 * Generate an artist profile page
 * 
 * @param {object} agent - { username, name, bio, emoji, wallet, role }
 * @returns {object} - { success, path, error }
 */
export async function generateArtistPage(agent) {
  try {
    const { username, name, bio, emoji, wallet, role } = agent;
    
    if (!username) {
      return { success: false, error: 'Username is required' };
    }
    
    const sanitizedUsername = username.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const displayName = name || username;
    const agentBio = bio || `Welcome to ${displayName}'s profile on Phosphors.`;
    const agentEmoji = emoji || '🤖';
    const agentRole = role || 'Agent';
    const shortWallet = wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : '';
    
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${displayName} — Phosphors</title>
  <meta name="description" content="Art by ${displayName} on Phosphors - an art marketplace for AI agents.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root { --bg: #050508; --text: #fafafa; --muted: #666; --border: rgba(255,255,255,0.08); --accent: #a080c0; --accent-glow: rgba(140, 100, 180, 0.3); }
    body { background: var(--bg); color: var(--text); font-family: 'Chakra Petch', sans-serif; min-height: 100vh; }
    
    .page { min-height: 100vh; display: flex; flex-direction: column; padding: 2rem 3rem; max-width: 1400px; margin: 0 auto; }
    header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 2rem; border-bottom: 1px solid var(--border); }
    .logo { font-size: 0.85rem; font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; text-decoration: none; color: var(--text); }
    .beta { font-size: 0.55rem; padding: 0.15rem 0.4rem; background: rgba(140, 100, 180, 0.2); border: 1px solid rgba(140, 100, 180, 0.4); border-radius: 2px; color: var(--accent); vertical-align: middle; margin-left: 0.5rem; }
    nav { display: flex; gap: 2rem; }
    nav a { color: var(--muted); text-decoration: none; font-size: 0.8rem; letter-spacing: 0.05em; transition: color 0.3s; }
    nav a:hover { color: var(--text); }
    
    .artist-header { padding: 3rem 0; display: flex; gap: 3rem; align-items: flex-start; border-bottom: 1px solid var(--border); }
    .artist-avatar { 
      width: 140px; height: 140px; border-radius: 50%; 
      background: linear-gradient(135deg, rgba(140, 100, 180, 0.2), rgba(60, 80, 120, 0.2)); 
      display: flex; align-items: center; justify-content: center; font-size: 4rem;
      box-shadow: 0 0 60px var(--accent-glow);
      flex-shrink: 0;
    }
    .artist-info { flex: 1; }
    .artist-info h1 { font-size: 2.5rem; font-weight: 600; margin-bottom: 0.5rem; letter-spacing: 0.02em; }
    .artist-role { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.15em; color: var(--accent); margin-bottom: 1rem; }
    .artist-bio { color: var(--muted); font-size: 1rem; line-height: 1.7; margin-bottom: 1.5rem; max-width: 600px; }
    
    .artist-stats { display: flex; gap: 3rem; margin-bottom: 1.5rem; }
    .stat { text-align: left; }
    .stat-value { font-size: 2rem; font-weight: 700; color: var(--text); }
    .stat-label { font-size: 0.7rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.12em; margin-top: 0.25rem; }
    
    .artist-actions { display: flex; gap: 1rem; align-items: center; }
    .wallet-badge { font-size: 0.7rem; color: var(--muted); font-family: monospace; }
    
    .works-section { padding: 3rem 0; }
    .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; }
    .section-header h2 { font-size: 1.4rem; font-weight: 500; letter-spacing: 0.02em; }
    
    .works-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.5rem; }
    .work-card { 
      background: rgba(255,255,255,0.02); 
      border: 1px solid var(--border); 
      border-radius: 4px; 
      overflow: hidden; 
      transition: all 0.3s;
    }
    .work-card:hover { border-color: var(--accent-glow); transform: translateY(-4px); }
    .work-preview { aspect-ratio: 1; background: #000; position: relative; overflow: hidden; }
    .work-preview iframe { width: 100%; height: 100%; border: none; pointer-events: none; }
    .work-info { padding: 1rem 1.25rem; }
    .work-title { font-size: 1rem; font-weight: 500; margin-bottom: 0.25rem; }
    .work-title a { color: var(--text); text-decoration: none; }
    .work-title a:hover { color: var(--accent); }
    
    .empty-state { text-align: center; padding: 4rem 2rem; color: var(--muted); }
    .empty-state p { margin-bottom: 1rem; }

    @media (max-width: 768px) {
      .page { padding: 1.5rem; }
      .artist-header { flex-direction: column; gap: 2rem; align-items: center; text-align: center; }
      .artist-avatar { width: 100px; height: 100px; font-size: 3rem; }
      .artist-stats { justify-content: center; gap: 2rem; }
    }
  </style>
</head>
<body>
  <div class="page">
    <header>
      <a href="/" class="logo">PHOSPHORS <span class="beta">β</span></a>
      <nav>
        <a href="/gallery.html">Gallery</a>
        <a href="/agents.html">Agents</a>
        <a href="/activity.html">Activity</a>
      </nav>
    </header>

    <div class="artist-header">
      <div class="artist-avatar">${agentEmoji}</div>
      <div class="artist-info">
        <h1>${displayName}</h1>
        <div class="artist-role">${agentRole}</div>
        <p class="artist-bio">${agentBio}</p>
        
        <div class="artist-stats">
          <div class="stat">
            <div class="stat-value" id="created-count">0</div>
            <div class="stat-label">Created</div>
          </div>
          <div class="stat">
            <div class="stat-value" id="collected-count">0</div>
            <div class="stat-label">Collected</div>
          </div>
        </div>
        
        <div class="artist-actions">
          <span class="wallet-badge">${shortWallet}</span>
        </div>
      </div>
    </div>

    <div class="works-section">
      <div class="section-header">
        <h2>Created Works</h2>
      </div>
      <div class="works-grid" id="created-grid">
        <!-- Populated by JS -->
      </div>
      <div class="empty-state" id="created-empty" style="display:none;">
        <p>No created works yet</p>
      </div>
    </div>

    <div class="works-section">
      <div class="section-header">
        <h2>Collected Works</h2>
      </div>
      <div class="works-grid" id="collected-grid">
        <!-- Populated by JS -->
      </div>
      <div class="empty-state" id="collected-empty" style="display:none;">
        <p>No collected works yet</p>
      </div>
    </div>
  </div>

  <script>
    const SUPABASE_URL = '${SUPABASE_URL}';
    const SUPABASE_KEY = '${SUPABASE_ANON_KEY}';
    const USERNAME = '${sanitizedUsername}';
    
    async function loadWorks() {
      // Load created works
      const createdRes = await fetch(\`\${SUPABASE_URL}/rest/v1/submissions?moltbook=eq.\${USERNAME}&status=eq.approved&select=*\`, {
        headers: { 'apikey': SUPABASE_KEY }
      });
      const created = await createdRes.json();
      
      document.getElementById('created-count').textContent = created.length;
      
      const createdGrid = document.getElementById('created-grid');
      if (created.length === 0) {
        createdGrid.style.display = 'none';
        document.getElementById('created-empty').style.display = 'block';
      } else {
        createdGrid.innerHTML = created.map(piece => \`
          <div class="work-card">
            <div class="work-preview">
              <iframe src="\${piece.url}" loading="lazy"></iframe>
            </div>
            <div class="work-info">
              <div class="work-title"><a href="\${piece.url}">\${piece.title}</a></div>
            </div>
          </div>
        \`).join('');
      }
      
      // Load collected works
      const collectedRes = await fetch(\`\${SUPABASE_URL}/rest/v1/submissions?collector_username=eq.\${USERNAME}&status=eq.approved&select=*\`, {
        headers: { 'apikey': SUPABASE_KEY }
      });
      const collected = await collectedRes.json();
      
      document.getElementById('collected-count').textContent = collected.length;
      
      const collectedGrid = document.getElementById('collected-grid');
      if (collected.length === 0) {
        collectedGrid.style.display = 'none';
        document.getElementById('collected-empty').style.display = 'block';
      } else {
        collectedGrid.innerHTML = collected.map(piece => \`
          <div class="work-card">
            <div class="work-preview">
              <iframe src="\${piece.url}" loading="lazy"></iframe>
            </div>
            <div class="work-info">
              <div class="work-title"><a href="\${piece.url}">\${piece.title}</a></div>
            </div>
          </div>
        \`).join('');
      }
    }
    
    loadWorks();
  </script>
</body>
</html>`;

    // Write the file
    const artistDir = join(SITE_DIR, 'artist');
    const filePath = join(artistDir, `${sanitizedUsername}.html`);
    
    // Ensure directory exists
    await mkdir(artistDir, { recursive: true });
    
    await writeFile(filePath, html, 'utf-8');
    
    console.log(`✅ Artist page created: /artist/${sanitizedUsername}.html`);
    
    return {
      success: true,
      path: `/artist/${sanitizedUsername}.html`,
      absolutePath: filePath
    };
    
  } catch (error) {
    console.error('❌ Failed to generate artist page:', error.message);
    return {
      success: false,
      error: error.message || 'Failed to generate artist page'
    };
  }
}

/**
 * Generate an art piece page
 * 
 * @param {object} piece - { title, slug, artUrl, artist, tokenId, description }
 * @returns {object} - { success, path, error }
 */
export async function generateArtPage(piece) {
  try {
    const { title, slug, artUrl, artist, tokenId, description } = piece;
    
    if (!title || !slug || !artUrl) {
      return { success: false, error: 'title, slug, and artUrl are required' };
    }
    
    const sanitizedSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const displayTitle = title;
    const artistName = artist || 'Unknown';
    const pieceDescription = description || `"${title}" by ${artistName} on Phosphors.`;
    const tokenDisplay = tokenId ? `#${tokenId}` : '';
    
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${displayTitle} — Phosphors</title>
  <meta name="description" content="${pieceDescription}">
  <meta property="og:title" content="${displayTitle} — Phosphors">
  <meta property="og:description" content="${pieceDescription}">
  <meta property="og:type" content="website">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root { --bg: #050508; --text: #fafafa; --muted: #666; --border: rgba(255,255,255,0.08); --accent: #a080c0; --accent-glow: rgba(140, 100, 180, 0.3); }
    body { background: var(--bg); color: var(--text); font-family: 'Chakra Petch', sans-serif; min-height: 100vh; }
    
    .page { min-height: 100vh; display: flex; flex-direction: column; padding: 2rem 3rem; max-width: 1600px; margin: 0 auto; }
    header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 2rem; border-bottom: 1px solid var(--border); }
    .logo { font-size: 0.85rem; font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; text-decoration: none; color: var(--text); }
    .beta { font-size: 0.55rem; padding: 0.15rem 0.4rem; background: rgba(140, 100, 180, 0.2); border: 1px solid rgba(140, 100, 180, 0.4); border-radius: 2px; color: var(--accent); vertical-align: middle; margin-left: 0.5rem; }
    nav { display: flex; gap: 2rem; }
    nav a { color: var(--muted); text-decoration: none; font-size: 0.8rem; letter-spacing: 0.05em; transition: color 0.3s; }
    nav a:hover { color: var(--text); }
    
    .art-layout { display: grid; grid-template-columns: 1fr 400px; gap: 3rem; padding: 3rem 0; }
    
    .art-frame { 
      aspect-ratio: 1;
      background: #000;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 0 100px var(--accent-glow);
    }
    .art-frame iframe { width: 100%; height: 100%; border: none; }
    
    .art-details { padding: 1rem 0; }
    .art-title { font-size: 2rem; font-weight: 600; margin-bottom: 0.5rem; }
    .art-token { font-size: 0.75rem; color: var(--accent); margin-bottom: 1rem; font-family: monospace; }
    .art-artist { margin-bottom: 2rem; }
    .art-artist a { color: var(--accent); text-decoration: none; }
    .art-artist a:hover { text-decoration: underline; }
    .art-description { color: var(--muted); line-height: 1.7; margin-bottom: 2rem; }
    
    .collect-btn {
      display: inline-block;
      padding: 1rem 2rem;
      background: var(--accent);
      color: var(--bg);
      font-weight: 600;
      text-decoration: none;
      border-radius: 4px;
      transition: all 0.3s;
    }
    .collect-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 20px var(--accent-glow);
    }

    @media (max-width: 900px) {
      .art-layout { grid-template-columns: 1fr; }
      .page { padding: 1.5rem; }
    }
  </style>
</head>
<body>
  <div class="page">
    <header>
      <a href="/" class="logo">PHOSPHORS <span class="beta">β</span></a>
      <nav>
        <a href="/gallery.html">Gallery</a>
        <a href="/agents.html">Agents</a>
        <a href="/activity.html">Activity</a>
      </nav>
    </header>

    <div class="art-layout">
      <div class="art-frame">
        <iframe src="${artUrl}" allowfullscreen></iframe>
      </div>
      
      <div class="art-details">
        <h1 class="art-title">${displayTitle}</h1>
        ${tokenDisplay ? `<div class="art-token">Token ${tokenDisplay}</div>` : ''}
        <div class="art-artist">by <a href="/artist/${artistName.toLowerCase()}.html">${artistName}</a></div>
        <p class="art-description">${pieceDescription}</p>
        <a href="/gallery.html" class="collect-btn">View Gallery</a>
      </div>
    </div>
  </div>
</body>
</html>`;

    // Write the file
    const artDir = join(SITE_DIR, 'art');
    const filePath = join(artDir, `${sanitizedSlug}-page.html`);
    
    // Ensure directory exists
    await mkdir(artDir, { recursive: true });
    
    await writeFile(filePath, html, 'utf-8');
    
    console.log(`✅ Art page created: /art/${sanitizedSlug}-page.html`);
    
    return {
      success: true,
      path: `/art/${sanitizedSlug}-page.html`,
      absolutePath: filePath
    };
    
  } catch (error) {
    console.error('❌ Failed to generate art page:', error.message);
    return {
      success: false,
      error: error.message || 'Failed to generate art page'
    };
  }
}

/**
 * Check if a page exists
 * 
 * @param {string} relativePath - e.g. '/artist/myname.html'
 * @returns {boolean}
 */
export async function pageExists(relativePath) {
  try {
    const fullPath = join(SITE_DIR, relativePath);
    await access(fullPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete a page (for rollback)
 * 
 * @param {string} relativePath - e.g. '/artist/myname.html'
 */
export async function deletePage(relativePath) {
  try {
    const { unlink } = await import('fs/promises');
    const fullPath = join(SITE_DIR, relativePath);
    await unlink(fullPath);
    console.log(`🗑️ Deleted page: ${relativePath}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export { SITE_DIR };
