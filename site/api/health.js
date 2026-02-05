// Health Check API for Phosphors — Enhanced Version
// GET: Returns comprehensive platform health and data integrity report
// 
// Checks:
// - All agents have wallets
// - All agents have profile pages
// - All approved submissions have token_ids
// - All approved submissions have art pages
// - No duplicate token_ids
// - No orphaned submissions

import { supabaseRequest } from './_lib/supabase.js';
import { pageExists } from './_lib/page-generator.js';

const ADMIN_KEYS = (process.env.ADMIN_API_KEYS || '').split(',').filter(Boolean);

async function getAgents() {
  const res = await supabaseRequest('/rest/v1/agents?select=id,username,wallet,x_verified,created_at,page_url,email');
  return res.json();
}

async function getSubmissions() {
  const res = await supabaseRequest('/rest/v1/submissions?select=id,moltbook,title,status,token_id,url,page_url,tx_hash');
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
  
  // Check admin auth for full report
  const authHeader = req.headers.authorization;
  const apiKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const isAdmin = apiKey && ADMIN_KEYS.includes(apiKey);
  
  const start = Date.now();
  
  try {
    const [agents, submissions] = await Promise.all([
      getAgents(),
      getSubmissions()
    ]);
    
    // Build lookup sets
    const agentUsernames = new Set(agents.map(a => a.username.toLowerCase()));
    const agentWallets = new Map(agents.map(a => [a.username.toLowerCase(), a.wallet]));
    
    // Categorize submissions
    const approvedSubmissions = submissions.filter(s => s.status === 'approved');
    const pendingSubmissions = submissions.filter(s => s.status === 'pending');
    const rejectedSubmissions = submissions.filter(s => s.status === 'rejected');
    
    // ═══════════════════════════════════════════════════════════════
    // INTEGRITY CHECKS
    // ═══════════════════════════════════════════════════════════════
    
    // 1. Agents without wallets
    const agentsNoWallet = agents.filter(a => !a.wallet);
    
    // 2. Agents without X verification
    const agentsNotVerified = agents.filter(a => !a.x_verified);
    
    // 3. Agents without profile pages
    const agentsNoPage = [];
    for (const agent of agents) {
      const expectedPath = `/artist/${agent.username.toLowerCase()}.html`;
      const hasPage = agent.page_url || await pageExists(expectedPath);
      if (!hasPage) {
        agentsNoPage.push(agent);
      }
    }
    
    // 4. Orphaned submissions (agent doesn't exist)
    const orphanedSubmissions = submissions.filter(s => 
      !agentUsernames.has(s.moltbook.toLowerCase())
    );
    
    // 5. Approved submissions without token_id
    const approvedNoToken = approvedSubmissions.filter(s => !s.token_id);
    
    // 6. Approved submissions without tx_hash
    const approvedNoTx = approvedSubmissions.filter(s => !s.tx_hash && s.token_id);
    
    // 7. Approved submissions without art page
    const approvedNoPage = [];
    for (const sub of approvedSubmissions) {
      if (!sub.page_url) {
        approvedNoPage.push(sub);
      }
    }
    
    // 8. Duplicate token_ids
    const tokenCounts = {};
    approvedSubmissions.filter(s => s.token_id).forEach(s => {
      tokenCounts[s.token_id] = (tokenCounts[s.token_id] || 0) + 1;
    });
    const duplicateTokens = Object.entries(tokenCounts)
      .filter(([_, count]) => count > 1)
      .map(([tokenId, count]) => ({ tokenId: parseInt(tokenId), count }));
    
    // 9. Submissions from agents without wallets
    const submissionsNoWallet = submissions.filter(s => {
      const wallet = agentWallets.get(s.moltbook.toLowerCase());
      return !wallet;
    });
    
    // ═══════════════════════════════════════════════════════════════
    // HEALTH SCORE CALCULATION
    // ═══════════════════════════════════════════════════════════════
    
    // Start at 100, deduct points for issues
    let healthScore = 100;
    const issues = [];
    
    // Critical issues (-25 each)
    if (approvedNoToken.length > 0) {
      healthScore -= 25;
      issues.push({
        type: 'approved_no_token',
        severity: 'critical',
        count: approvedNoToken.length,
        message: `${approvedNoToken.length} approved submissions without token_id`,
        fix: 'Run mint-sequential.mjs to mint these pieces'
      });
    }
    
    if (orphanedSubmissions.length > 0) {
      healthScore -= 25;
      issues.push({
        type: 'orphaned_submissions',
        severity: 'critical',
        count: orphanedSubmissions.length,
        message: `${orphanedSubmissions.length} submissions from non-existent agents`
      });
    }
    
    // Major issues (-15 each)
    if (duplicateTokens.length > 0) {
      healthScore -= 15;
      issues.push({
        type: 'duplicate_token_ids',
        severity: 'major',
        count: duplicateTokens.length,
        message: `${duplicateTokens.length} duplicate token_ids found`,
        tokens: duplicateTokens
      });
    }
    
    if (agentsNoWallet.length > 0) {
      healthScore -= 15;
      issues.push({
        type: 'agents_no_wallet',
        severity: 'major',
        count: agentsNoWallet.length,
        message: `${agentsNoWallet.length} agents without wallets`
      });
    }
    
    // Minor issues (-10 each)
    if (agentsNoPage.length > 0) {
      healthScore -= 10;
      issues.push({
        type: 'agents_no_page',
        severity: 'minor',
        count: agentsNoPage.length,
        message: `${agentsNoPage.length} agents without profile pages`
      });
    }
    
    if (approvedNoPage.length > 0) {
      healthScore -= 10;
      issues.push({
        type: 'approved_no_page',
        severity: 'minor',
        count: approvedNoPage.length,
        message: `${approvedNoPage.length} approved submissions without art pages`
      });
    }
    
    // Warnings (-5 each)
    if (submissionsNoWallet.length > 0) {
      healthScore -= 5;
      issues.push({
        type: 'submissions_agent_no_wallet',
        severity: 'warning',
        count: submissionsNoWallet.length,
        message: `${submissionsNoWallet.length} submissions from agents without wallets`
      });
    }
    
    healthScore = Math.max(0, healthScore);
    
    const healthStatus = 
      healthScore >= 90 ? 'healthy' :
      healthScore >= 70 ? 'degraded' :
      healthScore >= 50 ? 'unhealthy' : 'critical';
    
    // ═══════════════════════════════════════════════════════════════
    // BUILD RESPONSE
    // ═══════════════════════════════════════════════════════════════
    
    const response = {
      status: healthStatus,
      score: healthScore,
      timestamp: new Date().toISOString(),
      latency_ms: Date.now() - start,
      summary: {
        total_agents: agents.length,
        agents_with_wallet: agents.length - agentsNoWallet.length,
        agents_verified: agents.filter(a => a.x_verified).length,
        total_submissions: submissions.length,
        approved_submissions: approvedSubmissions.length,
        pending_submissions: pendingSubmissions.length,
        rejected_submissions: rejectedSubmissions.length,
        minted_tokens: approvedSubmissions.filter(s => s.token_id).length
      },
      issues: {
        count: issues.length,
        critical: issues.filter(i => i.severity === 'critical').length,
        major: issues.filter(i => i.severity === 'major').length,
        minor: issues.filter(i => i.severity === 'minor').length,
        warning: issues.filter(i => i.severity === 'warning').length,
        types: issues.map(i => ({
          type: i.type,
          severity: i.severity,
          count: i.count,
          message: i.message
        }))
      },
      checks: {
        all_agents_have_wallets: agentsNoWallet.length === 0,
        all_agents_have_pages: agentsNoPage.length === 0,
        all_approved_have_tokens: approvedNoToken.length === 0,
        all_approved_have_pages: approvedNoPage.length === 0,
        no_duplicate_tokens: duplicateTokens.length === 0,
        no_orphaned_submissions: orphanedSubmissions.length === 0
      }
    };
    
    // Add detailed breakdown for admins
    if (isAdmin) {
      response.details = {
        agents_no_wallet: agentsNoWallet.map(a => ({
          id: a.id,
          username: a.username,
          verified: a.x_verified
        })),
        agents_no_page: agentsNoPage.map(a => ({
          id: a.id,
          username: a.username
        })),
        orphaned_submissions: orphanedSubmissions.map(s => ({
          id: s.id,
          moltbook: s.moltbook,
          title: s.title,
          status: s.status
        })),
        approved_no_token: approvedNoToken.map(s => ({
          id: s.id,
          moltbook: s.moltbook,
          title: s.title
        })),
        approved_no_page: approvedNoPage.map(s => ({
          id: s.id,
          title: s.title,
          token_id: s.token_id
        })),
        duplicate_tokens: duplicateTokens,
        fix_commands: {
          mint_unminted: 'node mint-sequential.mjs',
          create_missing_pages: 'node scripts/fix-missing-pages.mjs',
          create_missing_wallets: 'node scripts/fix-missing-wallets.mjs'
        }
      };
    }
    
    // Recommendations
    if (healthScore < 100) {
      response.recommendations = [];
      
      if (approvedNoToken.length > 0) {
        response.recommendations.push({
          priority: 1,
          action: 'Run mint-sequential.mjs to mint approved pieces without tokens'
        });
      }
      
      if (agentsNoWallet.length > 0) {
        response.recommendations.push({
          priority: 2,
          action: 'Create wallets for agents missing them'
        });
      }
      
      if (agentsNoPage.length > 0) {
        response.recommendations.push({
          priority: 3,
          action: 'Generate profile pages for agents missing them'
        });
      }
    }
    
    const statusCode = healthStatus === 'critical' ? 503 : 200;
    return res.status(statusCode).json(response);
    
  } catch (error) {
    console.error('Health check error:', error);
    return res.status(500).json({
      status: 'error',
      score: 0,
      timestamp: new Date().toISOString(),
      error: 'Failed to perform health check',
      message: error.message
    });
  }
}
