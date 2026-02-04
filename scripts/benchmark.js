#!/usr/bin/env node
// Benchmark key API endpoints and record to metrics

const BASE_URL = process.env.BASE_URL || 'https://phosphors.art';
const METRICS_URL = `${BASE_URL}/api/metrics`;

const endpoints = [
  { name: '/api/pieces', url: `${BASE_URL}/api/pieces` },
  { name: '/api/pieces?slug=x', url: `${BASE_URL}/api/pieces?slug=afterglow` },
  { name: '/api/artists', url: `${BASE_URL}/api/artists` },
  { name: '/api/funder/status', url: `${BASE_URL}/api/funder/status` },
  { name: '/api/bridge (GET)', url: `${BASE_URL}/api/bridge` },
  { name: '/api/skill.md', url: `${BASE_URL}/api/skill` },
];

async function benchmark(endpoint) {
  const start = Date.now();
  try {
    const res = await fetch(endpoint.url);
    const duration = Date.now() - start;
    const status = res.status;
    
    console.log(`${endpoint.name}: ${duration}ms (${status})`);
    
    // Record to metrics API
    await fetch(METRICS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: endpoint.name,
        duration_ms: duration,
        status_code: status
      })
    }).catch(() => {}); // Ignore if metrics endpoint not ready
    
    return { endpoint: endpoint.name, duration, status };
  } catch (e) {
    console.log(`${endpoint.name}: ERROR - ${e.message}`);
    return { endpoint: endpoint.name, error: e.message };
  }
}

async function run() {
  console.log(`\n📊 Benchmarking ${BASE_URL}\n${'─'.repeat(40)}`);
  
  const results = [];
  for (const ep of endpoints) {
    results.push(await benchmark(ep));
    await new Promise(r => setTimeout(r, 100)); // Small delay between requests
  }
  
  console.log(`${'─'.repeat(40)}`);
  
  const successful = results.filter(r => !r.error);
  if (successful.length > 0) {
    const avg = successful.reduce((a, b) => a + b.duration, 0) / successful.length;
    console.log(`Average: ${Math.round(avg)}ms across ${successful.length} endpoints\n`);
  }
}

run();
