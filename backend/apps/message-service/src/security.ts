import { createHmac, timingSafeEqual } from 'node:crypto';
import { validateChatInput } from '../../../libs/common/src/message-contracts/index.js';
import type { ChatErrorCode } from '../../../libs/common/src/message-contracts/index.js';

const statuses: Partial<Record<ChatErrorCode, number>> = {
  UNAUTHORIZED: 401,
  CONVERSATION_NOT_FOUND: 404,
  CHAT_INELIGIBLE: 403,
  CHAT_READ_ONLY: 409,
  IDEMPOTENCY_CONFLICT: 409,
  MEDIA_UNVERIFIED: 422,
  CONTACT_INFORMATION_BLOCKED: 422,
  RATE_LIMITED: 429,
  ELIGIBILITY_UNAVAILABLE: 503,
  PAYLOAD_TOO_LARGE: 413,
  INTERNAL_ERROR: 500,
};
export class ChatError extends Error {
  constructor(
    public readonly code: ChatErrorCode,
    public readonly retryAfterMs?: number,
  ) {
    super(code);
  }
  get status() {
    return statuses[this.code] ?? 400;
  }
  get retryable() {
    return [
      'ELIGIBILITY_UNAVAILABLE',
      'RATE_LIMITED',
      'INTERNAL_ERROR',
    ].includes(this.code);
  }
}
export function publicError(error: unknown): ChatError {
  return error instanceof ChatError ? error : new ChatError('INTERNAL_ERROR');
}
export function validateInput(operation: string, input: unknown): void {
  if (Buffer.byteLength(JSON.stringify(input) ?? '') > 16384)
    throw new ChatError('PAYLOAD_TOO_LARGE');
  if (validateChatInput(operation, input)) return;
  if (
    operation === 'message.send' &&
    typeof input === 'object' &&
    input !== null &&
    'content' in input &&
    typeof input.content === 'string'
  ) {
    // Validate the same shape with harmless text to distinguish the policy rejection from malformed payloads.
    if (
      input.content.length <= 4000 &&
      input.content.trim() &&
      validateChatInput(operation, { ...input, content: 'valid text' })
    )
      throw new ChatError('CONTACT_INFORMATION_BLOCKED');
  }
  throw new ChatError('VALIDATION_ERROR');
}
export class RateLimits {
  private readonly windows = new Map<string, number[]>();
  private lastCleanup=0;
  constructor(private readonly now = Date.now) {}
  take(key: string, max: number, milliseconds: number) {
    const now = this.now();
    if(now-this.lastCleanup>=30000){for(const [k,v]of this.windows)if(v.at(-1)!<now-600000)this.windows.delete(k);this.lastCleanup=now;}
    if(!this.windows.has(key)&&this.windows.size>=20000)throw new ChatError('RATE_LIMITED',1000);
    const values = (this.windows.get(key) ?? []).filter(
      (time) => time > now - milliseconds,
    );
    if (values.length >= max)
      throw new ChatError(
        'RATE_LIMITED',
        Math.max(1, values[0]! + milliseconds - now),
      );
    values.push(now);
    this.windows.set(key, values);
  }
}
export class CursorCodec {
  constructor(private readonly secret: string) {
    if (secret.length < 32)
      throw new Error(
        'MESSAGE_CURSOR_SECRET must contain at least 32 characters',
      );
  }
  encode(userId: string, timestamp: Date, id: string) {
    const body = Buffer.from(
      JSON.stringify({
        v: 1,
        userId,
        sortTimestamp: timestamp.toISOString(),
        id,
      }),
    ).toString('base64url');
    return Buffer.from(`${body}.${this.mac(body)}`).toString('base64url');
  }
  decode(userId: string, cursor: string): { id: string; timestamp: Date } {
    try {
      if (cursor.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(cursor))
        throw new Error();
      const [body, mac, extra] = Buffer.from(cursor, 'base64url')
        .toString()
        .split('.');
      if (
        !body ||
        !mac ||
        extra ||
        !timingSafeEqual(Buffer.from(mac), Buffer.from(this.mac(body)))
      )
        throw new Error();
      const value = JSON.parse(Buffer.from(body, 'base64url').toString());
      const timestamp = new Date(value.sortTimestamp);
      if (
        value.v !== 1 ||
        value.userId !== userId ||
        typeof value.id !== 'string' ||
        !Number.isFinite(timestamp.getTime())
      )
        throw new Error();
      return { id: value.id, timestamp };
    } catch {
      throw new ChatError('VALIDATION_ERROR');
    }
  }
  private mac(value: string) {
    return createHmac('sha256', this.secret).update(value).digest('base64url');
  }
}
