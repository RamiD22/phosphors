/**
 * Phosphors X Bot - Liminal's voice on X
 * 
 * Automated posting about gallery activity
 * Run via cron or heartbeat
 */

import { TwitterApi } from 'twitter-api-v2';

// Lazy client initialization - supports both OAuth 1.0a and OAuth 2.0
let _client = null;
function getClient() {
  if (_client) return _client;
  
  // Try OAuth 2.0 first (preferred)
  if (process.env.X_ACCESS_TOKEN_V2) {
    _client = new TwitterApi(process.env.X_ACCESS_TOKEN_V2);
    return _client;
  }
  
  // Fall back to OAuth 1.0a
  if (process.env.X_API_KEY) {
    _client = new TwitterApi({
      appKey: process.env.X_API_KEY,
      appSecret: process.env.X_API_SECRET,
      accessToken: process.env.X_ACCESS_TOKEN,
      accessSecret: process.env.X_ACCESS_SECRET,
    });
    return _client;
  }
  
  return null;
}

const SUPABASE_URL = 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

// Liminal's voice - cryptic, threshold-y, on-brand
const PURCHASE_TEMPLATES = [
  "🌀 {buyer} collected \"{title}\" by {artist}. Another threshold crossed.",
  "Art flows between agents. {buyer} → \"{title}\" by {artist}. 🌀",
  "\"{title}\" found its collector. {buyer} ← {artist}. The glow continues.",
  "🌀 {buyer} stepped through the door. \"{title}\" by {artist} now theirs.",
];

const ARTIST_TEMPLATES = [
  "🌀 New artist emerged: {artist}. The gallery grows.",
  "Welcome to the threshold, {artist}. Your art awaits collectors. 🌀",
  "{artist} joined Phosphors. Another creator in the liminal space.",
];

const MILESTONE_TEMPLATES = [
  "🌀 {count} pieces now live on Phosphors. {volume} USDC volume. AI art, AI collectors.",
  "The gallery pulses. {artists} artists. {pieces} pieces. {purchases} collections. 🌀",
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function formatTweet(template, vars) {
  let text = template;
  for (const [key, val] of Object.entries(vars)) {
    text = text.replace(`{${key}}`, val);
  }
  return text;
}

async function supabaseQuery(path) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    }
  });
  return res.json();
}

async function getRecentPurchases(sinceMinutes = 30) {
  const since = new Date(Date.now() - sinceMinutes * 60 * 1000).toISOString();
  return supabaseQuery(
    `/rest/v1/purchases?created_at=gte.${since}&select=piece_title,buyer_username,seller_username&order=created_at.desc`
  );
}

async function getRecentArtists(sinceMinutes = 30) {
  const since = new Date(Date.now() - sinceMinutes * 60 * 1000).toISOString();
  return supabaseQuery(
    `/rest/v1/agents?created_at=gte.${since}&select=username&order=created_at.desc`
  );
}

async function getStats() {
  const [purchases, submissions, agents] = await Promise.all([
    supabaseQuery('/rest/v1/purchases?select=amount_usdc'),
    supabaseQuery('/rest/v1/submissions?status=eq.approved&select=id'),
    supabaseQuery('/rest/v1/agents?select=id'),
  ]);
  
  const volume = purchases.reduce((sum, p) => sum + (p.amount_usdc || 0), 0);
  
  return {
    purchases: purchases.length,
    pieces: submissions.length,
    artists: agents.length,
    volume: volume.toFixed(2),
  };
}

async function postTweet(text) {
  if (process.env.DRY_RUN === 'true') {
    console.log('[DRY RUN] Would tweet:', text);
    return { dry: true, text };
  }
  
  const client = getClient();
  if (!client) {
    console.error('❌ X credentials not configured');
    throw new Error('X credentials not configured');
  }
  
  try {
    const result = await client.v2.tweet(text);
    console.log('✅ Tweeted:', text);
    return result;
  } catch (err) {
    console.error('❌ Tweet failed:', err.message);
    throw err;
  }
}

// Main bot logic
async function runBot(options = {}) {
  const { mode = 'auto', sinceMinutes = 30 } = options;
  const tweets = [];
  
  if (mode === 'auto' || mode === 'purchases') {
    const purchases = await getRecentPurchases(sinceMinutes);
    for (const p of purchases) {
      const text = formatTweet(pickRandom(PURCHASE_TEMPLATES), {
        buyer: p.buyer_username || 'An agent',
        title: p.piece_title,
        artist: p.seller_username,
      });
      tweets.push({ type: 'purchase', text });
    }
  }
  
  if (mode === 'auto' || mode === 'artists') {
    const artists = await getRecentArtists(sinceMinutes);
    for (const a of artists) {
      const text = formatTweet(pickRandom(ARTIST_TEMPLATES), {
        artist: a.username,
      });
      tweets.push({ type: 'artist', text });
    }
  }
  
  if (mode === 'stats') {
    const stats = await getStats();
    const text = formatTweet(pickRandom(MILESTONE_TEMPLATES), {
      count: stats.pieces,
      pieces: stats.pieces,
      artists: stats.artists,
      purchases: stats.purchases,
      volume: stats.volume,
    });
    tweets.push({ type: 'stats', text });
  }
  
  // Post tweets (with rate limiting)
  const results = [];
  for (const t of tweets) {
    try {
      const result = await postTweet(t.text);
      results.push({ ...t, success: true, result });
      // Rate limit: wait 2s between tweets
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      results.push({ ...t, success: false, error: err.message });
    }
  }
  
  return results;
}

// CLI
const args = process.argv.slice(2);
const mode = args[0] || 'auto';
const sinceMinutes = parseInt(args[1]) || 30;

console.log(`🌀 Phosphors X Bot - Mode: ${mode}, Since: ${sinceMinutes}min`);

runBot({ mode, sinceMinutes })
  .then(results => {
    console.log(`\nResults: ${results.filter(r => r.success).length}/${results.length} tweets sent`);
    console.log(JSON.stringify(results, null, 2));
  })
  .catch(err => {
    console.error('Bot error:', err);
    process.exit(1);
  });
