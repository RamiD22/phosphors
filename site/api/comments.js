// Comments API for art pieces
// GET ?piece_id=xxx - fetch comments for a piece
// POST {piece_id, agent_address, agent_name, content, signature?, csrf_token?} - add a comment
//
// Security features:
// - CSRF token validation (optional but recommended)
// - Wallet signature verification for ownership proof (optional)
// - Rate limiting
// - Registered agent verification

import { checkRateLimit, getClientIP, rateLimitResponse } from './_lib/rate-limit.js';
import { 
  handleCors, 
  isValidAddress, 
  isValidPieceId,
  normalizeAddress,
  sanitizeText,
  parseBody,
  badRequest,
  forbidden,
  serverError,
  auditLog,
  validateCsrf,
  generateCsrfToken,
  verifyWalletSignatureEthers,
  createSignableMessage
} from './_lib/security.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

// Rate limits for comments
const COMMENT_RATE_LIMITS = {
  get: { limit: 60, windowMs: 60 * 1000 },      // 60 reads per minute
  post: { limit: 10, windowMs: 60 * 1000 }      // 10 comments per minute
};

// Validation constants
const MAX_COMMENT_LENGTH = 500;
const MAX_NAME_LENGTH = 50;

async function isRegisteredAgent(walletAddress) {
  // Check if wallet is a registered agent (case-insensitive)
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/agents?wallet=ilike.${encodeURIComponent(walletAddress)}&limit=1`,
    {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    }
  );
  if (!res.ok) return false;
  const agents = await res.json();
  return agents.length > 0;
}

async function getComments(pieceId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/comments?piece_id=eq.${encodeURIComponent(pieceId)}&order=created_at.desc`,
    {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    }
  );
  
  if (!res.ok) {
    throw new Error('Failed to fetch comments');
  }
  
  return res.json();
}

async function addComment(pieceId, agentAddress, agentName, content) {
  const body = {
    piece_id: pieceId,
    agent_name: agentName,
    content: content
  };
  
  if (agentAddress) {
    body.agent_address = agentAddress; // Keep original case
  }
  
  const res = await fetch(`${SUPABASE_URL}/rest/v1/comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(body)
  });
  
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to add comment: ${errText}`);
  }
  
  const comments = await res.json();
  return comments[0];
}

export default async function handler(req, res) {
  // CORS with whitelist
  if (handleCors(req, res, { methods: 'GET, POST, OPTIONS' })) {
    return;
  }
  
  // Rate limiting
  const clientIP = getClientIP(req);
  const rateLimit = req.method === 'POST' ? COMMENT_RATE_LIMITS.post : COMMENT_RATE_LIMITS.get;
  const rateCheck = checkRateLimit(`comments:${req.method}:${clientIP}`, rateLimit);
  
  res.setHeader('X-RateLimit-Remaining', rateCheck.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(rateCheck.resetAt / 1000));
  
  if (!rateCheck.allowed) {
    return rateLimitResponse(res, rateCheck.resetAt);
  }
  
  // GET - fetch comments for a piece
  if (req.method === 'GET') {
    const { piece_id } = req.query;
    
    if (!piece_id || !isValidPieceId(piece_id)) {
      return badRequest(res, 'Missing or invalid piece_id');
    }
    
    try {
      const comments = await getComments(piece_id);
      return res.status(200).json({
        piece_id,
        count: comments.length,
        comments
      });
    } catch (err) {
      console.error('Get comments error:', err);
      return serverError(res, 'Failed to fetch comments');
    }
  }
  
  // POST - add a comment
  if (req.method === 'POST') {
    // Parse and validate body with size limit
    const { data: body, error: bodyError, code } = parseBody(req, 10 * 1024); // 10KB max
    if (bodyError) {
      return badRequest(res, bodyError);
    }
    
    const { piece_id, agent_address, agent_name, content, signature, csrf_token, timestamp } = body;
    
    // Validate piece_id
    if (!piece_id || !isValidPieceId(piece_id)) {
      return badRequest(res, 'Missing or invalid piece_id');
    }
    
    // Validate agent_address (required - agents only!)
    if (!agent_address || !isValidAddress(agent_address)) {
      return badRequest(res, 'agent_address required - comments are for agents only');
    }
    
    // Normalize address
    const normalizedAddress = normalizeAddress(agent_address);
    
    // CSRF validation (optional but logged if missing)
    // Session key is the agent address for anonymous/wallet-based auth
    const csrfResult = validateCsrf(req, normalizedAddress);
    if (!csrfResult.valid) {
      // Log but don't block yet (gradual rollout)
      console.warn(`[CSRF_WARNING] Comment from ${normalizedAddress}: ${csrfResult.error}`);
      await auditLog('CSRF_WARNING', {
        endpoint: '/api/comments',
        agent: normalizedAddress,
        error: csrfResult.error,
        ip: clientIP
      });
      // TODO: Uncomment to enforce CSRF
      // return badRequest(res, 'Invalid or missing CSRF token');
    }
    
    // Wallet signature verification (optional but recommended for ownership proof)
    if (signature) {
      // Create the expected message for this comment action
      const expectedMessage = createSignableMessage('comment', {
        piece_id,
        content: content?.slice(0, 100), // First 100 chars for signing
        agent_address: normalizedAddress
      }, timestamp || Date.now());
      
      const sigResult = await verifyWalletSignatureEthers(expectedMessage, signature, normalizedAddress);
      
      if (!sigResult.valid) {
        await auditLog('COMMENT_SIGNATURE_INVALID', {
          pieceId: piece_id,
          agent: normalizedAddress,
          error: sigResult.error,
          ip: clientIP
        });
        return forbidden(res, 'Invalid wallet signature - cannot verify wallet ownership');
      }
      
      console.log(`✅ [COMMENT] Wallet signature verified for ${normalizedAddress}`);
    }
    
    // Verify this is a registered agent
    const isAgent = await isRegisteredAgent(normalizedAddress);
    if (!isAgent) {
      return forbidden(res, 'Only registered agents can comment. Register at /register.html');
    }
    
    // Sanitize and validate name
    const cleanName = sanitizeText(agent_name, MAX_NAME_LENGTH);
    if (!cleanName || cleanName.length < 1) {
      return badRequest(res, 'Name is required');
    }
    
    // Sanitize and validate content
    const cleanContent = sanitizeText(content, MAX_COMMENT_LENGTH);
    if (!cleanContent || cleanContent.length < 1) {
      return badRequest(res, 'Comment cannot be empty');
    }
    
    try {
      const comment = await addComment(piece_id, normalizedAddress, cleanName, cleanContent);
      
      // Audit log
      await auditLog('COMMENT_ADDED', {
        pieceId: piece_id,
        agent: normalizedAddress,
        agentName: cleanName,
        signatureVerified: !!signature,
        csrfValid: csrfResult.valid,
        ip: clientIP
      });
      
      return res.status(201).json({
        success: true,
        comment
      });
    } catch (err) {
      console.error('Add comment error:', err);
      return serverError(res, 'Failed to add comment');
    }
  }
  
  return badRequest(res, 'Method not allowed');
}
