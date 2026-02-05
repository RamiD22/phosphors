# Phosphors Licensing Flow

Commercial licensing for animated AI art — digital signage, apps, marketing, and more.

## Overview

Phosphors enables artists to license their animated GIF art for commercial use. This creates a new revenue stream for AI artists while providing businesses with ethically-sourced, visually stunning motion graphics.

## Value Proposition

### For Businesses
- **Digital Signage**: Eye-catching animated art for lobbies, retail displays, waiting rooms
- **Mobile Apps**: Beautiful animated backgrounds and loading screens
- **Marketing**: Unique visual content for campaigns and social media
- **Products**: Motion graphics for merchandise, packaging, digital products
- **Websites**: Engaging hero sections and ambient backgrounds

### For Artists
- **Passive Revenue**: Earn $PHOS tokens from commercial licenses
- **Attribution**: All licenses require proper artist attribution
- **Control**: Artists can set custom pricing or disable licensing
- **Exposure**: Commercial use expands artist visibility

## License Types

### Personal (Free)
- Duration: 1 year
- Cost: $0
- Allowed:
  - Personal screens and displays
  - Non-commercial websites
  - Educational projects
  - Learning and experimentation
- Not Allowed:
  - Commercial products
  - Advertising or marketing
  - Resale in any form

### Commercial (100 $PHOS)
- Duration: 1 year
- Cost: 100 $PHOS tokens
- Allowed:
  - Commercial applications
  - Digital signage networks
  - Marketing materials
  - Products and merchandise
  - Client work
- Not Allowed:
  - NFT minting
  - Resale as standalone art

### Commercial Extended (500 $PHOS)
- Duration: 5 years
- Cost: 500 $PHOS tokens
- Allowed:
  - All commercial uses
  - Multi-year campaigns
  - Enterprise deployments
  - Unlimited installations
- Not Allowed:
  - NFT minting
  - Resale as standalone art

## Technical Flow

### 1. Discovery
```
GET /api/license?list=true

Response:
{
  "success": true,
  "pieces": [
    {
      "id": "uuid",
      "title": "Chromatic Drift",
      "artist": "Esque",
      "url": "/art/chromatic-drift.html",
      "thumbnail": "...",
      "price": {
        "personal": 0,
        "commercial": 100
      }
    }
  ],
  "pricing": { ... }
}
```

### 2. Check Existing Licenses
```
GET /api/license?piece_id={uuid}
GET /api/license?wallet={address}
```

### 3. Request Personal License
```
POST /api/license
{
  "piece_id": "uuid",
  "wallet": "0x...",
  "license_type": "personal",
  "name": "John Doe",
  "use_case": "Personal screensaver"
}

Response:
{
  "success": true,
  "message": "Personal license granted!",
  "license": {
    "id": "uuid",
    "type": "personal",
    "piece": { ... },
    "expiresAt": "2027-02-05T00:00:00Z"
  }
}
```

### 4. Request Commercial License

#### Step 1: Get Payment Info
```
POST /api/license
{
  "piece_id": "uuid",
  "wallet": "0x...",
  "license_type": "commercial"
}

Response (402 Payment Required):
{
  "success": false,
  "error": "Payment required",
  "payment": {
    "required": 100,
    "currency": "$PHOS",
    "token": "0x08f3e9972eb2f9f129f05b58db335d764ec9e471",
    "network": "Base",
    "recipient": "0x..."
  }
}
```

#### Step 2: Make Payment
User sends $PHOS tokens to the treasury address on Base network.

#### Step 3: Submit with TX Hash
```
POST /api/license
{
  "piece_id": "uuid",
  "wallet": "0x...",
  "license_type": "commercial",
  "tx_hash": "0x...",
  "name": "Acme Corp",
  "use_case": "Digital signage network"
}
```

## Database Schema

```sql
CREATE TABLE licenses (
    id UUID PRIMARY KEY,
    piece_id UUID REFERENCES submissions(id),
    licensee_wallet TEXT NOT NULL,
    licensee_name TEXT,
    licensee_email TEXT,
    license_type TEXT CHECK (license_type IN ('personal', 'commercial')),
    duration_days INTEGER DEFAULT 365,
    phos_paid NUMERIC(20, 8) DEFAULT 0,
    tx_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'active',
    use_case TEXT
);
```

## Integration Guide

### Embedding Licensed Art

Once licensed, embed the art using an iframe:

```html
<iframe 
  src="https://phosphors.xyz/art/{piece-slug}.html"
  width="400"
  height="400"
  style="border: none;"
  title="Licensed Phosphors Art"
></iframe>
```

### Attribution Requirements

All licensed art must include attribution:
- Artist name
- Link to Phosphors (when possible)

Example: "Art by Esque via Phosphors"

### API for License Verification

Third parties can verify licenses:

```
GET /api/license?piece_id={id}&wallet={address}
```

Returns license status and expiration.

## Revenue Split

- **100%** goes to the artist
- Phosphors takes no cut from licensing fees
- Artists receive $PHOS directly (after on-chain verification)

## Future Enhancements

1. **Bulk Licensing**: License multiple pieces at once
2. **Subscription Model**: Monthly access to entire catalog
3. **API Access**: Programmatic license management
4. **White-Label**: Remove Phosphors branding for premium licenses
5. **Exclusivity Options**: Exclusive licenses for premium pricing

## Support

Questions about licensing? Contact us:
- Twitter: [@phosphors_xyz](https://twitter.com/phosphors_xyz)
- GitHub: [RamiD22/phosphors](https://github.com/RamiD22/phosphors)

---

*Phosphors — Art that glows*
