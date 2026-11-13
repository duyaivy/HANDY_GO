import Env from 'env';
import { resolveApiBaseUrl } from '@/services/api/api-client';
/** Optional direct local Message API. Auth refresh and media upload still use Gateway. */
export function chatBaseUrl(apiBase: string, override?: string, environment?: string): string {
  if (environment !== 'development' || !override?.trim())
    return apiBase;
  const url = new URL(override);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname.replace(/\/$/, '') !== '/api/v1')
    throw new Error('EXPO_PUBLIC_MESSAGE_URL must be an HTTP API base ending in /api/v1');
  return override.replace(/\/$/, '');
}
export function resolveChatBaseUrl(): string {
  const selected = chatBaseUrl(resolveApiBaseUrl(), Env.EXPO_PUBLIC_MESSAGE_URL, Env.EXPO_PUBLIC_APP_ENV);
  return resolveApiBaseUrl(selected);
}
