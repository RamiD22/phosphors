import { Coinbase, Wallet } from '@coinbase/coinbase-sdk';
import { readFileSync, readdirSync } from 'fs';

Coinbase.configureFromJson({ filePath: './cdp-api-key.json' });

const walletFiles = readdirSync('.').filter(f => f.startsWith('wallet-') && f.endsWith('.json'));

for (const file of walletFiles) {
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    if (!data.walletId || !data.seed) {
      console.log(`\n${file}: No walletId/seed`);
      continue;
    }
    const wallet = await Wallet.import({
      walletId: data.walletId,
      seed: data.seed,
      networkId: data.networkId || 'base-sepolia'
    });
    const address = await wallet.getDefaultAddress();
    const eth = await wallet.getBalance('eth');
    const usdc = await wallet.getBalance('usdc');
    console.log(`\n${file}:`);
    console.log(`  Address: ${address.getId()}`);
    console.log(`  ETH: ${eth.toString()}`);
    console.log(`  USDC: ${usdc.toString()}`);
  } catch (e) {
    console.log(`\n${file}: Error - ${e.message}`);
  }
}
