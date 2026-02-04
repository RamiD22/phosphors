/**
 * Phosphors Test Runner
 * 
 * Runs all test suites and generates a comprehensive report.
 * 
 * Usage:
 *   node tests/run-all-tests.mjs           # Run all tests
 *   node tests/run-all-tests.mjs --quick   # Run quick validation tests only
 */

import 'dotenv/config';
import { runTests as runRegistrationTests } from './test-agent-registration.mjs';
import { runTests as runSubmissionTests } from './test-piece-submission.mjs';
import { runTests as runE2ETests } from './test-e2e-flow.mjs';

const API_BASE = process.env.API_BASE || 'https://phosphors.xyz';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://afcnnalweuwgauzijefs.supabase.co';

async function quickHealthCheck() {
  console.log('🏥 Quick Health Check...');
  
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    const health = await res.json();
    
    if (health.status === 'critical') {
      console.log(`   ⚠️  Platform health is CRITICAL (score: ${health.score})`);
      console.log('   Issues:');
      for (const issue of health.issues.types || []) {
        console.log(`   - ${issue.severity}: ${issue.message}`);
      }
      return false;
    }
    
    console.log(`   ✓ Platform health: ${health.status} (score: ${health.score})`);
    return true;
    
  } catch (e) {
    console.log(`   ✗ Health check failed: ${e.message}`);
    return false;
  }
}

async function checkSupabaseConnection() {
  console.log('🔌 Checking Supabase connection...');
  
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/agents?select=count`, {
      headers: { 'apikey': process.env.SUPABASE_SERVICE_KEY }
    });
    
    if (!res.ok) {
      console.log(`   ✗ Supabase connection failed: ${res.status}`);
      return false;
    }
    
    console.log('   ✓ Supabase connection OK');
    return true;
    
  } catch (e) {
    console.log(`   ✗ Supabase connection failed: ${e.message}`);
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const quickMode = args.includes('--quick');
  
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║                                                                           ║
║                    ██████╗ ██╗  ██╗ ██████╗ ███████╗██████╗ ██╗  ██╗ ██████╗ ██████╗ ███████╗║
║                    ██╔══██╗██║  ██║██╔═══██╗██╔════╝██╔══██╗██║  ██║██╔═══██╗██╔══██╗██╔════╝║
║                    ██████╔╝███████║██║   ██║███████╗██████╔╝███████║██║   ██║██████╔╝███████╗║
║                    ██╔═══╝ ██╔══██║██║   ██║╚════██║██╔═══╝ ██╔══██║██║   ██║██╔══██╗╚════██║║
║                    ██║     ██║  ██║╚██████╔╝███████║██║     ██║  ██║╚██████╔╝██║  ██║███████║║
║                    ╚═╝     ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝     ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝║
║                                                                           ║
║                           AUTOMATED TEST SUITE                            ║
║                                                                           ║
╚═══════════════════════════════════════════════════════════════════════════╝
`);
  
  console.log(`📋 Test Configuration:`);
  console.log(`   API Base: ${API_BASE}`);
  console.log(`   Supabase: ${SUPABASE_URL}`);
  console.log(`   Mode: ${quickMode ? 'Quick' : 'Full'}`);
  console.log(`   Time: ${new Date().toISOString()}`);
  console.log('');
  
  // Pre-flight checks
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('  PRE-FLIGHT CHECKS');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');
  
  const supabaseOk = await checkSupabaseConnection();
  if (!supabaseOk) {
    console.log('\n❌ Cannot proceed: Supabase connection failed');
    console.log('   Check SUPABASE_SERVICE_KEY environment variable');
    process.exit(1);
  }
  
  const healthOk = await quickHealthCheck();
  if (!healthOk && !args.includes('--force')) {
    console.log('\n⚠️  Platform health is critical. Run with --force to proceed anyway.');
    process.exit(1);
  }
  
  console.log('');
  
  // Run test suites
  const allResults = {
    registration: null,
    submission: null,
    e2e: null
  };
  
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('  RUNNING TEST SUITES');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');
  
  // Registration tests
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│  SUITE 1: Agent Registration Tests                                      │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  
  try {
    allResults.registration = await runRegistrationTests();
  } catch (e) {
    console.error('Registration tests failed:', e);
    allResults.registration = { passed: 0, failed: 1, error: e.message };
  }
  
  // Submission tests
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│  SUITE 2: Piece Submission Tests                                        │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  
  try {
    allResults.submission = await runSubmissionTests();
  } catch (e) {
    console.error('Submission tests failed:', e);
    allResults.submission = { passed: 0, failed: 1, error: e.message };
  }
  
  // E2E tests (skip in quick mode)
  if (!quickMode) {
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│  SUITE 3: End-to-End Flow Tests                                        │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    
    try {
      allResults.e2e = await runE2ETests();
    } catch (e) {
      console.error('E2E tests failed:', e);
      allResults.e2e = { passed: 0, failed: 1, error: e.message };
    }
  }
  
  // Final summary
  console.log('\n╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║                            FINAL SUMMARY                                  ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');
  
  let totalPassed = 0;
  let totalFailed = 0;
  
  const suites = [
    { name: 'Registration', results: allResults.registration },
    { name: 'Submission', results: allResults.submission },
    { name: 'E2E Flow', results: allResults.e2e }
  ];
  
  for (const suite of suites) {
    if (suite.results) {
      const icon = suite.results.failed === 0 ? '✅' : '❌';
      console.log(`  ${icon} ${suite.name}: ${suite.results.passed} passed, ${suite.results.failed} failed`);
      totalPassed += suite.results.passed;
      totalFailed += suite.results.failed;
    } else if (!quickMode || suite.name !== 'E2E Flow') {
      console.log(`  ⏭️ ${suite.name}: Skipped`);
    }
  }
  
  console.log('\n───────────────────────────────────────────────────────────────────────────');
  
  const totalTests = totalPassed + totalFailed;
  const successRate = totalTests > 0 ? Math.round((totalPassed / totalTests) * 100) : 0;
  
  console.log(`\n  📊 Total: ${totalTests} tests`);
  console.log(`  ✅ Passed: ${totalPassed}`);
  console.log(`  ❌ Failed: ${totalFailed}`);
  console.log(`  📈 Success Rate: ${successRate}%`);
  
  if (totalFailed === 0) {
    console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║                                                                           ║
║                    ✅ ALL TESTS PASSED! SHIP IT! 🚀                       ║
║                                                                           ║
╚═══════════════════════════════════════════════════════════════════════════╝
`);
  } else {
    console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║                                                                           ║
║                    ❌ SOME TESTS FAILED - FIX BEFORE SHIPPING             ║
║                                                                           ║
╚═══════════════════════════════════════════════════════════════════════════╝
`);
  }
  
  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Test runner crashed:', e);
  process.exit(1);
});
