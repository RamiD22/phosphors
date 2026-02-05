// Security utilities for Phosphors API
// Centralized security functions: validation, sanitization, CORS, audit logging

import crypto from 'crypto';

// ==================== INPUT VALIDATION ====================

/**
 * Validate Ethereum wallet address (checksummed or lowercase)
 */
export function isValidAddress(addr) {
  if (!addr || typeof addr !== 'string') return false;
  // Basic format check
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) return false;
  // If all lowercase or all uppercase, valid
  if (addr === addr.toLowerCase() || addr === addr.toUpperCase().replace('0X', '0x')) {
    return true;
  }
  // Otherwise, verify checksum (EIP-55)
  return isValidChecksumAddress(addr);
}

/**
 * EIP-55 checksum validation
 */
function isValidChecksumAddress(addr) {
  const address = addr.slice(2);
  const hash = crypto.createHash('sha256').update(address.toLowerCase()).digest('hex');
  for (let i = 0; i < 40; i++) {
    const charCode = address.charCodeAt(i);
    const isLower = charCode >= 97 && charCode <= 122; // a-f
    const isUpper = charCode >= 65 && charCode <= 90;  // A-F
    if (isLower || isUpper) {
      const shouldBeUpper = parseInt(hash[i], 16) >= 8;
      if ((shouldBeUpper && isLower) || (!shouldBeUpper && isUpper)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Normalize wallet address to lowercase
 */
export function normalizeAddress(addr) {
  if (!isValidAddress(addr)) return null;
  return addr.toLowerCase();
}

/**
 * Validate transaction hash format
 */
export function isValidTxHash(hash) {
  return typeof hash === 'string' && /^0x[a-fA-F0-9]{64}$/.test(hash);
}

/**
 * Validate piece ID format
 */
export function isValidPieceId(id) {
  return typeof id === 'string' && 
         id.length >= 1 && 
         id.length <= 100 && 
         /^[a-zA-Z0-9_-]+$/.test(id);
}

/**
 * Validate username format
 */
export function isValidUsername(username) {
  return typeof username === 'string' && 
         /^[a-zA-Z][a-zA-Z0-9_]{2,29}$/.test(username);
}

/**
 * Validate UUID format
 */
export function isValidUUID(uuid) {
  return typeof uuid === 'string' && 
         /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);
}

// ==================== INPUT SANITIZATION ====================

/**
 * Sanitize string input - removes dangerous characters
 */
export function sanitizeString(str, maxLength = 1000) {
  if (!str || typeof str !== 'string') return '';
  return str
    .trim()
    .slice(0, maxLength)
    .replace(/[<>]/g, '') // Remove HTML brackets
    .replace(/[\x00-\x1F\x7F]/g, ''); // Remove control characters
}

/**
 * Sanitize text content (for comments, descriptions)
 */
export function sanitizeText(text, maxLength = 500) {
  if (!text || typeof text !== 'string') return null;
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, maxLength)
    .replace(/[<>]/g, '');
}

/**
 * Sanitize emoji - extract first valid emoji or return default
 */
export function sanitizeEmoji(str, defaultEmoji = '🤖') {
  if (!str || typeof str !== 'string') return defaultEmoji;
  const emojiMatch = str.match(/(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)/u);
  return emojiMatch ? emojiMatch[0] : defaultEmoji;
}

// ==================== CORS CONFIGURATION ====================

// Allowed origins - ONLY trusted domains
const ALLOWED_ORIGINS = [
  'https://phosphors.xyz',
  'https://www.phosphors.xyz',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173'
];

// In production, strict origins only
const IS_PRODUCTION = process.env.NODE_ENV === 'production' || 
                      process.env.VERCEL_ENV === 'production';

/**
 * Set CORS headers with origin whitelist
 */
export function setCorsHeaders(req, res, options = {}) {
  const origin = req.headers.origin;
  const allowedMethods = options.methods || 'GET, POST, OPTIONS';
  const allowedHeaders = options.headers || 'Content-Type, Authorization, X-API-Key';
  
  // Check if origin is allowed
  if (origin && (ALLOWED_ORIGINS.includes(origin) || !IS_PRODUCTION)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!IS_PRODUCTION) {
    // Development: allow all
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  // If origin not allowed in production, don't set the header (browser will block)
  
  res.setHeader('Access-Control-Allow-Methods', allowedMethods);
  res.setHeader('Access-Control-Allow-Headers', allowedHeaders);
  res.setHeader('Access-Control-Max-Age', '86400'); // Cache preflight for 24h
  
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
}

/**
 * Handle OPTIONS preflight
 */
export function handleCors(req, res, options = {}) {
  setCorsHeaders(req, res, options);
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  return false;
}

// ==================== REQUEST BODY VALIDATION ====================

const MAX_BODY_SIZE = 100 * 1024; // 100KB default

/**
 * Parse and validate request body with size limit
 */
export function parseBody(req, maxSize = MAX_BODY_SIZE) {
  try {
    // Check content length if available
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    if (contentLength > maxSize) {
      return { error: 'Request body too large', code: 'BODY_TOO_LARGE' };
    }
    
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    
    // Check parsed body size
    const bodySize = JSON.stringify(body).length;
    if (bodySize > maxSize) {
      return { error: 'Request body too large', code: 'BODY_TOO_LARGE' };
    }
    
    return { data: body };
  } catch (e) {
    return { error: 'Invalid JSON body', code: 'INVALID_JSON' };
  }
}

// ==================== ERROR RESPONSES ====================

/**
 * Create a safe error response (no internal details)
 */
export function errorResponse(res, status, code, message) {
  return res.status(status).json({
    success: false,
    error: { code, message }
  });
}

/**
 * 400 Bad Request
 */
export function badRequest(res, message = 'Invalid request') {
  return errorResponse(res, 400, 'BAD_REQUEST', message);
}

/**
 * 401 Unauthorized
 */
export function unauthorized(res, message = 'Authentication required') {
  return errorResponse(res, 401, 'UNAUTHORIZED', message);
}

/**
 * 403 Forbidden
 */
export function forbidden(res, message = 'Access denied') {
  return errorResponse(res, 403, 'FORBIDDEN', message);
}

/**
 * 404 Not Found
 */
export function notFound(res, message = 'Resource not found') {
  return errorResponse(res, 404, 'NOT_FOUND', message);
}

/**
 * 500 Internal Server Error (safe - no details)
 */
export function serverError(res, message = 'An error occurred') {
  return errorResponse(res, 500, 'INTERNAL_ERROR', message);
}

// ==================== AUDIT LOGGING ====================

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

/**
 * Log security-relevant event to database
 */
export async function auditLog(event, data = {}) {
  if (!SUPABASE_KEY) {
    console.log(`[AUDIT] ${event}:`, JSON.stringify(data));
    return;
  }
  
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/audit_log`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        event,
        data: JSON.stringify(data),
        timestamp: new Date().toISOString(),
        ip: data.ip || null
      })
    });
  } catch (err) {
    // Don't fail the request if audit logging fails
    console.error('Audit log failed:', err.message);
  }
}

/**
 * Get client IP from request
 */
export function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() 
    || req.headers['x-real-ip'] 
    || req.socket?.remoteAddress 
    || 'unknown';
}

// ==================== API KEY AUTHENTICATION ====================

/**
 * Verify API key from Authorization header
 */
export async function verifyApiKey(req) {
  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers['x-api-key'];
  
  const apiKey = apiKeyHeader || 
    (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null);
  
  if (!apiKey || !apiKey.startsWith('ph_')) {
    return { valid: false, error: 'Invalid API key format' };
  }
  
  if (!SUPABASE_KEY) {
    return { valid: false, error: 'Server configuration error' };
  }
  
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/agents?api_key=eq.${encodeURIComponent(apiKey)}&select=id,username,wallet`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      }
    );
    
    if (!res.ok) {
      return { valid: false, error: 'Verification failed' };
    }
    
    const agents = await res.json();
    if (agents.length === 0) {
      return { valid: false, error: 'Invalid API key' };
    }
    
    return { valid: true, agent: agents[0] };
  } catch (err) {
    return { valid: false, error: 'Verification failed' };
  }
}

// ==================== REQUEST SIGNING (For Agent Actions) ====================

/**
 * Verify request signature for sensitive agent actions
 * Signature = HMAC-SHA256(timestamp + method + path + body, apiKey)
 */
export function verifyRequestSignature(req, apiKey) {
  const signature = req.headers['x-signature'];
  const timestamp = req.headers['x-timestamp'];
  
  if (!signature || !timestamp) {
    return { valid: false, error: 'Missing signature headers' };
  }
  
  // Check timestamp is within 5 minutes
  const now = Date.now();
  const reqTime = parseInt(timestamp, 10);
  if (isNaN(reqTime) || Math.abs(now - reqTime) > 5 * 60 * 1000) {
    return { valid: false, error: 'Request expired or invalid timestamp' };
  }
  
  // Reconstruct the signed payload
  const body = typeof req.body === 'object' ? JSON.stringify(req.body) : (req.body || '');
  const payload = `${timestamp}${req.method}${req.url}${body}`;
  
  // Compute expected signature
  const expected = crypto
    .createHmac('sha256', apiKey)
    .update(payload)
    .digest('hex');
  
  // Constant-time comparison
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return { valid: false, error: 'Invalid signature' };
  }
  
  return { valid: true };
}

// ==================== SESSION TOKENS ====================

const SESSION_SECRET = process.env.SESSION_SECRET || process.env.ADMIN_SECRET;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Generate a secure session token
 */
export function generateSessionToken(payload = {}) {
  const sessionId = crypto.randomBytes(32).toString('base64url');
  const timestamp = Date.now();
  const data = JSON.stringify({ ...payload, sessionId, timestamp });
  const encoded = Buffer.from(data).toString('base64url');
  
  // Sign the token
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET || 'fallback-secret')
    .update(encoded)
    .digest('base64url');
  
  return `${encoded}.${signature}`;
}

/**
 * Verify session token
 */
export function verifySessionToken(token) {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'No token provided' };
  }
  
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) {
    return { valid: false, error: 'Invalid token format' };
  }
  
  // Verify signature
  const expected = crypto
    .createHmac('sha256', SESSION_SECRET || 'fallback-secret')
    .update(encoded)
    .digest('base64url');
  
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return { valid: false, error: 'Invalid signature' };
  }
  
  // Decode and check expiry
  try {
    const data = JSON.parse(Buffer.from(encoded, 'base64url').toString());
    if (Date.now() - data.timestamp > SESSION_TTL_MS) {
      return { valid: false, error: 'Token expired' };
    }
    return { valid: true, data };
  } catch (e) {
    return { valid: false, error: 'Invalid token data' };
  }
}
