import { chatBaseUrl } from '../chat-config';

jest.mock('env', () => ({ __esModule: true, default: {} }));
jest.mock('@/services/api/api-client', () => ({ resolveApiBaseUrl: (url?: string) => url || 'https://gateway.test/api/v1' }));
it('uses the Gateway by default and ignores dev overrides outside development', () => {
  expect(chatBaseUrl('https://gateway.test/api/v1')).toBe('https://gateway.test/api/v1');
  expect(chatBaseUrl('https://gateway.test/api/v1', 'http://localhost:3011/api/v1', 'production')).toBe('https://gateway.test/api/v1');
});
it('accepts only an explicit development API base without credentials or query secrets', () => {
  expect(chatBaseUrl('http://localhost:3000/api/v1', 'http://localhost:3011/api/v1', 'development')).toBe('http://localhost:3011/api/v1');
  expect(() => chatBaseUrl('http://localhost:3000/api/v1', 'http://user:pass@localhost:3011/api/v1', 'development')).toThrow();
  expect(() => chatBaseUrl('http://localhost:3000/api/v1', 'http://localhost:3011', 'development')).toThrow();
});
