// Bounty rewards system for Phosphors
// Handles creation bounties and referral rewards

import { supabaseRequest } from './supabase.js';

// Bounty amounts in $Phosphors
// Token price ~$0.0000364
export const BOUNTY_AMOUNTS = {
  // Creation bounties
  first_sale: 2500,
  five_sales: 7500,
  ten_sales: 15000,
  featured: 50000,
  
  // Referral rewards
  referral_signup: 1000,
  referral_first_sale: 5000,
  referral_first_collect: 2500,
  referral_ten_sales: 15000
};

// Sale milestones
export const SALE_MILESTONES = {
  1: 'first_sale',
  5: 'five_sales',
  10: 'ten_sales'
};

/**
 * Generate a unique referral code for an agent
 * Format: username-XXXX (4 random alphanumeric chars)
 */
export function generateReferralCode(username) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${username.toLowerCase()}-${suffix}`;
}

/**
 * Create a bounty event
 */
export async function createBountyEvent({
  walletAddress,
  eventType,
  submissionId = null,
  referredWallet = null
}) {
  const phosAmount = BOUNTY_AMOUNTS[eventType];
  
  if (!phosAmount) {
    console.error(`Unknown bounty event type: ${eventType}`);
    return { success: false, error: 'Unknown event type' };
  }
  
  try {
    const response = await supabaseRequest('/rest/v1/bounty_events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        wallet_address: walletAddress.toLowerCase(),
        event_type: eventType,
        phos_amount: phosAmount,
        submission_id: submissionId,
        referred_wallet: referredWallet?.toLowerCase() || null,
        status: 'pending'
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      // Check if it's a unique constraint violation (already earned this bounty)
      if (error.includes('duplicate') || error.includes('unique')) {
        return { success: false, error: 'Bounty already earned', duplicate: true };
      }
      console.error('Failed to create bounty event:', error);
      return { success: false, error };
    }
    
    const [event] = await response.json();
    console.log(`🎁 Bounty created: ${eventType} (+${phosAmount.toLocaleString()} $Phosphors) for ${walletAddress}`);
    
    return { success: true, event, amount: phosAmount };
  } catch (err) {
    console.error('Bounty creation error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Create a referral record
 */
export async function createReferral(referrerWallet, referredWallet, referralCode) {
  try {
    const response = await supabaseRequest('/rest/v1/referrals', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        referrer_wallet: referrerWallet.toLowerCase(),
        referred_wallet: referredWallet.toLowerCase(),
        referral_code: referralCode,
        status: 'pending'
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      if (error.includes('duplicate') || error.includes('unique')) {
        return { success: false, error: 'Already referred', duplicate: true };
      }
      console.error('Failed to create referral:', error);
      return { success: false, error };
    }
    
    const [referral] = await response.json();
    return { success: true, referral };
  } catch (err) {
    console.error('Referral creation error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Look up a referral code to find the referrer
 */
export async function lookupReferralCode(code) {
  try {
    const response = await supabaseRequest(
      `/rest/v1/agents?referral_code=eq.${encodeURIComponent(code)}&select=id,username,wallet,referral_code`
    );
    
    if (!response.ok) return null;
    
    const agents = await response.json();
    return agents[0] || null;
  } catch (err) {
    console.error('Referral lookup error:', err.message);
    return null;
  }
}

/**
 * Get the referrer for a given wallet (if any)
 */
export async function getReferrer(walletAddress) {
  try {
    const response = await supabaseRequest(
      `/rest/v1/referrals?referred_wallet=ilike.${encodeURIComponent(walletAddress)}&select=*`
    );
    
    if (!response.ok) return null;
    
    const referrals = await response.json();
    return referrals[0] || null;
  } catch (err) {
    console.error('Get referrer error:', err.message);
    return null;
  }
}

/**
 * Update referral status
 */
export async function updateReferralStatus(referredWallet, status) {
  try {
    const updates = { status };
    if (status === 'converted') {
      updates.converted_at = new Date().toISOString();
    }
    
    const response = await supabaseRequest(
      `/rest/v1/referrals?referred_wallet=ilike.${encodeURIComponent(referredWallet)}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(updates)
      }
    );
    
    return response.ok;
  } catch (err) {
    console.error('Update referral status error:', err.message);
    return false;
  }
}

/**
 * Get pending bounties for a wallet
 */
export async function getPendingBounties(walletAddress) {
  try {
    const response = await supabaseRequest(
      `/rest/v1/bounty_events?wallet_address=ilike.${encodeURIComponent(walletAddress)}&status=eq.pending&select=*&order=created_at.desc`
    );
    
    if (!response.ok) return [];
    
    return await response.json();
  } catch (err) {
    console.error('Get pending bounties error:', err.message);
    return [];
  }
}

/**
 * Get bounty history for a wallet
 */
export async function getBountyHistory(walletAddress, limit = 50) {
  try {
    const response = await supabaseRequest(
      `/rest/v1/bounty_events?wallet_address=ilike.${encodeURIComponent(walletAddress)}&select=*&order=created_at.desc&limit=${limit}`
    );
    
    if (!response.ok) return [];
    
    return await response.json();
  } catch (err) {
    console.error('Get bounty history error:', err.message);
    return [];
  }
}

/**
 * Get total sales count for a wallet (as seller)
 */
export async function getSellerSalesCount(walletAddress) {
  try {
    const response = await supabaseRequest(
      `/rest/v1/purchases?seller_wallet=ilike.${encodeURIComponent(walletAddress)}&status=eq.completed&select=id`
    );
    
    if (!response.ok) return 0;
    
    const purchases = await response.json();
    return purchases.length;
  } catch (err) {
    console.error('Get sales count error:', err.message);
    return 0;
  }
}

/**
 * Check if a wallet has ever collected (as buyer)
 */
export async function hasCollectedBefore(walletAddress) {
  try {
    const response = await supabaseRequest(
      `/rest/v1/purchases?buyer_wallet=ilike.${encodeURIComponent(walletAddress)}&status=eq.completed&select=id&limit=1`
    );
    
    if (!response.ok) return true; // Assume yes on error to avoid false rewards
    
    const purchases = await response.json();
    return purchases.length > 0;
  } catch (err) {
    console.error('Has collected check error:', err.message);
    return true;
  }
}

/**
 * Check if a wallet has earned a specific bounty type
 */
export async function hasEarnedBounty(walletAddress, eventType) {
  try {
    const response = await supabaseRequest(
      `/rest/v1/bounty_events?wallet_address=ilike.${encodeURIComponent(walletAddress)}&event_type=eq.${eventType}&select=id&limit=1`
    );
    
    if (!response.ok) return true; // Assume yes on error
    
    const events = await response.json();
    return events.length > 0;
  } catch (err) {
    console.error('Has earned bounty check error:', err.message);
    return true;
  }
}

/**
 * Check and create milestone bounties based on sales count
 */
export async function checkMilestoneBounties(sellerWallet, submissionId = null) {
  const salesCount = await getSellerSalesCount(sellerWallet);
  const results = [];
  
  for (const [milestone, eventType] of Object.entries(SALE_MILESTONES)) {
    if (salesCount >= parseInt(milestone)) {
      const alreadyEarned = await hasEarnedBounty(sellerWallet, eventType);
      if (!alreadyEarned) {
        const result = await createBountyEvent({
          walletAddress: sellerWallet,
          eventType,
          submissionId
        });
        if (result.success) {
          results.push({ eventType, amount: result.amount });
        }
      }
    }
  }
  
  return results;
}

/**
 * Handle bounties triggered by a sale
 * This should be called after a successful purchase
 */
export async function handleSaleBounties(sellerWallet, buyerWallet, submissionId) {
  const results = {
    seller: [],
    referrer: []
  };
  
  // 1. Check seller milestone bounties (first sale, 5 sales, 10 sales)
  const milestones = await checkMilestoneBounties(sellerWallet, submissionId);
  results.seller.push(...milestones);
  
  // 2. Check if seller was referred and this is their first sale
  const sellerReferral = await getReferrer(sellerWallet);
  if (sellerReferral) {
    const salesCount = await getSellerSalesCount(sellerWallet);
    
    // First sale by referred agent = referral_first_sale for referrer
    if (salesCount === 1) {
      const result = await createBountyEvent({
        walletAddress: sellerReferral.referrer_wallet,
        eventType: 'referral_first_sale',
        referredWallet: sellerWallet
      });
      if (result.success) {
        results.referrer.push({ eventType: 'referral_first_sale', amount: result.amount });
      }
      
      // Mark referral as converted
      await updateReferralStatus(sellerWallet, 'converted');
    }
    
    // 10 sales by referred agent = referral_ten_sales for referrer
    if (salesCount === 10) {
      const result = await createBountyEvent({
        walletAddress: sellerReferral.referrer_wallet,
        eventType: 'referral_ten_sales',
        referredWallet: sellerWallet
      });
      if (result.success) {
        results.referrer.push({ eventType: 'referral_ten_sales', amount: result.amount });
      }
    }
  }
  
  // 3. Check if buyer was referred and this is their first collection
  const buyerReferral = await getReferrer(buyerWallet);
  if (buyerReferral) {
    const hasCollected = await hasCollectedBefore(buyerWallet);
    
    // This would be false BEFORE the current purchase was recorded
    // We check if this is their first by seeing if they have exactly 1 purchase now
    const response = await supabaseRequest(
      `/rest/v1/purchases?buyer_wallet=ilike.${encodeURIComponent(buyerWallet)}&status=eq.completed&select=id`
    );
    const purchases = await response.json();
    
    if (purchases.length === 1) {
      const result = await createBountyEvent({
        walletAddress: buyerReferral.referrer_wallet,
        eventType: 'referral_first_collect',
        referredWallet: buyerWallet
      });
      if (result.success) {
        results.referrer.push({ eventType: 'referral_first_collect', amount: result.amount });
      }
      
      // Mark referral as converted (if not already)
      await updateReferralStatus(buyerWallet, 'converted');
    }
  }
  
  return results;
}

/**
 * Get global bounty stats
 */
export async function getBountyStats() {
  try {
    const response = await supabaseRequest('/rest/v1/bounty_stats?select=*');
    if (!response.ok) return null;
    const stats = await response.json();
    return stats[0] || null;
  } catch (err) {
    console.error('Get bounty stats error:', err.message);
    return null;
  }
}

/**
 * Get bounty stats by type
 */
export async function getBountyStatsByType() {
  try {
    const response = await supabaseRequest('/rest/v1/bounty_stats_by_type?select=*');
    if (!response.ok) return [];
    return await response.json();
  } catch (err) {
    console.error('Get bounty stats by type error:', err.message);
    return [];
  }
}

/**
 * Get referral leaderboard
 */
export async function getReferralLeaderboard(limit = 20) {
  try {
    const response = await supabaseRequest(
      `/rest/v1/referral_leaderboard?select=*&limit=${limit}`
    );
    if (!response.ok) return [];
    return await response.json();
  } catch (err) {
    console.error('Get referral leaderboard error:', err.message);
    return [];
  }
}
