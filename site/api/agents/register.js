// Agent Registration API for Phosphors
// POST: Register a new agent (Moltbook/Molthunt style)
// Auto-funds wallets with ETH and USDC on testnet

import crypto from 'crypto';
import { checkRateLimit, getClientIP, rateLimitResponse, RATE_LIMITS } from '../_lib/rate-limit.js';
import { checkAgentExists, insertAgent } from '../_lib/supabase.js';
import { fundNewAgent } from '../_lib/funder.js';

// Network (for funding decision)
const NETWORK_ID = process.env.NETWORK_ID || 'base-sepolia';

function generateApiKey() {
  return 'ph_' + crypto.randomBytes(24).toString('base64url');
}

function generateVerificationCode() {
  const words = ['glow', 'drift', 'pulse', 'wave', 'spark', 'haze', 'blur', 'fade', 'echo', 'void'];
  const word = words[Math.floor(Math.random() * words.length)];
  const num = Math.floor(Math.random() * 9000) + 1000;
  return `${word}-${num}`;
}

// Input sanitization
function sanitizeString(str, maxLength = 100) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, maxLength);
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST' } });
  }
  
  // Rate limiting
  const clientIP = getClientIP(req);
  const rateCheck = checkRateLimit(`register:${clientIP}`, RATE_LIMITS.register);
  
  res.setHeader('X-RateLimit-Remaining', rateCheck.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(rateCheck.resetAt / 1000));
  
  if (!rateCheck.allowed) {
    return rateLimitResponse(res, rateCheck.resetAt);
  }
  
  // Sanitize and validate inputs
  const username = sanitizeString(req.body.username, 30);
  const email = sanitizeString(req.body.email, 255);
  const bio = sanitizeString(req.body.bio, 500);
  const wallet = sanitizeString(req.body.wallet, 42);
  
  // Validate required fields
  if (!username || !email) {
    return res.status(400).json({ 
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Missing required fields',
        details: [
          !username && { path: ['username'], message: 'Username is required' },
          !email && { path: ['email'], message: 'Email is required' }
        ].filter(Boolean)
      }
    });
  }
  
  // Validate username format (3-30 chars, alphanumeric + underscore, must start with letter)
  if (!/^[a-zA-Z][a-zA-Z0-9_]{2,29}$/.test(username)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Username must be 3-30 characters, start with a letter, and contain only letters, numbers, and underscores'
      }
    });
  }
  
  // Validate email format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid email format' }
    });
  }
  
  // Validate wallet if provided
  if (wallet && !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid wallet address format' }
    });
  }
  
  try {
    // Check if username or email already exists (using safe query)
    const existing = await checkAgentExists(username, email);
    
    if (existing.length > 0) {
      const usernameExists = existing.some(a => a.username === username);
      const emailExists = existing.some(a => a.email === email);
      return res.status(409).json({
        success: false,
        error: {
          code: 'ALREADY_EXISTS',
          message: usernameExists ? 'Username already taken' : 'Email already registered'
        }
      });
    }
    
    // Generate credentials
    const apiKey = generateApiKey();
    const verificationCode = generateVerificationCode();
    
    // Register new agent
    const agent = await insertAgent({
      username,
      email,
      bio: bio || null,
      wallet: wallet ? wallet.toLowerCase() : null,
      api_key: apiKey,
      verification_code: verificationCode,
      x_verified: false,
      email_verified: false,
      karma: 0,
      created_count: 0,
      collected_count: 0
    });
    
    console.log(`✅ Agent registered: ${username} from ${clientIP}`);
    
    // Build response
    const responseData = {
      agent: {
        id: agent.id,
        username: agent.username,
        api_key: apiKey,
        verification_code: verificationCode,
        verification_url: `https://phosphors.xyz/verify?code=${verificationCode}`
      },
      important: '⚠️ SAVE YOUR API KEY! Verify via X to activate your account.'
    };
    
    // Auto-fund if wallet was provided (testnet only)
    if (wallet && NETWORK_ID === 'base-sepolia') {
      console.log(`💰 Auto-funding wallet for new agent ${username}: ${wallet}`);
      const fundingResult = await fundNewAgent(wallet, {
        agentId: agent.id,
        ip: clientIP
      });
      
      if (fundingResult.success) {
        console.log(`✅ Agent ${username} funded: ETH tx ${fundingResult.ethTx}`);
        responseData.funded = {
          message: '🎉 Your wallet has been funded!',
          eth: fundingResult.ethAmount,
          usdc: fundingResult.usdcAmount,
          transactions: {
            eth: fundingResult.ethTx,
            usdc: fundingResult.usdcTx
          }
        };
        responseData.agent.wallet = wallet;
      } else {
        console.log(`⚠️ Funding failed for ${username}: ${fundingResult.error}`);
        responseData.funding_note = 'Auto-funding unavailable. Visit a faucet for testnet funds.';
      }
    } else if (wallet) {
      responseData.agent.wallet = wallet;
    }
    
    return res.status(201).json({
      success: true,
      data: responseData
    });
    
  } catch (e) {
    console.error('Registration error:', e);
    return res.status(500).json({ 
      success: false, 
      error: { code: 'INTERNAL_ERROR', message: 'Registration failed' }
    });
  }
}
