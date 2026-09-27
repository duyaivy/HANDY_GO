import * as SecureStore from 'expo-secure-store';
import { Logger } from '@/services/logger/logger';

const AUTH_TOKENS_KEY = 'handy_go_auth_tokens';

export type TokenType = {
  access: string;
  refresh: string;
};

// In-memory cache for synchronous read by Axios interceptor
let memoryTokens: TokenType | null = null;
let sessionVersion = 0;

export function getToken(): TokenType | null {
  return memoryTokens;
}

export function getSessionVersion(): number {
  return sessionVersion;
}

async function isSecureStoreAvailable(): Promise<boolean> {
  if (typeof SecureStore.isAvailableAsync === 'function') {
    return SecureStore.isAvailableAsync();
  }
  return true;
}

export async function setToken(value: TokenType): Promise<void> {
  memoryTokens = value;
  sessionVersion++;

  try {
    const isAvailable = await isSecureStoreAvailable();
    if (isAvailable) {
      await SecureStore.setItemAsync(AUTH_TOKENS_KEY, JSON.stringify(value));
    }
  }
  catch (error) {
    Logger.error('SECURE_STORE_WRITE_ERROR', 'Failed to persist auth tokens securely', error);
    throw new Error('Không thể lưu trữ phiên đăng nhập an toàn trên thiết bị.');
  }
}

export async function removeToken(): Promise<void> {
  memoryTokens = null;
  sessionVersion++;

  try {
    const isAvailable = await isSecureStoreAvailable();
    if (isAvailable) {
      await SecureStore.deleteItemAsync(AUTH_TOKENS_KEY);
    }
  }
  catch (error) {
    Logger.error('SECURE_STORE_DELETE_ERROR', 'Failed to remove auth tokens from storage', error);
  }
}

/**
 * Hydrates tokens from SecureStore on application startup.
 */
export async function hydrateTokens(): Promise<TokenType | null> {
  try {
    const isAvailable = await isSecureStoreAvailable();
    if (isAvailable) {
      const stored = await SecureStore.getItemAsync(AUTH_TOKENS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as TokenType;
        if (parsed?.access && parsed?.refresh) {
          memoryTokens = parsed;
          return memoryTokens;
        }
      }
    }
  }
  catch (error) {
    Logger.error('SECURE_STORE_READ_ERROR', 'Failed to read auth tokens from secure storage', error);
  }

  memoryTokens = null;
  return null;
}
