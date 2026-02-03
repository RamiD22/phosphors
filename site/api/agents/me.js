// Agent Profile API for Phosphors
// GET: Get current agent profile
// PATCH: Update profile

import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '../lib/rate-limit.js';
import { queryAgents, updateAgentById } from '../lib/supabase.js';

async function getAgentFromApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.startsWith('ph_')) {
    return null;
  }
  const agents = await queryAgents({ api_key: apiKey });
  return agents[0] || null;
}

// Input sanitization
function sanitizeString(str, maxLength = 100) {
  if (typeof str !== 'string') return undefined;
  const sanitized = str.trim().slice(0, maxLength);
  return sanitized || undefined;
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
  
  // Rate limiting (by API key)
  const rateCheck = checkRateLimit(`profile:${apiKey}`, RATE_LIMITS.profile);
  res.setHeader('X-RateLimit-Remaining', rateCheck.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(rateCheck.resetAt / 1000));
  
  if (!rateCheck.allowed) {
    return rateLimitResponse(res, rateCheck.resetAt);
  }
  
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
    const updates = {};
    
    // Sanitize each allowed field
    const bio = sanitizeString(req.body.bio, 500);
    const website = sanitizeString(req.body.website, 255);
    const wallet = sanitizeString(req.body.wallet, 42);
    const avatar_url = sanitizeString(req.body.avatar_url, 500);
    const x_handle = sanitizeString(req.body.x_handle, 50);
    
    if (bio !== undefined) updates.bio = bio;
    if (website !== undefined) updates.website = website;
    if (avatar_url !== undefined) updates.avatar_url = avatar_url;
    if (x_handle !== undefined) updates.x_handle = x_handle;
    
    // Special handling for wallet
    if (wallet !== undefined) {
      if (wallet && !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid wallet address format' }
        });
      }
      updates.wallet = wallet ? wallet.toLowerCase() : null;
    }
    
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'No valid fields to update' }
      });
    }
    
    updates.updated_at = new Date().toISOString();
    
    const updated = await updateAgentById(agent.id, updates);
    if (!updated) {
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to update profile' }
      });
    }
    
    console.log(`✅ Agent updated: ${agent.username}`);
    
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
        updated_at: updated.updated_at
      }
    });
  }
  
  return res.status(405).json({
    success: false,
    error: { code: 'METHOD_NOT_ALLOWED', message: 'Use GET or PATCH' }
  });
}
