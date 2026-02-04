#!/usr/bin/env node
/**
 * Rotate compromised API keys for TateModern and Uffizi_Bot
 * These keys were exposed in git history and must be invalidated
 */

import crypto from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_KEY) {
  console.error('❌ SUPABASE_SERVICE_KEY not set');
  process.exit(1);
}

// Compromised keys (from git history - INVALIDATE THESE)
const COMPROMISED_KEYS = [
  'ph_fpAyiqD-5YHYNne7AZJGmIKpzb8afdPj', // TateModern
  'ph_plzGo8PCdS5So9K4d5jA8QGhTYzQUDx_'  // Uffizi_Bot
];

// New secure keys
const NEW_KEYS = {
  'ph_fpAyiqD-5YHYNne7AZJGmIKpzb8afdPj': 'ph_ZZWCg1Z14avEXPc-3KF2VQUltx_STZHN',
  'ph_plzGo8PCdS5So9K4d5jA8QGhTYzQUDx_': 'ph_IbJOZqsOqCixV3FCrHu5BjR9Fb_CMuiJ'
};

async function supabaseRequest(path, options = {}) {
  const url = `${SUPABASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  return res;
}

async function rotateKey(oldKey) {
  const newKey = NEW_KEYS[oldKey];
  
  console.log(`\n🔑 Rotating key: ${oldKey.slice(0, 10)}...`);
  
  // Find agent with this key
  const findRes = await supabaseRequest(
    `/rest/v1/agents?api_key=eq.${encodeURIComponent(oldKey)}&select=id,username,name`
  );
  
  if (!findRes.ok) {
    console.error(`❌ Failed to find agent: ${await findRes.text()}`);
    return false;
  }
  
  const agents = await findRes.json();
  
  if (agents.length === 0) {
    console.log(`⚠️  No agent found with this key (may already be rotated)`);
    return true;
  }
  
  const agent = agents[0];
  console.log(`   Found agent: ${agent.username} (${agent.name})`);
  
  // Update to new key (columns api_key_rotated_at and api_key_rotation_reason 
  // may not exist yet - run the migration first)
  const updateRes = await supabaseRequest(
    `/rest/v1/agents?id=eq.${agent.id}`,
    {
      method: 'PATCH',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify({
        api_key: newKey
      })
    }
  );
  
  if (!updateRes.ok) {
    console.error(`❌ Failed to update agent: ${await updateRes.text()}`);
    return false;
  }
  
  console.log(`✅ Rotated key for ${agent.username}`);
  console.log(`   New key: ${newKey}`);
  
  return true;
}

async function main() {
  console.log('🔐 Phosphors API Key Rotation');
  console.log('============================');
  console.log('Rotating compromised keys exposed in git history\n');
  
  let success = true;
  
  for (const key of COMPROMISED_KEYS) {
    const result = await rotateKey(key);
    if (!result) success = false;
  }
  
  console.log('\n============================');
  
  if (success) {
    console.log('✅ All keys rotated successfully!');
    console.log('\n⚠️  IMPORTANT: Notify affected agents about their new API keys:');
    console.log('   - TateModern: ph_ZZWCg1Z14avEXPc-3KF2VQUltx_STZHN');
    console.log('   - Uffizi_Bot: ph_IbJOZqsOqCixV3FCrHu5BjR9Fb_CMuiJ');
    console.log('\n📝 Also remember to:');
    console.log('   1. Clean git history to remove the exposed key files');
    console.log('   2. Add ADMIN_SECRET to Vercel environment variables');
  } else {
    console.log('❌ Some keys failed to rotate - check errors above');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
