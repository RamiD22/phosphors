// Admin Authentication API for Phosphors
// POST: Verify admin password and return a session token
// GET: Verify existing session token

import crypto from 'crypto';
import { checkRateLimit, getClientIP, rateLimitResponse } from '../_lib/rate-limit.js';

// Rate limit: 5 login attempts per 15 minutes
const AUTH_RATE_LIMIT = { limit: 5, windowMs: 15 * 60 * 1000 };

// In-memory session store (for serverless, consider using Redis/Supabase)
const sessions = new Map();
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Clean expired sessions periodically
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of sessions.entries()) {
    if (now - data.createdAt > SESSION_TTL_MS) {
      sessions.delete(token);
    }
  }
}, 60 * 60 * 1000); // Clean every hour

function generateSessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Check if admin secret is configured
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    return res.status(503).json({
      success: false,
      error: { code: 'NOT_CONFIGURED', message: 'Admin authentication not configured' }
    });
  }
  
  // GET - Verify existing session
  if (req.method === 'GET') {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'No session token provided' }
      });
    }
    
    const token = authHeader.slice(7);
    const session = sessions.get(token);
    
    if (!session || Date.now() - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(token);
      return res.status(401).json({
        success: false,
        error: { code: 'SESSION_EXPIRED', message: 'Session expired or invalid' }
      });
    }
    
    return res.status(200).json({
      success: true,
      data: { valid: true, expiresIn: SESSION_TTL_MS - (Date.now() - session.createdAt) }
    });
  }
  
  // POST - Login with password
  if (req.method === 'POST') {
    // Rate limiting
    const clientIP = getClientIP(req);
    const rateCheck = checkRateLimit(`admin-auth:${clientIP}`, AUTH_RATE_LIMIT);
    
    res.setHeader('X-RateLimit-Remaining', rateCheck.remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(rateCheck.resetAt / 1000));
    
    if (!rateCheck.allowed) {
      return rateLimitResponse(res, rateCheck.resetAt);
    }
    
    const { password } = req.body || {};
    
    if (!password) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PASSWORD', message: 'Password is required' }
      });
    }
    
    // Constant-time comparison to prevent timing attacks
    const passwordBuffer = Buffer.from(password);
    const secretBuffer = Buffer.from(adminSecret);
    
    if (passwordBuffer.length !== secretBuffer.length || 
        !crypto.timingSafeEqual(passwordBuffer, secretBuffer)) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_PASSWORD', message: 'Invalid password' }
      });
    }
    
    // Create session
    const token = generateSessionToken();
    sessions.set(token, { createdAt: Date.now(), ip: clientIP });
    
    console.log(`✅ Admin login from ${clientIP}`);
    
    return res.status(200).json({
      success: true,
      data: {
        token,
        expiresIn: SESSION_TTL_MS,
        message: 'Login successful'
      }
    });
  }
  
  return res.status(405).json({
    success: false,
    error: { code: 'METHOD_NOT_ALLOWED', message: 'Use GET or POST' }
  });
}
