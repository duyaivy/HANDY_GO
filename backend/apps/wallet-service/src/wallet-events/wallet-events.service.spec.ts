import { describe, expect, it, vi } from 'vitest';
import { WalletEventsService } from './wallet-events.service.js';
describe('WalletEventsService', () => { it('delegates to shared outbox publisher', async () => { const publisher = { publishPendingEvents: vi.fn().mockResolvedValue(2) }; const service = new WalletEventsService(publisher as never); await expect(service.publishPending()).resolves.toBe(2); }); });
