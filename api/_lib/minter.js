/**
 * NFT Minting Library for Phosphors
 * 
 * Handles on-chain minting via Platform contract
 */

import { getMinterWallet } from './wallet.js';

const PLATFORM_CONTRACT = process.env.PLATFORM_CONTRACT || '0xf5663DF53DA46718f28C879ae1C3Fb1bDcD4490D';

const ABI = [
  {
    "inputs": [{"name": "to", "type": "address"}],
    "name": "mint",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "nextTokenId",
    "outputs": [{"type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  }
];

/**
 * Get the next token ID from the contract
 * 
 * @returns {number} - Next token ID
 */
export async function getNextTokenId() {
  const { wallet } = await getMinterWallet();
  
  const result = await wallet.invokeContract({
    contractAddress: PLATFORM_CONTRACT,
    method: 'nextTokenId',
    args: {},
    abi: ABI
  });
  
  // Parse the result - nextTokenId returns the next ID to mint
  const nextId = parseInt(result.toString());
  return nextId;
}

/**
 * Mint an NFT to a recipient address
 * 
 * @param {string} recipientAddress - Address to mint to
 * @returns {object} - { success, tokenId, txHash, error }
 */
export async function mintNFT(recipientAddress) {
  try {
    // Validate address
    if (!recipientAddress || !/^0x[a-fA-F0-9]{40}$/.test(recipientAddress)) {
      return { success: false, error: 'Invalid recipient address' };
    }
    
    console.log(`🎨 Minting NFT to ${recipientAddress}...`);
    
    const { wallet, error: walletError } = await getMinterWallet();
    if (walletError) {
      return { success: false, error: walletError };
    }
    
    // Get the token ID BEFORE minting
    // Note: nextTokenId returns the ID that WILL be minted
    let tokenId;
    try {
      const nextIdResult = await wallet.invokeContract({
        contractAddress: PLATFORM_CONTRACT,
        method: 'nextTokenId',
        args: {},
        abi: ABI
      });
      // The result needs to be awaited and parsed
      await nextIdResult.wait();
      // After wait, we need to call the read function differently
      // For now, we'll track based on mint order
    } catch (e) {
      console.log('⚠️ Could not pre-fetch token ID, will derive from tx');
    }
    
    // Execute mint
    const invocation = await wallet.invokeContract({
      contractAddress: PLATFORM_CONTRACT,
      method: 'mint',
      args: { to: recipientAddress },
      abi: ABI
    });
    
    const result = await invocation.wait();
    
    if (result.getStatus() !== 'complete') {
      return {
        success: false,
        error: `Mint failed with status: ${result.getStatus()}`
      };
    }
    
    const txHash = result.getTransaction().getTransactionHash();
    
    // Parse token ID from transaction logs
    // The Transfer event contains: from, to, tokenId
    const tx = result.getTransaction();
    tokenId = await parseTokenIdFromTx(txHash);
    
    console.log(`✅ Minted token #${tokenId} → ${recipientAddress}`);
    console.log(`   TX: ${txHash}`);
    
    return {
      success: true,
      tokenId,
      txHash,
      recipient: recipientAddress
    };
    
  } catch (error) {
    console.error('❌ Minting error:', error.message);
    return {
      success: false,
      error: error.message || 'Minting failed'
    };
  }
}

/**
 * Parse token ID from transaction (via events or receipt)
 */
async function parseTokenIdFromTx(txHash) {
  // For ERC721, the Transfer event signature is:
  // Transfer(address indexed from, address indexed to, uint256 indexed tokenId)
  // In a mint, 'from' is address(0)
  
  // Try to fetch from Base Sepolia explorer API
  try {
    const response = await fetch(
      `https://api-sepolia.basescan.org/api?module=proxy&action=eth_getTransactionReceipt&txhash=${txHash}`
    );
    const data = await response.json();
    
    if (data.result && data.result.logs) {
      // Find Transfer event (topic0 = keccak256("Transfer(address,address,uint256)"))
      const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
      const transferLog = data.result.logs.find(log => 
        log.topics[0] === transferTopic && 
        log.address.toLowerCase() === PLATFORM_CONTRACT.toLowerCase()
      );
      
      if (transferLog && transferLog.topics[3]) {
        // Topic[3] is the tokenId (indexed)
        return parseInt(transferLog.topics[3], 16);
      }
    }
  } catch (e) {
    console.log('⚠️ Could not parse token ID from tx:', e.message);
  }
  
  // Fallback: return null and let caller handle
  return null;
}

/**
 * Batch mint multiple NFTs (with rate limiting)
 * 
 * @param {Array} submissions - Array of { id, recipientAddress }
 * @param {function} onMinted - Callback for each successful mint
 * @param {number} delayMs - Delay between mints (default 3000ms)
 */
export async function batchMint(submissions, onMinted, delayMs = 3000) {
  const results = [];
  
  for (const submission of submissions) {
    const result = await mintNFT(submission.recipientAddress);
    
    if (result.success) {
      results.push({
        submissionId: submission.id,
        ...result
      });
      
      if (onMinted) {
        await onMinted(submission.id, result);
      }
    } else {
      results.push({
        submissionId: submission.id,
        success: false,
        error: result.error
      });
    }
    
    // Rate limiting between mints
    if (submissions.indexOf(submission) < submissions.length - 1) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  
  return results;
}

export { PLATFORM_CONTRACT };
