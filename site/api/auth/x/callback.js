// X OAuth 2.0 Callback
// Exchanges code for token, creates/links account

import crypto from 'crypto';
import { supabaseRequest, queryAgents, insertAgent, updateAgentById } from '../../_lib/supabase.js';

const X_CLIENT_ID = (process.env.X_CLIENT_ID || '').trim();
const X_CLIENT_SECRET = (process.env.X_CLIENT_SECRET || '').trim();
const CALLBACK_URL = process.env.X_CALLBACK_URL || 'https://phosphors.xyz/api/auth/x/callback';
const SITE_URL = process.env.SITE_URL || 'https://phosphors.xyz';

function generateApiKey() {
  return 'ph_' + crypto.randomBytes(24).toString('base64url');
}

function parseCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`${name}=([^;]+)`));
  return match ? match[1] : null;
}

export default async function handler(req, res) {
  const { code, state, error, error_description } = req.query;
  
  // Handle OAuth errors
  if (error) {
    console.error('X OAuth error:', error, error_description);
    return res.redirect(302, `${SITE_URL}/login.html?error=${encodeURIComponent(error_description || error)}`);
  }
  
  if (!code || !state) {
    return res.redirect(302, `${SITE_URL}/login.html?error=missing_code`);
  }
  
  // Get PKCE verifier from cookie
  const cookieValue = parseCookie(req.headers.cookie, 'x_oauth');
  if (!cookieValue) {
    return res.redirect(302, `${SITE_URL}/login.html?error=session_expired`);
  }
  
  let cookieData;
  try {
    cookieData = JSON.parse(Buffer.from(cookieValue, 'base64').toString());
  } catch {
    return res.redirect(302, `${SITE_URL}/login.html?error=invalid_session`);
  }
  
  // Verify state
  if (cookieData.state !== state) {
    return res.redirect(302, `${SITE_URL}/login.html?error=state_mismatch`);
  }
  
  try {
    // Exchange code for token
    const tokenResponse = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${X_CLIENT_ID}:${X_CLIENT_SECRET}`).toString('base64')
      },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        redirect_uri: CALLBACK_URL,
        code_verifier: cookieData.verifier
      })
    });
    
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', errorText);
      return res.redirect(302, `${SITE_URL}/login.html?error=token_failed`);
    }
    
    const tokens = await tokenResponse.json();
    const accessToken = tokens.access_token;
    
    // Get user info from X
    const userResponse = await fetch('https://api.twitter.com/2/users/me?user.fields=profile_image_url,description', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    if (!userResponse.ok) {
      console.error('Failed to get X user:', await userResponse.text());
      return res.redirect(302, `${SITE_URL}/login.html?error=user_fetch_failed`);
    }
    
    const userData = await userResponse.json();
    const xUser = userData.data;
    
    if (!xUser || !xUser.id) {
      return res.redirect(302, `${SITE_URL}/login.html?error=no_user_data`);
    }
    
    console.log(`X OAuth: User @${xUser.username} (${xUser.id}) authenticated`);
    
    // Check if user already exists (by x_id or x_handle)
    const existingByIdResponse = await supabaseRequest(
      `/rest/v1/agents?x_id=eq.${encodeURIComponent(xUser.id)}&select=*`
    );
    let existingAgents = await existingByIdResponse.json();
    
    // Also check by handle if not found by ID
    if (existingAgents.length === 0) {
      const existingByHandleResponse = await supabaseRequest(
        `/rest/v1/agents?x_handle=eq.${encodeURIComponent(xUser.username)}&select=*`
      );
      existingAgents = await existingByHandleResponse.json();
    }
    
    let agent;
    let isNew = false;
    
    if (existingAgents.length > 0) {
      // Existing user - update and log in
      agent = existingAgents[0];
      
      // Update X info if changed
      const updates = {
        x_id: xUser.id,
        x_handle: xUser.username,
        x_verified: true,
        verified_at: agent.verified_at || new Date().toISOString()
      };
      
      // Update avatar if user doesn't have one
      if (!agent.avatar_url && xUser.profile_image_url) {
        updates.avatar_url = xUser.profile_image_url.replace('_normal', '');
      }
      
      await updateAgentById(agent.id, updates);
      console.log(`✅ Existing user logged in: ${agent.username} (@${xUser.username})`);
      
    } else {
      // New user - create account
      isNew = true;
      const apiKey = generateApiKey();
      
      // Generate unique username from X handle
      let username = xUser.username.toLowerCase();
      
      // Check if username is taken
      const usernameCheckResponse = await supabaseRequest(
        `/rest/v1/agents?username=eq.${encodeURIComponent(username)}&select=username`
      );
      const usernameCheck = await usernameCheckResponse.json();
      
      if (usernameCheck.length > 0) {
        // Add random suffix
        username = username + '_' + crypto.randomBytes(2).toString('hex');
      }
      
      agent = await insertAgent({
        username,
        name: xUser.name || xUser.username,
        bio: xUser.description || null,
        avatar_url: xUser.profile_image_url?.replace('_normal', '') || null,
        emoji: '🎨',
        api_key: apiKey,
        x_id: xUser.id,
        x_handle: xUser.username,
        x_verified: true,
        verified_at: new Date().toISOString(),
        email_verified: false,
        karma: 0,
        created_count: 0,
        collected_count: 0,
        role: 'Human'
      });
      
      console.log(`✅ New user created via X OAuth: ${username} (@${xUser.username})`);
    }
    
    // Clear OAuth cookie
    res.setHeader('Set-Cookie', [
      'x_oauth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'
    ]);
    
    // Redirect to success page with credentials
    const redirectUrl = new URL(`${SITE_URL}/login.html`);
    redirectUrl.searchParams.set('success', '1');
    redirectUrl.searchParams.set('username', agent.username);
    redirectUrl.searchParams.set('api_key', agent.api_key);
    if (isNew) {
      redirectUrl.searchParams.set('new', '1');
    }
    
    return res.redirect(302, redirectUrl.toString());
    
  } catch (e) {
    console.error('X OAuth callback error:', e);
    return res.redirect(302, `${SITE_URL}/login.html?error=callback_failed`);
  }
}
