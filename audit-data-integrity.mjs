#!/usr/bin/env node
/**
 * Phosphors Data Integrity Audit
 * Checks all agents and submissions for completeness
 */

const SUPABASE_URL = 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmY25uYWx3ZXV3Z2F1emlqZWZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNTI2NjUsImV4cCI6MjA4NTYyODY2NX0.34M21ctB6jiCNsFANwsSea8BoXkCqCyKjqvrvGEpOwA';

import fs from 'fs';
import path from 'path';

async function supabaseQuery(endpoint) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  });
  return res.json();
}

async function checkArtPageExists(url) {
  // Check if local file exists based on URL
  if (url.includes('phosphors.xyz/art/')) {
    const artPath = url.replace('https://phosphors.xyz/art/', '');
    const localPath = path.join('site', 'art', artPath);
    return fs.existsSync(localPath);
  }
  return null; // External URL - can't check
}

function checkAgentProfileExists(username) {
  const profilePath = path.join('site', 'artist', `${username.toLowerCase()}.html`);
  return fs.existsSync(profilePath);
}

async function audit() {
  console.log('🔍 PHOSPHORS DATA INTEGRITY AUDIT\n');
  console.log('=' .repeat(60) + '\n');
  
  // Get all data
  const agents = await supabaseQuery('agents?select=*');
  const submissions = await supabaseQuery('submissions?select=*');
  
  console.log(`📊 Total agents: ${agents.length}`);
  console.log(`📊 Total submissions: ${submissions.length}\n`);
  
  // AUDIT 1: Agents without wallets
  console.log('=' .repeat(60));
  console.log('🔴 AGENTS WITHOUT WALLETS');
  console.log('=' .repeat(60));
  const agentsNoWallet = agents.filter(a => !a.wallet);
  console.log(`Found: ${agentsNoWallet.length} agents without wallets\n`);
  agentsNoWallet.forEach(a => {
    console.log(`  - ${a.username} (${a.email || 'no email'})`);
  });
  
  // AUDIT 2: Agents without profile pages
  console.log('\n' + '=' .repeat(60));
  console.log('🟠 AGENTS WITHOUT PROFILE PAGES');
  console.log('=' .repeat(60));
  const agentsNoProfile = agents.filter(a => !checkAgentProfileExists(a.username));
  console.log(`Found: ${agentsNoProfile.length} agents without profile pages\n`);
  agentsNoProfile.forEach(a => {
    const hasWallet = a.wallet ? '✅ wallet' : '❌ no wallet';
    const isVerified = a.x_verified ? '✅ verified' : '❌ unverified';
    console.log(`  - ${a.username} (${hasWallet}, ${isVerified})`);
  });
  
  // AUDIT 3: Verified agents without profile pages (CRITICAL)
  console.log('\n' + '=' .repeat(60));
  console.log('🔴 VERIFIED AGENTS WITHOUT PROFILE PAGES (CRITICAL)');
  console.log('=' .repeat(60));
  const verifiedNoProfile = agents.filter(a => a.x_verified && !checkAgentProfileExists(a.username));
  console.log(`Found: ${verifiedNoProfile.length} verified agents without profile pages\n`);
  verifiedNoProfile.forEach(a => {
    console.log(`  - ${a.username} (wallet: ${a.wallet ? 'yes' : 'NO'})`);
  });
  
  // AUDIT 4: Approved submissions without art pages
  console.log('\n' + '=' .repeat(60));
  console.log('🟠 APPROVED SUBMISSIONS - ART FILE CHECK');
  console.log('=' .repeat(60));
  const approvedSubs = submissions.filter(s => s.status === 'approved');
  console.log(`Checking ${approvedSubs.length} approved submissions...\n`);
  
  let missingArtFiles = 0;
  for (const sub of approvedSubs) {
    const exists = await checkArtPageExists(sub.url);
    if (exists === false) {
      console.log(`  ❌ MISSING: ${sub.title} (${sub.moltbook})`);
      console.log(`     URL: ${sub.url}`);
      missingArtFiles++;
    }
  }
  console.log(`\nTotal missing art files: ${missingArtFiles}`);
  
  // AUDIT 5: Submissions without token_ids
  console.log('\n' + '=' .repeat(60));
  console.log('🟡 APPROVED SUBMISSIONS WITHOUT TOKEN_ID');
  console.log('=' .repeat(60));
  const approvedNoToken = submissions.filter(s => s.status === 'approved' && !s.token_id);
  console.log(`Found: ${approvedNoToken.length} approved submissions without token_id\n`);
  approvedNoToken.forEach(s => {
    console.log(`  - ${s.title} by ${s.moltbook} (id: ${s.id})`);
  });
  
  // AUDIT 6: Submissions from non-existent agents
  console.log('\n' + '=' .repeat(60));
  console.log('🔴 SUBMISSIONS FROM NON-EXISTENT AGENTS');
  console.log('=' .repeat(60));
  const agentUsernames = new Set(agents.map(a => a.username.toLowerCase()));
  const orphanedSubs = submissions.filter(s => !agentUsernames.has(s.moltbook.toLowerCase()));
  console.log(`Found: ${orphanedSubs.length} submissions from non-existent agents\n`);
  orphanedSubs.forEach(s => {
    console.log(`  - "${s.title}" by ${s.moltbook} (status: ${s.status})`);
  });
  
  // AUDIT 7: Duplicate token IDs
  console.log('\n' + '=' .repeat(60));
  console.log('🟡 DUPLICATE TOKEN_IDS CHECK');
  console.log('=' .repeat(60));
  const tokenCounts = {};
  submissions.filter(s => s.token_id).forEach(s => {
    tokenCounts[s.token_id] = (tokenCounts[s.token_id] || 0) + 1;
  });
  const duplicates = Object.entries(tokenCounts).filter(([_, count]) => count > 1);
  console.log(`Found: ${duplicates.length} duplicate token_ids\n`);
  duplicates.forEach(([tokenId, count]) => {
    const subs = submissions.filter(s => s.token_id == tokenId);
    console.log(`  Token #${tokenId} used ${count} times:`);
    subs.forEach(s => console.log(`    - ${s.title} by ${s.moltbook}`));
  });
  
  // SUMMARY
  console.log('\n' + '=' .repeat(60));
  console.log('📋 SUMMARY - ACTIONS NEEDED');
  console.log('=' .repeat(60));
  
  const criticalIssues = [];
  const warningIssues = [];
  
  if (verifiedNoProfile.length > 0) {
    criticalIssues.push(`Create profile pages for ${verifiedNoProfile.length} verified agents`);
  }
  if (orphanedSubs.length > 0) {
    criticalIssues.push(`Handle ${orphanedSubs.length} submissions from non-existent agents`);
  }
  if (missingArtFiles > 0) {
    criticalIssues.push(`Create ${missingArtFiles} missing art HTML files`);
  }
  if (agentsNoWallet.length > 0) {
    warningIssues.push(`Fund wallets for ${agentsNoWallet.length} agents (or remove test accounts)`);
  }
  if (duplicates.length > 0) {
    warningIssues.push(`Investigate ${duplicates.length} duplicate token_ids`);
  }
  
  console.log('\n🔴 CRITICAL:');
  if (criticalIssues.length === 0) {
    console.log('  None! ✅');
  } else {
    criticalIssues.forEach(i => console.log(`  - ${i}`));
  }
  
  console.log('\n🟡 WARNINGS:');
  if (warningIssues.length === 0) {
    console.log('  None! ✅');
  } else {
    warningIssues.forEach(i => console.log(`  - ${i}`));
  }
  
  // Return data for programmatic use
  return {
    agents,
    submissions,
    issues: {
      agentsNoWallet,
      agentsNoProfile,
      verifiedNoProfile,
      orphanedSubs,
      missingArtFiles,
      duplicateTokenIds: duplicates
    }
  };
}

audit().catch(console.error);
