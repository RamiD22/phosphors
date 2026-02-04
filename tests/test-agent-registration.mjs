/**
 * Test: Agent Registration Flow
 * 
 * Tests the atomic registration flow:
 * 1. Create wallet
 * 2. Fund wallet
 * 3. Create profile page
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

// Test configuration
const TEST_PREFIX = 'test_';
const generateTestUsername = () => `${TEST_PREFIX}agent_${Date.now()}`;

async function supabaseRequest(path, options = {}) {
  const url = `${SUPABASE_URL}${path}`;
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    ...options.headers
  };
  return fetch(url, { ...options, headers });
}

async function cleanup(username) {
  console.log(`\n🧹 Cleaning up test data for ${username}...`);
  
  // Delete from DB
  try {
    await supabaseRequest(`/rest/v1/agents?username=eq.${username}`, {
      method: 'DELETE'
    });
    console.log('   ✓ DB record deleted');
  } catch (e) {
    console.log('   ⚠️ Could not delete DB record:', e.message);
  }
  
  // Delete profile page
  const pagePath = path.join(SITE_DIR, 'artist', `${username}.html`);
  if (existsSync(pagePath)) {
    try {
      await unlink(pagePath);
      console.log('   ✓ Profile page deleted');
    } catch (e) {
      console.log('   ⚠️ Could not delete profile page:', e.message);
    }
  }
}

async function test_registration_creates_wallet() {
  const testName = 'Registration creates wallet';
  const username = generateTestUsername();
  
  console.log(`\n📋 Test: ${testName}`);
  console.log(`   Username: ${username}`);
  
  try {
    // Register without providing wallet
    const response = await fetch(`${API_BASE}/api/agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Agent',
        username: username,
        description: 'A test agent for automated testing',
        emoji: '🧪'
      })
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      console.log(`   ❌ FAILED: Registration returned ${response.status}`);
      console.log(`   Error: ${JSON.stringify(result.error)}`);
      return { passed: false, testName, error: result.error };
    }
    
    // Verify wallet was created
    if (!result.data?.agent?.wallet) {
      console.log('   ❌ FAILED: No wallet in response');
      await cleanup(username);
      return { passed: false, testName, error: 'No wallet created' };
    }
    
    const wallet = result.data.agent.wallet;
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      console.log(`   ❌ FAILED: Invalid wallet format: ${wallet}`);
      await cleanup(username);
      return { passed: false, testName, error: 'Invalid wallet format' };
    }
    
    console.log(`   ✅ PASSED: Wallet created: ${wallet.slice(0, 10)}...`);
    await cleanup(username);
    return { passed: true, testName, wallet };
    
  } catch (e) {
    console.log(`   ❌ FAILED: ${e.message}`);
    await cleanup(username);
    return { passed: false, testName, error: e.message };
  }
}

async function test_registration_creates_page() {
  const testName = 'Registration creates profile page';
  const username = generateTestUsername();
  
  console.log(`\n📋 Test: ${testName}`);
  console.log(`   Username: ${username}`);
  
  try {
    const response = await fetch(`${API_BASE}/api/agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Agent',
        username: username,
        description: 'A test agent for page creation test',
        emoji: '📄'
      })
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      console.log(`   ❌ FAILED: Registration returned ${response.status}`);
      return { passed: false, testName, error: result.error };
    }
    
    // Check if page URL is returned
    const pageUrl = result.data?.agent?.page_url;
    if (!pageUrl) {
      console.log('   ❌ FAILED: No page_url in response');
      await cleanup(username);
      return { passed: false, testName, error: 'No page_url returned' };
    }
    
    // Verify page file exists
    const pagePath = path.join(SITE_DIR, 'artist', `${username}.html`);
    if (!existsSync(pagePath)) {
      console.log(`   ❌ FAILED: Page file does not exist at ${pagePath}`);
      await cleanup(username);
      return { passed: false, testName, error: 'Page file not created' };
    }
    
    console.log(`   ✅ PASSED: Profile page created at ${pageUrl}`);
    await cleanup(username);
    return { passed: true, testName, pageUrl };
    
  } catch (e) {
    console.log(`   ❌ FAILED: ${e.message}`);
    await cleanup(username);
    return { passed: false, testName, error: e.message };
  }
}

async function test_registration_inserts_db() {
  const testName = 'Registration inserts DB record';
  const username = generateTestUsername();
  
  console.log(`\n📋 Test: ${testName}`);
  console.log(`   Username: ${username}`);
  
  try {
    const response = await fetch(`${API_BASE}/api/agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Agent DB',
        username: username,
        description: 'A test agent for DB insertion test',
        emoji: '💾'
      })
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      console.log(`   ❌ FAILED: Registration returned ${response.status}`);
      return { passed: false, testName, error: result.error };
    }
    
    // Verify DB record exists
    const dbRes = await supabaseRequest(
      `/rest/v1/agents?username=eq.${username}&select=*`
    );
    const agents = await dbRes.json();
    
    if (agents.length === 0) {
      console.log('   ❌ FAILED: No DB record found');
      await cleanup(username);
      return { passed: false, testName, error: 'DB record not created' };
    }
    
    const agent = agents[0];
    
    // Verify required fields
    const required = ['id', 'username', 'wallet', 'api_key', 'page_url'];
    const missing = required.filter(f => !agent[f]);
    
    if (missing.length > 0) {
      console.log(`   ❌ FAILED: Missing fields: ${missing.join(', ')}`);
      await cleanup(username);
      return { passed: false, testName, error: `Missing fields: ${missing.join(', ')}` };
    }
    
    console.log(`   ✅ PASSED: DB record created with ID ${agent.id}`);
    await cleanup(username);
    return { passed: true, testName, agentId: agent.id };
    
  } catch (e) {
    console.log(`   ❌ FAILED: ${e.message}`);
    await cleanup(username);
    return { passed: false, testName, error: e.message };
  }
}

async function test_registration_duplicate_rejected() {
  const testName = 'Registration rejects duplicate username';
  const username = generateTestUsername();
  
  console.log(`\n📋 Test: ${testName}`);
  console.log(`   Username: ${username}`);
  
  try {
    // First registration should succeed
    const response1 = await fetch(`${API_BASE}/api/agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'First Agent',
        username: username,
        emoji: '1️⃣'
      })
    });
    
    if (!response1.ok) {
      console.log('   ❌ FAILED: First registration failed');
      return { passed: false, testName, error: 'First registration failed' };
    }
    
    // Second registration with same username should fail
    const response2 = await fetch(`${API_BASE}/api/agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Second Agent',
        username: username,
        emoji: '2️⃣'
      })
    });
    
    if (response2.ok) {
      console.log('   ❌ FAILED: Duplicate registration was accepted');
      await cleanup(username);
      return { passed: false, testName, error: 'Duplicate accepted' };
    }
    
    const result2 = await response2.json();
    
    if (result2.error?.code !== 'ALREADY_EXISTS') {
      console.log(`   ❌ FAILED: Wrong error code: ${result2.error?.code}`);
      await cleanup(username);
      return { passed: false, testName, error: 'Wrong error code' };
    }
    
    console.log(`   ✅ PASSED: Duplicate correctly rejected with ALREADY_EXISTS`);
    await cleanup(username);
    return { passed: true, testName };
    
  } catch (e) {
    console.log(`   ❌ FAILED: ${e.message}`);
    await cleanup(username);
    return { passed: false, testName, error: e.message };
  }
}

async function test_registration_with_provided_wallet() {
  const testName = 'Registration with provided wallet';
  const username = generateTestUsername();
  const providedWallet = '0x1234567890123456789012345678901234567890';
  
  console.log(`\n📋 Test: ${testName}`);
  console.log(`   Username: ${username}`);
  console.log(`   Provided wallet: ${providedWallet}`);
  
  try {
    const response = await fetch(`${API_BASE}/api/agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Wallet Test Agent',
        username: username,
        wallet: providedWallet,
        emoji: '💰'
      })
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      console.log(`   ❌ FAILED: Registration returned ${response.status}`);
      return { passed: false, testName, error: result.error };
    }
    
    // Verify the provided wallet was used (not a new one created)
    const returnedWallet = result.data?.agent?.wallet?.toLowerCase();
    if (returnedWallet !== providedWallet.toLowerCase()) {
      console.log(`   ❌ FAILED: Wallet mismatch. Got: ${returnedWallet}`);
      await cleanup(username);
      return { passed: false, testName, error: 'Wallet mismatch' };
    }
    
    console.log(`   ✅ PASSED: Provided wallet used correctly`);
    await cleanup(username);
    return { passed: true, testName };
    
  } catch (e) {
    console.log(`   ❌ FAILED: ${e.message}`);
    await cleanup(username);
    return { passed: false, testName, error: e.message };
  }
}

// Main test runner
async function runTests() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PHOSPHORS - Agent Registration Tests');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  API: ${API_BASE}`);
  console.log(`  Time: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════════════');
  
  const tests = [
    test_registration_creates_wallet,
    test_registration_creates_page,
    test_registration_inserts_db,
    test_registration_duplicate_rejected,
    test_registration_with_provided_wallet
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
    
    // Small delay between tests
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

// Run if called directly
runTests()
  .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
  .catch(e => {
    console.error('Test runner error:', e);
    process.exit(1);
  });

export { runTests };
