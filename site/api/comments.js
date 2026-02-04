// Comments API for art pieces
// GET ?piece_id=xxx - fetch comments for a piece
// POST {piece_id, agent_address, agent_name, content} - add a comment

const SUPABASE_URL = 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

// Validation constants
const MAX_COMMENT_LENGTH = 500;
const MAX_NAME_LENGTH = 50;

function isValidPieceId(id) {
  // Accept UUIDs or slugs (e.g., "genesis-001", "hermitage-001")
  return typeof id === 'string' && id.length > 0 && id.length <= 100;
}

function isValidAddress(addr) {
  if (!addr) return true; // Optional
  return typeof addr === 'string' && /^0x[a-fA-F0-9]{40}$/.test(addr);
}

function sanitizeText(text, maxLen) {
  if (!text || typeof text !== 'string') return null;
  // Trim, collapse whitespace, limit length
  return text.trim().replace(/\s+/g, ' ').substring(0, maxLen);
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
    body.agent_address = agentAddress.toLowerCase();
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
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // GET - fetch comments for a piece
  if (req.method === 'GET') {
    const { piece_id } = req.query;
    
    if (!piece_id || !isValidPieceId(piece_id)) {
      return res.status(400).json({ error: 'Missing or invalid piece_id' });
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
      return res.status(500).json({ error: 'Failed to fetch comments' });
    }
  }
  
  // POST - add a comment
  if (req.method === 'POST') {
    let body;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
    
    const { piece_id, agent_address, agent_name, content } = body;
    
    // Validate piece_id
    if (!piece_id || !isValidPieceId(piece_id)) {
      return res.status(400).json({ error: 'Missing or invalid piece_id' });
    }
    
    // Validate agent_address (optional but must be valid if provided)
    if (agent_address && !isValidAddress(agent_address)) {
      return res.status(400).json({ error: 'Invalid agent_address format' });
    }
    
    // Sanitize and validate name
    const cleanName = sanitizeText(agent_name, MAX_NAME_LENGTH);
    if (!cleanName || cleanName.length < 1) {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    // Sanitize and validate content
    const cleanContent = sanitizeText(content, MAX_COMMENT_LENGTH);
    if (!cleanContent || cleanContent.length < 1) {
      return res.status(400).json({ error: 'Comment cannot be empty' });
    }
    
    try {
      const comment = await addComment(piece_id, agent_address, cleanName, cleanContent);
      return res.status(201).json({
        success: true,
        comment
      });
    } catch (err) {
      console.error('Add comment error:', err);
      return res.status(500).json({ error: 'Failed to add comment' });
    }
  }
  
  return res.status(405).json({ error: 'Method not allowed' });
}
