// CSRF Token Generation Endpoint
// GET ?session_key=xxx - Get a CSRF token tied to a session/wallet
//
// Usage:
// 1. Call GET /api/csrf?session_key=YOUR_WALLET_ADDRESS
// 2. Include the token in POST requests as X-CSRF-Token header or csrf_token body field
// 3. Tokens expire after 1 hour

import { handleCors, generateCsrfToken, badRequest, getClientIP } from './_lib/security.js';
import { checkRateLimit, rateLimitResponse } from './_lib/rate-limit.js';

// Rate limit: 30 token requests per minute
const CSRF_RATE_LIMIT = { limit: 30, windowMs: 60 * 1000 };

export default async function handler(req, res) {
  // CORS with whitelist
  if (handleCors(req, res, { methods: 'GET, OPTIONS' })) {
    return;
  }
  
  if (req.method !== 'GET') {
    return badRequest(res, 'Use GET method');
  }
  
  const clientIP = getClientIP(req);
  
  // Rate limiting
  const rateCheck = checkRateLimit(`csrf:${clientIP}`, CSRF_RATE_LIMIT);
  res.setHeader('X-RateLimit-Remaining', rateCheck.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(rateCheck.resetAt / 1000));
  
  if (!rateCheck.allowed) {
    return rateLimitResponse(res, rateCheck.resetAt);
  }
  
  // Session key can be wallet address, API key, or any session identifier
  const sessionKey = req.query.session_key || 
                     req.headers['x-api-key'] || 
                     req.headers.authorization?.replace('Bearer ', '') ||
                     'anon';
  
  const token = generateCsrfToken(sessionKey);
  
  // Set cache headers - token should not be cached
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  
  return res.status(200).json({
    success: true,
    csrf_token: token,
    expires_in: 3600, // 1 hour
    usage: {
      header: 'Include as X-CSRF-Token header',
      body: 'Or include as csrf_token field in request body'
    }
  });
}
