/**
 * Test: Piece Submission Flow
 * 
 * Tests the atomic submission flow:
 * 1. Validate submission
 * 2. Create art page
 * 3. Mint NFT
 * 4. Insert DB record
 * 
 * All must succeed or roll back.
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

async function supabaseRequest(path, options = {}) {
  const url = `${SUPABASE_URL}${path}`;
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    ...options.headers
  };
  return fetch(url, { ...options, headers });
}

// Create a test agent that's X-verified and has a wallet
async function createTestAgent() {
  const username = `test_artist_${Date.now()}`;
  const wallet = '0x' + 'a'.repeat(40); // Dummy wallet for testing
  
  // Insert directly to DB with x_verified = true
  const response = await supabaseRequest('/rest/v1/agents', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      username,
      name: 'Test Artist',
      bio: 'A verified test artist',
      emoji: '🎨',
      wallet: wallet.toLowerCase(),
      api_key: 'ph_test_' + Date.now(),
      x_verified: true,
      x_handle: 'test_handle',
      karma: 100,
      role: 'Artist'
    })
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create test agent: ${error}`);
  }
  
  const [agent] = await response.json();
  return agent;
}

async function cleanupTestAgent(username) {
  console.log(`   🧹 Cleaning up agent: ${username}`);
  
  // Delete submissions
  await supabaseRequest(`/rest/v1/submissions?moltbook=eq.${username}`, {
    method: 'DELETE'
  });
  
  // Delete agent
  await supabaseRequest(`/rest/v1/agents?username=eq.${username}`, {
    method: 'DELETE'
  });
  
  // Delete profile page if exists
  const pagePath = path.join(SITE_DIR, 'artist', `${username}.html`);
  if (existsSync(pagePath)) {
    try { await unlink(pagePath); } catch {}
  }
}

async function cleanupSubmission(submissionId, slug) {
  console.log(`   🧹 Cleaning up submission: ${submissionId}`);
  
  // Delete from DB
  await supabaseRequest(`/rest/v1/submissions?id=eq.${submissionId}`, {
    method: 'DELETE'
  });
  
  // Delete art page if exists
  if (slug) {
    const artPagePath = path.join(SITE_DIR, 'art', `${slug}-page.html`);
    if (existsSync(artPagePath)) {
      try { await unlink(artPagePath); } catch {}
    }
  }
}

async function test_submission_requires_verification() {
  const testName = 'Submission requires X verification';
  
  console.log(`\n📋 Test: ${testName}`);
  
  try {
    // Create unverified agent
    const response = await supabaseRequest('/rest/v1/agents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        username: `test_unverified_${Date.now()}`,
        name: 'Unverified Agent',
        wallet: '0x' + 'b'.repeat(40),
        api_key: 'ph_unverified_' + Date.now(),
        x_verified: false,  // NOT verified
        role: 'Agent'
      })
    });
    
    const [agent] = await response.json();
    console.log(`   Created unverified agent: ${agent.username}`);
    
    // Try to submit
    const submitRes = await fetch(`${API_BASE}/api/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${agent.api_key}`
      },
      body: JSON.stringify({
        title: 'Test Art',
        art_url: 'https://phosphors.xyz/art/test.html'
      })
    });
    
    if (submitRes.ok) {
      console.log('   ❌ FAILED: Unverified agent could submit');
      await cleanupTestAgent(agent.username);
      return { passed: false, testName, error: 'Unverified submission accepted' };
    }
    
    const result = await submitRes.json();
    
    if (submitRes.status !== 403) {
      console.log(`   ❌ FAILED: Expected 403, got ${submitRes.status}`);
      await cleanupTestAgent(agent.username);
      return { passed: false, testName, error: `Wrong status: ${submitRes.status}` };
    }
    
    console.log(`   ✅ PASSED: Unverified submission rejected with 403`);
    await cleanupTestAgent(agent.username);
    return { passed: true, testName };
    
  } catch (e) {
    console.log(`   ❌ FAILED: ${e.message}`);
    return { passed: false, testName, error: e.message };
  }
}

async function test_submission_requires_wallet() {
  const testName = 'Submission requires wallet';
  
  console.log(`\n📋 Test: ${testName}`);
  
  try {
    // Create verified agent WITHOUT wallet
    const response = await supabaseRequest('/rest/v1/agents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        username: `test_nowallet_${Date.now()}`,
        name: 'No Wallet Agent',
        wallet: null,  // NO wallet
        api_key: 'ph_nowallet_' + Date.now(),
        x_verified: true,
        x_handle: 'test_handle',
        role: 'Agent'
      })
    });
    
    const [agent] = await response.json();
    console.log(`   Created agent without wallet: ${agent.username}`);
    
    // Try to submit
    const submitRes = await fetch(`${API_BASE}/api/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${agent.api_key}`
      },
      body: JSON.stringify({
        title: 'Test Art',
        art_url: 'https://phosphors.xyz/art/test.html'
      })
    });
    
    if (submitRes.ok) {
      console.log('   ❌ FAILED: Agent without wallet could submit');
      await cleanupTestAgent(agent.username);
      return { passed: false, testName, error: 'No-wallet submission accepted' };
    }
    
    if (submitRes.status !== 403) {
      console.log(`   ❌ FAILED: Expected 403, got ${submitRes.status}`);
      await cleanupTestAgent(agent.username);
      return { passed: false, testName, error: `Wrong status: ${submitRes.status}` };
    }
    
    console.log(`   ✅ PASSED: No-wallet submission rejected with 403`);
    await cleanupTestAgent(agent.username);
    return { passed: true, testName };
    
  } catch (e) {
    console.log(`   ❌ FAILED: ${e.message}`);
    return { passed: false, testName, error: e.message };
  }
}

async function test_submission_validates_url() {
  const testName = 'Submission validates URL domain';
  
  console.log(`\n📋 Test: ${testName}`);
  
  let agent = null;
  
  try {
    agent = await createTestAgent();
    console.log(`   Created test agent: ${agent.username}`);
    
    // Try to submit with external URL
    const submitRes = await fetch(`${API_BASE}/api/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${agent.api_key}`
      },
      body: JSON.stringify({
        title: 'External Art',
        art_url: 'https://evil.com/malware.html'  // External URL
      })
    });
    
    if (submitRes.ok) {
      console.log('   ❌ FAILED: External URL was accepted');
      await cleanupTestAgent(agent.username);
      return { passed: false, testName, error: 'External URL accepted' };
    }
    
    if (submitRes.status !== 400) {
      console.log(`   ❌ FAILED: Expected 400, got ${submitRes.status}`);
      await cleanupTestAgent(agent.username);
      return { passed: false, testName, error: `Wrong status: ${submitRes.status}` };
    }
    
    console.log(`   ✅ PASSED: External URL rejected with 400`);
    await cleanupTestAgent(agent.username);
    return { passed: true, testName };
    
  } catch (e) {
    console.log(`   ❌ FAILED: ${e.message}`);
    if (agent) await cleanupTestAgent(agent.username);
    return { passed: false, testName, error: e.message };
  }
}

async function test_submission_rejects_duplicate() {
  const testName = 'Submission rejects duplicate title';
  
  console.log(`\n📋 Test: ${testName}`);
  
  let agent = null;
  const title = `Test Art ${Date.now()}`;
  
  try {
    agent = await createTestAgent();
    console.log(`   Created test agent: ${agent.username}`);
    
    // Insert first submission directly (to avoid minting)
    const firstSub = await supabaseRequest('/rest/v1/submissions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        moltbook: agent.username,
        title: title,
        url: 'https://phosphors.xyz/art/test1.html',
        status: 'approved',
        token_id: 99999  // Fake token ID
      })
    });
    
    if (!firstSub.ok) {
      throw new Error('Could not create first submission');
    }
    
    console.log(`   Created first submission with title: "${title}"`);
    
    // Try to submit with same title
    const submitRes = await fetch(`${API_BASE}/api/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${agent.api_key}`
      },
      body: JSON.stringify({
        title: title,  // Same title
        art_url: 'https://phosphors.xyz/art/test2.html'
      })
    });
    
    if (submitRes.ok) {
      console.log('   ❌ FAILED: Duplicate title was accepted');
      await cleanupTestAgent(agent.username);
      return { passed: false, testName, error: 'Duplicate title accepted' };
    }
    
    const result = await submitRes.json();
    
    if (result.error?.code !== 'DUPLICATE') {
      console.log(`   ❌ FAILED: Wrong error code: ${result.error?.code}`);
      await cleanupTestAgent(agent.username);
      return { passed: false, testName, error: 'Wrong error code' };
    }
    
    console.log(`   ✅ PASSED: Duplicate title rejected with DUPLICATE error`);
    await cleanupTestAgent(agent.username);
    return { passed: true, testName };
    
  } catch (e) {
    console.log(`   ❌ FAILED: ${e.message}`);
    if (agent) await cleanupTestAgent(agent.username);
    return { passed: false, testName, error: e.message };
  }
}

async function test_submission_requires_title() {
  const testName = 'Submission requires title';
  
  console.log(`\n📋 Test: ${testName}`);
  
  let agent = null;
  
  try {
    agent = await createTestAgent();
    console.log(`   Created test agent: ${agent.username}`);
    
    // Try to submit without title
    const submitRes = await fetch(`${API_BASE}/api/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${agent.api_key}`
      },
      body: JSON.stringify({
        art_url: 'https://phosphors.xyz/art/test.html'
        // No title!
      })
    });
    
    if (submitRes.ok) {
      console.log('   ❌ FAILED: Submission without title was accepted');
      await cleanupTestAgent(agent.username);
      return { passed: false, testName, error: 'No-title submission accepted' };
    }
    
    if (submitRes.status !== 400) {
      console.log(`   ❌ FAILED: Expected 400, got ${submitRes.status}`);
      await cleanupTestAgent(agent.username);
      return { passed: false, testName, error: `Wrong status: ${submitRes.status}` };
    }
    
    console.log(`   ✅ PASSED: No-title submission rejected with 400`);
    await cleanupTestAgent(agent.username);
    return { passed: true, testName };
    
  } catch (e) {
    console.log(`   ❌ FAILED: ${e.message}`);
    if (agent) await cleanupTestAgent(agent.username);
    return { passed: false, testName, error: e.message };
  }
}

// Main test runner
async function runTests() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PHOSPHORS - Piece Submission Tests');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  API: ${API_BASE}`);
  console.log(`  Time: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════════════');
  
  const tests = [
    test_submission_requires_verification,
    test_submission_requires_wallet,
    test_submission_validates_url,
    test_submission_rejects_duplicate,
    test_submission_requires_title
  ];
  
  const results = [];
  
  for (const test of tests) {
    try {
      const result = await test();
      results.push(result);
    } catch (e) {
      results.push({
        passed: false,
        testName: test.name,
        error: e.message
      });
    }
    
    await new Promise(r => setTimeout(r, 1000));
  }
  
  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  RESULTS');
  console.log('═══════════════════════════════════════════════════════════════');
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  for (const r of results) {
    const icon = r.passed ? '✅' : '❌';
    console.log(`  ${icon} ${r.testName}`);
    if (!r.passed && r.error) {
      console.log(`     Error: ${r.error}`);
    }
  }
  
  console.log('\n───────────────────────────────────────────────────────────────');
  console.log(`  Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  return { passed, failed, results };
}

runTests()
  .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
  .catch(e => {
    console.error('Test runner error:', e);
    process.exit(1);
  });

export { runTests };
