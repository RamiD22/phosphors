/**
 * Auth Helper for Phosphors API
 * 
 * Standardizes API key extraction and agent lookup across endpoints.
 * Supports both Authorization: Bearer and X-API-Key headers.
 */

import { queryAgents, supabaseRequest } from './supabase.js';

/**
 * Extract API key from request headers
 * Supports both formats:
 *   - Authorization: Bearer ph_xxx
 *   - X-API-Key: ph_xxx
 * 
 * @param {Request} req - HTTP request object
 * @returns {string|null} - The API key or null if not found
 */
export function extractApiKey(req) {
  // Check Authorization header first (Bearer token)
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  
  // Fall back to X-API-Key header
  const xApiKey = req.headers['x-api-key'] || req.headers['X-API-Key'];
  if (xApiKey) {
    return xApiKey.trim();
  }
  
  return null;
}

/**
 * Validate API key format
 * @param {string} apiKey 
 * @returns {boolean}
 */
export function isValidApiKeyFormat(apiKey) {
  return typeof apiKey === 'string' && apiKey.startsWith('ph_') && apiKey.length > 10;
}

/**
 * Get agent by API key using the shared supabase helper
 * @param {string} apiKey 
 * @returns {Promise<object|null>}
 */
export async function getAgentByApiKey(apiKey) {
  if (!apiKey || !isValidApiKeyFormat(apiKey)) {
    return null;
  }
  
  try {
    const agents = await queryAgents({ api_key: apiKey });
    return agents?.[0] || null;
  } catch (error) {
    console.error('Error looking up agent by API key:', error);
    return null;
  }
}

/**
 * Get agent by wallet address (case-insensitive)
 * @param {string} wallet - Wallet address
 * @returns {Promise<object|null>}
 */
export async function getAgentByWallet(wallet) {
  if (!wallet || typeof wallet !== 'string') {
    return null;
  }
  
  const normalizedWallet = wallet.toLowerCase();
  
  try {
    // Use ilike for case-insensitive matching
    const response = await supabaseRequest(
      `/rest/v1/agents?wallet=ilike.${encodeURIComponent(normalizedWallet)}&select=id,username,name,emoji,wallet,bio,x_verified,last_seen_at,visit_count,created_at`
    );
    
    if (!response.ok) {
      console.error('Supabase wallet lookup failed:', response.status);
      return null;
    }
    
    const agents = await response.json();
    return agents?.[0] || null;
  } catch (error) {
    console.error('Error looking up agent by wallet:', error);
    return null;
  }
}

/**
 * Authenticate request and return agent
 * Combines key extraction, validation, and lookup
 * 
 * @param {Request} req - HTTP request
 * @returns {Promise<{agent: object|null, error: object|null}>}
 */
export async function authenticateRequest(req) {
  const apiKey = extractApiKey(req);
  
  if (!apiKey) {
    return {
      agent: null,
      error: {
        code: 'AUTH_REQUIRED',
        message: 'Authentication required',
        hint: 'Include Authorization: Bearer YOUR_API_KEY or X-API-Key header'
      }
    };
  }
  
  if (!isValidApiKeyFormat(apiKey)) {
    return {
      agent: null,
      error: {
        code: 'INVALID_KEY_FORMAT',
        message: 'Invalid API key format',
        hint: 'API keys should start with "ph_"'
      }
    };
  }
  
  const agent = await getAgentByApiKey(apiKey);
  
  if (!agent) {
    return {
      agent: null,
      error: {
        code: 'INVALID_API_KEY',
        message: 'Invalid API key'
      }
    };
  }
  
  return { agent, error: null };
}
