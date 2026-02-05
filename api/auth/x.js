// X OAuth 2.0 - Initiate Login
// Redirects user to X for authorization

import crypto from 'crypto';

const X_CLIENT_ID = (process.env.X_CLIENT_ID || '').trim();
const CALLBACK_URL = process.env.X_CALLBACK_URL || 'https://phosphors.xyz/api/auth/x/callback';

// Store PKCE verifiers (in production, use Redis/DB)
// For serverless, we'll store in a secure cookie
function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
  return { verifier, challenge };
}

function generateState() {
  return crypto.randomBytes(16).toString('hex');
}

export default async function handler(req, res) {
  if (!X_CLIENT_ID) {
    return res.status(500).json({
      success: false,
      error: { code: 'CONFIG_ERROR', message: 'X OAuth not configured' }
    });
  }
  
  // Generate PKCE and state
  const { verifier, challenge } = generatePKCE();
  const state = generateState();
  
  // Store verifier and state in secure cookie
  const cookieData = JSON.stringify({ verifier, state });
  const cookieValue = Buffer.from(cookieData).toString('base64');
  
  // Set cookie (HttpOnly, Secure, SameSite=Lax for OAuth redirect)
  res.setHeader('Set-Cookie', [
    `x_oauth=${cookieValue}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
  ]);
  
  // X OAuth 2.0 Authorization URL
  const scopes = 'tweet.read users.read';
  
  const authUrl = new URL('https://twitter.com/i/oauth2/authorize');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', X_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', CALLBACK_URL);
  authUrl.searchParams.set('scope', scopes);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  
  // Redirect to X
  return res.redirect(302, authUrl.toString());
}
