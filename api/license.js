/**
 * Phosphors Licensing API
 * 
 * POST /api/license - Request a license for a piece
 * GET /api/license?piece_id=xxx - Check license status for a piece
 * GET /api/license?wallet=xxx - Get all licenses for a wallet
 * 
 * License Types:
 * - personal: Free, non-commercial use only
 * - commercial: Requires $PHOS payment, allows commercial use
 */

import { 
  handleCors, 
  isValidAddress, 
  isValidUUID,
  normalizeAddress,
  badRequest,
  serverError,
  sanitizeText,
  auditLog,
  getClientIP
} from './_lib/security.js';
import { checkRateLimit, RATE_LIMITS, rateLimitResponse } from './_lib/rate-limit.js';

// Supabase config
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

// License pricing in $PHOS
const LICENSE_PRICES = {
  personal: 0,          // Free
  commercial: 100,      // 100 $PHOS
  commercial_extended: 500  // Extended commercial (5 years)
};

// License durations in days
const LICENSE_DURATIONS = {
  personal: 365,        // 1 year
  commercial: 365,      // 1 year
  commercial_extended: 1825  // 5 years
};

async function supabaseQuery(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  return res;
}

/**
 * Get piece info
 */
async function getPieceInfo(pieceId) {
  const res = await supabaseQuery(
    `/rest/v1/submissions?id=eq.${encodeURIComponent(pieceId)}&select=*`
  );
  const pieces = await res.json();
  return pieces[0] || null;
}

/**
 * Get licenses for a piece
 */
async function getLicensesForPiece(pieceId) {
  const res = await supabaseQuery(
    `/rest/v1/licenses?piece_id=eq.${encodeURIComponent(pieceId)}&status=eq.active&order=created_at.desc`
  );
  return await res.json();
}

/**
 * Get licenses for a wallet
 */
async function getLicensesForWallet(wallet) {
  const res = await supabaseQuery(
    `/rest/v1/licenses?licensee_wallet=ilike.${encodeURIComponent(wallet)}&order=created_at.desc`
  );
  return await res.json();
}

/**
 * Check if wallet already has active license for piece
 */
async function hasActiveLicense(pieceId, wallet, licenseType) {
  const res = await supabaseQuery(
    `/rest/v1/licenses?piece_id=eq.${encodeURIComponent(pieceId)}&licensee_wallet=ilike.${encodeURIComponent(wallet)}&license_type=eq.${licenseType}&status=eq.active&expires_at=gt.${new Date().toISOString()}`
  );
  const licenses = await res.json();
  return licenses.length > 0;
}

/**
 * Record a new license
 */
async function createLicense(data) {
  const res = await supabaseQuery('/rest/v1/licenses', {
    method: 'POST',
    headers: { 'Prefer': 'return=representation' },
    body: JSON.stringify(data)
  });
  
  if (!res.ok) {
    const error = await res.text();
    console.error('Failed to create license:', error);
    return null;
  }
  
  const licenses = await res.json();
  return licenses[0];
}

/**
 * Get licensable pieces
 */
async function getLicensablePieces(limit = 50, offset = 0) {
  const res = await supabaseQuery(
    `/rest/v1/submissions?status=eq.approved&licensable=eq.true&select=id,title,moltbook,url,thumbnail_url,license_price_phos&order=submitted_at.desc&limit=${limit}&offset=${offset}`
  );
  return await res.json();
}

/**
 * Verify $PHOS payment (simulated for now)
 * In production, this would verify on-chain transaction
 */
async function verifyPhosPayment(txHash, expectedAmount, fromWallet) {
  // TODO: Implement actual on-chain verification
  // For now, simulate verification
  if (!txHash || !txHash.startsWith('0x')) {
    return { valid: false, error: 'Invalid transaction hash' };
  }
  
  // In production:
  // 1. Fetch transaction from Base chain
  // 2. Verify it's a $PHOS transfer
  // 3. Verify amount >= expectedAmount
  // 4. Verify from address matches
  // 5. Verify to address is Phosphors treasury
  
  // Simulated success for development
  console.log(`[PHOS Payment] Simulating verification for ${txHash}`);
  return { 
    valid: true, 
    amount: expectedAmount,
    simulated: true 
  };
}

export default async function handler(req, res) {
  // CORS
  if (handleCors(req, res, { 
    methods: 'GET, POST, OPTIONS',
    headers: 'Content-Type, Authorization'
  })) {
    return;
  }

  const clientIP = getClientIP(req);

  // Rate limiting
  const rateCheck = checkRateLimit(`license:${clientIP}`, RATE_LIMITS.api);
  if (!rateCheck.allowed) {
    return rateLimitResponse(res, rateCheck.resetAt);
  }

  try {
    // GET - Query licenses or licensable pieces
    if (req.method === 'GET') {
      const { piece_id, wallet, list } = req.query;
      
      // List licensable pieces
      if (list === 'true' || list === '1') {
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const offset = parseInt(req.query.offset) || 0;
        
        const pieces = await getLicensablePieces(limit, offset);
        
        return res.status(200).json({
          success: true,
          pieces: pieces.map(p => ({
            id: p.id,
            title: p.title,
            artist: p.moltbook,
            url: p.url,
            thumbnail: p.thumbnail_url,
            price: {
              personal: LICENSE_PRICES.personal,
              commercial: p.license_price_phos || LICENSE_PRICES.commercial
            }
          })),
          pricing: {
            personal: { price: 0, duration: '1 year', description: 'Non-commercial use only' },
            commercial: { price: LICENSE_PRICES.commercial, duration: '1 year', description: 'Full commercial rights' },
            commercial_extended: { price: LICENSE_PRICES.commercial_extended, duration: '5 years', description: 'Extended commercial rights' }
          }
        });
      }
      
      // Get licenses for a specific piece
      if (piece_id) {
        if (!isValidUUID(piece_id)) {
          return badRequest(res, 'Invalid piece ID format');
        }
        
        const piece = await getPieceInfo(piece_id);
        if (!piece) {
          return res.status(404).json({ success: false, error: 'Piece not found' });
        }
        
        const licenses = await getLicensesForPiece(piece_id);
        
        return res.status(200).json({
          success: true,
          piece: {
            id: piece.id,
            title: piece.title,
            artist: piece.moltbook,
            licensable: piece.licensable !== false,
            price: {
              personal: LICENSE_PRICES.personal,
              commercial: piece.license_price_phos || LICENSE_PRICES.commercial
            }
          },
          licenses: licenses.map(l => ({
            id: l.id,
            type: l.license_type,
            licensee: l.licensee_wallet.slice(0, 6) + '...' + l.licensee_wallet.slice(-4),
            expiresAt: l.expires_at,
            status: l.status
          })),
          totalLicenses: licenses.length
        });
      }
      
      // Get licenses for a wallet
      if (wallet) {
        if (!isValidAddress(wallet)) {
          return badRequest(res, 'Invalid wallet address');
        }
        
        const licenses = await getLicensesForWallet(wallet);
        
        return res.status(200).json({
          success: true,
          wallet: normalizeAddress(wallet),
          licenses: licenses.map(l => ({
            id: l.id,
            pieceId: l.piece_id,
            type: l.license_type,
            expiresAt: l.expires_at,
            status: l.status,
            createdAt: l.created_at
          })),
          totalLicenses: licenses.length
        });
      }
      
      // No query params - return pricing info
      return res.status(200).json({
        success: true,
        message: 'Phosphors Licensing API',
        pricing: {
          personal: {
            price: 0,
            currency: '$PHOS',
            duration: '1 year',
            description: 'Personal, non-commercial use. Perfect for personal screens, wallpapers, learning projects.',
            allowed: ['Personal displays', 'Non-commercial websites', 'Educational use'],
            notAllowed: ['Commercial products', 'Advertising', 'Resale']
          },
          commercial: {
            price: LICENSE_PRICES.commercial,
            currency: '$PHOS',
            duration: '1 year',
            description: 'Full commercial rights. Use in apps, digital signage, marketing, products.',
            allowed: ['Commercial apps', 'Digital signage', 'Marketing materials', 'Products'],
            notAllowed: ['Resale as standalone art', 'NFT minting']
          },
          commercial_extended: {
            price: LICENSE_PRICES.commercial_extended,
            currency: '$PHOS',
            duration: '5 years',
            description: 'Extended commercial rights for long-term projects.',
            allowed: ['All commercial uses', 'Multi-year campaigns', 'Enterprise deployments'],
            notAllowed: ['Resale as standalone art', 'NFT minting']
          }
        },
        endpoints: {
          list: 'GET /api/license?list=true',
          checkPiece: 'GET /api/license?piece_id={id}',
          checkWallet: 'GET /api/license?wallet={address}',
          request: 'POST /api/license'
        }
      });
    }
    
    // POST - Request a license
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      
      const { 
        piece_id, 
        wallet, 
        license_type = 'personal',
        tx_hash,
        name,
        email,
        use_case
      } = body;
      
      // Validate required fields
      if (!piece_id || !isValidUUID(piece_id)) {
        return badRequest(res, 'Valid piece_id is required');
      }
      
      if (!wallet || !isValidAddress(wallet)) {
        return badRequest(res, 'Valid wallet address is required');
      }
      
      if (!['personal', 'commercial', 'commercial_extended'].includes(license_type)) {
        return badRequest(res, 'Invalid license_type. Use: personal, commercial, or commercial_extended');
      }
      
      const normalizedWallet = normalizeAddress(wallet);
      
      // Get piece info
      const piece = await getPieceInfo(piece_id);
      if (!piece) {
        return res.status(404).json({ success: false, error: 'Piece not found' });
      }
      
      if (piece.licensable === false) {
        return res.status(403).json({ 
          success: false, 
          error: 'This piece is not available for licensing' 
        });
      }
      
      // Check for existing active license
      const existingLicense = await hasActiveLicense(piece_id, normalizedWallet, license_type);
      if (existingLicense) {
        return res.status(409).json({
          success: false,
          error: 'You already have an active license of this type for this piece'
        });
      }
      
      // Determine price
      const requiredPhos = license_type === 'personal' ? 0 : 
        (piece.license_price_phos || LICENSE_PRICES[license_type]);
      
      // For commercial licenses, require payment
      if (license_type !== 'personal') {
        if (!tx_hash) {
          return res.status(402).json({
            success: false,
            error: 'Payment required',
            payment: {
              required: requiredPhos,
              currency: '$PHOS',
              token: '0x08f3e9972eb2f9f129f05b58db335d764ec9e471',
              network: 'Base',
              recipient: process.env.PHOS_TREASURY || '0xc27b70A5B583C6E3fF90CcDC4577cC4f1f598281',
              piece: {
                id: piece.id,
                title: piece.title,
                artist: piece.moltbook
              }
            }
          });
        }
        
        // Verify payment
        const paymentVerification = await verifyPhosPayment(tx_hash, requiredPhos, normalizedWallet);
        if (!paymentVerification.valid) {
          await auditLog('LICENSE_PAYMENT_FAILED', {
            pieceId: piece_id,
            wallet: normalizedWallet,
            txHash: tx_hash,
            error: paymentVerification.error,
            ip: clientIP
          });
          
          return res.status(400).json({
            success: false,
            error: `Payment verification failed: ${paymentVerification.error}`
          });
        }
      }
      
      // Create the license
      const license = await createLicense({
        piece_id,
        licensee_wallet: normalizedWallet,
        licensee_name: sanitizeText(name, 100),
        licensee_email: sanitizeText(email, 100),
        license_type,
        duration_days: LICENSE_DURATIONS[license_type],
        phos_paid: requiredPhos,
        tx_hash: tx_hash || null,
        use_case: sanitizeText(use_case, 500),
        status: 'active'
      });
      
      if (!license) {
        return serverError(res, 'Failed to create license');
      }
      
      // Log successful license
      await auditLog('LICENSE_CREATED', {
        licenseId: license.id,
        pieceId: piece_id,
        pieceTitle: piece.title,
        artist: piece.moltbook,
        licensee: normalizedWallet,
        type: license_type,
        phosPaid: requiredPhos,
        ip: clientIP
      });
      
      return res.status(201).json({
        success: true,
        message: `${license_type.charAt(0).toUpperCase() + license_type.slice(1)} license granted!`,
        license: {
          id: license.id,
          type: license.license_type,
          piece: {
            id: piece.id,
            title: piece.title,
            artist: piece.moltbook,
            url: piece.url
          },
          licensee: normalizedWallet,
          createdAt: license.created_at,
          expiresAt: license.expires_at,
          durationDays: license.duration_days,
          phosPaid: license.phos_paid
        },
        rights: license_type === 'personal' ? {
          allowed: ['Personal displays', 'Non-commercial websites', 'Educational use'],
          notAllowed: ['Commercial products', 'Advertising', 'Resale']
        } : {
          allowed: ['Commercial apps', 'Digital signage', 'Marketing materials', 'Products'],
          notAllowed: ['Resale as standalone art', 'NFT minting']
        }
      });
    }
    
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed',
      allowed: ['GET', 'POST']
    });
    
  } catch (error) {
    console.error('License API error:', error);
    return serverError(res, 'An error occurred processing your request');
  }
}
