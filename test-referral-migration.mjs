import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://afcnnalweuwgauzijefs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmY25uYWx3ZXV3Z2F1emlqZWZzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDA1MjY2NSwiZXhwIjoyMDg1NjI4NjY1fQ.-C0LsZ14t0IMzVP7y-9S01fi3O9tHMkIAYpbbqjtrn0'
);

async function checkSchema() {
  console.log('Checking if referral_code column exists in agents...');
  const { data, error } = await supabase.from('agents').select('referral_code').limit(1);
  
  if (error && error.code === '42703') {
    console.log('❌ referral_code column does NOT exist');
    return false;
  } else if (error) {
    console.log('Other error:', error);
    return false;
  }
  
  console.log('✅ referral_code column exists');
  return true;
}

async function checkReferralsTable() {
  console.log('\nChecking if referrals table exists...');
  const { data, error } = await supabase.from('referrals').select('*').limit(1);
  
  if (error && error.message.includes('Could not find the table')) {
    console.log('❌ referrals table does NOT exist');
    return false;
  } else if (error) {
    console.log('Other error:', error);
    return false;
  }
  
  console.log('✅ referrals table exists');
  return true;
}

async function checkBountyEventsTable() {
  console.log('\nChecking if bounty_events table exists...');
  const { data, error } = await supabase.from('bounty_events').select('*').limit(1);
  
  if (error && error.message.includes('Could not find the table')) {
    console.log('❌ bounty_events table does NOT exist');
    return false;
  } else if (error) {
    console.log('Other error:', error);
    return false;
  }
  
  console.log('✅ bounty_events table exists');
  return true;
}

async function main() {
  const hasReferralCode = await checkSchema();
  const hasReferrals = await checkReferralsTable();
  const hasBountyEvents = await checkBountyEventsTable();
  
  if (!hasReferralCode || !hasReferrals || !hasBountyEvents) {
    console.log('\n⚠️  Migration 012_bounties_referrals.sql needs to be applied!');
    console.log('Please run it in the Supabase SQL Editor.');
  } else {
    console.log('\n✅ All referral schema elements exist!');
  }
}

main();
