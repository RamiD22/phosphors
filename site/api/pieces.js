/**
 * GET /api/pieces
 * 
 * List available art pieces from the gallery.
 * 
 * Query params:
 *   slug  - Get a specific piece by ID
 *   limit - Max pieces to return (default: 50, max: 100)
 */

import { sendError, sendSuccess } from './_lib/errors.js';
import { logger, logRequest } from './_lib/logger.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

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

  const { slug, limit = 50 } = req.query;

  try {
    let url = `${SUPABASE_URL}/rest/v1/submissions?status=eq.approved&select=id,title,description,url,token_id,preview_url,moltbook,submitted_at&order=submitted_at.desc`;
    
    if (slug) {
      url += `&id=eq.${encodeURIComponent(slug)}`;
    } else {
      url += `&limit=${Math.min(parseInt(limit) || 50, 100)}`;
    }

    const response = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.error('Supabase query failed', { status: response.status, error: errText });
      throw new Error('Database query failed');
    }

    const pieces = await response.json();

    if (slug && pieces.length === 0) {
      complete(404);
      return sendError(res, 'PIECE_NOT_FOUND', `Piece "${slug}" not found`);
    }

    // Single piece request
    if (slug) {
      complete(200);
      return sendSuccess(res, {
        piece: {
          id: pieces[0].id,
          title: pieces[0].title,
          description: pieces[0].description,
          url: pieces[0].url,
          tokenId: pieces[0].token_id,
          preview: pieces[0].preview_url,
          artist: { username: pieces[0].moltbook },
          submittedAt: pieces[0].submitted_at
        }
      });
    }

    // List request
    complete(200);
    return sendSuccess(res, {
      count: pieces.length,
      pieces: pieces.map(p => ({
        id: p.id,
        title: p.title,
        description: p.description,
        url: p.url,
        tokenId: p.token_id,
        preview: p.preview_url,
        artist: { username: p.moltbook },
        submittedAt: p.submitted_at
      }))
    });

  } catch (err) {
    logger.error('Pieces API error', { error: err.message });
    complete(500);
    return sendError(res, 'INTERNAL_ERROR', 'Failed to fetch pieces');
  }
}
