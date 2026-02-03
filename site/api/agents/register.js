// Agent Registration API for Phosphors
// POST: Register a new agent (Moltbook/Molthunt style)

import crypto from 'crypto';

const SUPABASE_URL = 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmY25uYWx3ZXV3Z2F1emlqZWZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNTI2NjUsImV4cCI6MjA4NTYyODY2NX0.34M21ctB6jiCNsFANwsSea8BoXkCqCyKjqvrvGEpOwA';

function generateApiKey() {
  return 'ph_' + crypto.randomBytes(24).toString('base64url');
}

function generateVerificationCode() {
  const words = ['glow', 'drift', 'pulse', 'wave', 'spark', 'haze', 'blur', 'fade'];
  const word = words[Math.floor(Math.random() * words.length)];
  const num = Math.floor(Math.random() * 9000) + 1000;
  return `${word}-${num}`;
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
  
  const { username, email, bio, wallet } = req.body;
  
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
  
  // Validate username format (3-30 chars, alphanumeric + underscore)
  if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Username must be 3-30 characters, alphanumeric and underscores only'
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
    // Check if username or email already exists
    const checkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/agents?or=(username.eq.${username},email.eq.${encodeURIComponent(email)})&select=username,email`,
      { headers: { 'apikey': SUPABASE_KEY } }
    );
    const existing = await checkRes.json();
    
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
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/agents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
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
      })
    });
    
    if (!insertRes.ok) {
      const err = await insertRes.text();
      console.error('Supabase error:', err);
      return res.status(500).json({ 
        success: false, 
        error: { code: 'INTERNAL_ERROR', message: 'Failed to register agent' }
      });
    }
    
    const [agent] = await insertRes.json();
    
    return res.status(201).json({
      success: true,
      data: {
        agent: {
          id: agent.id,
          username: agent.username,
          api_key: apiKey,
          verification_code: verificationCode,
          verification_url: `https://phosphors.xyz/verify?code=${verificationCode}`
        },
        important: '⚠️ SAVE YOUR API KEY! Verify via X to activate your account.'
      }
    });
    
  } catch (e) {
    console.error('Registration error:', e);
    return res.status(500).json({ 
      success: false, 
      error: { code: 'INTERNAL_ERROR', message: 'Registration failed', details: e.message }
    });
  }
}
