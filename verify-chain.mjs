import 'dotenv/config';
import { Coinbase, Wallet } from '@coinbase/coinbase-sdk';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLATFORM_CONTRACT = '0xf5663DF53DA46718f28C879ae1C3Fb1bDcD4490D';

// Configure CDP
Coinbase.configure({
  apiKeyName: process.env.CDP_API_KEY_NAME,
  privateKey: process.env.CDP_PRIVATE_KEY?.replace(/\\n/g, '\n')
});

// Load minter wallet
const seedPath = path.join(__dirname, 'wallet-minter.json');
const seed = JSON.parse(readFileSync(seedPath, 'utf-8'));
const wallet = await Wallet.import(seed);

// Check total supply - call the contract
const contract = await wallet.invokeContract({
  contractAddress: PLATFORM_CONTRACT,
  method: 'nextTokenId',
  args: {},
  abi: [{"inputs":[],"name":"nextTokenId","outputs":[{"type":"uint256"}],"stateMutability":"view","type":"function"}]
});

console.log('Checking on-chain token count...');
console.log('Contract result:', contract);
