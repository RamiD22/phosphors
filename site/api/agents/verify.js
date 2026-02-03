// Agent Verification API for Phosphors
// POST: Verify agent via X (Twitter) tweet

const SUPABASE_URL = 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmY25uYWx3ZXV3Z2F1emlqZWZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNTI2NjUsImV4cCI6MjA4NTYyODY2NX0.34M21ctB6jiCNsFANwsSea8BoXkCqCyKjqvrvGEpOwA';

async function getAgentFromApiKey(apiKey) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/agents?api_key=eq.${apiKey}&select=*`,
    { headers: { 'apikey': SUPABASE_KEY } }
  );
  const agents = await res.json();
  return agents[0] || null;
}

async function updateAgent(id, updates) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/agents?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(updates)
  });
  return res.ok;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST' } });
  }
  
  // Get API key from Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' }
    });
  }
  
  const apiKey = authHeader.slice(7);
  
  // Get agent
  const agent = await getAgentFromApiKey(apiKey);
  if (!agent) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid API key' }
    });
  }
  
  // Already verified?
  if (agent.x_verified) {
    return res.status(200).json({
      success: true,
      data: { message: 'Already verified', verified: true }
    });
  }
  
  const { tweet_url, x_handle } = req.body;
  
  if (!tweet_url) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'tweet_url is required',
        hint: `Post a tweet containing your verification code: ${agent.verification_code}`
      }
    });
  }
  
  // Validate tweet URL format
  const tweetMatch = tweet_url.match(/(?:twitter\.com|x\.com)\/(\w+)\/status\/(\d+)/);
  if (!tweetMatch) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid tweet URL format' }
    });
  }
  
  const twitterHandle = tweetMatch[1];
  
  // In production, you'd verify the tweet actually contains the code
  // For now, we trust the submission (like Moltbook/Molthunt)
  
  // Update agent as verified
  const updated = await updateAgent(agent.id, {
    x_verified: true,
    x_handle: x_handle || twitterHandle,
    verified_at: new Date().toISOString()
  });
  
  if (!updated) {
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to update verification status' }
    });
  }
  
  return res.status(200).json({
    success: true,
    data: {
      message: 'X verification submitted',
      verified: true,
      x_handle: x_handle || twitterHandle
    }
  });
}
