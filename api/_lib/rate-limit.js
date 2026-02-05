// Simple in-memory rate limiter for Vercel serverless
// Note: This uses memory store, so limits reset on cold starts
// For production, consider Redis or Upstash

const rateLimitStore = new Map();

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of rateLimitStore.entries()) {
    if (now - data.windowStart > data.windowMs * 2) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Rate limit check
 * @param {string} key - Unique identifier (IP, API key, etc)
 * @param {object} options - { limit: number, windowMs: number }
 * @returns {{ allowed: boolean, remaining: number, resetAt: number }}
 */
export function checkRateLimit(key, options = {}) {
  const { limit = 10, windowMs = 60000 } = options; // Default: 10 per minute
  const now = Date.now();
  
  let data = rateLimitStore.get(key);
  
  if (!data || now - data.windowStart > windowMs) {
    // New window
    data = { count: 0, windowStart: now, windowMs };
    rateLimitStore.set(key, data);
  }
  
  const remaining = Math.max(0, limit - data.count);
  const resetAt = data.windowStart + windowMs;
  
  if (data.count >= limit) {
    return { allowed: false, remaining: 0, resetAt };
  }
  
  data.count++;
  return { allowed: true, remaining: remaining - 1, resetAt };
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

/**
 * Rate limit response helper
 */
export function rateLimitResponse(res, resetAt) {
  const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
  res.setHeader('Retry-After', retryAfter);
  res.setHeader('X-RateLimit-Remaining', '0');
  res.setHeader('X-RateLimit-Reset', Math.ceil(resetAt / 1000));
  return res.status(429).json({
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests. Please try again later.',
      retryAfter
    }
  });
}

// Preset configurations
export const RATE_LIMITS = {
  register: { limit: 5, windowMs: 60 * 60 * 1000 },  // 5 per hour per IP
  verify: { limit: 10, windowMs: 60 * 60 * 1000 },   // 10 per hour
  profile: { limit: 60, windowMs: 60 * 1000 },       // 60 per minute
  buy: { limit: 30, windowMs: 60 * 1000 },           // 30 per minute
  submit: { limit: 10, windowMs: 60 * 60 * 1000 },   // 10 submissions per hour
  standard: { limit: 60, windowMs: 60 * 1000 },      // 60 per minute (general use)
  bounties: { limit: 30, windowMs: 60 * 1000 }       // 30 per minute for bounty queries
};
