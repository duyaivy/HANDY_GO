export type AccountStatus = 'pending' | 'active' | 'suspended';

export type RoleName = 'Customer' | 'Worker' | 'Admin';

export const StandardPermissions = {
  AUTH_ME: 'auth:me',
  PROFILE_READ: 'profile:read',
  PROFILE_UPDATE: 'profile:update',
  USER_READ: 'user:read',
  USER_MANAGE: 'user:manage',
} as const;

export interface JwtPayload {
  sub: string; // accountId
  userId: string;
  sid: string; // refresh session id
  roles: string[];
  permissions: string[];
  iss: string;
  aud: string;
  jti: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedUser {
  accountId: string;
  userId: string;
  sessionId: string;
  roles: string[];
  permissions: string[];
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
