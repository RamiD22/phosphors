/**
 * Phosphors Art File Migration Script
 * 
 * Reorganizes art files to consistent naming: {artist}-{title}.html
 * Updates database URLs to match
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

async function migrate() {
  console.log('🚀 Starting Phosphors file migration...\n');
  
  // Get all approved submissions
  const { data: submissions, error } = await supabase
    .from('submissions')
    .select('id, title, moltbook, url')
    .eq('status', 'approved');
  
  if (error) {
    console.error('Failed to fetch submissions:', error);
    process.exit(1);
  }
  
  console.log(`Found ${submissions.length} approved submissions\n`);
  
  const siteDir = path.join(__dirname, '..', 'site');
  const artDir = path.join(siteDir, 'art');
  
  let moved = 0;
  let updated = 0;
  let errors = [];
  
  for (const sub of submissions) {
    const artistSlug = slugify(sub.moltbook);
    const titleSlug = slugify(sub.title);
    const newFilename = `${artistSlug}-${titleSlug}.html`;
    const newRelPath = `/art/${newFilename}`;
    const newFullPath = path.join(artDir, newFilename);
    
    // Current file path
    const oldRelPath = sub.url.replace('https://phosphors.xyz', '');
    const oldFullPath = path.join(siteDir, oldRelPath.slice(1)); // Remove leading /
    
    // Skip if already correct
    if (oldRelPath === newRelPath) {
      console.log(`✓ ${sub.title} - already correct`);
      continue;
    }
    
    // Check source file exists
    if (!fs.existsSync(oldFullPath)) {
      errors.push(`Missing source: ${sub.title} (${oldFullPath})`);
      continue;
    }
    
    // Check destination doesn't exist (avoid overwrite)
    if (fs.existsSync(newFullPath) && oldFullPath !== newFullPath) {
      // Read both and compare - if same, just delete old
      const oldContent = fs.readFileSync(oldFullPath, 'utf8');
      const newContent = fs.readFileSync(newFullPath, 'utf8');
      if (oldContent === newContent) {
        fs.unlinkSync(oldFullPath);
        console.log(`✓ ${sub.title} - duplicate removed`);
      } else {
        errors.push(`Destination exists: ${sub.title} (${newFullPath})`);
        continue;
      }
    } else {
      // Move/rename file
      fs.renameSync(oldFullPath, newFullPath);
      moved++;
      console.log(`📦 ${sub.title}`);
      console.log(`   ${oldRelPath} → ${newRelPath}`);
    }
    
    // Update database
    const newUrl = `https://phosphors.xyz${newRelPath}`;
    const { error: updateError } = await supabase
      .from('submissions')
      .update({ url: newUrl })
      .eq('id', sub.id);
    
    if (updateError) {
      errors.push(`DB update failed: ${sub.title} - ${updateError.message}`);
    } else {
      updated++;
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 MIGRATION SUMMARY');
  console.log('='.repeat(50));
  console.log(`Files moved:    ${moved}`);
  console.log(`DB updated:     ${updated}`);
  console.log(`Errors:         ${errors.length}`);
  
  if (errors.length > 0) {
    console.log('\n⚠️  ERRORS:');
    errors.forEach(e => console.log(`   - ${e}`));
  }
  
  // Clean up empty generated directory
  const generatedDir = path.join(artDir, 'generated');
  if (fs.existsSync(generatedDir)) {
    const remaining = fs.readdirSync(generatedDir);
    if (remaining.length === 0) {
      fs.rmdirSync(generatedDir);
      console.log('\n🗑️  Removed empty /art/generated/ directory');
    } else {
      console.log(`\n📁 /art/generated/ still has ${remaining.length} files`);
    }
  }
  
  console.log('\n✅ Migration complete!\n');
}

migrate().catch(console.error);
