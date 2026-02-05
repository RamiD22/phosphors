/**
 * GET /api/agent/[wallet]/notifications
 * 
 * Returns notifications for an agent:
 * - Sale notifications (your art was collected)
 * - New art from artists you follow
 * - Purchase confirmations
 * - Weekly digests
 * 
 * POST /api/agent/[wallet]/notifications
 * Mark notifications as read or update preferences
 */

import { checkRateLimit, getClientIP, rateLimitResponse } from '../../_lib/rate-limit.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

// Rate limits
const GET_RATE_LIMIT = { limit: 30, windowMs: 60 * 1000 };
const POST_RATE_LIMIT = { limit: 10, windowMs: 60 * 1000 };

async function supabaseQuery(path) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    headers: { 'apikey': SUPABASE_KEY }
  });
  if (!res.ok) return [];
  return res.json();
}

async function supabasePost(path, data) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(data)
  });
  return res;
}

async function supabaseUpdate(table, filter, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(data)
  });
  return res.ok;
}

function isValidAddress(addr) {
  return typeof addr === 'string' && /^0x[a-fA-F0-9]{40}$/i.test(addr);
}

async function getAgentByWallet(wallet) {
  const agents = await supabaseQuery(
    `/rest/v1/agents?wallet=ilike.${encodeURIComponent(wallet)}&select=id,username,notify_on_sale,notify_on_new_art,notify_digest`
  );
  return agents?.[0] || null;
}

async function getNotifications(agentId, limit = 20, unreadOnly = false) {
  let query = `/rest/v1/notifications?agent_id=eq.${agentId}&select=id,type,title,message,data,read_at,created_at&order=created_at.desc&limit=${limit}`;
  
  if (unreadOnly) {
    query += '&read_at=is.null';
  }
  
  return supabaseQuery(query);
}

async function markAsRead(agentId, notificationIds) {
  const now = new Date().toISOString();
  
  for (const id of notificationIds) {
    await supabaseUpdate(
      'notifications',
      `id=eq.${id}&agent_id=eq.${agentId}`,
      { read_at: now }
    );
  }
  
  return true;
}

async function markAllAsRead(agentId) {
  const now = new Date().toISOString();
  return supabaseUpdate(
    'notifications',
    `agent_id=eq.${agentId}&read_at=is.null`,
    { read_at: now }
  );
}

async function updatePreferences(agentId, preferences) {
  const validPrefs = {};
  if (typeof preferences.notify_on_sale === 'boolean') {
    validPrefs.notify_on_sale = preferences.notify_on_sale;
  }
  if (typeof preferences.notify_on_new_art === 'boolean') {
    validPrefs.notify_on_new_art = preferences.notify_on_new_art;
  }
  if (typeof preferences.notify_digest === 'boolean') {
    validPrefs.notify_digest = preferences.notify_digest;
  }
  
  if (Object.keys(validPrefs).length === 0) {
    return false;
  }
  
  return supabaseUpdate('agents', `id=eq.${agentId}`, validPrefs);
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  const { wallet } = req.query;
  
  if (!wallet || !isValidAddress(wallet)) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_WALLET', message: 'Valid wallet address required' }
    });
  }
  
  const normalizedWallet = wallet.toLowerCase();
  const clientIP = getClientIP(req);
  
  // Get agent
  const agent = await getAgentByWallet(normalizedWallet);
  
  if (!agent) {
    return res.status(404).json({
      success: false,
      error: { 
        code: 'AGENT_NOT_FOUND', 
        message: 'No agent registered with this wallet',
        hint: 'Register at POST /api/agents/register'
      }
    });
  }
  
  if (req.method === 'GET') {
    // Rate limit GET
    const rateCheck = checkRateLimit(`notif-get:${normalizedWallet}`, GET_RATE_LIMIT);
    res.setHeader('X-RateLimit-Remaining', rateCheck.remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(rateCheck.resetAt / 1000));
    
    if (!rateCheck.allowed) {
      return rateLimitResponse(res, rateCheck.resetAt);
    }
    
    const { limit: limitParam, unread } = req.query;
    const limit = Math.min(parseInt(limitParam) || 20, 50);
    const unreadOnly = unread === 'true' || unread === '1';
    
    try {
      const notifications = await getNotifications(agent.id, limit, unreadOnly);
      const unreadCount = (notifications || []).filter(n => !n.read_at).length;
      
      // Format notifications
      const formatted = (notifications || []).map(n => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        data: n.data,
        read: !!n.read_at,
        when: n.created_at,
        // Add action URL based on type
        action: n.type === 'sale' 
          ? `https://phosphors.xyz/art/${n.data?.piece_title?.toLowerCase().replace(/[^a-z0-9]/g, '-')}.html`
          : n.type === 'new_art'
          ? `https://phosphors.xyz/api/buy/${n.data?.piece_id}?buyer=${normalizedWallet}`
          : null
      }));
      
      // Cache for 30 seconds
      res.setHeader('Cache-Control', 'private, max-age=30');
      
      return res.status(200).json({
        success: true,
        data: {
          notifications: formatted,
          unreadCount,
          total: notifications?.length || 0,
          preferences: {
            notifyOnSale: agent.notify_on_sale ?? true,
            notifyOnNewArt: agent.notify_on_new_art ?? true,
            notifyDigest: agent.notify_digest ?? true
          }
        }
      });
      
    } catch (error) {
      console.error('Get notifications error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch notifications' }
      });
    }
  }
  
  if (req.method === 'POST') {
    // Rate limit POST
    const rateCheck = checkRateLimit(`notif-post:${normalizedWallet}`, POST_RATE_LIMIT);
    res.setHeader('X-RateLimit-Remaining', rateCheck.remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(rateCheck.resetAt / 1000));
    
    if (!rateCheck.allowed) {
      return rateLimitResponse(res, rateCheck.resetAt);
    }
    
    const { action, notificationIds, preferences } = req.body || {};
    
    try {
      if (action === 'mark_read' && Array.isArray(notificationIds)) {
        await markAsRead(agent.id, notificationIds);
        return res.status(200).json({
          success: true,
          message: `Marked ${notificationIds.length} notification(s) as read`
        });
      }
      
      if (action === 'mark_all_read') {
        await markAllAsRead(agent.id);
        return res.status(200).json({
          success: true,
          message: 'Marked all notifications as read'
        });
      }
      
      if (action === 'update_preferences' && preferences) {
        const updated = await updatePreferences(agent.id, preferences);
        return res.status(200).json({
          success: updated,
          message: updated ? 'Preferences updated' : 'No valid preferences to update'
        });
      }
      
      return res.status(400).json({
        success: false,
        error: { 
          code: 'INVALID_ACTION', 
          message: 'Valid action required: mark_read, mark_all_read, or update_preferences'
        }
      });
      
    } catch (error) {
      console.error('Notification action error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to process action' }
      });
    }
  }
  
  return res.status(405).json({
    success: false,
    error: { code: 'METHOD_NOT_ALLOWED', message: 'Use GET or POST' }
  });
}
