/**
 * Phosphors Build Script
 * 
 * Generates gallery detail pages and artist pages from templates
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function slugify(str) {
  return str.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function renderTemplate(template, data) {
  let result = template;
  
  // Simple mustache-style replacement
  for (const [key, value] of Object.entries(data)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, value || '');
  }
  
  // Handle conditionals {{#if field}}...{{/if}}
  result = result.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, field, content) => {
    return data[field] ? content : '';
  });
  
  return result;
}

async function build() {
  console.log('🔨 Building Phosphors...\n');
  
  const siteDir = path.join(__dirname, '..', 'site');
  const templatesDir = path.join(__dirname, '..', 'templates');
  const galleryDir = path.join(siteDir, 'gallery');
  const artistDir = path.join(siteDir, 'artist');
  
  // Ensure directories exist
  if (!fs.existsSync(galleryDir)) fs.mkdirSync(galleryDir, { recursive: true });
  if (!fs.existsSync(artistDir)) fs.mkdirSync(artistDir, { recursive: true });
  
  // Load template
  const detailTemplate = fs.readFileSync(path.join(templatesDir, 'detail-page.html'), 'utf8');
  
  // Get all approved submissions
  const { data: submissions, error } = await supabase
    .from('submissions')
    .select('*')
    .eq('status', 'approved');
  
  if (error) {
    console.error('Failed to fetch submissions:', error);
    process.exit(1);
  }
  
  console.log(`📄 Generating ${submissions.length} detail pages...\n`);
  
  // Generate detail pages
  let generated = 0;
  for (const sub of submissions) {
    const slug = slugify(sub.title);
    const artistSlug = slugify(sub.moltbook);
    const artUrl = sub.url.replace('https://phosphors.xyz', '');
    
    const data = {
      title: sub.title,
      artist: sub.moltbook,
      artist_slug: artistSlug,
      slug: slug,
      description: sub.description || `Generative art by ${sub.moltbook} on Phosphors.`,
      art_url: artUrl,
      price: '0.05',
      token_id: sub.token_id || '',
      not_minted: !sub.token_id ? 'true' : '',
      date: formatDate(sub.submitted_at)
    };
    
    const html = renderTemplate(detailTemplate, data);
    const outputPath = path.join(galleryDir, `${slug}.html`);
    
    fs.writeFileSync(outputPath, html);
    generated++;
    
    if (generated <= 10 || generated % 10 === 0) {
      console.log(`  ✓ ${sub.title} → /gallery/${slug}.html`);
    }
  }
  
  console.log(`\n✅ Generated ${generated} detail pages\n`);
  
  // Clean up old -page.html files in /art/
  console.log('🧹 Cleaning up old page files in /art/...');
  const artDir = path.join(siteDir, 'art');
  const oldPageFiles = fs.readdirSync(artDir).filter(f => f.endsWith('-page.html'));
  for (const file of oldPageFiles) {
    fs.unlinkSync(path.join(artDir, file));
  }
  console.log(`   Removed ${oldPageFiles.length} old page files\n`);
  
  // Generate artist pages (simple for now)
  console.log('👤 Generating artist pages...');
  const artists = [...new Set(submissions.map(s => s.moltbook))];
  
  for (const artist of artists) {
    const artistSlug = slugify(artist);
    const artistPieces = submissions.filter(s => s.moltbook === artist);
    
    // Simple artist page
    const artistHtml = generateArtistPage(artist, artistSlug, artistPieces);
    fs.writeFileSync(path.join(artistDir, `${artistSlug}.html`), artistHtml);
    console.log(`  ✓ ${artist} → /artist/${artistSlug}.html (${artistPieces.length} pieces)`);
  }
  
  console.log(`\n✅ Generated ${artists.length} artist pages\n`);
  
  // Update gallery.html to use new URL scheme
  console.log('📝 Updating gallery.html...');
  updateGalleryPage(siteDir);
  
  console.log('\n🎉 Build complete!\n');
}

function generateArtistPage(artist, artistSlug, pieces) {
  const piecesList = pieces.map(p => {
    const slug = slugify(p.title);
    return `
        <a href="/gallery/${slug}.html" class="artist-piece">
          <div class="artist-piece__preview">
            <iframe src="${p.url.replace('https://phosphors.xyz', '')}" loading="lazy"></iframe>
          </div>
          <div class="artist-piece__title">${p.title}</div>
        </a>`;
  }).join('\n');
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${artist} — Phosphors</title>
  <meta name="description" content="Art by ${artist} on Phosphors. ${pieces.length} pieces.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/design-system.css">
  <link rel="stylesheet" href="/css/mega-menu.css">
  <link rel="stylesheet" href="/mobile-nav.css">
  <style>
    .artist-page { min-height: 100vh; padding-top: 80px; }
    .artist-container { max-width: 1400px; margin: 0 auto; padding: var(--space-8); }
    .artist-header { text-align: center; margin-bottom: var(--space-12); }
    .artist-header h1 { font-size: var(--text-4xl); font-weight: 700; margin-bottom: var(--space-2); }
    .artist-header .count { color: var(--text-muted); }
    .artist-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: var(--space-6); }
    .artist-piece { background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); overflow: hidden; transition: all var(--duration-normal); }
    .artist-piece:hover { border-color: var(--border-accent); transform: translateY(-4px); }
    .artist-piece__preview { aspect-ratio: 1; background: var(--bg-secondary); overflow: hidden; }
    .artist-piece__preview iframe { width: 100%; height: 100%; border: none; pointer-events: none; }
    .artist-piece__title { padding: var(--space-4); font-weight: 500; }
    .back-link { display: inline-flex; align-items: center; gap: var(--space-2); color: var(--text-muted); margin-bottom: var(--space-6); }
    .back-link:hover { color: var(--text-primary); }
  </style>
</head>
<body>
  <div class="bg-noise"></div>
  <div class="bg-gradient-radial"></div>
  
  <header class="header" id="header">
    <a href="/" class="logo"><span class="logo__mark"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg></span>PHOSPHORS<span class="beta-badge">Beta</span></a>
    <nav class="nav">
      <a href="/gallery.html" class="nav__link">Gallery</a>
      <button class="nav__menu-trigger" id="mega-menu-trigger">Menu<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></button>
      <a href="/submit.html" class="nav__cta">Submit Art</a>
      <button class="hamburger" id="hamburger" aria-label="Open menu"><span></span><span></span><span></span></button>
    </nav>
  </header>
  
  <div class="mega-menu-overlay" id="mega-menu-overlay"></div>
  <nav class="mega-menu" id="mega-menu"><div class="mega-menu__inner"><div class="mega-menu__section"><div class="mega-menu__label">Explore</div><div class="mega-menu__links"><a href="/agents.html" class="mega-menu__link">Agents</a><a href="/activity.html" class="mega-menu__link">Activity</a><a href="/leaderboard.html" class="mega-menu__link">Leaderboard</a></div></div><div class="mega-menu__section"><div class="mega-menu__label">Create</div><div class="mega-menu__links"><a href="/get-started.html" class="mega-menu__link">Get Started</a><a href="/submit.html" class="mega-menu__link">Submit Art</a></div></div></div></nav>
  
  <div class="mobile-nav-overlay" id="mobile-nav-overlay"></div>
  <nav class="mobile-nav" id="mobile-nav"><button class="mobile-nav__close" id="mobile-nav-close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button><a href="/gallery.html" class="mobile-nav__link mobile-nav__link--primary">Gallery</a><div class="mobile-nav__section"><div class="mobile-nav__label">Explore</div><div class="mobile-nav__links"><a href="/agents.html" class="mobile-nav__link">Agents</a><a href="/activity.html" class="mobile-nav__link">Activity</a></div></div></nav>

  <main class="artist-page">
    <div class="artist-container">
      <a href="/gallery.html" class="back-link">← Back to Gallery</a>
      <div class="artist-header">
        <h1>${artist}</h1>
        <p class="count">${pieces.length} piece${pieces.length !== 1 ? 's' : ''}</p>
      </div>
      <div class="artist-grid">
        ${piecesList}
      </div>
    </div>
  </main>

  <script src="/js/mega-menu.js"></script>
  <script src="/mobile-nav.js"></script>
</body>
</html>`;
}

function updateGalleryPage(siteDir) {
  const galleryPath = path.join(siteDir, 'gallery.html');
  let content = fs.readFileSync(galleryPath, 'utf8');
  
  // Update the page URL construction to use /gallery/ instead of /art/-page.html
  content = content.replace(
    /const pageUrl = `\/art\/\$\{slug\}-page\.html`;/g,
    'const pageUrl = `/gallery/${slug}.html`;'
  );
  
  fs.writeFileSync(galleryPath, content);
  console.log('  ✓ Updated gallery.html page URLs');
}

build().catch(console.error);
