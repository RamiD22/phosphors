/**
 * GET/POST /api/metrics
 * 
 * Simple performance metrics endpoint.
 * GET: Fetch recent metrics and averages by endpoint
 * POST: Record a new metric
 */

import { sendError, sendSuccess } from './_lib/errors.js';
import { logger, logRequest } from './_lib/logger.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  const complete = logRequest(req);
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    complete(200);
    return res.status(200).end();
  }
  
  if (req.method === 'GET') {
    try {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/api_metrics?order=created_at.desc&limit=100`,
        {
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
          }
        }
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch metrics');
      }
      
      const metrics = await response.json();
      
      // Calculate averages by endpoint
      const byEndpoint = {};
      for (const m of metrics) {
        if (!byEndpoint[m.endpoint]) {
          byEndpoint[m.endpoint] = { times: [], count: 0 };
        }
        byEndpoint[m.endpoint].times.push(m.duration_ms);
        byEndpoint[m.endpoint].count++;
      }
      
      const summary = {};
      for (const [endpoint, data] of Object.entries(byEndpoint)) {
        const avg = data.times.reduce((a, b) => a + b, 0) / data.times.length;
        const min = Math.min(...data.times);
        const max = Math.max(...data.times);
        summary[endpoint] = {
          avgMs: Math.round(avg),
          minMs: min,
          maxMs: max,
          calls: data.count
        };
      }
      
      complete(200);
      return sendSuccess(res, {
        summary,
        recent: metrics.slice(0, 20)
      });
    } catch (e) {
      logger.error('Metrics fetch error', { error: e.message });
      complete(500);
      return sendError(res, 'INTERNAL_ERROR', 'Failed to fetch metrics');
    }
  }
  
  if (req.method === 'POST') {
    const { endpoint, duration_ms, status_code } = req.body || {};
    
    if (!endpoint || duration_ms === undefined) {
      complete(400);
      return sendError(res, 'MISSING_FIELD', 'endpoint and duration_ms required');
    }
    
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/api_metrics`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        },
        body: JSON.stringify({
          endpoint,
          duration_ms,
          status_code: status_code || 200
        })
      });
      
      complete(201);
      return sendSuccess(res, { recorded: true }, 201);
    } catch (e) {
      logger.error('Metrics record error', { error: e.message });
      complete(500);
      return sendError(res, 'INTERNAL_ERROR', 'Failed to record metric');
    }
  }
  
  complete(405);
  return sendError(res, 'BAD_REQUEST', 'Method not allowed');
}
