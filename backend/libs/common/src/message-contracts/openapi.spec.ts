import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateChatInput } from './index.js';
import type {
  ChatEnvelope,
  ChatConversation,
  ConversationCreateInput,
  MessageReadInput,
} from './index.js';
import type { ApiResponseEnvelope } from '../dto/api-response.dto.js';
const document = JSON.parse(
  readFileSync(
    new URL(
      '../../../../../docs/message-service/openapi.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const schemas = document.components.schemas;
function resolveRef(reference: string): unknown {
  return reference
    .split('/')
    .slice(1)
    .reduce(
      (current: Record<string, unknown>, segment: string) =>
        current[segment] as Record<string, unknown>,
      document,
    );
}
describe('checked-in OpenAPI contract compatibility', () => {
  it('resolves every local reference, including response and socket extension schemas', () => {
    const queue: unknown[] = [document];
    while (queue.length) {
      const value = queue.pop();
      if (typeof value !== 'object' || value === null) continue;
      const object = value as Record<string, unknown>;
      if (typeof object.$ref === 'string')
        expect(resolveRef(object.$ref), object.$ref).toBeDefined();
      queue.push(...Object.values(object));
    }
  });
  it('defines authenticated REST operations with the existing response envelope', () => {
    for (const [path, method] of [
      ['/api/v1/conversations', 'get'],
      ['/api/v1/conversations', 'post'],
      ['/api/v1/conversations/{id}', 'get'],
      ['/api/v1/conversations/{id}/messages', 'get'],
      ['/api/v1/conversations/{id}/read', 'patch'],
    ]) {
      const operation = document.paths[path!][method!];
      expect(operation.security).toEqual([{ 'JWT-Auth': [] }]);
      const success = operation.responses['200'] ?? operation.responses['201'];
      const envelope = resolveRef(
        success.content['application/json'].schema.$ref,
      ) as { required: string[] };
      expect(envelope.required).toEqual(['statusCode', 'message', 'data']);
    }
    const compatible: ApiResponseEnvelope<ChatConversation> =
      {} as ChatEnvelope<ChatConversation>;
    expect(compatible).toBeDefined();
  });
  it('keeps bid-only creation and own read-cursor request compatible with portable validators', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    const create: ConversationCreateInput = { bidId: id };
    const read: MessageReadInput = {
      conversationId: id,
      lastReadSequence: '3',
    };
    expect(schemas.ConversationCreateInput.required).toEqual(
      Object.keys(create),
    );
    expect(Object.keys(schemas.ConversationCreateInput.properties)).toEqual([
      'bidId',
    ]);
    expect(schemas.ConversationCreateInput.additionalProperties).toBe(false);
    expect(schemas.ReadInput.required).toEqual(['lastReadSequence']);
    expect(validateChatInput('conversation.create', create)).toBe(true);
    expect(validateChatInput('message.read', read)).toBe(true);
  });
  it('keeps bigint sequence as JSON string and socket sending separate from REST', () => {
    expect(schemas.Sequence.type).toBe('string');
    expect(document.paths['/api/v1/messages']).toBeUndefined();
    expect(schemas.MessageSendInput.required).toEqual([
      'conversationId',
      'clientMessageId',
      'messageType',
    ]);
    expect(schemas.MessageSendInput.properties.senderId).toBeUndefined();
    expect(document['x-socket-io'].clientEvents).toContain('message.send');
  });
});
