/**
 * Request Logging Middleware for Phosphors API
 * 
 * Structured JSON logging for easy parsing and monitoring.
 * Logs: timestamp, method, path, response status, duration, and more.
 */

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const LOG_LEVEL = process.env.LOG_LEVEL || (IS_PRODUCTION ? 'info' : 'debug');

// Log levels (lower = more verbose)
const LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

const currentLevel = LEVELS[LOG_LEVEL] || LEVELS.info;

/**
 * Format a log entry as structured JSON
 * 
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {object} meta - Additional metadata
 * @returns {string} JSON formatted log entry
 */
function formatLog(level, message, meta = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta
  };
  
  return JSON.stringify(entry);
}

/**
 * Core logging function
 */
function log(level, message, meta = {}) {
  if (LEVELS[level] < currentLevel) {
    return;
  }
  
  const formatted = formatLog(level, message, meta);
  
  switch (level) {
    case 'error':
      console.error(formatted);
      break;
    case 'warn':
      console.warn(formatted);
      break;
    default:
      console.log(formatted);
  }
}

/**
 * Logger object with level methods
 */
export const logger = {
  debug: (message, meta) => log('debug', message, meta),
  info: (message, meta) => log('info', message, meta),
  warn: (message, meta) => log('warn', message, meta),
  error: (message, meta) => log('error', message, meta)
};

/**
 * Extract client IP from request
 * @param {Request} req
 * @returns {string}
 */
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() 
    || req.headers['x-real-ip'] 
    || req.socket?.remoteAddress 
    || 'unknown';
}

/**
 * Get a sanitized version of the request path (remove sensitive params)
 * @param {Request} req
 * @returns {string}
 */
function sanitizePath(req) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  // Remove sensitive query params from logs
  const sensitiveParams = ['api_key', 'apikey', 'key', 'token', 'secret', 'password'];
  sensitiveParams.forEach(param => {
    if (url.searchParams.has(param)) {
      url.searchParams.set(param, '[REDACTED]');
    }
  });
  return url.pathname + (url.search ? url.search : '');
}

/**
 * Get user agent summary
 * @param {string} ua
 * @returns {string}
 */
function summarizeUserAgent(ua) {
  if (!ua) return 'unknown';
  
  // Common bot/agent patterns
  if (ua.includes('OpenClaw')) return 'OpenClaw';
  if (ua.includes('python-requests')) return 'python-requests';
  if (ua.includes('axios')) return 'axios';
  if (ua.includes('node-fetch')) return 'node-fetch';
  if (ua.includes('curl')) return 'curl';
  if (ua.includes('PostmanRuntime')) return 'Postman';
  
  // Truncate long UAs
  return ua.length > 50 ? ua.substring(0, 47) + '...' : ua;
}

/**
 * Create request context for logging
 * @param {Request} req
 * @returns {object}
 */
export function createRequestContext(req) {
  return {
    method: req.method,
    path: sanitizePath(req),
    ip: getClientIP(req),
    userAgent: summarizeUserAgent(req.headers['user-agent']),
    requestId: req.headers['x-request-id'] || crypto.randomUUID?.() || Date.now().toString(36)
  };
}

/**
 * Log an API request (call at start of handler)
 * Returns a function to call when request completes
 * 
 * @param {Request} req
 * @returns {Function} Complete function to call with status code
 */
export function logRequest(req) {
  const startTime = Date.now();
  const context = createRequestContext(req);
  
  logger.debug(`→ ${context.method} ${context.path}`, {
    type: 'request_start',
    ...context
  });
  
  // Return function to call on completion
  return (status, extra = {}) => {
    const duration = Date.now() - startTime;
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
    
    logger[level](`← ${context.method} ${context.path} ${status} (${duration}ms)`, {
      type: 'request_complete',
      ...context,
      status,
      durationMs: duration,
      ...extra
    });
  };
}

/**
 * Middleware wrapper that adds logging to a handler
 * 
 * @param {Function} handler - Request handler function
 * @returns {Function} Wrapped handler with logging
 */
export function withLogging(handler) {
  return async (req, res) => {
    const complete = logRequest(req);
    
    // Patch res.json to capture status
    const originalJson = res.json.bind(res);
    let responseStatus = 200;
    
    res.json = (body) => {
      responseStatus = res.statusCode || 200;
      complete(responseStatus, { 
        hasError: body?.success === false || !!body?.error 
      });
      return originalJson(body);
    };
    
    // Patch res.end for non-json responses
    const originalEnd = res.end.bind(res);
    res.end = (...args) => {
      if (!res.headersSent || res.statusCode !== responseStatus) {
        responseStatus = res.statusCode || 200;
        complete(responseStatus);
      }
      return originalEnd(...args);
    };
    
    try {
      return await handler(req, res);
    } catch (error) {
      // Log unhandled errors
      logger.error(`Handler error: ${error.message}`, {
        type: 'unhandled_error',
        ...createRequestContext(req),
        error: error.message,
        stack: IS_PRODUCTION ? undefined : error.stack
      });
      throw error;
    }
  };
}

/**
 * Log an API event (for important business events)
 * 
 * @param {string} event - Event name
 * @param {object} data - Event data
 */
export function logEvent(event, data = {}) {
  logger.info(event, {
    type: 'event',
    event,
    ...data
  });
}

/**
 * Log a metric (for monitoring)
 * 
 * @param {string} name - Metric name
 * @param {number} value - Metric value
 * @param {object} tags - Additional tags
 */
export function logMetric(name, value, tags = {}) {
  logger.info(`Metric: ${name}=${value}`, {
    type: 'metric',
    metric: name,
    value,
    ...tags
  });
}

/**
 * Log a security event
 * 
 * @param {string} event - Event type
 * @param {object} data - Event data
 */
export function logSecurity(event, data = {}) {
  logger.warn(`Security: ${event}`, {
    type: 'security',
    event,
    ...data
  });
}

export default logger;
