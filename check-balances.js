import { Coinbase, Wallet } from '@coinbase/coinbase-sdk';
import { readFileSync } from 'fs';

Coinbase.configureFromJson({ filePath: './cdp-api-key.json' });

async function checkWallet(name, file) {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const wallet = await Wallet.import(data);
  const address = await wallet.getDefaultAddress();
  const eth = await wallet.getBalance('eth');
  const usdc = await wallet.getBalance('usdc');
  console.log(`\n${name}:`);
  console.log(`  Address: ${address.getId()}`);
  console.log(`  ETH: ${eth.toString()}`);
  console.log(`  USDC: ${usdc.toString()}`);
  return { wallet, address, eth, usdc };
}

const collector = await checkWallet('TestCollector', './wallet-collector.json');
const esque = await checkWallet('Esque', './wallet-esque.json');
