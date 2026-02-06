/**
 * Supabase Database Client for Phosphors
 * 
 * Provides a consistent interface for all database operations.
 * Uses Supabase's REST API (PostgREST) for queries.
 * 
 * ## Tables:
 * - agents: Registered users/agents
 * - submissions: Art submissions
 * - purchases: Purchase records
 * - funding_log: Wallet funding history
 * - licenses: Art licensing records
 * - bounty_events: Reward events
 * - referrals: Referral tracking
 * - notifications: Agent notifications
 * 
 * ## Usage:
 * ```javascript
 * import { queryAgents, insertPurchase, supabaseRequest } from './_lib/supabase.js';
 * 
 * // Query with helpers
 * const agents = await queryAgents({ username: 'noctis' });
 * 
 * // Raw request for complex queries
 * const res = await supabaseRequest('/rest/v1/rpc/my_function');
 * ```
 * 
 * @module supabase
 */

/**
 * Supabase project URL
 * @constant {string}
 */
const SUPABASE_URL = 'https://afcnnalweuwgauzijefs.supabase.co';

/**
 * Supabase service role key (required for database operations)
 * Service key has elevated permissions - handle with care
 * @constant {string|undefined}
 */
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

/**
 * Log a funding event
 */
export async function logFunding(data) {
  const response = await supabaseRequest('/rest/v1/funding_log', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(data)
  });
  
  // Don't fail if logging fails (funding already happened)
  if (!response.ok) {
    console.error('Failed to log funding:', await response.text());
    return null;
  }
  
  const [log] = await response.json();
  return log;
}

/**
 * Check if a wallet was already funded
 */
export async function checkWalletFunded(walletAddress) {
  const response = await supabaseRequest(
    `/rest/v1/funding_log?wallet_address=eq.${encodeURIComponent(walletAddress.toLowerCase())}&select=id,funded_at`
  );
  
  if (!response.ok) {
    return null; // Assume not funded on error
  }
  
  const results = await response.json();
  return results.length > 0 ? results[0] : null;
}

export { SUPABASE_URL, SUPABASE_KEY };
