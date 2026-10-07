export type AccountStatus = 'pending' | 'active' | 'suspended' | 'locked' | 'deleted';

export enum RegisterRole {
  CUSTOMER = 'Customer',
  WORKER = 'Worker',
}

export const Role = {
  ADMIN: 'Admin',
  CUSTOMER: RegisterRole.CUSTOMER,
  WORKER: RegisterRole.WORKER,
} as const;

export type Role = (typeof Role)[keyof typeof Role];
export type RoleName = Role;

export const StandardPermissions = {
  AUTH_ME: 'auth:me',
  PROFILE_READ: 'profile:read',
  PROFILE_UPDATE: 'profile:update',
  USER_READ: 'user:read',
  USER_MANAGE: 'user:manage',
  CATALOG_READ: 'catalog:read',
  CATALOG_CREATE: 'catalog:create',
  CATALOG_UPDATE: 'catalog:update',
  CATALOG_DELETE: 'catalog:delete',
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
