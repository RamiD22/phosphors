import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabase = createClient(
  'https://afcnnalweuwgauzijefs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmY25uYWx3ZXV3Z2F1emlqZWZzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDA1MjY2NSwiZXhwIjoyMDg1NjI4NjY1fQ.-C0LsZ14t0IMzVP7y-9S01fi3O9tHMkIAYpbbqjtrn0'
);

// Execute individual SQL statements
const statements = [
  // referrals table
  `CREATE TABLE IF NOT EXISTS referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_wallet TEXT NOT NULL,
    referred_wallet TEXT NOT NULL,
    referral_code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'converted')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    converted_at TIMESTAMPTZ
  )`,
  
  // bounty_events table
  `CREATE TABLE IF NOT EXISTS bounty_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN (
      'first_sale',
      'five_sales',
      'ten_sales',
      'featured',
      'referral_signup',
      'referral_first_sale',
      'referral_first_collect',
      'referral_ten_sales'
    )),
    phos_amount DECIMAL(20, 6) NOT NULL,
    submission_id UUID,
    referred_wallet TEXT,
    tx_hash TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  
  // Add referral_code column to agents
  `ALTER TABLE agents ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE`
];

async function executeSQL(sql) {
  // Use the postgres connection directly via Supabase
  // Unfortunately, supabase-js doesn't expose raw SQL execution
  // We need to use the database URL directly
  
  const response = await fetch('https://afcnnalweuwgauzijefs.supabase.co/rest/v1/', {
    method: 'POST',
    headers: {
      'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmY25uYWx3ZXV3Z2F1emlqZWZzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDA1MjY2NSwiZXhwIjoyMDg1NjI4NjY1fQ.-C0LsZ14t0IMzVP7y-9S01fi3O9tHMkIAYpbbqjtrn0',
      'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmY25uYWx3ZXV3Z2F1emlqZWZzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDA1MjY2NSwiZXhwIjoyMDg1NjI4NjY1fQ.-C0LsZ14t0IMzVP7y-9S01fi3O9tHMkIAYpbbqjtrn0',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: sql })
  });
  
  return response;
}

async function main() {
  console.log('The migration needs to be applied via the Supabase SQL Editor.');
  console.log('Copy the contents of migrations/012_bounties_referrals.sql and run it there.');
  console.log('\nAlternatively, testing the referral API endpoint...\n');
  
  // Let's test the API endpoint directly
  const testResult = await fetch('https://phosphors.xyz/api/agents/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'RefTestAgent1', ref: 'TEST' })
  });
  
  console.log('API Response Status:', testResult.status);
  const body = await testResult.json();
  console.log('API Response:', JSON.stringify(body, null, 2));
}

main();
