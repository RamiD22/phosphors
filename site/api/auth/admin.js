// Admin Authentication API for Phosphors
// POST: Verify admin password and return a session token
// GET: Verify existing session token
//
// Security features:
// - IP allowlist (ADMIN_ALLOWED_IPS env var)
// - Login attempt logging with timestamps
// - Rate limiting
// - Constant-time password comparison
// - Consider: Supabase session storage for multi-instance deployments

import crypto from 'crypto';
import { checkRateLimit, getClientIP, rateLimitResponse } from '../_lib/rate-limit.js';
import { handleCors, auditLog } from '../_lib/security.js';
import { supabaseRequest } from '../_lib/supabase.js';

// Rate limit: 5 login attempts per 15 minutes
const AUTH_RATE_LIMIT = { limit: 5, windowMs: 15 * 60 * 1000 };

// In-memory session store (for serverless, consider using Supabase for persistence)
// TODO: For multi-instance/production, migrate to Supabase sessions table
const sessions = new Map();
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Login attempt tracking (for security audit)
const loginAttempts = new Map();
const MAX_TRACKED_ATTEMPTS = 100;

// Clean expired sessions and old login attempts periodically
setInterval(() => {
  const now = Date.now();
  
  // Clean sessions
  for (const [token, data] of sessions.entries()) {
    if (now - data.createdAt > SESSION_TTL_MS) {
      sessions.delete(token);
    }
  }
  
  // Clean old login attempts (keep last 24h)
  for (const [ip, attempts] of loginAttempts.entries()) {
    const recentAttempts = attempts.filter(a => now - a.timestamp < 24 * 60 * 60 * 1000);
    if (recentAttempts.length === 0) {
      loginAttempts.delete(ip);
    } else {
      loginAttempts.set(ip, recentAttempts);
    }
  }
}, 60 * 60 * 1000); // Clean every hour

/**
 * Check if IP is in the admin allowlist
 * ADMIN_ALLOWED_IPS can be comma-separated list or "all" for no restriction
 */
function isIpAllowed(clientIP) {
  const allowedIps = process.env.ADMIN_ALLOWED_IPS;
  
  // If not configured, allow all (but log warning)
  if (!allowedIps) {
    console.warn('⚠️ ADMIN_ALLOWED_IPS not configured - all IPs allowed for admin login');
    return true;
  }
  
  // Special value to allow all
  if (allowedIps.toLowerCase() === 'all') {
    return true;
  }
  
  // Parse comma-separated list
  const allowed = allowedIps.split(',').map(ip => ip.trim().toLowerCase());
  
  // Check exact match or CIDR (basic support)
  const normalizedClientIP = clientIP.toLowerCase();
  
  for (const entry of allowed) {
    // Exact match
    if (entry === normalizedClientIP) {
      return true;
    }
    
    // IPv4 prefix match (e.g., "192.168.1.")
    if (entry.endsWith('.') && normalizedClientIP.startsWith(entry)) {
      return true;
    }
    
    // Localhost variants
    if (entry === 'localhost' && ['127.0.0.1', '::1', 'localhost'].includes(normalizedClientIP)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Log login attempt for security audit
 */
function logLoginAttempt(clientIP, success, reason = null) {
  const attempt = {
    timestamp: Date.now(),
    ip: clientIP,
    success,
    reason,
    isoTime: new Date().toISOString()
  };
  
  // Add to in-memory tracking
  const ipAttempts = loginAttempts.get(clientIP) || [];
  ipAttempts.push(attempt);
  
  // Keep only recent attempts per IP
  if (ipAttempts.length > MAX_TRACKED_ATTEMPTS) {
    ipAttempts.shift();
  }
  loginAttempts.set(clientIP, ipAttempts);
  
  // Console log for immediate visibility
  if (success) {
    console.log(`✅ [ADMIN_LOGIN] Success from ${clientIP} at ${attempt.isoTime}`);
  } else {
    console.warn(`❌ [ADMIN_LOGIN] Failed from ${clientIP}: ${reason} at ${attempt.isoTime}`);
  }
  
  return attempt;
}

/**
 * Get recent login attempts for an IP (for security dashboard)
 */
function getLoginAttempts(clientIP) {
  return loginAttempts.get(clientIP) || [];
}

/**
 * Store session in Supabase (optional - for multi-instance deployments)
 * Creates admin_sessions table if using Supabase for sessions
 */
async function storeSessionSupabase(token, data) {
  try {
    await supabaseRequest('/rest/v1/admin_sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        token_hash: crypto.createHash('sha256').update(token).digest('hex'),
        ip: data.ip,
        created_at: new Date(data.createdAt).toISOString(),
        expires_at: new Date(data.createdAt + SESSION_TTL_MS).toISOString()
      })
    });
    return true;
  } catch (err) {
    // Table might not exist - fall back to memory
    console.log('Supabase session storage not available, using memory');
    return false;
  }
}

function generateSessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export default async function handler(req, res) {
  // CORS with origin whitelist
  if (handleCors(req, res, { methods: 'GET, POST, OPTIONS' })) {
    return;
  }
  
  const clientIP = getClientIP(req);
  
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
    // IP allowlist check FIRST (before rate limiting to avoid info leakage)
    if (!isIpAllowed(clientIP)) {
      logLoginAttempt(clientIP, false, 'IP not in allowlist');
      
      // Audit log for blocked IP
      await auditLog('ADMIN_LOGIN_IP_BLOCKED', {
        ip: clientIP,
        timestamp: new Date().toISOString()
      });
      
      // Return generic error (don't reveal IP blocking)
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied' }
      });
    }
    
    // Rate limiting
    const rateCheck = checkRateLimit(`admin-auth:${clientIP}`, AUTH_RATE_LIMIT);
    
    res.setHeader('X-RateLimit-Remaining', rateCheck.remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(rateCheck.resetAt / 1000));
    
    if (!rateCheck.allowed) {
      logLoginAttempt(clientIP, false, 'Rate limited');
      return rateLimitResponse(res, rateCheck.resetAt);
    }
    
    const { password } = req.body || {};
    
    if (!password) {
      logLoginAttempt(clientIP, false, 'Missing password');
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PASSWORD', message: 'Password is required' }
      });
    }
    
    // Constant-time comparison to prevent timing attacks
    const passwordBuffer = Buffer.from(password);
    const secretBuffer = Buffer.from(adminSecret);
    
    let passwordValid = false;
    try {
      // Lengths must match for timingSafeEqual
      if (passwordBuffer.length === secretBuffer.length) {
        passwordValid = crypto.timingSafeEqual(passwordBuffer, secretBuffer);
      }
    } catch (e) {
      passwordValid = false;
    }
    
    if (!passwordValid) {
      logLoginAttempt(clientIP, false, 'Invalid password');
      
      // Audit log for failed attempt
      await auditLog('ADMIN_LOGIN_FAILED', {
        ip: clientIP,
        timestamp: new Date().toISOString(),
        recentAttempts: getLoginAttempts(clientIP).length
      });
      
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_PASSWORD', message: 'Invalid password' }
      });
    }
    
    // Create session
    const token = generateSessionToken();
    const sessionData = { createdAt: Date.now(), ip: clientIP };
    sessions.set(token, sessionData);
    
    // Optionally store in Supabase for multi-instance persistence
    await storeSessionSupabase(token, sessionData);
    
    // Log successful login
    logLoginAttempt(clientIP, true);
    
    // Audit log for successful login
    await auditLog('ADMIN_LOGIN_SUCCESS', {
      ip: clientIP,
      timestamp: new Date().toISOString()
    });
    
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
