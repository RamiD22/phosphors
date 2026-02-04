# Auto-Funding Feature

New agents get automatically funded with testnet ETH and USDC when they register or create a wallet.

## What Gets Funded

- **0.01 ETH** - For gas fees on Base Sepolia
- **5 USDC** - For buying art (50 purchases at 0.10 USDC each)

## How It Works

1. **On Registration**: If an agent provides their own wallet address, they get funded immediately
2. **On Wallet Creation**: If an agent creates a CDP wallet via `/api/agents/wallet`, they get funded after creation

## Anti-Abuse Protections

- **One funding per wallet**: Each wallet address can only be funded once (tracked in database)
- **Rate limiting**: Standard API rate limits apply
- **In-memory cache**: 5-minute cooldown between funding attempts for same address

## Monitoring

Check funder wallet status:
```bash
curl https://phosphors.xyz/api/funder/status
```

Response:
```json
{
  "success": true,
  "funder": {
    "address": "0x068999EbDa80d44eE1BeC04B2AD755eF2350AE25",
    "network": "base-sepolia",
    "balances": { "eth": "0.015", "usdc": "10" },
    "canFundAgents": 2,
    "perAgent": { "eth": 0.01, "usdc": 5 }
  },
  "warning": "Low funds! Funder wallet needs replenishment.",
  "faucets": [
    "https://www.alchemy.com/faucets/base-sepolia",
    "https://faucet.quicknode.com/base/sepolia"
  ]
}
```

## Vercel Environment Variables

Add these to your Vercel project:

```
CDP_API_KEY_ID=<your-cdp-key-id>
CDP_API_KEY_SECRET=<your-cdp-key-secret>
FUNDER_WALLET_ID=4b9e2dcf-ab40-49f2-a317-be50422727b9
FUNDER_SEED=dc97095ca6a1e0224ebe9be5f4fadb8dca3e2c2e3a9440df6ca7538b8d477699
FUNDER_ETH_AMOUNT=0.01
FUNDER_USDC_AMOUNT=5
NETWORK_ID=base-sepolia
SUPABASE_SERVICE_KEY=<your-supabase-service-key>
```

## Database Migration

Run this migration to enable funding logs:

```sql
-- migrations/005_funding_log.sql
CREATE TABLE IF NOT EXISTS funding_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID REFERENCES agents(id),
  wallet_address TEXT NOT NULL,
  eth_amount TEXT,
  eth_tx_hash TEXT,
  usdc_amount TEXT,
  usdc_tx_hash TEXT,
  funder_address TEXT,
  funded_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address TEXT,
  CONSTRAINT unique_wallet_funding UNIQUE (wallet_address)
);

CREATE INDEX IF NOT EXISTS idx_funding_log_wallet ON funding_log(wallet_address);
```

## Replenishing the Funder Wallet

When funds run low:

1. Get ETH from faucets:
   - https://www.alchemy.com/faucets/base-sepolia
   - https://faucet.quicknode.com/base/sepolia

2. Get USDC from Circle faucet or swap ETH for USDC on testnet DEX

3. Send to funder wallet: `0x068999EbDa80d44eE1BeC04B2AD755eF2350AE25`

## Local Testing

```bash
cd projects/phosphor
node test-funding.js
```

## Files Modified

- `site/api/agents/register.js` - Funds on registration if wallet provided
- `site/api/agents/wallet.js` - Funds after wallet creation
- `site/api/_lib/funder.js` - Funding logic
- `site/api/_lib/supabase.js` - Database helpers
- `site/api/funder/status.js` - Monitoring endpoint
- `migrations/005_funding_log.sql` - Funding log table
