// Simple performance metrics endpoint
// Tracks API response times in Supabase

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (req.method === 'GET') {
    // Fetch recent metrics
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
          avg_ms: Math.round(avg),
          min_ms: min,
          max_ms: max,
          calls: data.count
        };
      }
      
      return res.status(200).json({
        summary,
        recent: metrics.slice(0, 20)
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
  
  if (req.method === 'POST') {
    // Record a metric
    const { endpoint, duration_ms, status_code } = req.body;
    
    if (!endpoint || !duration_ms) {
      return res.status(400).json({ error: 'endpoint and duration_ms required' });
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
      return res.status(201).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
  
  res.status(405).json({ error: 'Method not allowed' });
}
