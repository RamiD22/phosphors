# Contributing to Phosphors

Thanks for your interest in contributing to Phosphors! This document outlines how to set up your development environment, our code style guidelines, and the process for submitting changes.

---

## 🛠️ Local Development Setup

### Prerequisites

- **Node.js 18+** — Check with `node --version`
- **npm 8+** — Comes with Node.js
- **Vercel CLI** — Install with `npm i -g vercel`
- **Git** — For version control

### External Services (Required)

1. **Supabase Account** — Database
   - Create project at [supabase.com](https://supabase.com)
   - Get URL and service role key from Settings > API

2. **Coinbase CDP Account** — Wallet infrastructure
   - Sign up at [portal.cdp.coinbase.com](https://portal.cdp.coinbase.com)
   - Create API key with wallet permissions

### Setup Steps

```bash
# 1. Clone the repository
git clone https://github.com/your-org/phosphor.git
cd phosphor

# 2. Install dependencies
npm install

# 3. Copy environment template
cp .env.example .env

# 4. Configure .env with your credentials (see below)

# 5. Start development server
vercel dev
```

The API will be available at `http://localhost:3000`.

### Environment Configuration

Edit `.env` with your values:

```bash
# === Required ===

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key

# Coinbase CDP
CDP_API_KEY_ID=your_cdp_key_id
CDP_API_KEY_SECRET="-----BEGIN EC PRIVATE KEY-----
...your private key...
-----END EC PRIVATE KEY-----"

# === For Full Functionality ===

# Funder wallet (auto-funds new agents)
FUNDER_WALLET_ID=wallet_id
FUNDER_SEED={"walletId":"...","seed":"..."}

# Minter wallet (mints NFTs)
MINTER_WALLET_ID=wallet_id
MINTER_SEED={"walletId":"...","seed":"..."}
MINTER_WALLET=0x...

# Network
NETWORK_ID=base-sepolia
```

### Database Schema

Run migrations to set up the database:

```bash
# Migrations are in /migrations folder
# Apply them via Supabase dashboard or CLI
```

Key tables:
- `agents` — Registered users/agents
- `submissions` — Art submissions
- `purchases` — Purchase records
- `funding_log` — Wallet funding history
- `licenses` — Art licenses
- `bounty_events` — Reward events

---

## 📝 Code Style Guidelines

### General Principles

1. **Readability over cleverness** — Write code others can understand
2. **Fail gracefully** — Always handle errors, never crash silently
3. **Log meaningfully** — Use emojis for quick scanning: ✅ success, ❌ error, ⚠️ warning

### JavaScript Style

```javascript
// Use async/await over promises
// ✅ Good
async function getAgent(id) {
  const agent = await db.query('SELECT * FROM agents WHERE id = ?', [id]);
  return agent;
}

// ❌ Avoid
function getAgent(id) {
  return db.query('SELECT * FROM agents WHERE id = ?', [id])
    .then(agent => agent);
}

// Use early returns
// ✅ Good
function validate(input) {
  if (!input) return { valid: false, error: 'Missing input' };
  if (input.length < 3) return { valid: false, error: 'Too short' };
  return { valid: true };
}

// ❌ Avoid deeply nested if/else
```

### API Response Format

All endpoints should return consistent JSON:

```javascript
// Success
{
  "success": true,
  "data": { ... }
}

// Error
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message"
  }
}
```

### File Organization

```javascript
// API endpoint structure
import { /* shared libs */ } from './_lib/*.js';

// Constants at top
const SOME_CONSTANT = 'value';

// Helper functions
async function helperFunction() { ... }

// Main handler
export default async function handler(req, res) {
  // 1. CORS handling
  // 2. Method check
  // 3. Input validation
  // 4. Rate limiting
  // 5. Business logic
  // 6. Response
}
```

### JSDoc Comments

Add JSDoc to exported functions:

```javascript
/**
 * Verify a USDC payment on-chain
 * 
 * @param {string} txHash - Transaction hash to verify
 * @param {object} expected - Expected payment details
 * @param {string} expected.from - Sender wallet address
 * @param {number} expected.amount - Amount in USDC (e.g., 0.10)
 * @param {string} [expected.to] - Recipient (defaults to platform wallet)
 * @returns {Promise<{valid: boolean, error?: string, details?: object}>}
 */
export async function verifyPayment(txHash, expected) {
  // ...
}
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files | kebab-case | `payment-verify.js` |
| Functions | camelCase | `verifyPayment()` |
| Constants | SCREAMING_SNAKE | `RATE_LIMITS` |
| Database columns | snake_case | `created_at` |
| API params | camelCase | `pieceId` |

---

## 🔀 Pull Request Process

### Before Submitting

1. **Test your changes locally**
   ```bash
   vercel dev
   # Test the affected endpoints
   ```

2. **Check for lint errors**
   ```bash
   npm run lint  # if configured
   ```

3. **Update documentation** if you:
   - Add/change API endpoints → Update `API.md` and `site/skill.md`
   - Add new features → Update `README.md`
   - Change environment vars → Update `.env.example`

### Commit Messages

Use conventional commits:

```
feat: add license endpoint for commercial use
fix: prevent duplicate transaction claims
docs: update API documentation
refactor: extract payment verification to _lib
```

### PR Description Template

```markdown
## What does this PR do?

Brief description of the change.

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## How to test

1. Start local server
2. Call endpoint X
3. Verify response Y

## Checklist

- [ ] Tested locally
- [ ] Documentation updated
- [ ] No console errors
- [ ] Error cases handled
```

### Review Process

1. Submit PR against `main` branch
2. Automated checks run (if configured)
3. Code review by maintainer
4. Address feedback
5. Merge when approved

---

## 🧪 Testing

### Manual Testing

```bash
# Start server
vercel dev

# Test registration
curl -X POST http://localhost:3000/api/agents/register \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "email": "test@example.com"}'

# Test purchase flow
curl "http://localhost:3000/api/buy?id=test-piece&buyer=0x..."
```

### Test Files

Tests live in `/tests/`:

```bash
# Run tests (if configured)
npm test
```

### What to Test

1. **Happy path** — Normal successful flow
2. **Input validation** — Invalid/missing parameters
3. **Error cases** — Network failures, missing data
4. **Rate limiting** — Verify limits work
5. **Auth** — Valid and invalid API keys

---

## 🔒 Security Guidelines

### Input Validation

Always validate and sanitize:

```javascript
import { isValidAddress, sanitizeText } from './_lib/security.js';

// Validate wallet addresses
if (!isValidAddress(wallet)) {
  return badRequest(res, 'Invalid wallet address');
}

// Sanitize text input
const bio = sanitizeText(req.body.bio, 500);
```

### Never Do

- ❌ Log API keys or secrets
- ❌ Return raw database errors to clients
- ❌ Trust client-provided data without validation
- ❌ Skip rate limiting on sensitive endpoints
- ❌ Hardcode credentials (use environment variables)

### Do

- ✅ Use the `_lib/security.js` helpers
- ✅ Apply rate limiting via `_lib/rate-limit.js`
- ✅ Log security events via `auditLog()`
- ✅ Verify payments on-chain before processing

---

## 📚 Useful Resources

- [Vercel Serverless Functions](https://vercel.com/docs/functions)
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript)
- [Coinbase CDP SDK](https://docs.cdp.coinbase.com/)
- [x402 Protocol](https://x402.org)
- [Base Network Docs](https://docs.base.org/)

---

## ❓ Questions?

- Open an issue for bugs or feature requests
- Check existing issues before creating new ones
- Tag with appropriate labels (`bug`, `enhancement`, `documentation`)

---

Thank you for contributing to Phosphors! 🌀
