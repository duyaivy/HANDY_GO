import { describe, expect, it } from 'vitest';
import {
  advanceReadSequence,
  chatPermissions,
  validateChatInput,
  validateMediaReferences,
} from './index.js';
const customer = '00000000-0000-4000-8000-000000000001';
const worker = '00000000-0000-4000-8000-000000000002';
const stranger = '00000000-0000-4000-8000-000000000003';
const id = '00000000-0000-4000-8000-000000000004';
const text = {
  conversationId: id,
  clientMessageId: id,
  messageType: 'TEXT',
  content: 'I can arrive tomorrow.',
};
const snapshot = {
  customerId: customer,
  workerId: worker,
  bidStatus: 'active',
  bidCurrentlyValid: true,
  requestStatus: 'open_for_bidding',
  selectedWorkerId: null,
  orderStatus: null,
  verified: true,
  userActive: true,
  conversationExists: true,
  completionWindowOpen: false,
};
describe('chat wire validation', () => {
  it('accepts text and server-free upload references', () => {
    expect(validateChatInput('message.send', text)).toBe(true);
    expect(
      validateChatInput('message.send', {
        ...text,
        messageType: 'IMAGE',
        attachments: [{ storageKey: 'handy-go/images/asset' }],
      }),
    ).toBe(true);
  });
  it.each([
    { ...text, senderId: stranger },
    { ...text, content: '' },
    { ...text, content: 'a'.repeat(4001) },
    { ...text, messageType: 'AUDIO' },
    { ...text, replyToId: 'bad' },
    { ...text, attachments: [{ storageKey: 'x', url: 'https://untrusted' }] },
    { ...text, messageType: 'IMAGE', attachments: [] },
    {
      ...text,
      messageType: 'VIDEO',
      attachments: [{ storageKey: 'a' }, { storageKey: 'b' }],
    },
    { ...text, messageType: 'TEXT', attachments: [{ storageKey: 'a' }] },
    { ...text, content: 'Call me at +84 912 345 678' },
    { ...text, content: 'email me a@example.com' },
    { ...text, content: 'https://t.me/contactme' },
    { ...text, content: '@my_contact' },
  ])('rejects malformed, forged or forbidden send %#', (input) =>
    expect(validateChatInput('message.send', input)).toBe(false),
  );
  it.each([
    { messageType: ['IMAGE'] },
    { messageType: ['VIDEO'] },
    { messageType: {} },
    { messageType: { toString: () => 'IMAGE' } },
  ])('rejects non-string message type %#', ({ messageType }) => {
    expect(
      validateChatInput('message.send', {
        ...text,
        messageType,
        attachments: [{ storageKey: 'handy-go/images/asset' }],
      }),
    ).toBe(false);
  });
  it('requires bid identity and forbids choosing participants', () => {
    expect(validateChatInput('conversation.create', { bidId: id })).toBe(true);
    expect(
      validateChatInput('conversation.create', { bidId: id, workerId: worker }),
    ).toBe(false);
  });
  it('preserves large cursor precision and rejects noncanonical or out-of-range sequences', () => {
    expect(
      validateChatInput('message.read', {
        conversationId: id,
        lastReadSequence: '9007199254740993',
      }),
    ).toBe(true);
    for (const lastReadSequence of [1, '-1', '01', '9223372036854775808'])
      expect(
        validateChatInput('message.read', {
          conversationId: id,
          lastReadSequence,
        }),
      ).toBe(false);
  });
  it('restricts room and typing payloads to conversation identity', () => {
    expect(validateChatInput('typing.start', { conversationId: id })).toBe(
      true,
    );
    expect(
      validateChatInput('conversation.join', {
        conversationId: id,
        room: 'user:other',
      }),
    ).toBe(false);
    expect(
      validateChatInput('typing.start', { conversationId: id, text: 'draft' }),
    ).toBe(false);
  });
  it('bounds pagination and disallows mixed history directions', () => {
    expect(
      validateChatInput('messages.list', { limit: 30, afterSequence: '0' }),
    ).toBe(true);
    expect(validateChatInput('messages.list', { limit: 101 })).toBe(false);
    expect(
      validateChatInput('messages.list', {
        afterSequence: '1',
        beforeSequence: '2',
      }),
    ).toBe(false);
  });
});
describe('authoritative chat lifecycle policy', () => {
  it('grants participants of a committed valid bid only', () => {
    expect(chatPermissions(snapshot, worker)).toEqual({
      create: true,
      read: true,
      send: true,
    });
    expect(chatPermissions(snapshot, customer)).toEqual({
      create: true,
      read: true,
      send: true,
    });
    expect(chatPermissions(snapshot, stranger)).toEqual({
      create: false,
      read: false,
      send: false,
    });
  });
  it('denies missing/unverified eligibility and inactive identities', () => {
    for (const change of [
      { verified: false },
      { userActive: false },
      { bidStatus: null },
      { customerId: worker },
    ])
      expect(chatPermissions({ ...snapshot, ...change }, worker).send).toBe(
        false,
      );
    expect(
      chatPermissions(
        { ...snapshot, conversationExists: false, bidStatus: null },
        worker,
      ),
    ).toEqual({ create: false, read: false, send: false });
  });
  it.each(['withdrawn', 'expired', 'rejected'])(
    'preserves history but disables sending for %s bid',
    (bidStatus) =>
      expect(chatPermissions({ ...snapshot, bidStatus }, worker)).toEqual({
        create: false,
        read: true,
        send: false,
      }),
  );
  it('rejects active rows whose expiry or canceled round invalidates current admission', () => {
    expect(
      chatPermissions({ ...snapshot, bidCurrentlyValid: false }, worker).send,
    ).toBe(false);
    expect(
      chatPermissions(
        { ...snapshot, bidCurrentlyValid: false, conversationExists: false },
        customer,
      ).create,
    ).toBe(false);
  });
  it('continues selected worker history through conversion and order progress', () => {
    expect(
      chatPermissions(
        {
          ...snapshot,
          bidStatus: 'selected',
          requestStatus: 'converted_to_order',
          selectedWorkerId: worker,
          orderStatus: 'in_progress',
        },
        worker,
      ).send,
    ).toBe(true);
    expect(
      chatPermissions({ ...snapshot, selectedWorkerId: stranger }, worker).send,
    ).toBe(false);
    expect(
      chatPermissions(
        {
          ...snapshot,
          bidStatus: null,
          selectedWorkerId: worker,
          requestStatus: 'converted_to_order',
          orderStatus: 'created',
        },
        worker,
      ).send,
    ).toBe(false);
  });
  it('preserves committed selected-order admission while Bidding selection delivery lags', () => {
    expect(
      chatPermissions(
        {
          ...snapshot,
          bidStatus: 'active',
          bidCurrentlyValid: false,
          requestStatus: 'converted_to_order',
          selectedWorkerId: worker,
          orderStatus: 'created',
        },
        worker,
      ).send,
    ).toBe(true);
  });
  it.each(['cancelled', 'expired'])(
    'closes %s request without deleting history',
    (requestStatus) =>
      expect(chatPermissions({ ...snapshot, requestStatus }, customer)).toEqual(
        { create: false, read: true, send: false },
      ),
  );
  it('requires configured completion window and closes canceled/disputed order', () => {
    const order = {
      ...snapshot,
      selectedWorkerId: worker,
      bidStatus: 'selected',
      requestStatus: 'converted_to_order',
    };
    expect(
      chatPermissions({ ...order, orderStatus: 'completed' }, worker).send,
    ).toBe(false);
    expect(
      chatPermissions(
        { ...order, orderStatus: 'completed', completionWindowOpen: true },
        worker,
      ).send,
    ).toBe(true);
    expect(
      chatPermissions(
        { ...order, orderStatus: 'cancelled', completionWindowOpen: true },
        worker,
      ).send,
    ).toBe(false);
    expect(
      chatPermissions({ ...order, orderStatus: 'disputed' }, worker).send,
    ).toBe(false);
  });
});
describe('media reference policy', () => {
  const input = {
    ...text,
    messageType: 'IMAGE' as const,
    attachments: [{ storageKey: 'handy-go/images/asset' }],
  };
  const asset = {
    storageKey: 'handy-go/images/asset',
    ownerId: customer,
    verified: true,
    ready: true,
    private: true,
    mediaType: 'IMAGE' as const,
    mimeType: 'image/jpeg',
    sizeBytes: 1000,
  };
  it('accepts only independently verified owned ready private matching assets', () =>
    expect(validateMediaReferences(input, [asset], customer)).toBe(true));
  it.each([
    { ownerId: stranger },
    { verified: false },
    { ready: false },
    { private: false },
    { mimeType: 'image/svg+xml' },
    { sizeBytes: 10485761 },
    { storageKey: 'other' },
    { mediaType: 'VIDEO' as const },
  ])('rejects forged or inaccessible references %#', (change) =>
    expect(
      validateMediaReferences(input, [{ ...asset, ...change }], customer),
    ).toBe(false),
  );
});

describe('read cursor progression policy', () => {
  it('advances to a real visible high water and never regresses on delayed devices', () => {
    expect(advanceReadSequence('1', '5', '9')).toBe('5');
    expect(advanceReadSequence('5', '2', '9')).toBe('5');
    expect(() => advanceReadSequence('5', '10', '9')).toThrow(
      'INVALID_READ_CURSOR',
    );
    expect(() => advanceReadSequence('5', '-1', '9')).toThrow(
      'INVALID_READ_CURSOR',
    );
  });
});
