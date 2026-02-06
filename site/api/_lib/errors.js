/**
 * Standardized Error Responses for Phosphors API
 * 
 * Provides consistent error formatting across all endpoints.
 * Never exposes internal error details to clients in production.
 */

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Error codes with user-friendly messages
export const ERROR_CODES = {
  // Authentication errors (401)
  AUTH_REQUIRED: 'Authentication required',
  INVALID_API_KEY: 'Invalid API key',
  INVALID_KEY_FORMAT: 'Invalid API key format',
  EXPIRED_TOKEN: 'Token has expired',
  
  // Authorization errors (403)
  FORBIDDEN: 'Access denied',
  INSUFFICIENT_PERMISSIONS: 'Insufficient permissions',
  
  // Validation errors (400)
  BAD_REQUEST: 'Invalid request',
  MISSING_FIELD: 'Required field missing',
  INVALID_FORMAT: 'Invalid data format',
  INVALID_ADDRESS: 'Invalid wallet address',
  INVALID_TX_HASH: 'Invalid transaction hash',
  INVALID_PIECE_ID: 'Invalid piece ID',
  
  // Payment errors (402)
  PAYMENT_REQUIRED: 'Payment required',
  PAYMENT_INVALID: 'Payment verification failed',
  PAYMENT_INSUFFICIENT: 'Insufficient payment amount',
  
  // Not found errors (404)
  NOT_FOUND: 'Resource not found',
  AGENT_NOT_FOUND: 'Agent not found',
  PIECE_NOT_FOUND: 'Art piece not found',
  
  // Rate limiting (429)
  RATE_LIMITED: 'Too many requests',
  
  // Server errors (500)
  INTERNAL_ERROR: 'Internal server error',
  DATABASE_ERROR: 'Database operation failed',
  EXTERNAL_SERVICE_ERROR: 'External service unavailable',
  
  // Service unavailable (503)
  SERVICE_UNAVAILABLE: 'Service temporarily unavailable',
  MAINTENANCE_MODE: 'System under maintenance'
};

/**
 * Create a standardized error response object
 * 
 * @param {string} code - Error code from ERROR_CODES
 * @param {string} [message] - Custom message (overrides default)
 * @param {object} [details] - Additional details (only included in development)
 * @returns {object} Error response object
 */
export function createError(code, message = null, details = null) {
  const response = {
    success: false,
    error: {
      code: code,
      message: message || ERROR_CODES[code] || 'An error occurred'
    }
  };
  
  // Only include details in development
  if (!IS_PRODUCTION && details) {
    response.error.details = details;
  }
  
  return response;
}

/**
 * Get HTTP status code for error code
 * @param {string} code - Error code
 * @returns {number} HTTP status code
 */
export function getStatusCode(code) {
  const statusMap = {
    // 400 Bad Request
    BAD_REQUEST: 400,
    MISSING_FIELD: 400,
    INVALID_FORMAT: 400,
    INVALID_ADDRESS: 400,
    INVALID_TX_HASH: 400,
    INVALID_PIECE_ID: 400,
    
    // 401 Unauthorized
    AUTH_REQUIRED: 401,
    INVALID_API_KEY: 401,
    INVALID_KEY_FORMAT: 401,
    EXPIRED_TOKEN: 401,
    
    // 402 Payment Required
    PAYMENT_REQUIRED: 402,
    PAYMENT_INVALID: 402,
    PAYMENT_INSUFFICIENT: 402,
    
    // 403 Forbidden
    FORBIDDEN: 403,
    INSUFFICIENT_PERMISSIONS: 403,
    
    // 404 Not Found
    NOT_FOUND: 404,
    AGENT_NOT_FOUND: 404,
    PIECE_NOT_FOUND: 404,
    
    // 429 Too Many Requests
    RATE_LIMITED: 429,
    
    // 500 Internal Server Error
    INTERNAL_ERROR: 500,
    DATABASE_ERROR: 500,
    EXTERNAL_SERVICE_ERROR: 500,
    
    // 503 Service Unavailable
    SERVICE_UNAVAILABLE: 503,
    MAINTENANCE_MODE: 503
  };
  
  return statusMap[code] || 500;
}

/**
 * Send a standardized error response
 * 
 * @param {Response} res - Express/Vercel response object
 * @param {string} code - Error code from ERROR_CODES
 * @param {string} [message] - Custom message
 * @param {object} [details] - Additional details (dev only)
 * @returns {Response}
 */
export function sendError(res, code, message = null, details = null) {
  const statusCode = getStatusCode(code);
  const body = createError(code, message, details);
  return res.status(statusCode).json(body);
}

/**
 * Wrap an async handler with standardized error handling
 * 
 * @param {Function} handler - Async request handler
 * @returns {Function} Wrapped handler with error catching
 */
export function withErrorHandling(handler) {
  return async (req, res) => {
    try {
      return await handler(req, res);
    } catch (error) {
      console.error(`[API Error] ${req.method} ${req.url}:`, error);
      
      // Check if response already sent
      if (res.headersSent) {
        return;
      }
      
      // Handle known error types
      if (error.code && ERROR_CODES[error.code]) {
        return sendError(res, error.code, error.message);
      }
      
      // Default to internal error
      return sendError(res, 'INTERNAL_ERROR', null, {
        message: error.message,
        stack: error.stack
      });
    }
  };
}

/**
 * Create a throwable error with code
 * 
 * @param {string} code - Error code
 * @param {string} [message] - Custom message
 * @returns {Error} Error object with code property
 */
export function ApiError(code, message = null) {
  const error = new Error(message || ERROR_CODES[code] || 'An error occurred');
  error.code = code;
  return error;
}

/**
 * Send success response with consistent format
 * 
 * @param {Response} res - Express/Vercel response object
 * @param {object} data - Response data
 * @param {number} [status=200] - HTTP status code
 * @returns {Response}
 */
export function sendSuccess(res, data, status = 200) {
  return res.status(status).json({
    success: true,
    data
  });
}

// Quick helpers for common cases
export const errors = {
  badRequest: (res, msg) => sendError(res, 'BAD_REQUEST', msg),
  unauthorized: (res, msg) => sendError(res, 'AUTH_REQUIRED', msg),
  forbidden: (res, msg) => sendError(res, 'FORBIDDEN', msg),
  notFound: (res, msg) => sendError(res, 'NOT_FOUND', msg),
  rateLimit: (res, msg) => sendError(res, 'RATE_LIMITED', msg),
  internal: (res, msg) => sendError(res, 'INTERNAL_ERROR', msg),
  paymentRequired: (res, msg) => sendError(res, 'PAYMENT_REQUIRED', msg)
};
