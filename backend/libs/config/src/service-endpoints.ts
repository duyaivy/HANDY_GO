import topology from '../../../deploy/production/services.json' with { type: 'json' };
import { isIP } from 'node:net';

const privateIps: Record<string, string> = {
  vps1: '10.77.0.1', vps2: '10.77.0.2', vps3: '10.77.0.3',
};
type EndpointService = { host: string; port: number; url_env?: string; http_callers?: string[]; wireguard_http?: boolean };

/** Validate production HTTP origins before clients can fall back to local addresses. */
export function validateProductionServiceEndpoints(
  config: Record<string, unknown>, serviceName: string,
): void {
  if (config.NODE_ENV !== 'production') return;
  const services: Record<string, EndpointService> = topology.services;
  for (const [name, target] of Object.entries(services)) {
    if (!target.url_env || !target.http_callers?.includes(serviceName)) continue;
    const url = origin(config[target.url_env], target.url_env);
    const crossesHosts = target.http_callers.some(caller => services[caller]?.host !== target.host);
    const allowed = crossesHosts ? [privateIps[target.host]] : [name, ...(target.wireguard_http ? [privateIps[target.host]] : [])];
    if (url.protocol !== 'http:' || !allowed.includes(url.hostname) || url.port !== String(target.port)) {
      throw new Error(`${target.url_env} must target ${allowed[0]}:${target.port}${crossesHosts ? ' over WireGuard' : ' using same-host Docker DNS'}`);
    }
  }
  if (['api-gateway', 'user-trust-service', 'matching-service'].includes(serviceName)) {
    const url = origin(config.AI_SERVICE_URL, 'AI_SERVICE_URL');
    // AI is deployed separately to Azure, not inside a backend container/VPS.
    if (url.protocol !== 'https:' || isIP(url.hostname.replace(/^\[|\]$/g, ''))
        || !url.hostname.includes('.') || /\.(localhost|local|internal)$/.test(url.hostname)) {
      throw new Error('AI_SERVICE_URL must be the external HTTPS origin of the deployed AI service');
    }
  }
}

function origin(value: unknown, key: string): URL {
  let url: URL;
  try { url = new URL(typeof value === 'string' ? value : ''); }
  catch { throw new Error(`${key} is required and must be an HTTP service origin`); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error(`${key} must be an origin without credentials, path, query or fragment`);
  }
  return url;
}
