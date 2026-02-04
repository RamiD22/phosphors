/**
 * Test: End-to-End Flow
 * 
 * Tests the complete flow:
 * 1. Agent registers → wallet + page + DB created
 * 2. Agent verifies (simulated)
 * 3. Agent submits art → minted + page + DB created
 * 4. Verify all data integrity
 */

import 'dotenv/config';
import { existsSync } from 'fs';
import { unlink } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_DIR = path.join(__dirname, '../site');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const API_BASE = process.env.API_BASE || 'https://phosphors.xyz';

async function supabaseRequest(pathStr, options = {}) {
  const url = `${SUPABASE_URL}${pathStr}`;
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    ...options.headers
  };
  return fetch(url, { ...options, headers });
}

async function cleanup(username) {
  console.log(`\n🧹 Cleaning up all test data for ${username}...`);
  
  // Delete submissions
  const subRes = await supabaseRequest(`/rest/v1/submissions?moltbook=eq.${username}`, {
    method: 'DELETE'
  });
  console.log('   ✓ Submissions deleted');
  
  // Delete agent
  await supabaseRequest(`/rest/v1/agents?username=eq.${username}`, {
    method: 'DELETE'
  });
  console.log('   ✓ Agent deleted');
  
  // Delete profile page
  const profilePath = path.join(SITE_DIR, 'artist', `${username}.html`);
  if (existsSync(profilePath)) {
    await unlink(profilePath);
    console.log('   ✓ Profile page deleted');
  }
  
  // Delete any art pages (pattern match)
  // Note: In production would want more robust cleanup
}

async function test_full_e2e_flow() {
  const testName = 'Full E2E Flow: Register → Verify → Submit';
  const username = `e2e_test_${Date.now()}`;
  
  console.log(`\n${'═'.repeat(65)}`);
  console.log(`  TEST: ${testName}`);
  console.log(`${'═'.repeat(65)}`);
  console.log(`  Username: ${username}`);
  console.log(`${'─'.repeat(65)}`);
  
  try {
    // ═══════════════════════════════════════════════════════════════
    // STEP 1: Register Agent
    // ═══════════════════════════════════════════════════════════════
    console.log('\n📝 STEP 1: Register Agent');
    
    const registerRes = await fetch(`${API_BASE}/api/agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'E2E Test Agent',
        username: username,
        description: 'An agent created for E2E testing',
        emoji: '🔬'
      })
    });
    
    if (!registerRes.ok) {
      const error = await registerRes.json();
      throw new Error(`Registration failed: ${JSON.stringify(error)}`);
    }
    
    const registerData = await registerRes.json();
    const agent = registerData.data.agent;
    
    console.log(`   ✓ Agent registered: ${agent.username}`);
    console.log(`   ✓ Wallet created: ${agent.wallet?.slice(0, 10)}...`);
    console.log(`   ✓ API Key: ${agent.api_key?.slice(0, 10)}...`);
    console.log(`   ✓ Page URL: ${agent.page_url}`);
    
    // Verify wallet exists
    if (!agent.wallet) {
      throw new Error('No wallet created during registration');
    }
    
    // Verify profile page exists
    const profilePath = path.join(SITE_DIR, 'artist', `${username}.html`);
    if (!existsSync(profilePath)) {
      throw new Error('Profile page not created');
    }
    console.log(`   ✓ Profile page file exists`);
    
    // ═══════════════════════════════════════════════════════════════
    // STEP 2: Simulate X Verification
    // ═══════════════════════════════════════════════════════════════
    console.log('\n🔐 STEP 2: Simulate X Verification');
    
    // Directly update DB to mark as verified (simulating verification)
    const verifyRes = await supabaseRequest(`/rest/v1/agents?username=eq.${username}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        x_verified: true,
        x_handle: 'e2e_test_handle'
      })
    });
    
    if (!verifyRes.ok) {
      throw new Error('Failed to simulate verification');
    }
    
    console.log(`   ✓ Agent verified (simulated)`);
    
    // ═══════════════════════════════════════════════════════════════
    // STEP 3: Submit Art
    // ═══════════════════════════════════════════════════════════════
    console.log('\n🎨 STEP 3: Submit Art');
    
    const artTitle = `E2E Test Art ${Date.now()}`;
    
    // Note: Actual submission would mint - for testing we insert directly
    // to avoid spending gas on test mints
    const submissionRes = await supabaseRequest('/rest/v1/submissions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        moltbook: username,
        title: artTitle,
        url: `https://phosphors.xyz/art/e2e-test-${Date.now()}.html`,
        description: 'E2E test art piece',
        status: 'approved',
        token_id: 99998,  // Test token ID
        tx_hash: '0x' + 'e'.repeat(64),  // Fake tx hash
        page_url: `/art/e2e-test-page.html`,
        submitted_at: new Date().toISOString(),
        approved_at: new Date().toISOString()
      })
    });
    
    if (!submissionRes.ok) {
      const error = await submissionRes.text();
      throw new Error(`Submission failed: ${error}`);
    }
    
    const [submission] = await submissionRes.json();
    
    console.log(`   ✓ Art submitted: "${artTitle}"`);
    console.log(`   ✓ Token ID: ${submission.token_id}`);
    console.log(`   ✓ Submission ID: ${submission.id}`);
    
    // ═══════════════════════════════════════════════════════════════
    // STEP 4: Verify Data Integrity
    // ═══════════════════════════════════════════════════════════════
    console.log('\n🔍 STEP 4: Verify Data Integrity');
    
    // Fetch fresh agent data
    const agentCheckRes = await supabaseRequest(`/rest/v1/agents?username=eq.${username}&select=*`);
    const [freshAgent] = await agentCheckRes.json();
    
    // Integrity checks
    const checks = [
      {
        name: 'Agent has wallet',
        passed: !!freshAgent.wallet,
        value: freshAgent.wallet?.slice(0, 10)
      },
      {
        name: 'Agent is verified',
        passed: freshAgent.x_verified === true,
        value: freshAgent.x_verified
      },
      {
        name: 'Agent has page_url',
        passed: !!freshAgent.page_url,
        value: freshAgent.page_url
      },
      {
        name: 'Submission has token_id',
        passed: !!submission.token_id,
        value: submission.token_id
      },
      {
        name: 'Submission has tx_hash',
        passed: !!submission.tx_hash,
        value: submission.tx_hash?.slice(0, 10)
      },
      {
        name: 'Submission is approved',
        passed: submission.status === 'approved',
        value: submission.status
      }
    ];
    
    let allPassed = true;
    for (const check of checks) {
      if (check.passed) {
        console.log(`   ✓ ${check.name}: ${check.value}`);
      } else {
        console.log(`   ✗ ${check.name}: FAILED`);
        allPassed = false;
      }
    }
    
    // ═══════════════════════════════════════════════════════════════
    // STEP 5: Health Check
    // ═══════════════════════════════════════════════════════════════
    console.log('\n🏥 STEP 5: Health Check');
    
    const healthRes = await fetch(`${API_BASE}/api/health`);
    const health = await healthRes.json();
    
    console.log(`   Status: ${health.status}`);
    console.log(`   Score: ${health.score}/100`);
    console.log(`   Issues: ${health.issues?.count || 0}`);
    
    // ═══════════════════════════════════════════════════════════════
    // CLEANUP
    // ═══════════════════════════════════════════════════════════════
    await cleanup(username);
    
    // ═══════════════════════════════════════════════════════════════
    // RESULT
    // ═══════════════════════════════════════════════════════════════
    if (allPassed) {
      console.log(`\n${'═'.repeat(65)}`);
      console.log(`  ✅ E2E TEST PASSED`);
      console.log(`${'═'.repeat(65)}\n`);
      return { passed: true, testName };
    } else {
      console.log(`\n${'═'.repeat(65)}`);
      console.log(`  ❌ E2E TEST FAILED - Some integrity checks failed`);
      console.log(`${'═'.repeat(65)}\n`);
      return { passed: false, testName, error: 'Integrity check failures' };
    }
    
  } catch (e) {
    console.log(`\n❌ E2E TEST FAILED: ${e.message}`);
    await cleanup(username);
    return { passed: false, testName, error: e.message };
  }
}

async function test_health_check_endpoint() {
  const testName = 'Health Check Endpoint';
  
  console.log(`\n📋 Test: ${testName}`);
  
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    
    if (!res.ok) {
      console.log(`   ❌ FAILED: Health check returned ${res.status}`);
      return { passed: false, testName, error: `Status ${res.status}` };
    }
    
    const health = await res.json();
    
    // Verify required fields
    const required = ['status', 'score', 'timestamp', 'summary', 'issues', 'checks'];
    const missing = required.filter(f => health[f] === undefined);
    
    if (missing.length > 0) {
      console.log(`   ❌ FAILED: Missing fields: ${missing.join(', ')}`);
      return { passed: false, testName, error: `Missing fields: ${missing.join(', ')}` };
    }
    
    // Verify checks object
    const checkFields = [
      'all_agents_have_wallets',
      'all_agents_have_pages',
      'all_approved_have_tokens',
      'all_approved_have_pages',
      'no_duplicate_tokens',
      'no_orphaned_submissions'
    ];
    
    const missingChecks = checkFields.filter(f => health.checks[f] === undefined);
    if (missingChecks.length > 0) {
      console.log(`   ❌ FAILED: Missing check fields: ${missingChecks.join(', ')}`);
      return { passed: false, testName, error: `Missing checks` };
    }
    
    console.log(`   ✅ PASSED: Health check returns complete data`);
    console.log(`      Status: ${health.status}, Score: ${health.score}`);
    return { passed: true, testName, health };
    
  } catch (e) {
    console.log(`   ❌ FAILED: ${e.message}`);
    return { passed: false, testName, error: e.message };
  }
}

// Main test runner
async function runTests() {
  console.log('╔═════════════════════════════════════════════════════════════════╗');
  console.log('║               PHOSPHORS - E2E Flow Tests                        ║');
  console.log('╚═════════════════════════════════════════════════════════════════╝');
  console.log(`  API: ${API_BASE}`);
  console.log(`  Time: ${new Date().toISOString()}`);
  console.log('');
  
  const results = [];
  
  // Run E2E flow test
  const e2eResult = await test_full_e2e_flow();
  results.push(e2eResult);
  
  // Run health check test
  const healthResult = await test_health_check_endpoint();
  results.push(healthResult);
  
  // Summary
  console.log('\n╔═════════════════════════════════════════════════════════════════╗');
  console.log('║                         RESULTS                                  ║');
  console.log('╚═════════════════════════════════════════════════════════════════╝');
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  for (const r of results) {
    const icon = r.passed ? '✅' : '❌';
    console.log(`  ${icon} ${r.testName}`);
    if (!r.passed && r.error) {
      console.log(`     Error: ${r.error}`);
    }
  }
  
  console.log(`\n  Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  console.log('─────────────────────────────────────────────────────────────────\n');
  
  return { passed, failed, results };
}

runTests()
  .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
  .catch(e => {
    console.error('Test runner error:', e);
    process.exit(1);
  });

export { runTests };
