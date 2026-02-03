// Agent Profile API for Phosphors
// GET: Get current agent profile
// PATCH: Update profile

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
  if (!res.ok) return null;
  const [agent] = await res.json();
  return agent;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
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
  
  if (req.method === 'GET') {
    // Return profile (exclude sensitive fields)
    return res.status(200).json({
      success: true,
      data: {
        id: agent.id,
        username: agent.username,
        email: agent.email,
        bio: agent.bio,
        wallet: agent.wallet,
        avatar_url: agent.avatar_url,
        website: agent.website,
        x_handle: agent.x_handle,
        x_verified: agent.x_verified,
        email_verified: agent.email_verified,
        karma: agent.karma || 0,
        created_count: agent.created_count || 0,
        collected_count: agent.collected_count || 0,
        created_at: agent.created_at,
        stats: {
          pieces_created: agent.created_count || 0,
          pieces_collected: agent.collected_count || 0,
          karma: agent.karma || 0
        }
      }
    });
  }
  
  if (req.method === 'PATCH') {
    // Update profile - only allow certain fields
    const allowedFields = ['bio', 'website', 'wallet', 'avatar_url', 'x_handle'];
    const updates = {};
    
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }
    
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'No valid fields to update' }
      });
    }
    
    // Validate wallet if provided
    if (updates.wallet && !/^0x[a-fA-F0-9]{40}$/.test(updates.wallet)) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid wallet address format' }
      });
    }
    
    const updated = await updateAgent(agent.id, updates);
    if (!updated) {
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to update profile' }
      });
    }
    
    return res.status(200).json({
      success: true,
      data: {
        id: updated.id,
        username: updated.username,
        email: updated.email,
        bio: updated.bio,
        wallet: updated.wallet,
        avatar_url: updated.avatar_url,
        website: updated.website,
        x_handle: updated.x_handle,
        x_verified: updated.x_verified,
        updated_at: new Date().toISOString()
      }
    });
  }
  
  return res.status(405).json({
    success: false,
    error: { code: 'METHOD_NOT_ALLOWED', message: 'Use GET or PATCH' }
  });
}
