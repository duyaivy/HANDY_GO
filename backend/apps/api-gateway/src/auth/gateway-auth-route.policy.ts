export interface PublicRouteRule {
  path: string;
  methods?: readonly string[];
  match: 'exact' | 'prefix';
}

export const PUBLIC_ROUTE_RULES: readonly PublicRouteRule[] = [
  // Auth endpoints (exact match, POST only)
  { path: '/api/v1/auth/login', methods: ['POST'], match: 'exact' },
  { path: '/api/v1/auth/register', methods: ['POST'], match: 'exact' },
  { path: '/api/v1/auth/verify-email', methods: ['POST'], match: 'exact' },
  { path: '/api/v1/auth/resend-otp', methods: ['POST'], match: 'exact' },
  { path: '/api/v1/auth/refresh', methods: ['POST'], match: 'exact' },
  { path: '/api/v1/auth/logout', methods: ['POST'], match: 'exact' },
  { path: '/api/v1/auth/forgot-password', methods: ['POST'], match: 'exact' },
  { path: '/api/v1/auth/verify-reset-otp', methods: ['POST'], match: 'exact' },
  { path: '/api/v1/auth/reset-password', methods: ['POST'], match: 'exact' },

  // Catalog & categories & services (prefix match, GET/HEAD only)
  { path: '/api/v1/catalog', methods: ['GET', 'HEAD'], match: 'prefix' },
  { path: '/api/v1/categories', methods: ['GET', 'HEAD'], match: 'prefix' },
  { path: '/api/v1/services', methods: ['GET', 'HEAD'], match: 'prefix' },

  // Infrastructure & Dev Tooling (prefix match)
  { path: '/health', match: 'prefix' },
  { path: '/docs', match: 'prefix' },
  { path: '/docs-json', match: 'prefix' },
  { path: '/favicon.ico', match: 'prefix' },
  { path: '/dev', match: 'prefix' },
];

export function isPublicRoute(pathname: string, method: string): boolean {
  const normalizedPath = pathname.split('?')[0] ?? '';
  const normalizedMethod = method.toUpperCase();

  for (const rule of PUBLIC_ROUTE_RULES) {
    const matchesPath =
      rule.match === 'exact'
        ? normalizedPath === rule.path
        : normalizedPath === rule.path ||
          normalizedPath.startsWith(`${rule.path}/`);

    if (!matchesPath) {
      continue;
    }

    if (!rule.methods || rule.methods.length === 0) {
      return true;
    }

    if (rule.methods.some((m) => m.toUpperCase() === normalizedMethod)) {
      return true;
    }
  }

  return false;
}
