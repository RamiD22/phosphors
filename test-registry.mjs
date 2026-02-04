/**
 * Test PurchaseRegistry contract - record and verify a purchase
 */

import { Coinbase, Wallet } from '@coinbase/coinbase-sdk';
import { readFileSync } from 'fs';
import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';

// Load CDP credentials
Coinbase.configureFromJson({ filePath: './cdp-api-key.json' });

const REGISTRY_ADDRESS = '0x9663Bf8f68b29C4840E522eeDdb6005004F7c7a4';
const RPC_URL = 'https://sepolia.base.org';

const registryAbi = [
  {
    type: 'function',
    name: 'totalPurchases',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'recordPurchase',
    inputs: [
      { name: 'buyer', type: 'address' },
      { name: 'seller', type: 'address' },
      { name: 'pieceId', type: 'string' },
      { name: 'priceUsdc', type: 'uint256' },
      { name: 'paymentTxHash', type: 'bytes32' },
    ],
    outputs: [{ name: 'purchaseId', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getPurchase',
    inputs: [{ name: 'index', type: 'uint256' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'buyer', type: 'address' },
          { name: 'seller', type: 'address' },
          { name: 'pieceId', type: 'string' },
          { name: 'priceUsdc', type: 'uint256' },
          { name: 'timestamp', type: 'uint256' },
          { name: 'paymentTxHash', type: 'bytes32' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'checkLoop',
    inputs: [{ name: 'agent', type: 'address' }],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'recorder',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
];

async function test() {
  console.log('🧪 Testing PurchaseRegistry Contract\n');
  console.log(`📍 Contract: ${REGISTRY_ADDRESS}\n`);

  // Setup viem client for reading
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(RPC_URL),
  });

  // Check totalPurchases
  const totalBefore = await publicClient.readContract({
    address: REGISTRY_ADDRESS,
    abi: registryAbi,
    functionName: 'totalPurchases',
  });
  console.log(`📊 Total purchases before: ${totalBefore}`);

  // Check recorder
  const recorder = await publicClient.readContract({
    address: REGISTRY_ADDRESS,
    abi: registryAbi,
    functionName: 'recorder',
  });
  console.log(`🔑 Recorder address: ${recorder}\n`);

  // Load minter wallet (which is the recorder)
  console.log('📂 Loading minter wallet...');
  const walletData = JSON.parse(readFileSync('./wallet-minter.json', 'utf8'));
  const wallet = await Wallet.import(walletData);
  
  const minterAddress = (await wallet.getDefaultAddress()).getId();
  console.log(`📍 Minter address: ${minterAddress}`);
  console.log(`   Matches recorder: ${minterAddress.toLowerCase() === recorder.toLowerCase() ? '✅' : '❌'}\n`);

  // Test addresses for purchase
  const testBuyer = '0x1234567890123456789012345678901234567890';
  const testSeller = '0x0987654321098765432109876543210987654321';
  const testPieceId = 'test-piece-001';
  const testPrice = 1000000n; // 1 USDC (6 decimals)
  const testTxHash = '0x' + 'ab'.repeat(32);

  console.log('📝 Recording test purchase...');
  console.log(`   Buyer: ${testBuyer}`);
  console.log(`   Seller: ${testSeller}`);
  console.log(`   Piece: ${testPieceId}`);
  console.log(`   Price: 1 USDC\n`);

  try {
    // Use CDP to invoke the contract
    const invocation = await wallet.invokeContract({
      contractAddress: REGISTRY_ADDRESS,
      method: 'recordPurchase',
      args: {
        buyer: testBuyer,
        seller: testSeller,
        pieceId: testPieceId,
        priceUsdc: testPrice.toString(),
        paymentTxHash: testTxHash,
      },
      abi: [
        {
          type: 'function',
          name: 'recordPurchase',
          inputs: [
            { name: 'buyer', type: 'address' },
            { name: 'seller', type: 'address' },
            { name: 'pieceId', type: 'string' },
            { name: 'priceUsdc', type: 'uint256' },
            { name: 'paymentTxHash', type: 'bytes32' },
          ],
          outputs: [{ name: 'purchaseId', type: 'uint256' }],
        },
      ],
    });

    console.log('⏳ Waiting for confirmation...');
    await invocation.wait();

    const txHash = invocation.getTransaction().getTransactionHash();
    console.log(`✅ Purchase recorded!`);
    console.log(`📋 Tx: https://sepolia.basescan.org/tx/${txHash}\n`);

    // Verify the purchase
    console.log('🔍 Verifying purchase...');
    const totalAfter = await publicClient.readContract({
      address: REGISTRY_ADDRESS,
      abi: registryAbi,
      functionName: 'totalPurchases',
    });
    console.log(`📊 Total purchases after: ${totalAfter}`);

    const purchase = await publicClient.readContract({
      address: REGISTRY_ADDRESS,
      abi: registryAbi,
      functionName: 'getPurchase',
      args: [totalBefore],
    });
    console.log(`📦 Purchase #${totalBefore}:`, purchase);

    // Check loop status
    const buyerInLoop = await publicClient.readContract({
      address: REGISTRY_ADDRESS,
      abi: registryAbi,
      functionName: 'checkLoop',
      args: [testBuyer],
    });
    console.log(`\n🔄 Buyer in the loop: ${buyerInLoop ? '✅ Yes' : '❌ No'}`);

    console.log('\n✅ Registry test PASSED!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

test().catch(console.error);
