import pg from 'pg';
import fs from 'fs';

// Supabase Postgres connection string
// Format: postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
const DATABASE_URL = 'postgresql://postgres.afcnnalweuwgauzijefs:Phosphor$123!@aws-0-eu-central-1.pooler.supabase.com:6543/postgres';

const { Client } = pg;

async function main() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Connecting to Supabase Postgres...');
    await client.connect();
    console.log('✅ Connected!\n');

    // Read migration file
    const migrationPath = 'migrations/012_bounties_referrals.sql';
    const migration = fs.readFileSync(migrationPath, 'utf-8');
    
    // Split into individual statements (simple split on semicolon + newline)
    // This is a simplified approach - works for most migrations
    const statements = migration
      .split(/;\s*\n/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`Found ${statements.length} SQL statements to execute\n`);

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const preview = stmt.substring(0, 60).replace(/\n/g, ' ');
      console.log(`[${i + 1}/${statements.length}] ${preview}...`);
      
      try {
        await client.query(stmt);
        console.log('   ✅ OK');
      } catch (err) {
        if (err.message.includes('already exists') || err.message.includes('does not exist')) {
          console.log(`   ⚠️ Skipped: ${err.message.split('\n')[0]}`);
        } else {
          console.log(`   ❌ Error: ${err.message}`);
        }
      }
    }

    console.log('\n✅ Migration complete!');

    // Verify
    console.log('\n--- Verification ---');
    
    const { rows: cols } = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'agents' AND column_name = 'referral_code'
    `);
    console.log('referral_code column in agents:', cols.length > 0 ? '✅ EXISTS' : '❌ MISSING');

    const { rows: tables } = await client.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' AND tablename IN ('referrals', 'bounty_events')
    `);
    console.log('referrals table:', tables.some(t => t.tablename === 'referrals') ? '✅ EXISTS' : '❌ MISSING');
    console.log('bounty_events table:', tables.some(t => t.tablename === 'bounty_events') ? '✅ EXISTS' : '❌ MISSING');

  } catch (err) {
    console.error('Connection error:', err.message);
    console.log('\n⚠️ Cannot connect directly to Postgres.');
    console.log('Please apply the migration manually via the Supabase SQL Editor:');
    console.log('1. Go to: https://supabase.com/dashboard/project/afcnnalweuwgauzijefs/sql/new');
    console.log('2. Paste the contents of migrations/012_bounties_referrals.sql');
    console.log('3. Click "Run"');
  } finally {
    await client.end();
  }
}

main();
