// Health Check API for Phosphors
// GET: Returns platform health status and data integrity report
// Admin auth required for full report

import { supabaseRequest } from './_lib/supabase.js';

const ADMIN_KEYS = (process.env.ADMIN_API_KEYS || '').split(',').filter(Boolean);

async function getAgents() {
  const res = await supabaseRequest('/rest/v1/agents?select=id,username,wallet,x_verified,created_at');
  return res.json();
}

async function getSubmissions() {
  const res = await supabaseRequest('/rest/v1/submissions?select=id,moltbook,title,status,token_id,url');
  return res.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  // Check if admin auth provided for full report
  const authHeader = req.headers.authorization;
  const apiKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const isAdmin = apiKey && ADMIN_KEYS.includes(apiKey);
  
  const start = Date.now();
  
  try {
    const [agents, submissions] = await Promise.all([
      getAgents(),
      getSubmissions()
    ]);
    
    // Calculate integrity stats
    const agentUsernames = new Set(agents.map(a => a.username.toLowerCase()));
    const approvedSubmissions = submissions.filter(s => s.status === 'approved');
    const pendingSubmissions = submissions.filter(s => s.status === 'pending');
    
    // Issues
    const agentsNoWallet = agents.filter(a => !a.wallet);
    const agentsNoVerification = agents.filter(a => !a.x_verified);
    const orphanedSubmissions = submissions.filter(s => !agentUsernames.has(s.moltbook.toLowerCase()));
    
    // Check for duplicate token_ids
    const tokenCounts = {};
    approvedSubmissions.filter(s => s.token_id).forEach(s => {
      tokenCounts[s.token_id] = (tokenCounts[s.token_id] || 0) + 1;
    });
    const duplicateTokens = Object.entries(tokenCounts)
      .filter(([_, count]) => count > 1)
      .map(([tokenId, count]) => ({ tokenId: parseInt(tokenId), count }));
    
    // Check approved submissions without token_id
    const approvedNoToken = approvedSubmissions.filter(s => !s.token_id);
    
    // Overall health score (0-100)
    let healthScore = 100;
    if (agentsNoWallet.length > 0) healthScore -= 10;
    if (orphanedSubmissions.length > 0) healthScore -= 20;
    if (duplicateTokens.length > 0) healthScore -= 15;
    if (approvedNoToken.length > 0) healthScore -= 25;
    healthScore = Math.max(0, healthScore);
    
    const healthStatus = healthScore >= 80 ? 'healthy' : healthScore >= 50 ? 'degraded' : 'critical';
    
    // Build response
    const response = {
      status: healthStatus,
      score: healthScore,
      timestamp: new Date().toISOString(),
      latency_ms: Date.now() - start,
      summary: {
        total_agents: agents.length,
        verified_agents: agents.filter(a => a.x_verified).length,
        total_submissions: submissions.length,
        approved_submissions: approvedSubmissions.length,
        pending_submissions: pendingSubmissions.length
      },
      issues: {
        count: (agentsNoWallet.length > 0 ? 1 : 0) + 
               (orphanedSubmissions.length > 0 ? 1 : 0) + 
               (duplicateTokens.length > 0 ? 1 : 0) +
               (approvedNoToken.length > 0 ? 1 : 0),
        types: []
      }
    };
    
    // Add issue types
    if (agentsNoWallet.length > 0) {
      response.issues.types.push({
        type: 'agents_no_wallet',
        severity: 'warning',
        count: agentsNoWallet.length,
        message: `${agentsNoWallet.length} agents without wallets`
      });
    }
    
    if (orphanedSubmissions.length > 0) {
      response.issues.types.push({
        type: 'orphaned_submissions',
        severity: 'critical',
        count: orphanedSubmissions.length,
        message: `${orphanedSubmissions.length} submissions from non-existent agents`
      });
    }
    
    if (duplicateTokens.length > 0) {
      response.issues.types.push({
        type: 'duplicate_token_ids',
        severity: 'warning',
        count: duplicateTokens.length,
        message: `${duplicateTokens.length} duplicate token_ids found`
      });
    }
    
    if (approvedNoToken.length > 0) {
      response.issues.types.push({
        type: 'approved_no_token',
        severity: 'critical',
        count: approvedNoToken.length,
        message: `${approvedNoToken.length} approved submissions without token_id`
      });
    }
    
    // Add detailed report for admins
    if (isAdmin) {
      response.details = {
        agents_no_wallet: agentsNoWallet.map(a => ({ id: a.id, username: a.username })),
        orphaned_submissions: orphanedSubmissions.map(s => ({ id: s.id, moltbook: s.moltbook, title: s.title })),
        duplicate_tokens: duplicateTokens,
        approved_no_token: approvedNoToken.map(s => ({ id: s.id, title: s.title }))
      };
    }
    
    const statusCode = healthStatus === 'healthy' ? 200 : healthStatus === 'degraded' ? 200 : 503;
    return res.status(statusCode).json(response);
    
  } catch (error) {
    console.error('Health check error:', error);
    return res.status(500).json({
      status: 'error',
      score: 0,
      timestamp: new Date().toISOString(),
      error: 'Failed to perform health check'
    });
  }
}
