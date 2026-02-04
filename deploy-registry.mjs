/**
 * Deploy PurchaseRegistry contract to Base Sepolia
 */

import { Coinbase, Wallet } from '@coinbase/coinbase-sdk';
import { readFileSync } from 'fs';
import { ethers } from 'ethers';

// Load CDP credentials
Coinbase.configureFromJson({ filePath: './cdp-api-key.json' });

// Contract artifacts
const abi = JSON.parse(readFileSync('./contracts/build/contracts_PurchaseRegistry_sol_PurchaseRegistry.abi', 'utf8'));
const bytecode = '0x' + readFileSync('./contracts/build/contracts_PurchaseRegistry_sol_PurchaseRegistry.bin', 'utf8').trim();

// Platform wallet that will record purchases
const RECORDER_ADDRESS = '0xc27b70A5B583C6E3fF90CcDC4577cC4f1f598281'; // Minter wallet

async function deploy() {
  console.log('🚀 Deploying PurchaseRegistry to Base Sepolia...\n');

  // Load deployer wallet (use minter wallet)
  const walletData = JSON.parse(readFileSync('./wallet-minter.json', 'utf8'));
  const wallet = await Wallet.import(walletData);
  
  const address = (await wallet.getDefaultAddress()).getId();
  console.log(`📍 Deployer: ${address}`);

  // Check balance
  const balance = await wallet.getBalance('eth');
  console.log(`💰 Balance: ${balance} ETH`);

  if (parseFloat(balance) < 0.001) {
    console.error('❌ Not enough ETH for deployment');
    process.exit(1);
  }

  // Deploy using CDP
  console.log('\n📝 Deploying contract...');
  
  // Create provider for Base Sepolia
  const provider = new ethers.JsonRpcProvider('https://sepolia.base.org');
  
  // Get private key from seed (CDP uses the seed directly as private key for first address)
  const seed = walletData.seed;
  
  // Create ethers wallet from seed (CDP seed is the private key)
  const ethersWallet = new ethers.Wallet('0x' + seed, provider);
  
  // Create contract factory
  const factory = new ethers.ContractFactory(abi, bytecode, ethersWallet);
  
  // Deploy with recorder address
  console.log(`🔧 Recorder address: ${RECORDER_ADDRESS}`);
  const contract = await factory.deploy(RECORDER_ADDRESS);
  
  console.log(`⏳ Waiting for deployment...`);
  console.log(`📋 Tx hash: ${contract.deploymentTransaction().hash}`);
  
  await contract.waitForDeployment();
  
  const contractAddress = await contract.getAddress();
  console.log(`\n✅ Contract deployed!`);
  console.log(`📍 Address: ${contractAddress}`);
  console.log(`🔗 Explorer: https://sepolia.basescan.org/address/${contractAddress}`);
  
  // Save contract info
  const contractInfo = {
    address: contractAddress,
    deployer: address,
    recorder: RECORDER_ADDRESS,
    deployTx: contract.deploymentTransaction().hash,
    deployedAt: new Date().toISOString(),
    network: 'base-sepolia',
    abi: abi
  };
  
  const fs = await import('fs');
  fs.writeFileSync('./contracts/registry-deployed.json', JSON.stringify(contractInfo, null, 2));
  console.log('\n💾 Saved to contracts/registry-deployed.json');
}

deploy().catch(console.error);
