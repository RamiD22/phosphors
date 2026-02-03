// Supabase client configuration
// All database access should go through this module

const SUPABASE_URL = 'https://afcnnalweuwgauzijefs.supabase.co';

// Use service key from environment - no hardcoded fallbacks in production
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_KEY) {
  console.warn('⚠️ SUPABASE_SERVICE_KEY not set - database operations will fail');
}

/**
 * Make a Supabase REST API request
 * @param {string} path - API path (e.g., '/rest/v1/agents')
 * @param {object} options - fetch options
 */
export async function supabaseRequest(path, options = {}) {
  const url = `${SUPABASE_URL}${path}`;
  
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    ...options.headers
  };
  
  const response = await fetch(url, { ...options, headers });
  
  return response;
}

/**
 * Query agents table safely
 * @param {object} filters - { username?, email?, api_key?, id? }
 * @param {string} select - columns to select
 */
export async function queryAgents(filters = {}, select = '*') {
  const params = new URLSearchParams();
  params.set('select', select);
  
  // Build filters safely using PostgREST syntax
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null) {
      // Properly encode the value
      params.append(key, `eq.${value}`);
    }
  }
  
  const response = await supabaseRequest(`/rest/v1/agents?${params.toString()}`);
  return response.json();
}

/**
 * Check if username or email exists (OR query)
 */
export async function checkAgentExists(username, email) {
  // Use proper PostgREST OR syntax with URL encoding
  const orFilter = `or=(username.eq.${encodeURIComponent(username)},email.eq.${encodeURIComponent(email)})`;
  const response = await supabaseRequest(`/rest/v1/agents?${orFilter}&select=username,email`);
  return response.json();
}

/**
 * Insert a new agent
 */
export async function insertAgent(data) {
  const response = await supabaseRequest('/rest/v1/agents', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(data)
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Insert failed: ${error}`);
  }
  
  const [agent] = await response.json();
  return agent;
}

/**
 * Update an agent by ID
 */
export async function updateAgentById(id, updates) {
  const response = await supabaseRequest(`/rest/v1/agents?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(updates)
  });
  
  if (!response.ok) {
    return null;
  }
  
  const [agent] = await response.json();
  return agent;
}

/**
 * Query pieces table
 */
export async function queryPieces(filters = {}, select = '*') {
  const params = new URLSearchParams();
  params.set('select', select);
  
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null) {
      params.append(key, `eq.${value}`);
    }
  }
  
  const response = await supabaseRequest(`/rest/v1/pieces?${params.toString()}`);
  return response.json();
}

/**
 * Insert a purchase record
 */
export async function insertPurchase(data) {
  const response = await supabaseRequest('/rest/v1/purchases', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(data)
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Insert purchase failed: ${error}`);
  }
  
  const [purchase] = await response.json();
  return purchase;
}

/**
 * Get recent purchases for activity feed
 */
export async function getRecentPurchases(limit = 20) {
  const response = await supabaseRequest(
    `/rest/v1/purchases?select=*,piece:pieces(title,identifier),buyer:agents!buyer_id(username),seller:agents!seller_id(username)&order=created_at.desc&limit=${limit}`
  );
  return response.json();
}

export { SUPABASE_URL, SUPABASE_KEY };
