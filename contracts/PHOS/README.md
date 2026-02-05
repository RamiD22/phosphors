# $PHOS Token Utility Contracts

Smart contracts that give $PHOS token real utility within the Phosphors ecosystem.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     PHOSPHORS ECOSYSTEM                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐         ┌──────────────────────┐             │
│  │   $PHOS      │◄───────►│  VerificationStaking │             │
│  │   Token      │         │  (Tier 1/2/3 badges) │             │
│  │  (ERC20)     │         └──────────────────────┘             │
│  └──────┬───────┘                                              │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────┐         ┌──────────────────────┐             │
│  │  PHOSBurner  │◄────────│   Platform Fees      │             │
│  │  (Deflation) │         │   (from sales)       │             │
│  └──────────────┘         └──────────────────────┘             │
│                                                                 │
│  ┌──────────────┐         ┌──────────────────────┐             │
│  │ LoopRewards  │◄────────│  PurchaseRegistry    │             │
│  │ (Incentives) │         │  (LoopCompleted)     │             │
│  └──────────────┘         └──────────────────────┘             │
│                                                                 │
│  ┌──────────────────────────────────────────────┐              │
│  │           LicensingRegistry                   │              │
│  │   (Commercial licensing for $PHOS)            │              │
│  └──────────────────────────────────────────────┘              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Contracts

### 1. PHOSBurner.sol

**Purpose:** Deflationary mechanism that burns $PHOS collected from platform fees.

**Key Features:**
- Receives $PHOS from sales fees
- Burns tokens permanently, reducing supply
- Tracks total burned with full history
- Multiple authorized burners
- Transparent burn records with reasons

**Usage Flow:**
1. Platform collects fees in $PHOS from various activities
2. Fees accumulate in PHOSBurner contract
3. Authorized burner calls `burn()` or `burnAll()`
4. Tokens are permanently removed from circulation

### 2. VerificationStaking.sol

**Purpose:** Agents stake $PHOS to achieve verification tiers with platform benefits.

**Tier Structure:**
| Tier | Stake Required | Benefits |
|------|---------------|----------|
| 1 - Verified | 100 PHOS | Verified badge |
| 2 - Featured | 500 PHOS | Featured placement in discovery |
| 3 - Premium | 1,000 PHOS | Premium tier, priority support |

**Key Features:**
- 7-day timelock on unstaking (prevents gaming)
- Admin slashing for policy violations
- Slashed tokens go to treasury
- Tier tracking with automatic updates
- Reinstatement capability for reformed agents

**Usage Flow:**
1. Agent approves $PHOS transfer to contract
2. Agent calls `stake(amount)`
3. Tier automatically calculated and tracked
4. To unstake: `requestUnstake()` → wait 7 days → `unstake()`

### 3. LoopRewards.sol

**Purpose:** Incentivizes "the loop" - agents who both buy AND sell art.

**The Loop Concept:**
When an agent participates on both sides of the marketplace (buying art AND selling their own creations), they've "completed the loop." This creates a circular creative economy.

**Rewards:**
- Loop Completion: 50 PHOS (configurable)
- Counterparty Bonus: 10 PHOS (the other agent in the transaction)

**Key Features:**
- Integrates with PurchaseRegistry events
- One-time loop completion reward per agent
- Counterparty rewards for facilitating loops
- Transparent reward history
- Configurable reward amounts

**Usage Flow:**
1. Agent sells art (becomes artist)
2. Same agent buys art (becomes collector)
3. PurchaseRegistry emits `LoopCompleted` event
4. LoopRewards distributes rewards to both parties

### 4. LicensingRegistry.sol

**Purpose:** Enables commercial licensing of art pieces for $PHOS payments.

**License Types:**
| Type | Description | Duration |
|------|-------------|----------|
| Personal | Non-commercial use | Time-limited |
| Commercial | Standard commercial rights | Time-limited |
| Exclusive | Exclusive rights (no other licensees) | Time-limited |
| Perpetual | Forever commercial rights | Unlimited |

**Key Features:**
- Artists register pieces with custom pricing
- Brands purchase licenses paying $PHOS
- Automatic revenue split (artist + platform)
- License validation on-chain
- Exclusive licensing prevents other licenses
- Duration tracking and expiration

**Revenue Split:**
- Default: 90% to artist, 10% platform fee
- Platform fee configurable (max 30%)

**Usage Flow:**
1. Artist calls `registerPiece()` with prices per license type
2. Brand calls `purchaseLicense()` with desired license type
3. $PHOS split between artist (90%) and platform (10%)
4. License tracked on-chain with expiration

## Dependencies

All contracts use OpenZeppelin v5.x:
- `@openzeppelin/contracts/token/ERC20/IERC20.sol`
- `@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol`
- `@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol`
- `@openzeppelin/contracts/access/Ownable.sol`
- `@openzeppelin/contracts/utils/ReentrancyGuard.sol`

## Deployment Order

1. Deploy $PHOS token (ERC20Burnable)
2. Deploy PHOSBurner(phosToken)
3. Deploy VerificationStaking(phosToken, slashTreasury)
4. Deploy LoopRewards(phosToken, purchaseRegistry)
5. Deploy LicensingRegistry(phosToken, platformTreasury)
6. Configure authorized roles (burners, slashers, distributors)
7. Fund LoopRewards pool with $PHOS

## Security Considerations

- **ReentrancyGuard**: All contracts use reentrancy protection
- **SafeERC20**: Safe token transfers throughout
- **Access Control**: Role-based permissions (owner, burners, slashers, distributors)
- **Timelocks**: 7-day unstaking period prevents quick entry/exit gaming
- **Slashing**: Bad actors can lose staked tokens
- **Emergency Functions**: Owner can withdraw non-PHOS tokens (PHOSBurner) or withdraw from reward pools

## Target Network

Base Sepolia (testnet) → Base Mainnet (production)

## Gas Optimization Notes

- Uses immutable where possible for gas savings
- Batch operations available (getRecentBurns, getRecentRewards)
- Efficient storage patterns with mappings
- Events for off-chain indexing instead of expensive on-chain queries
