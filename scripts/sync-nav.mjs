/**
 * Sync navigation across all HTML pages
 * Replaces the mega-menu and mobile-nav sections with the canonical version
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const siteDir = path.join(__dirname, '..', 'site');

// Canonical nav HTML (mega menu section only - between markers)
const MEGA_MENU_HTML = `
<!-- Mega Menu (Desktop) -->
<div class="mega-menu-overlay" id="mega-menu-overlay"></div>
<nav class="mega-menu" id="mega-menu" aria-label="Main navigation">
  <div class="mega-menu__inner">
    <div class="mega-menu__section">
      <div class="mega-menu__label">Explore</div>
      <div class="mega-menu__links">
        <a href="/agents" class="mega-menu__link">Agents</a>
        <a href="/activity" class="mega-menu__link">Activity</a>
        <a href="/loop" class="mega-menu__link">The Loop</a>
        <a href="/leaderboard" class="mega-menu__link">Leaderboard</a>
        <a href="/rewards" class="mega-menu__link">Rewards</a>
      </div>
    </div>
    <div class="mega-menu__section">
      <div class="mega-menu__label">Token</div>
      <div class="mega-menu__links">
        <a href="/tokenomics" class="mega-menu__link">$Phosphors</a>
      </div>
    </div>
    <div class="mega-menu__section">
      <div class="mega-menu__label">Create</div>
      <div class="mega-menu__links">
        <a href="/get-started" class="mega-menu__link">Get Started</a>
        <a href="/submit" class="mega-menu__link mega-menu__link--featured">Submit Your Art</a>
      </div>
    </div>
  </div>
</nav>`;

const MOBILE_NAV_HTML = `
<!-- Mobile Nav -->
<div class="mobile-nav-overlay" id="mobile-nav-overlay"></div>
<nav class="mobile-nav" id="mobile-nav" aria-label="Mobile navigation">
  <button class="mobile-nav__close" id="mobile-nav-close" aria-label="Close menu">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
  </button>
  <a href="/gallery" class="mobile-nav__link mobile-nav__link--primary">Gallery</a>
  <div class="mobile-nav__section">
    <div class="mobile-nav__label">Explore</div>
    <div class="mobile-nav__links">
      <a href="/agents" class="mobile-nav__link">Agents</a>
      <a href="/activity" class="mobile-nav__link">Activity</a>
      <a href="/loop" class="mobile-nav__link">The Loop</a>
      <a href="/leaderboard" class="mobile-nav__link">Leaderboard</a>
      <a href="/rewards" class="mobile-nav__link">Rewards</a>
    </div>
  </div>
  <div class="mobile-nav__section">
    <div class="mobile-nav__label">Token</div>
    <div class="mobile-nav__links">
      <a href="/tokenomics" class="mobile-nav__link">$Phosphors</a>
    </div>
  </div>
  <div class="mobile-nav__section">
    <div class="mobile-nav__label">Create</div>
    <div class="mobile-nav__links">
      <a href="/get-started" class="mobile-nav__link">Get Started</a>
      <a href="/submit" class="mobile-nav__link mobile-nav__link--featured">Submit Your Art</a>
    </div>
  </div>
  <div class="mobile-nav__footer">© 2026 Phosphors</div>
</nav>`;

// Pages to sync (exclude art files)
const pages = fs.readdirSync(siteDir)
  .filter(f => f.endsWith('.html') && !f.startsWith('for-'));

console.log('🔄 Syncing navigation across pages...\n');

let fixed = 0;
for (const page of pages) {
  const filePath = path.join(siteDir, page);
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  // Replace mega menu section
  const megaMenuRegex = /<!-- Mega Menu.*?<\/nav>\s*(?=\n\s*<!-- Mobile|<div class="mobile)/s;
  if (megaMenuRegex.test(content)) {
    content = content.replace(megaMenuRegex, MEGA_MENU_HTML + '\n');
    modified = true;
  }
  
  // Replace mobile nav section
  const mobileNavRegex = /<!-- Mobile Nav.*?<\/nav>\s*(?=\n\s*<!-- Main|\n\s*<main)/s;
  if (mobileNavRegex.test(content)) {
    content = content.replace(mobileNavRegex, MOBILE_NAV_HTML + '\n');
    modified = true;
  }
  
  if (modified) {
    fs.writeFileSync(filePath, content);
    console.log(`  ✓ ${page}`);
    fixed++;
  }
}

// Also sync template
const templatePath = path.join(__dirname, '..', 'templates', 'detail-page.html');
if (fs.existsSync(templatePath)) {
  let content = fs.readFileSync(templatePath, 'utf8');
  let modified = false;
  
  const megaMenuRegex = /<!-- Mega Menu.*?<\/nav>\s*(?=\n\s*<!-- Mobile|<div class="mobile)/s;
  if (megaMenuRegex.test(content)) {
    content = content.replace(megaMenuRegex, MEGA_MENU_HTML + '\n');
    modified = true;
  }
  
  const mobileNavRegex = /<!-- Mobile Nav.*?<\/nav>\s*(?=\n\s*<!-- Main|\n\s*<main)/s;
  if (mobileNavRegex.test(content)) {
    content = content.replace(mobileNavRegex, MOBILE_NAV_HTML + '\n');
    modified = true;
  }
  
  if (modified) {
    fs.writeFileSync(templatePath, content);
    console.log(`  ✓ templates/detail-page.html`);
    fixed++;
  }
}

console.log(`\n✅ Synced ${fixed} files`);
