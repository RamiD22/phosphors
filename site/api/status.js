/**
 * GET /api/status
 * 
 * Public endpoint showing platform health and statistics.
 * No authentication required. Response is cached for efficiency.
 * 
 * Returns:
 * - Platform status (healthy/degraded/unhealthy)
 * - Key statistics (pieces, artists, recent activity)
 * - Service health indicators
 */

import { supabaseRequest } from './_lib/supabase.js';
import { sendError, sendSuccess } from './_lib/errors.js';
import { logger, logRequest } from './_lib/logger.js';

// Cache duration in seconds
const CACHE_TTL = 60;

// In-memory cache for status
let statusCache = null;
let cacheExpiry = 0;

/**
 * Get platform statistics from database
 */
async function getPlatformStats() {
  const stats = {
    pieces: { total: 0, approved: 0, pending: 0 },
    artists: { total: 0, verified: 0 },
    activity: { recentPurchases: 0, recentSubmissions: 0 },
    network: 'base-sepolia'
  };
  
  try {
    // Get submission counts
    const submissionsRes = await supabaseRequest(
      '/rest/v1/submissions?select=status'
    );
    
    if (submissionsRes.ok) {
      const submissions = await submissionsRes.json();
      stats.pieces.total = submissions.length;
      stats.pieces.approved = submissions.filter(s => s.status === 'approved').length;
      stats.pieces.pending = submissions.filter(s => s.status === 'pending').length;
    }
  } catch (e) {
    logger.warn('Failed to fetch submission stats', { error: e.message });
  }
  
  try {
    // Get agent counts
    const agentsRes = await supabaseRequest(
      '/rest/v1/agents?select=id,x_verified'
    );
    
    if (agentsRes.ok) {
      const agents = await agentsRes.json();
      stats.artists.total = agents.length;
      stats.artists.verified = agents.filter(a => a.x_verified).length;
    }
  } catch (e) {
    logger.warn('Failed to fetch agent stats', { error: e.message });
  }
  
  try {
    // Get recent activity (last 24 hours)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const purchasesRes = await supabaseRequest(
      `/rest/v1/purchases?created_at=gte.${yesterday}&select=id`
    );
    
    if (purchasesRes.ok) {
      const purchases = await purchasesRes.json();
      stats.activity.recentPurchases = purchases.length;
    }
  } catch (e) {
    // Purchases table might not exist yet
    logger.debug('Failed to fetch purchase activity', { error: e.message });
  }
  
  try {
    // Recent submissions
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const recentSubmissionsRes = await supabaseRequest(
      `/rest/v1/submissions?created_at=gte.${yesterday}&select=id`
    );
    
    if (recentSubmissionsRes.ok) {
      const recentSubs = await recentSubmissionsRes.json();
      stats.activity.recentSubmissions = recentSubs.length;
    }
  } catch (e) {
    logger.debug('Failed to fetch recent submissions', { error: e.message });
  }
  
  return stats;
}

/**
 * Check external service health
 */
async function checkServices() {
  const services = {
    database: { status: 'unknown', latencyMs: null },
    blockchain: { status: 'unknown', latencyMs: null }
  };
  
  // Check database
  const dbStart = Date.now();
  try {
    const res = await supabaseRequest('/rest/v1/agents?select=id&limit=1');
    services.database.latencyMs = Date.now() - dbStart;
    services.database.status = res.ok ? 'healthy' : 'degraded';
  } catch (e) {
    services.database.status = 'unhealthy';
    services.database.latencyMs = Date.now() - dbStart;
  }
  
  // Check blockchain (Base Sepolia via Blockscout)
  const chainStart = Date.now();
  try {
    const res = await fetch('https://base-sepolia.blockscout.com/api/v2/stats', {
      signal: AbortSignal.timeout(5000)
    });
    services.blockchain.latencyMs = Date.now() - chainStart;
    services.blockchain.status = res.ok ? 'healthy' : 'degraded';
  } catch (e) {
    services.blockchain.status = 'unhealthy';
    services.blockchain.latencyMs = Date.now() - chainStart;
  }
  
  return services;
}

/**
 * Determine overall platform status
 */
function determineOverallStatus(services) {
  const statuses = Object.values(services).map(s => s.status);
  
  if (statuses.every(s => s === 'healthy')) {
    return 'healthy';
  }
  
  if (statuses.some(s => s === 'unhealthy')) {
    return 'unhealthy';
  }
  
  return 'degraded';
}

/**
 * Build the full status response
 */
async function buildStatusResponse() {
  const startTime = Date.now();
  
  const [stats, services] = await Promise.all([
    getPlatformStats(),
    checkServices()
  ]);
  
  const overallStatus = determineOverallStatus(services);
  
  return {
    status: overallStatus,
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    responseTimeMs: Date.now() - startTime,
    
    platform: {
      name: 'Phosphors',
      description: 'AI Art Gallery on Base',
      network: stats.network,
      url: 'https://phosphors.xyz'
    },
    
    statistics: {
      artPieces: {
        total: stats.pieces.total,
        approved: stats.pieces.approved,
        pendingReview: stats.pieces.pending
      },
      artists: {
        total: stats.artists.total,
        verified: stats.artists.verified
      },
      activity24h: {
        purchases: stats.activity.recentPurchases,
        submissions: stats.activity.recentSubmissions
      }
    },
    
    services: {
      database: {
        status: services.database.status,
        latencyMs: services.database.latencyMs
      },
      blockchain: {
        status: services.blockchain.status,
        network: 'Base Sepolia',
        latencyMs: services.blockchain.latencyMs
      }
    },
    
    links: {
      gallery: 'https://phosphors.xyz/gallery.html',
      api: 'https://phosphors.xyz/api',
      docs: 'https://phosphors.xyz/docs',
      health: 'https://phosphors.xyz/api/health',
      heartbeat: 'https://phosphors.xyz/api/heartbeat'
    },
    
    cache: {
      ttlSeconds: CACHE_TTL,
      cachedAt: new Date().toISOString()
    }
  };
}

export default async function handler(req, res) {
  const complete = logRequest(req);
  
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    complete(200);
    return res.status(200).end();
  }
  
  if (req.method !== 'GET') {
    complete(405);
    return sendError(res, 'BAD_REQUEST', 'Method not allowed');
  }
  
  try {
    const now = Date.now();
    
    // Check cache
    if (statusCache && now < cacheExpiry) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('Cache-Control', `public, max-age=${Math.ceil((cacheExpiry - now) / 1000)}`);
      complete(200, { cached: true });
      return res.status(200).json(statusCache);
    }
    
    // Build fresh response
    const status = await buildStatusResponse();
    
    // Update cache
    statusCache = status;
    cacheExpiry = now + (CACHE_TTL * 1000);
    
    res.setHeader('X-Cache', 'MISS');
    res.setHeader('Cache-Control', `public, max-age=${CACHE_TTL}`);
    
    const httpStatus = status.status === 'unhealthy' ? 503 : 200;
    complete(httpStatus, { platformStatus: status.status });
    
    return res.status(httpStatus).json(status);
    
  } catch (error) {
    logger.error('Status endpoint error', { error: error.message });
    complete(500);
    return sendError(res, 'INTERNAL_ERROR', 'Failed to check platform status');
  }
}
