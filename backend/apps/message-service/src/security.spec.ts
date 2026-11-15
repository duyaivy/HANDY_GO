import { describe, expect, it } from 'vitest';
import { CursorCodec, RateLimits, validateInput } from './security.js';

describe('message security boundaries', () => {
  it('binds authenticated list cursors to user and detects tampering', () => {
    const codec = new CursorCodec('a'.repeat(32));
    const value = codec.encode('user-a', new Date('2026-01-01'), 'id');
    expect(codec.decode('user-a', value).id).toBe('id');
    expect(() => codec.decode('user-b', value)).toThrow();
    expect(() => codec.decode('user-a', `${value.slice(0, -1)}x`)).toThrow();
  });
  it('bounds memory and expires per-user sliding windows', () => {
    let now = 0;
    const limits = new RateLimits(() => now);
    limits.take('send:u', 2, 1000);
    limits.take('send:u', 2, 1000);
    expect(() => limits.take('send:u', 2, 1000)).toThrow('RATE_LIMITED');
    now = 1001;
    expect(() => limits.take('send:u', 2, 1000)).not.toThrow();
  });
  it('rejects new rate-limit buckets when capacity is full', () => {
    const limits=new RateLimits(()=>0);
    for(let i=0;i<20000;i++)limits.take(`user:${i}`,1,1000);
    expect(()=>limits.take('overflow',1,1000)).toThrow('RATE_LIMITED');
    expect(()=>limits.take('another-overflow',1,1000)).toThrow('RATE_LIMITED');
    expect((limits as unknown as {windows:Map<string,number[]>}).windows.size).toBe(20000);
  });
  it('distinguishes rejected contact text and forged identities', () => {
    const input = {
      conversationId: '11111111-1111-4111-8111-111111111111',
      clientMessageId: '22222222-2222-4222-8222-222222222222',
      messageType: 'TEXT',
      content: 'call 0901234567',
    };
    expect(() => validateInput('message.send', input)).toThrow(
      'CONTACT_INFORMATION_BLOCKED',
    );
    expect(() =>
      validateInput('message.send', {
        ...input,
        content: 'hello',
        senderId: 'fake',
      }),
    ).toThrow('VALIDATION_ERROR');
  });
});
