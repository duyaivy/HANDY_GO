import type { ChatMessage } from '../types';
import { contiguousSequence, mergeMessages } from '../message-cache';

function message(sequence: string, id = sequence): ChatMessage {
  return {
    id,
    sequence,
    conversationId: 'c',
    senderId: 's',
    clientMessageId: `key-${id}`,
    messageType: 'TEXT',
    content: 'Hello',
    replyToId: null,
    reply: null,
    attachments: [],
    createdAt: '2026-11-06T00:00:00Z',
  };
}
it('merges ACK, broadcast and history once in bigint sequence order', () => {
  expect(
    mergeMessages(
      [message('9007199254740993')],
      [message('9007199254740992'), message('9007199254740993')],
    ).map(m => m.sequence),
  ).toEqual(['9007199254740992', '9007199254740993']);
});
it('does not move a resync cursor past a missing persisted message', () => {
  expect(contiguousSequence('5', [message('6'), message('8')])).toBe('6');
  expect(
    contiguousSequence('5', [message('8'), message('7'), message('6')]),
  ).toBe('8');
});
it('never merges messages from another conversation', () => {
  expect(
    mergeMessages(
      [message('1')],
      [{ ...message('2'), conversationId: 'other' }],
    ),
  ).toHaveLength(1);
});
