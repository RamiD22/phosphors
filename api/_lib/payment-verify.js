// On-chain payment verification for Phosphors
// Verifies USDC transfers on Base before confirming purchases

// Network configuration
const IS_MAINNET = process.env.NETWORK_ID === 'base-mainnet';
const RPC_URL = IS_MAINNET 
  ? 'https://mainnet.base.org' 
  : 'https://sepolia.base.org';

// USDC contract addresses
const USDC_CONTRACT = IS_MAINNET
  ? '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' // Base Mainnet USDC
  : '0x036CbD53842c5426634e7929541eC2318f3dCF7e'; // Base Sepolia USDC

// Platform wallet that receives payments
const PLATFORM_WALLET = process.env.MINTER_WALLET || '0xc27b70A5B583C6E3fF90CcDC4577cC4f1f598281';

// USDC has 6 decimals
const USDC_DECIMALS = 6;

// ERC20 Transfer event signature
const TRANSFER_EVENT_SIGNATURE = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

/**
 * Verify that a transaction is a valid USDC payment
 * @param {string} txHash - Transaction hash to verify
 * @param {object} expected - Expected payment details
 * @param {string} expected.from - Expected sender address
 * @param {number} expected.amount - Expected amount in USDC (human readable, e.g., 0.10)
 * @param {string} expected.to - Expected recipient (optional, defaults to platform wallet)
 * @returns {object} { valid: boolean, error?: string, details?: object }
 */
export async function verifyPayment(txHash, expected) {
  // Validate inputs
  if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return { valid: false, error: 'Invalid transaction hash format' };
  }
  
  if (!expected.from || !/^0x[a-fA-F0-9]{40}$/.test(expected.from)) {
    return { valid: false, error: 'Invalid sender address' };
  }
  
  if (typeof expected.amount !== 'number' || expected.amount <= 0) {
    return { valid: false, error: 'Invalid amount' };
  }
  
  const recipient = (expected.to || PLATFORM_WALLET).toLowerCase();
  const sender = expected.from.toLowerCase();
  const expectedAmountWei = BigInt(Math.round(expected.amount * (10 ** USDC_DECIMALS)));
  
  try {
    // Fetch transaction receipt
    const receiptResponse = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getTransactionReceipt',
        params: [txHash]
      })
    });
    
    const receiptData = await receiptResponse.json();
    const receipt = receiptData.result;
    
    if (!receipt) {
      return { valid: false, error: 'Transaction not found or not yet confirmed' };
    }
    
    // Check transaction was successful
    if (receipt.status !== '0x1') {
      return { valid: false, error: 'Transaction failed on-chain' };
    }
    
    // Check the transaction is to the USDC contract
    if (receipt.to?.toLowerCase() !== USDC_CONTRACT.toLowerCase()) {
      return { valid: false, error: 'Transaction is not a USDC transfer' };
    }
    
    // Parse Transfer events from logs
    const transferLogs = receipt.logs.filter(log => 
      log.topics[0] === TRANSFER_EVENT_SIGNATURE &&
      log.address.toLowerCase() === USDC_CONTRACT.toLowerCase()
    );
    
    if (transferLogs.length === 0) {
      return { valid: false, error: 'No USDC transfer found in transaction' };
    }
    
    // Find a matching transfer
    for (const log of transferLogs) {
      // ERC20 Transfer: topics[1] = from, topics[2] = to, data = amount
      const logFrom = '0x' + log.topics[1].slice(26).toLowerCase();
      const logTo = '0x' + log.topics[2].slice(26).toLowerCase();
      const logAmount = BigInt(log.data);
      
      // Check if this transfer matches our expected payment
      if (logFrom === sender && logTo === recipient) {
        // Allow small tolerance for rounding (0.01 USDC = 10000 wei)
        const tolerance = BigInt(10000);
        const diff = logAmount > expectedAmountWei 
          ? logAmount - expectedAmountWei 
          : expectedAmountWei - logAmount;
        
        if (diff <= tolerance) {
          return {
            valid: true,
            details: {
              txHash,
              from: logFrom,
              to: logTo,
              amount: Number(logAmount) / (10 ** USDC_DECIMALS),
              blockNumber: parseInt(receipt.blockNumber, 16),
              confirmations: 'confirmed'
            }
          };
        } else {
          return {
            valid: false,
            error: `Amount mismatch: expected ${expected.amount} USDC, got ${Number(logAmount) / (10 ** USDC_DECIMALS)} USDC`
          };
        }
      }
    }
    
    return { valid: false, error: 'No matching USDC transfer found (wrong sender or recipient)' };
    
  } catch (err) {
    console.error('Payment verification error:', err);
    return { valid: false, error: 'Failed to verify transaction on-chain' };
  }
}

/**
 * Check if a transaction has been used for a previous purchase
 * @param {string} txHash - Transaction hash
 * @returns {boolean} True if already used
 */
export async function isTransactionUsed(txHash) {
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://afcnnalweuwgauzijefs.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  
  if (!SUPABASE_KEY) {
    console.warn('Cannot check transaction usage - no service key');
    return false;
  }
  
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/purchases?tx_hash=eq.${encodeURIComponent(txHash)}&select=id&limit=1`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      }
    );
    
    if (!res.ok) return false;
    const purchases = await res.json();
    return purchases.length > 0;
  } catch (err) {
    console.error('Transaction usage check error:', err);
    return false;
  }
}

/**
 * Full payment verification workflow
 * @param {string} txHash - Transaction hash
 * @param {string} buyerAddress - Expected buyer wallet
 * @param {number} amount - Expected amount in USDC
 * @returns {object} Verification result
 */
export async function verifyPurchasePayment(txHash, buyerAddress, amount) {
  // Step 1: Check if transaction was already used
  const alreadyUsed = await isTransactionUsed(txHash);
  if (alreadyUsed) {
    return { valid: false, error: 'Transaction already used for a previous purchase' };
  }
  
  // Step 2: Verify on-chain
  const verification = await verifyPayment(txHash, {
    from: buyerAddress,
    amount: amount
  });
  
  return verification;
}
