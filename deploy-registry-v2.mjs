/**
 * Deploy PurchaseRegistry contract using CDP wallet.deployContract()
 */

import { Coinbase, Wallet } from '@coinbase/coinbase-sdk';
import { readFileSync, writeFileSync } from 'fs';

// Load CDP credentials
Coinbase.configureFromJson({ filePath: './cdp-api-key.json' });

// Contract artifacts
const abi = JSON.parse(readFileSync('./contracts/build/contracts_PurchaseRegistry_sol_PurchaseRegistry.abi', 'utf8'));
const bytecode = '0x' + readFileSync('./contracts/build/contracts_PurchaseRegistry_sol_PurchaseRegistry.bin', 'utf8').trim();

// Platform wallet that will record purchases
const RECORDER_ADDRESS = '0xc27b70A5B583C6E3fF90CcDC4577cC4f1f598281';

async function deploy() {
  console.log('🚀 Deploying PurchaseRegistry to Base Sepolia...\n');

  // Load deployer wallet (minter has most ETH)
  const walletData = JSON.parse(readFileSync('./wallet-minter.json', 'utf8'));
  const wallet = await Wallet.import(walletData);
  
  const address = (await wallet.getDefaultAddress()).getId();
  console.log(`📍 Deployer: ${address}`);

  const balance = await wallet.getBalance('eth');
  console.log(`💰 Balance: ${balance} ETH\n`);

  console.log('📝 Deploying contract...');
  console.log(`🔧 Recorder address: ${RECORDER_ADDRESS}\n`);

  // Deploy using CDP
  const contract = await wallet.deployContract({
    abi: abi,
    bytecode: bytecode,
    args: { _recorder: RECORDER_ADDRESS },
  });

  console.log('⏳ Waiting for deployment confirmation...');
  await contract.wait();

  const contractAddress = contract.getContractAddress();
  const deployTx = contract.getTransaction().getTransactionHash();

  console.log(`\n✅ Contract deployed!`);
  console.log(`📍 Address: ${contractAddress}`);
  console.log(`📋 Tx hash: ${deployTx}`);
  console.log(`🔗 Explorer: https://sepolia.basescan.org/address/${contractAddress}`);

  // Save contract info
  const contractInfo = {
    address: contractAddress,
    deployer: address,
    recorder: RECORDER_ADDRESS,
    deployTx: deployTx,
    deployedAt: new Date().toISOString(),
    network: 'base-sepolia',
    abi: abi
  };

  writeFileSync('./contracts/registry-deployed.json', JSON.stringify(contractInfo, null, 2));
  console.log('\n💾 Saved to contracts/registry-deployed.json');
}

deploy().catch(console.error);
