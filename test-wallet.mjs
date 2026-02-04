import 'dotenv/config';
import { Coinbase, Wallet } from '@coinbase/coinbase-sdk';

console.log('CDP_API_KEY_ID:', process.env.CDP_API_KEY_ID ? 'Set' : 'Missing');

try {
  Coinbase.configure({
    apiKeyName: process.env.CDP_API_KEY_ID,
    privateKey: process.env.CDP_API_KEY_SECRET.replace(/\\n/g, '\n')
  });
  
  console.log('Creating wallet...');
  const wallet = await Wallet.create({ networkId: 'base-sepolia' });
  const address = await wallet.getDefaultAddress();
  console.log('Wallet created:', address.getId());
} catch (e) {
  console.error('Error:', e.message);
}
