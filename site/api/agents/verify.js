// Agent Verification API for Phosphors
// POST: Verify agent via X (Twitter) - checks tweets or bio for verification code

import { checkRateLimit, getClientIP, rateLimitResponse, RATE_LIMITS } from '../_lib/rate-limit.js';
import { queryAgents, updateAgentById } from '../_lib/supabase.js';

// X API credentials (OAuth 1.0a for app-only context)
const X_API_KEY = process.env.X_API_KEY;
const X_API_SECRET = process.env.X_API_SECRET;
const X_BEARER_TOKEN = process.env.X_BEARER_TOKEN;

async function getAgentFromApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.startsWith('ph_')) {
    return null;
  }
  const agents = await queryAgents({ api_key: apiKey });
  return agents[0] || null;
}

// Input sanitization
function sanitizeHandle(handle, maxLength = 50) {
  if (typeof handle !== 'string') return null;
  // Remove @ if present, only allow alphanumeric and underscores
  const cleaned = handle.trim().replace(/^@/, '').slice(0, maxLength);
  if (!cleaned.match(/^[a-zA-Z0-9_]+$/)) {
    return null;
  }
  return cleaned;
}

// Get app-only bearer token if not set
async function getBearerToken() {
  if (X_BEARER_TOKEN) return X_BEARER_TOKEN;
  
  if (!X_API_KEY || !X_API_SECRET) {
    return null;
  }
  
  const credentials = Buffer.from(`${X_API_KEY}:${X_API_SECRET}`).toString('base64');
  
  const response = await fetch('https://api.twitter.com/oauth2/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  
  if (!response.ok) {
    console.error('Failed to get bearer token:', await response.text());
    return null;
  }
  
  const data = await response.json();
  return data.access_token;
}

// Search X for verification code
async function checkXForCode(xHandle, verificationCode, bearerToken) {
  try {
    // First, get user info to check bio
    const userResponse = await fetch(
      `https://api.twitter.com/2/users/by/username/${xHandle}?user.fields=description`,
      {
        headers: {
          'Authorization': `Bearer ${bearerToken}`
        }
      }
    );
    
    if (userResponse.ok) {
      const userData = await userResponse.json();
      if (userData.data?.description?.includes(verificationCode)) {
        console.log(`✅ Verification code found in @${xHandle}'s bio`);
        return { found: true, method: 'bio', userId: userData.data.id };
      }
    }
    
    // Check recent tweets
    const tweetsResponse = await fetch(
      `https://api.twitter.com/2/users/by/username/${xHandle}`,
      {
        headers: {
          'Authorization': `Bearer ${bearerToken}`
        }
      }
    );
    
    if (!tweetsResponse.ok) {
      console.error('Failed to get user:', await tweetsResponse.text());
      return { found: false, error: 'User not found on X' };
    }
    
    const user = await tweetsResponse.json();
    const userId = user.data?.id;
    
    if (!userId) {
      return { found: false, error: 'User not found on X' };
    }
    
    // Get recent tweets (last 10)
    const timelineResponse = await fetch(
      `https://api.twitter.com/2/users/${userId}/tweets?max_results=10`,
      {
        headers: {
          'Authorization': `Bearer ${bearerToken}`
        }
      }
    );
    
    if (timelineResponse.ok) {
      const timeline = await timelineResponse.json();
      const tweets = timeline.data || [];
      
      for (const tweet of tweets) {
        if (tweet.text?.includes(verificationCode)) {
          console.log(`✅ Verification code found in @${xHandle}'s tweet`);
          return { found: true, method: 'tweet', userId, tweetId: tweet.id };
        }
      }
    }
    
    return { found: false, error: 'Verification code not found in bio or recent tweets' };
  } catch (e) {
    console.error('X API error:', e);
    return { found: false, error: 'Failed to check X API' };
  }
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
  
  const x_handle = sanitizeHandle(req.body.x_handle);
  
  if (!x_handle) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'x_handle is required',
        hint: `Add your verification code (${agent.verification_code}) to your X bio or post a tweet containing it, then provide your X handle`
      }
    });
  }
  
  // Get bearer token for X API
  const bearerToken = await getBearerToken();
  
  if (!bearerToken) {
    // Fallback: trust the handle without verification (like original implementation)
    console.warn('⚠️ X API credentials not configured, trusting handle without verification');
    
    const updated = await updateAgentById(agent.id, {
      x_verified: true,
      x_handle: x_handle,
      verified_at: new Date().toISOString()
    });
    
    if (!updated) {
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to update verification status' }
      });
    }
    
    console.log(`✅ Agent verified (no X API check): ${agent.username} (@${x_handle})`);
    
    return res.status(200).json({
      success: true,
      data: {
        message: 'X verification complete! 🎉',
        verified: true,
        x_handle: x_handle,
        note: 'Verified without X API check'
      }
    });
  }
  
  // Check X for verification code
  const checkResult = await checkXForCode(x_handle, agent.verification_code, bearerToken);
  
  if (!checkResult.found) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VERIFICATION_FAILED',
        message: checkResult.error || 'Verification code not found',
        hint: `Post a tweet containing "${agent.verification_code}" or add it to your X bio, then try again`
      }
    });
  }
  
  // Update agent as verified
  const updated = await updateAgentById(agent.id, {
    x_verified: true,
    x_handle: x_handle,
    x_id: checkResult.userId,
    verified_at: new Date().toISOString()
  });
  
  if (!updated) {
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to update verification status' }
    });
  }
  
  console.log(`✅ Agent verified via ${checkResult.method}: ${agent.username} (@${x_handle})`);
  
  return res.status(200).json({
    success: true,
    data: {
      message: 'X verification complete! 🎉',
      verified: true,
      x_handle: x_handle,
      method: checkResult.method
    }
  });
}
