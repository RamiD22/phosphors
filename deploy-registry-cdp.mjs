/**
 * Deploy PurchaseRegistry contract using CDP SDK
 */

import { Coinbase, Wallet, SmartContract } from '@coinbase/coinbase-sdk';
import { readFileSync } from 'fs';
import { writeFileSync } from 'fs';

// Load CDP credentials
Coinbase.configureFromJson({ filePath: './cdp-api-key.json' });

// Contract artifacts
const abi = JSON.parse(readFileSync('./contracts/build/contracts_PurchaseRegistry_sol_PurchaseRegistry.abi', 'utf8'));
const bytecode = '0x' + readFileSync('./contracts/build/contracts_PurchaseRegistry_sol_PurchaseRegistry.bin', 'utf8').trim();

// Platform wallet that will record purchases
const RECORDER_ADDRESS = '0xc27b70A5B583C6E3fF90CcDC4577cC4f1f598281';

async function deploy() {
  console.log('🚀 Deploying PurchaseRegistry to Base Sepolia via CDP...\n');

  // Load deployer wallet
  const walletData = JSON.parse(readFileSync('./wallet-minter.json', 'utf8'));
  const wallet = await Wallet.import(walletData);
  
  const address = (await wallet.getDefaultAddress()).getId();
  console.log(`📍 Deployer: ${address}`);

  const balance = await wallet.getBalance('eth');
  console.log(`💰 Balance: ${balance} ETH\n`);

  // Deploy using CDP SmartContract.create
  console.log('📝 Deploying contract...');
  console.log(`🔧 Recorder address: ${RECORDER_ADDRESS}\n`);

  try {
    // Encode constructor args (address _recorder)
    const { ethers } = await import('ethers');
    const iface = new ethers.Interface(abi);
    const constructorArgs = iface.encodeDeploy([RECORDER_ADDRESS]);
    
    // Full deployment bytecode = bytecode + constructor args (without 0x prefix on args)
    const deployBytecode = bytecode + constructorArgs.slice(2);

    // Use wallet to deploy
    const defaultAddress = await wallet.getDefaultAddress();
    
    // Create and send deployment transaction
    const deployTx = await defaultAddress.invokeContract({
      contractAddress: '0x0000000000000000000000000000000000000000',
      method: '',
      abi: [],
      args: {},
      // For deployment, we need to use a different approach
    });
    
    console.log('Deployment initiated...');
    
  } catch (e) {
    console.log('CDP SmartContract.create not available, trying raw tx...');
    
    // Alternative: Use Ethers with proper key export
    const { ethers } = await import('ethers');
    
    // Get the wallet's addresses and try to sign
    const defaultAddr = await wallet.getDefaultAddress();
    
    // Try to get export data
    const exportData = wallet.export();
    console.log('Export data keys:', Object.keys(exportData));
    
    // For MPC wallets, we need to use the SDK's transaction signing
    // Let's try sending a deployment tx through the wallet
    
    const provider = new ethers.JsonRpcProvider('https://sepolia.base.org');
    
    // Encode the full deployment
    const iface = new ethers.Interface(abi);
    const deployData = bytecode + iface.encodeDeploy([RECORDER_ADDRESS]).slice(2);
    
    // Estimate gas
    const gasEstimate = await provider.estimateGas({
      from: address,
      data: deployData,
    });
    console.log(`⛽ Gas estimate: ${gasEstimate}`);
    
    // Get current gas price
    const feeData = await provider.getFeeData();
    console.log(`💸 Gas price: ${ethers.formatUnits(feeData.gasPrice, 'gwei')} gwei`);
    
    // Create unsigned tx
    const nonce = await provider.getTransactionCount(address);
    const unsignedTx = {
      to: null, // Contract creation
      data: deployData,
      nonce: nonce,
      gasLimit: gasEstimate * 2n, // 2x buffer
      maxFeePerGas: feeData.maxFeePerGas * 2n,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
      chainId: 84532, // Base Sepolia
      type: 2,
    };
    
    console.log('\n📋 Transaction details:');
    console.log(`   Nonce: ${nonce}`);
    console.log(`   Gas limit: ${unsignedTx.gasLimit}`);
    console.log(`   Data size: ${deployData.length} bytes`);
    
    // Sign and send using CDP wallet
    console.log('\n⏳ Signing and sending via CDP...');
    
    // The CDP SDK should have a way to sign arbitrary transactions
    // Let's try using the transfer method with custom data
    const transfer = await wallet.createTransfer({
      amount: 0,
      assetId: 'eth',
      destination: '0x0000000000000000000000000000000000000001', // Burn address placeholder
    });
    
    console.log('Transfer object:', transfer);
  }
}

deploy().catch(console.error);
