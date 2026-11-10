import { describe, expect, it, vi } from 'vitest';
import { AuthorityClient } from './authority.js';
import { MessageService } from './message.service.js';
import { CursorCodec } from './security.js';
const customerId = '11111111-1111-4111-8111-111111111111';
const workerId = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333';
function setup() {
  const authority = new AuthorityClient({
    secret: 'test',
    bidding: '',
    order: '',
    auth: '',
    media: '',
  });
  vi.spyOn(authority, 'permission').mockResolvedValue({
    permissions: { read: true, send: true, create: true },
    serviceId: id,
    customerId,
    workerId,
    requestId: id,
    orderId: null,
    bid: {} as any,
  });
  const names = vi
    .spyOn(authority, 'displayNames')
    .mockResolvedValue({ [customerId]: 'Khách An', [workerId]: 'Thợ Bình' });
  const serviceName = vi
    .spyOn(authority, 'serviceName')
    .mockResolvedValue('Vệ sinh máy lạnh');
  const c = {
    id,
    requestId: id,
    customerId,
    workerId,
    orderId: null,
    status: 'OPEN',
    lastSequence: 0n,
    lastMessageAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const db = {
    conversation: { findUnique: vi.fn().mockResolvedValue(c) },
    conversationReadState: { findMany: vi.fn().mockResolvedValue([]) },
    $queryRaw: vi.fn().mockResolvedValue([c, { ...c, id: workerId }]),
  };
  const messages = new MessageService(
    db as any,
    authority,
    new CursorCodec('s'.repeat(32)),
  );
  return { messages, names, serviceName };
}
describe('authorized conversation metadata', () => {
  it('returns real participant and service labels in detail', async () => {
    const { messages } = setup();
    expect(await messages.get(customerId, id)).toMatchObject({
      customerName: 'Khách An',
      workerName: 'Thợ Bình',
      serviceName: 'Vệ sinh máy lạnh',
    });
  });
  it('does not request names for nonmembers', async () => {
    const { messages, names, serviceName } = setup();
    await expect(messages.get(id, id)).rejects.toThrow(
      'CONVERSATION_NOT_FOUND',
    );
    expect(names).not.toHaveBeenCalled();
    expect(serviceName).not.toHaveBeenCalled();
  });
  it('batches participants and deduplicates service lookups within a list', async () => {
    const { messages, names, serviceName } = setup();
    const result = await messages.list(customerId, {});
    expect(result.items.map((c) => c.workerName)).toEqual([
      'Thợ Bình',
      'Thợ Bình',
    ]);
    expect(names).toHaveBeenCalledTimes(1);
    expect(serviceName).toHaveBeenCalledTimes(1);
  });
});
