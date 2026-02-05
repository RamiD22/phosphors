/**
 * Phosphors Validation Script
 * 
 * Verifies all files exist and links are correct
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

async function validate() {
  console.log('🔍 Validating Phosphors...\n');
  
  const siteDir = path.join(__dirname, '..', 'site');
  let errors = [];
  let warnings = [];
  let passed = 0;
  
  // Get all approved submissions
  const { data: submissions, error } = await supabase
    .from('submissions')
    .select('*')
    .eq('status', 'approved');
  
  if (error) {
    console.error('Failed to fetch submissions:', error);
    process.exit(1);
  }
  
  console.log(`Checking ${submissions.length} pieces...\n`);
  
  for (const sub of submissions) {
    const slug = slugify(sub.title);
    const artistSlug = slugify(sub.moltbook);
    
    // 1. Check art file exists
    const artPath = sub.url.replace('https://phosphors.xyz', '');
    const artFile = path.join(siteDir, artPath.slice(1));
    
    if (!fs.existsSync(artFile)) {
      errors.push(`❌ Art file missing: ${sub.title} (${artFile})`);
    } else {
      passed++;
    }
    
    // 2. Check detail page exists
    const detailFile = path.join(siteDir, 'gallery', `${slug}.html`);
    
    if (!fs.existsSync(detailFile)) {
      errors.push(`❌ Detail page missing: ${sub.title} (/gallery/${slug}.html)`);
    } else {
      // Check iframe src is correct
      const content = fs.readFileSync(detailFile, 'utf8');
      if (!content.includes(`src="${artPath}"`)) {
        errors.push(`❌ Wrong iframe src in ${slug}.html - expected ${artPath}`);
      } else {
        passed++;
      }
    }
    
    // 3. Check artist page exists
    const artistFile = path.join(siteDir, 'artist', `${artistSlug}.html`);
    
    if (!fs.existsSync(artistFile)) {
      warnings.push(`⚠️  Artist page missing: ${sub.moltbook} (/artist/${artistSlug}.html)`);
    }
  }
  
  // Check unique artists have pages
  const artists = [...new Set(submissions.map(s => s.moltbook))];
  for (const artist of artists) {
    const artistSlug = slugify(artist);
    const artistFile = path.join(siteDir, 'artist', `${artistSlug}.html`);
    if (fs.existsSync(artistFile)) {
      passed++;
    }
  }
  
  // Check gallery.html has correct URL pattern
  const galleryContent = fs.readFileSync(path.join(siteDir, 'gallery.html'), 'utf8');
  if (galleryContent.includes('/art/${slug}-page.html')) {
    errors.push('❌ gallery.html still using old URL pattern');
  } else if (galleryContent.includes('/gallery/${slug}.html')) {
    passed++;
  }
  
  // Summary
  console.log('='.repeat(50));
  console.log('📊 VALIDATION RESULTS');
  console.log('='.repeat(50));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Errors: ${errors.length}`);
  console.log(`⚠️  Warnings: ${warnings.length}`);
  
  if (errors.length > 0) {
    console.log('\n❌ ERRORS:');
    errors.forEach(e => console.log(`   ${e}`));
  }
  
  if (warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    warnings.forEach(w => console.log(`   ${w}`));
  }
  
  if (errors.length === 0) {
    console.log('\n✅ All validations passed!\n');
    process.exit(0);
  } else {
    console.log('\n❌ Validation failed. Fix errors before deploying.\n');
    process.exit(1);
  }
}

validate().catch(console.error);
