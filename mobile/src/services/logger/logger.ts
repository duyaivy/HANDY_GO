/**
 * Secure Logger abstraction.
 * Automatically sanitizes sensitive keys (tokens, passwords, secrets) and suppresses verbose logs in production.
 */

const SENSITIVE_KEYS = ['password', 'token', 'access', 'refresh', 'secret', 'authorization', 'creditcard'];

function sanitize(data: unknown): unknown {
  if (!data || typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(sanitize);
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.some(k => key.toLowerCase().includes(k))) {
      sanitized[key] = '***[REDACTED]***';
    }
    else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitize(value);
    }
    else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

const isDev = __DEV__;

export const Logger = {
  debug: (tag: string, message: string, ...args: unknown[]) => {
    if (isDev) {
      console.log(`[DEBUG][${tag}] ${message}`, ...args.map(sanitize));
    }
  },

  info: (tag: string, message: string, ...args: unknown[]) => {
    if (isDev) {
      console.info(`[INFO][${tag}] ${message}`, ...args.map(sanitize));
    }
  },

  warn: (tag: string, message: string, ...args: unknown[]) => {
    console.warn(`[WARN][${tag}] ${message}`, ...args.map(sanitize));
  },

  error: (tag: string, message: string, error?: unknown) => {
    console.error(`[ERROR][${tag}] ${message}`, error ? sanitize(error) : '');
  },
};
