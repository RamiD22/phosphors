/**
 * CCTP Bridge API - Cross-chain USDC transfers for agents
 * 
 * Supports bridging USDC to/from Phosphors via Circle's CCTP protocol.
 * 
 * POST /api/bridge
 * {
 *   "action": "deposit" | "withdraw",
 *   "sourceChain": "ethereum-sepolia" | "solana-devnet" | "base-sepolia",
 *   "destinationChain": "base-sepolia" | "ethereum-sepolia" | "solana-devnet",
 *   "amount": "1.00",
 *   "destinationAddress": "0x..." | "So1ana..."
 * }
 */

// Note: Bridge API is stateless - no database access needed
// CCTP instructions are returned for client-side execution

// CCTP Domain IDs
const DOMAIN_IDS = {
  'ethereum-sepolia': 0,
  'base-sepolia': 6,
  'solana-devnet': 5,
};

// CCTP Contract Addresses (Testnet)
const CCTP_CONTRACTS = {
  'ethereum-sepolia': {
    tokenMessenger: '0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5',
    messageTransmitter: '0x7865fAfC2db2093669d92c0F33AeEF291086BEFD',
    usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  },
  'base-sepolia': {
    tokenMessenger: '0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5',
    messageTransmitter: '0x7865fAfC2db2093669d92c0F33AeEF291086BEFD',
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  },
  'solana-devnet': {
    cctpProgram: 'CCTPiPYPc6AsJuwueEnWgSgucamXDZwBd53dQ11YiKX3',
    usdcMint: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
  },
};

// Attestation service
const ATTESTATION_API = 'https://iris-api-sandbox.circle.com/attestations';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET - Return bridge info (static, cacheable)
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');
    return res.status(200).json({
      name: 'Phosphors CCTP Bridge',
      description: 'Bridge USDC across chains using Circle CCTP',
      supportedChains: Object.keys(DOMAIN_IDS),
      contracts: CCTP_CONTRACTS,
      attestationApi: ATTESTATION_API,
      usage: {
        deposit: 'Bridge USDC from another chain to Base Sepolia for use on Phosphors',
        withdraw: 'Bridge USDC from Base Sepolia to another chain',
      },
      steps: {
        evm_to_evm: [
          '1. Approve USDC spend on TokenMessenger',
          '2. Call depositForBurn() on source TokenMessenger',
          '3. Wait for attestation from Circle API',
          '4. Call receiveMessage() on destination MessageTransmitter',
        ],
        solana_to_evm: [
          '1. Create burn instruction via CCTP program',
          '2. Send and confirm transaction',
          '3. Wait for attestation from Circle API', 
          '4. Call receiveMessage() on destination MessageTransmitter',
        ],
      },
    });
  }

  // POST - Initiate or complete bridge
  if (req.method === 'POST') {
    let body;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
    
    const { action, sourceChain, destinationChain, amount, destinationAddress, messageSent, attestation } = body;

    // Validate chains
    if (!(sourceChain in DOMAIN_IDS) || !(destinationChain in DOMAIN_IDS)) {
      return res.status(400).json({
        error: 'Invalid chain',
        supportedChains: Object.keys(DOMAIN_IDS),
      });
    }

    if (sourceChain === destinationChain) {
      return res.status(400).json({ error: 'Source and destination must be different chains' });
    }

    // Return instructions for the bridge
    const sourceDomain = DOMAIN_IDS[sourceChain];
    const destDomain = DOMAIN_IDS[destinationChain];
    const sourceContracts = CCTP_CONTRACTS[sourceChain];
    const destContracts = CCTP_CONTRACTS[destinationChain];

    // If attestation provided, return receive instructions
    if (attestation && messageSent) {
      return res.status(200).json({
        step: 'receive',
        instructions: {
          chain: destinationChain,
          contract: destContracts.messageTransmitter,
          method: 'receiveMessage(bytes message, bytes attestation)',
          params: {
            message: messageSent,
            attestation: attestation,
          },
        },
      });
    }

    // Return burn/deposit instructions
    const amountInDecimals = Math.floor(parseFloat(amount) * 1e6); // USDC has 6 decimals

    if (sourceChain === 'solana-devnet') {
      // Solana -> EVM bridge
      const mintRecipient = destinationAddress 
        ? `0x000000000000000000000000${destinationAddress.slice(2)}` 
        : '<provide destinationAddress>';
      
      return res.status(200).json({
        step: 'burn',
        chain: sourceChain,
        instructions: {
          program: sourceContracts.cctpProgram,
          usdcMint: sourceContracts.usdcMint,
          amount: amountInDecimals,
          destinationDomain: destDomain,
          destinationAddress: destinationAddress || '<required>',
          mintRecipient: mintRecipient,
        },
        nextStep: {
          description: 'After burn tx confirms, poll attestation API',
          attestationApi: `${ATTESTATION_API}/{messageHash}`,
          then: 'POST back with attestation to get receive instructions',
        },
      });
    }

    // EVM -> EVM or EVM -> Solana bridge
    return res.status(200).json({
      step: 'burn',
      chain: sourceChain,
      instructions: {
        approve: {
          contract: sourceContracts.usdc,
          method: 'approve(address spender, uint256 amount)',
          params: {
            spender: sourceContracts.tokenMessenger,
            amount: amountInDecimals,
          },
        },
        depositForBurn: {
          contract: sourceContracts.tokenMessenger,
          method: 'depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken)',
          params: {
            amount: amountInDecimals,
            destinationDomain: destDomain,
            mintRecipient: destinationChain === 'solana-devnet' 
              ? (destinationAddress || '<provide solana address>') // Solana address as base58
              : (destinationAddress ? `0x000000000000000000000000${destinationAddress.slice(2)}` : '<provide destinationAddress>'), // Pad EVM address to 32 bytes
            burnToken: sourceContracts.usdc,
          },
        },
      },
      nextStep: {
        description: 'After depositForBurn tx confirms, get messageHash from MessageSent event',
        attestationApi: `${ATTESTATION_API}/{messageHash}`,
        polling: 'Poll until status is "complete"',
        then: 'POST back with messageSent bytes and attestation to get receive instructions',
      },
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
