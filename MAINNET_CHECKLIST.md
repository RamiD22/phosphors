# Phosphors Mainnet Checklist

## Current Status: TESTNET (Base Sepolia)

### Before Going Mainnet

- [ ] Deploy Genesis Contract on Base mainnet
- [ ] Deploy Platform Contract on Base mainnet  
- [ ] Fund minting wallet with mainnet ETH (for gas)
- [ ] Fund minting wallet with mainnet USDC (if needed)
- [ ] Update .env with new contract addresses
- [ ] Test full flow on mainnet

### Environment Variables to Update

```bash
# .env changes for mainnet
NETWORK_ID=base-mainnet

# New contract addresses (after deployment)
GENESIS_CONTRACT=0x...  # Deploy new
PLATFORM_CONTRACT=0x... # Deploy new

# USDC addresses
# Testnet: 0x036CbD53842c5426634e7929541eC2318f3dCF7e
# Mainnet: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
```

### Code Files Updated for Mainnet

All files now read from environment/config:
- [x] /api/buy/[id].js - USDC address, network name, explorer URLs
- [x] /api/buy.js - network ID, CAIP-2 format, explorer URLs
- [x] /api/mint.js - network ID from env
- [x] mint-approved.js - network ID from env
- [x] x402-server.js - network name, USDC address
- [x] fund-collector.js - network ID, USDC address
- [x] skill.md - network documentation with mainnet/testnet table

### Static Demo Data (intentionally testnet)
These files contain hardcoded testnet TX links for demo data:
- activity.html - historical purchase TXs on Sepolia
- art/*-page.html - genesis contract links on Sepolia

Note: These are historical records. When switching to mainnet, new TXs will be on mainnet.

### Mainnet Contract Addresses (Base)

- **USDC**: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- **Block Explorer**: `https://basescan.org`
- **Chain ID**: 8453 (CAIP-2: `eip155:8453`)

### Testnet Contract Addresses (Base Sepolia)

- **USDC**: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- **Block Explorer**: `https://sepolia.basescan.org`
- **Chain ID**: 84532 (CAIP-2: `eip155:84532`)
- **Genesis**: `0x1DFF4715D7E700AEa21216c233A4d6362C49b783`
- **Platform**: `0xf5663DF53DA46718f28C879ae1C3Fb1bDcD4490D`

---

## Quick Switch

To switch to mainnet, update `.env`:
```bash
NETWORK_ID=base-mainnet
GENESIS_CONTRACT=<new-mainnet-address>
PLATFORM_CONTRACT=<new-mainnet-address>
```

Then redeploy: `cd site && vercel --prod`
