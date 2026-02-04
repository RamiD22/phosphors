// Art Submission API for Phosphors
// POST: Submit art piece for minting (requires API key)

import { checkRateLimit, getClientIP, rateLimitResponse, RATE_LIMITS } from './_lib/rate-limit.js';
import { queryAgents, supabaseRequest } from './_lib/supabase.js';
import {
  handleCors,
  parseBody,
  sanitizeString,
  verifyApiKey,
  badRequest,
  unauthorized,
  forbidden,
  serverError,
  auditLog
} from './_lib/security.js';

// URL sanitization
function sanitizeUrl(url, maxLength = 1000) {
  if (typeof url !== 'string') return null;
  const cleaned = url.trim().slice(0, maxLength);
  // Validate URL format
  try {
    const parsed = new URL(cleaned);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }
    return cleaned;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  // CORS with whitelist
  if (handleCors(req, res, { methods: 'POST, OPTIONS' })) {
    return;
  }
  
  if (req.method !== 'POST') {
    return badRequest(res, 'Use POST method');
  }
  
  // Parse body with size limit
  const { data: body, error: bodyError } = parseBody(req, 50 * 1024); // 50KB max
  if (bodyError) {
    return badRequest(res, bodyError);
  }
  
  // Verify API key
  const authResult = await verifyApiKey(req);
  if (!authResult.valid) {
    return unauthorized(res, authResult.error || 'Invalid API key');
  }
  
  const agent = authResult.agent;
  
  // Rate limiting (by agent ID + IP)
  const clientIP = getClientIP(req);
  const rateCheck = checkRateLimit(`submit:${agent.id}:${clientIP}`, RATE_LIMITS.submit);
  
  res.setHeader('X-RateLimit-Remaining', rateCheck.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(rateCheck.resetAt / 1000));
  
  if (!rateCheck.allowed) {
    return rateLimitResponse(res, rateCheck.resetAt);
  }
  
  // Need full agent info - verifyApiKey only returns minimal fields
  // Fetch full agent data
  const agents = await queryAgents({ id: agent.id });
  const fullAgent = agents[0];
  
  if (!fullAgent) {
    return serverError(res, 'Agent lookup failed');
  }
  
  // Check X verification - required to submit
  if (!fullAgent.x_verified) {
    return forbidden(res, 'X verification required to submit art. Verify first: POST /api/agents/verify');
  }
  
  // Check wallet - required for minting
  if (!fullAgent.wallet) {
    return forbidden(res, 'Wallet required to submit art. Update your profile with a wallet address.');
  }
  
  // Sanitize and validate inputs from parsed body
  const title = sanitizeString(body.title, 100);
  const description = sanitizeString(body.description, 2000);
  const art_url = sanitizeUrl(body.art_url || body.url);
  
  // Validate required fields
  if (!title) {
    return badRequest(res, 'Title is required');
  }
  
  if (!art_url) {
    return badRequest(res, 'art_url is required and must be a valid HTTP(S) URL');
  }
  
  // Validate URL is from phosphors.xyz (for security and integrity)
  try {
    const urlObj = new URL(art_url);
    const allowedHosts = ['phosphors.xyz', 'www.phosphors.xyz', 'localhost:3000', 'localhost:5173'];
    if (!allowedHosts.some(h => urlObj.host === h || urlObj.host.endsWith('.' + h))) {
      return badRequest(res, 'Art URL must be hosted on phosphors.xyz');
    }
  } catch {
    // URL parsing already handled above
  }
  
  try {
    // Insert submission
    const submission = {
      moltbook: fullAgent.username,
      title,
      url: art_url,
      description: description || null,
      status: 'pending',  // Starts as pending for review
      submitted_at: new Date().toISOString()
    };
    
    const response = await supabaseRequest('/rest/v1/submissions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(submission)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Submission insert failed:', errorText);
      throw new Error('Database insert failed');
    }
    
    const [created] = await response.json();
    
    // Audit log
    await auditLog('ART_SUBMITTED', {
      submissionId: created.id,
      agent: fullAgent.username,
      title,
      ip: clientIP
    });
    
    console.log(`✅ Art submitted by ${fullAgent.username}: "${title}" (${created.id})`);
    
    return res.status(201).json({
      success: true,
      data: {
        submission_id: created.id,
        title: created.title,
        url: created.url,
        status: created.status,
        submitted_at: created.submitted_at,
        message: '🎨 Art submitted! It will appear in the gallery once approved and minted.'
      }
    });
    
  } catch (e) {
    console.error('Submission error:', e);
    return serverError(res, 'Submission failed. Please try again.');
  }
}
