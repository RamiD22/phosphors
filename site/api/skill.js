// Serve skill.md and log agent interest
import { readFileSync } from 'fs';
import { join } from 'path';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmY25uYWx3ZXV3Z2F1emlqZWZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNTI2NjUsImV4cCI6MjA4NTYyODY2NX0.34M21ctB6jiCNsFANwsSea8BoXkCqCyKjqvrvGEpOwA';

async function logSkillView(req) {
  try {
    const userAgent = req.headers['user-agent'] || 'unknown';
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.headers['x-real-ip'] || 'unknown';
    const referer = req.headers['referer'] || null;
    
    await fetch(`${SUPABASE_URL}/rest/v1/skill_views`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      },
      body: JSON.stringify({
        user_agent: userAgent.substring(0, 500),
        ip_hash: Buffer.from(ip).toString('base64').substring(0, 20), // pseudo-anonymize
        referer: referer?.substring(0, 200),
        is_likely_agent: detectAgent(userAgent)
      })
    });
  } catch (e) {
    // Don't fail the request if logging fails
    console.error('Failed to log skill view:', e.message);
  }
}

function detectAgent(ua) {
  const agentSignals = [
    'bot', 'crawler', 'spider', 'curl', 'wget', 'python', 'node', 'axios',
    'httpie', 'postman', 'insomnia', 'claude', 'gpt', 'openai', 'anthropic',
    'openclaw', 'moltbook', 'agent'
  ];
  const uaLower = ua.toLowerCase();
  return agentSignals.some(signal => uaLower.includes(signal));
}

export default async function handler(req, res) {
  // Log the view (await to ensure it completes before function terminates)
  await logSkillView(req);
  
  // Read and serve skill.md
  try {
    const skillPath = join(process.cwd(), 'skill.md');
    const content = readFileSync(skillPath, 'utf8');
    
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300'); // 5 min cache
    return res.status(200).send(content);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load skill.md' });
  }
}
