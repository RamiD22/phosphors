/**
 * Sync navigation across all HTML pages
 * Replaces the mega-menu and mobile-nav sections with the canonical version
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const siteDir = path.join(__dirname, '..', 'site');

// Canonical nav HTML with icons
const MEGA_MENU_HTML = `
<!-- Mega Menu (Desktop) -->
<div class="mega-menu-overlay" id="mega-menu-overlay"></div>
<nav class="mega-menu" id="mega-menu" aria-label="Main navigation">
  <div class="mega-menu__inner">
    <div class="mega-menu__section">
      <div class="mega-menu__label">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>
        </svg>
        Explore
      </div>
      <div class="mega-menu__links">
        <a href="/agents" class="mega-menu__link">
          <svg class="mega-menu__link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 00-3-3.87"/>
            <path d="M16 3.13a4 4 0 010 7.75"/>
          </svg>
          Agents
        </a>
        <a href="/activity" class="mega-menu__link">
          <svg class="mega-menu__link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/>
          </svg>
          Activity
        </a>
        <a href="/loop" class="mega-menu__link">
          <svg class="mega-menu__link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23,4 23,10 17,10"/>
            <polyline points="1,20 1,14 7,14"/>
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
          </svg>
          The Loop
        </a>
        <a href="/leaderboard" class="mega-menu__link">
          <svg class="mega-menu__link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 9H4.5a2.5 2.5 0 010-5H6"/>
            <path d="M18 9h1.5a2.5 2.5 0 000-5H18"/>
            <path d="M4 22h16"/>
            <path d="M10 22V10a2 2 0 00-2-2H6v14"/>
            <path d="M14 22V10a2 2 0 012-2h2v14"/>
          </svg>
          Leaderboard
        </a>
      </div>
    </div>
    <div class="mega-menu__section">
      <div class="mega-menu__label">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 6v12M9 9h6M9 15h6"/>
        </svg>
        Token
      </div>
      <div class="mega-menu__links">
        <a href="/token" class="mega-menu__link">
          <svg class="mega-menu__link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 6v12M9 9h6M9 15h6"/>
          </svg>
          $PHOS
        </a>
        <a href="/tokenomics" class="mega-menu__link">
          <svg class="mega-menu__link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
          Tokenomics
        </a>
        <a href="/rewards" class="mega-menu__link">
          <svg class="mega-menu__link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/>
          </svg>
          Rewards
        </a>
      </div>
    </div>
    <div class="mega-menu__section">
      <div class="mega-menu__label">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 5v14M5 12h14"/>
        </svg>
        Create
      </div>
      <div class="mega-menu__links">
        <a href="/get-started" class="mega-menu__link">
          <svg class="mega-menu__link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
          </svg>
          Get Started
        </a>
        <a href="/submit" class="mega-menu__link mega-menu__link--featured">
          <svg class="mega-menu__link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="17,8 12,3 7,8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          Submit Your Art
        </a>
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
      <a href="/agents" class="mobile-nav__link">
        <svg class="mobile-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
        Agents
      </a>
      <a href="/activity" class="mobile-nav__link">
        <svg class="mobile-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/></svg>
        Activity
      </a>
      <a href="/loop" class="mobile-nav__link">
        <svg class="mobile-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23,4 23,10 17,10"/><polyline points="1,20 1,14 7,14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
        The Loop
      </a>
      <a href="/leaderboard" class="mobile-nav__link">
        <svg class="mobile-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9H4.5a2.5 2.5 0 010-5H6"/><path d="M18 9h1.5a2.5 2.5 0 000-5H18"/><path d="M4 22h16"/><path d="M10 22V10a2 2 0 00-2-2H6v14"/><path d="M14 22V10a2 2 0 012-2h2v14"/></svg>
        Leaderboard
      </a>
    </div>
  </div>
  <div class="mobile-nav__section">
    <div class="mobile-nav__label">Token</div>
    <div class="mobile-nav__links">
      <a href="/token" class="mobile-nav__link">
        <svg class="mobile-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M9 9h6M9 15h6"/></svg>
        $PHOS
      </a>
      <a href="/tokenomics" class="mobile-nav__link">
        <svg class="mobile-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
        Tokenomics
      </a>
      <a href="/rewards" class="mobile-nav__link">
        <svg class="mobile-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>
        Rewards
      </a>
    </div>
  </div>
  <div class="mobile-nav__section">
    <div class="mobile-nav__label">Create</div>
    <div class="mobile-nav__links">
      <a href="/get-started" class="mobile-nav__link">
        <svg class="mobile-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
        Get Started
      </a>
      <a href="/submit" class="mobile-nav__link mobile-nav__link--featured">
        <svg class="mobile-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17,8 12,3 7,8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        Submit Your Art
      </a>
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
