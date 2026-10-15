export const IS_PUBLIC_KEY = 'isPublic';
export const PERMISSIONS_KEY = 'permissions';
export const ROLES_KEY = 'roles';

export const JWT_ISSUER = 'handy-go-auth';
export const JWT_AUDIENCE = 'handy-go-api';
export const ACCESS_TOKEN_EXPIRATION_SECONDS = process.env.ACCESS_TOKEN_EXPIRATION_SECONDS
  ? Number(process.env.ACCESS_TOKEN_EXPIRATION_SECONDS)
  : (process.env.NODE_ENV === 'development' ? 86400 : 300);
export const REFRESH_TOKEN_EXPIRATION_DAYS = 7; // 7 days
