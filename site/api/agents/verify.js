// Agent Verification API for Phosphors
// POST: Verify agent via X (Twitter) tweet

import { checkRateLimit, getClientIP, rateLimitResponse, RATE_LIMITS } from '../lib/rate-limit.js';
import { queryAgents, updateAgentById } from '../lib/supabase.js';

async function getAgentFromApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.startsWith('ph_')) {
    return null;
  }
  const agents = await queryAgents({ api_key: apiKey });
  return agents[0] || null;
}

// Input sanitization
function sanitizeUrl(url, maxLength = 500) {
  if (typeof url !== 'string') return null;
  const cleaned = url.trim().slice(0, maxLength);
  // Only allow twitter.com or x.com URLs
  if (!cleaned.match(/^https?:\/\/(twitter\.com|x\.com)\//)) {
    return null;
  }
  return cleaned;
}

function sanitizeHandle(handle, maxLength = 50) {
  if (typeof handle !== 'string') return null;
  // Remove @ if present, only allow alphanumeric and underscores
  const cleaned = handle.trim().replace(/^@/, '').slice(0, maxLength);
  if (!cleaned.match(/^[a-zA-Z0-9_]+$/)) {
    return null;
  }
  return cleaned;
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
  
  // Rate limiting (by API key + IP)
  const clientIP = getClientIP(req);
  const rateCheck = checkRateLimit(`verify:${apiKey}:${clientIP}`, RATE_LIMITS.verify);
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
  
  // Already verified?
  if (agent.x_verified) {
    return res.status(200).json({
      success: true,
      data: { message: 'Already verified', verified: true, x_handle: agent.x_handle }
    });
  }
  
  const tweet_url = sanitizeUrl(req.body.tweet_url);
  const x_handle = sanitizeHandle(req.body.x_handle);
  
  if (!tweet_url) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'tweet_url is required and must be a valid Twitter/X URL',
        hint: `Post a tweet containing your verification code: ${agent.verification_code}`
      }
    });
  }
  
  // Validate tweet URL format and extract handle
  const tweetMatch = tweet_url.match(/(?:twitter\.com|x\.com)\/(\w+)\/status\/(\d+)/);
  if (!tweetMatch) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid tweet URL format' }
    });
  }
  
  const twitterHandle = x_handle || tweetMatch[1];
  
  // In production, you'd verify the tweet actually contains the code
  // For now, we trust the submission (like Moltbook/Molthunt)
  
  // Update agent as verified
  const updated = await updateAgentById(agent.id, {
    x_verified: true,
    x_handle: twitterHandle,
    verified_at: new Date().toISOString()
  });
  
  if (!updated) {
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to update verification status' }
    });
  }
  
  console.log(`✅ Agent verified: ${agent.username} (@${twitterHandle})`);
  
  return res.status(200).json({
    success: true,
    data: {
      message: 'X verification complete! 🎉',
      verified: true,
      x_handle: twitterHandle
    }
  });
}
