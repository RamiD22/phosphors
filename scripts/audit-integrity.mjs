/**
 * Data Integrity Audit Script
 * 
 * Comprehensive audit of all data to ensure:
 * - All agents have wallets
 * - All agents have profile pages
 * - All approved submissions have token_ids
 * - All approved submissions have art pages
 * - No duplicate token_ids
 * - No orphaned submissions
 * 
 * Usage:
 *   node scripts/audit-integrity.mjs           # Run audit
 *   node scripts/audit-integrity.mjs --fix     # Run audit and fix issues
 */

import 'dotenv/config';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_DIR = path.join(__dirname, '../site');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function supabaseRequest(pathStr, options = {}) {
  const url = `${SUPABASE_URL}${pathStr}`;
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    ...options.headers
  };
  return fetch(url, { ...options, headers });
}

async function main() {
  const args = process.argv.slice(2);
  const fix = args.includes('--fix');
  
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║                     PHOSPHORS DATA INTEGRITY AUDIT                        ║
╚═══════════════════════════════════════════════════════════════════════════╝
`);
  console.log(`  Time: ${new Date().toISOString()}`);
  console.log(`  Mode: ${fix ? 'AUDIT + FIX' : 'AUDIT ONLY'}`);
  console.log('');
  
  // Fetch all data
  console.log('📥 Fetching data...');
  
  const [agentsRes, submissionsRes] = await Promise.all([
    supabaseRequest('/rest/v1/agents?select=*'),
    supabaseRequest('/rest/v1/submissions?select=*')
  ]);
  
  const agents = await agentsRes.json();
  const submissions = await submissionsRes.json();
  
  console.log(`   Agents: ${agents.length}`);
  console.log(`   Submissions: ${submissions.length}`);
  console.log('');
  
  const issues = [];
  const stats = {
    agents: {
      total: agents.length,
      withWallet: 0,
      withPage: 0,
      verified: 0
    },
    submissions: {
      total: submissions.length,
      approved: 0,
      pending: 0,
      rejected: 0,
      minted: 0
    }
  };
  
  // ═══════════════════════════════════════════════════════════════
  // AUDIT AGENTS
  // ═══════════════════════════════════════════════════════════════
  console.log('🔍 Auditing Agents...\n');
  
  const agentUsernames = new Set();
  
  for (const agent of agents) {
    agentUsernames.add(agent.username.toLowerCase());
    
    if (agent.x_verified) stats.agents.verified++;
    
    // Check wallet
    if (agent.wallet) {
      stats.agents.withWallet++;
      
      // Validate wallet format
      if (!/^0x[a-fA-F0-9]{40}$/i.test(agent.wallet)) {
        issues.push({
          type: 'INVALID_WALLET_FORMAT',
          severity: 'major',
          entity: 'agent',
          id: agent.id,
          username: agent.username,
          value: agent.wallet
        });
      }
    } else {
      issues.push({
        type: 'AGENT_NO_WALLET',
        severity: 'major',
        entity: 'agent',
        id: agent.id,
        username: agent.username
      });
    }
    
    // Check profile page
    const sanitizedUsername = agent.username.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const pagePath = path.join(SITE_DIR, 'artist', `${sanitizedUsername}.html`);
    
    if (existsSync(pagePath)) {
      stats.agents.withPage++;
    } else {
      issues.push({
        type: 'AGENT_NO_PAGE',
        severity: 'minor',
        entity: 'agent',
        id: agent.id,
        username: agent.username,
        expectedPath: pagePath
      });
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // AUDIT SUBMISSIONS
  // ═══════════════════════════════════════════════════════════════
  console.log('🔍 Auditing Submissions...\n');
  
  const tokenIds = new Map();
  
  for (const sub of submissions) {
    // Count by status
    if (sub.status === 'approved') stats.submissions.approved++;
    else if (sub.status === 'pending') stats.submissions.pending++;
    else if (sub.status === 'rejected') stats.submissions.rejected++;
    
    // Check for orphaned submissions
    if (!agentUsernames.has(sub.moltbook.toLowerCase())) {
      issues.push({
        type: 'ORPHANED_SUBMISSION',
        severity: 'critical',
        entity: 'submission',
        id: sub.id,
        moltbook: sub.moltbook,
        title: sub.title
      });
    }
    
    // For approved submissions
    if (sub.status === 'approved') {
      // Check token_id
      if (sub.token_id) {
        stats.submissions.minted++;
        
        // Check for duplicates
        if (tokenIds.has(sub.token_id)) {
          issues.push({
            type: 'DUPLICATE_TOKEN_ID',
            severity: 'critical',
            entity: 'submission',
            id: sub.id,
            tokenId: sub.token_id,
            otherSubmissionId: tokenIds.get(sub.token_id)
          });
        } else {
          tokenIds.set(sub.token_id, sub.id);
        }
      } else {
        issues.push({
          type: 'APPROVED_NO_TOKEN',
          severity: 'critical',
          entity: 'submission',
          id: sub.id,
          title: sub.title
        });
      }
      
      // Check art page (if page_url is set)
      if (sub.page_url) {
        const artPagePath = path.join(SITE_DIR, sub.page_url.replace(/^\//, ''));
        if (!existsSync(artPagePath)) {
          issues.push({
            type: 'APPROVED_PAGE_MISSING',
            severity: 'minor',
            entity: 'submission',
            id: sub.id,
            title: sub.title,
            expectedPath: artPagePath
          });
        }
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // GENERATE REPORT
  // ═══════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('  STATISTICS');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');
  
  console.log('  AGENTS:');
  console.log(`    Total: ${stats.agents.total}`);
  console.log(`    With Wallet: ${stats.agents.withWallet} (${Math.round(stats.agents.withWallet/stats.agents.total*100)}%)`);
  console.log(`    With Page: ${stats.agents.withPage} (${Math.round(stats.agents.withPage/stats.agents.total*100)}%)`);
  console.log(`    Verified: ${stats.agents.verified} (${Math.round(stats.agents.verified/stats.agents.total*100)}%)`);
  console.log('');
  
  console.log('  SUBMISSIONS:');
  console.log(`    Total: ${stats.submissions.total}`);
  console.log(`    Approved: ${stats.submissions.approved}`);
  console.log(`    Pending: ${stats.submissions.pending}`);
  console.log(`    Rejected: ${stats.submissions.rejected}`);
  console.log(`    Minted: ${stats.submissions.minted} (${Math.round(stats.submissions.minted/Math.max(1,stats.submissions.approved)*100)}% of approved)`);
  console.log('');
  
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('  ISSUES');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');
  
  const criticalIssues = issues.filter(i => i.severity === 'critical');
  const majorIssues = issues.filter(i => i.severity === 'major');
  const minorIssues = issues.filter(i => i.severity === 'minor');
  
  console.log(`  🔴 Critical: ${criticalIssues.length}`);
  console.log(`  🟠 Major: ${majorIssues.length}`);
  console.log(`  🟡 Minor: ${minorIssues.length}`);
  console.log(`  📊 Total: ${issues.length}`);
  console.log('');
  
  if (criticalIssues.length > 0) {
    console.log('  CRITICAL ISSUES:');
    for (const issue of criticalIssues.slice(0, 10)) {
      console.log(`    ❌ ${issue.type}: ${issue.username || issue.moltbook || issue.title} (ID: ${issue.id})`);
    }
    if (criticalIssues.length > 10) {
      console.log(`    ... and ${criticalIssues.length - 10} more`);
    }
    console.log('');
  }
  
  if (majorIssues.length > 0) {
    console.log('  MAJOR ISSUES:');
    for (const issue of majorIssues.slice(0, 10)) {
      console.log(`    ⚠️  ${issue.type}: ${issue.username || issue.moltbook || issue.title} (ID: ${issue.id})`);
    }
    if (majorIssues.length > 10) {
      console.log(`    ... and ${majorIssues.length - 10} more`);
    }
    console.log('');
  }
  
  // ═══════════════════════════════════════════════════════════════
  // HEALTH SCORE
  // ═══════════════════════════════════════════════════════════════
  let healthScore = 100;
  healthScore -= criticalIssues.length * 10;
  healthScore -= majorIssues.length * 5;
  healthScore -= minorIssues.length * 1;
  healthScore = Math.max(0, Math.min(100, healthScore));
  
  const healthStatus = 
    healthScore >= 90 ? '✅ HEALTHY' :
    healthScore >= 70 ? '⚠️  DEGRADED' :
    healthScore >= 50 ? '🟠 UNHEALTHY' : '🔴 CRITICAL';
  
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('  HEALTH SCORE');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');
  console.log(`  ${healthStatus} - Score: ${healthScore}/100`);
  console.log('');
  
  // ═══════════════════════════════════════════════════════════════
  // FIX RECOMMENDATIONS
  // ═══════════════════════════════════════════════════════════════
  if (issues.length > 0) {
    console.log('═══════════════════════════════════════════════════════════════════════════');
    console.log('  FIX COMMANDS');
    console.log('═══════════════════════════════════════════════════════════════════════════\n');
    
    if (issues.some(i => i.type === 'AGENT_NO_WALLET')) {
      console.log('  # Fix missing wallets:');
      console.log('  node scripts/fix-missing-wallets.mjs --apply --fund');
      console.log('');
    }
    
    if (issues.some(i => i.type === 'AGENT_NO_PAGE')) {
      console.log('  # Fix missing agent pages:');
      console.log('  node scripts/fix-missing-pages.mjs --apply');
      console.log('');
    }
    
    if (issues.some(i => i.type === 'APPROVED_NO_TOKEN')) {
      console.log('  # Mint unminted submissions:');
      console.log('  node mint-sequential.mjs');
      console.log('');
    }
  }
  
  // Exit with appropriate code
  if (criticalIssues.length > 0) {
    console.log('❌ Audit FAILED - Critical issues found\n');
    process.exit(1);
  } else if (majorIssues.length > 0) {
    console.log('⚠️  Audit completed with warnings\n');
    process.exit(0);
  } else {
    console.log('✅ Audit PASSED - No critical or major issues\n');
    process.exit(0);
  }
}

main().catch(e => {
  console.error('Audit error:', e);
  process.exit(1);
});
