import type { ChatMessage } from './types';

export function mergeMessages(
  current: ChatMessage[],
  incoming: ChatMessage[],
): ChatMessage[] {
  const conversationId
    = current[0]?.conversationId ?? incoming[0]?.conversationId;
  const messages = new Map<string, ChatMessage>();
  for (const message of [...current, ...incoming]) {
    if (message.conversationId === conversationId)
      messages.set(message.id, message);
  }
  return [...messages.values()].sort((a, b) =>
    BigInt(a.sequence) < BigInt(b.sequence)
      ? -1
      : BigInt(a.sequence) > BigInt(b.sequence)
        ? 1
        : 0,
  );
}
export function contiguousSequence(
  start: string,
  messages: ChatMessage[],
): string {
  let cursor = BigInt(start);
  for (const message of [...messages].sort((a, b) =>
    BigInt(a.sequence) < BigInt(b.sequence) ? -1 : 1,
  )) {
    if (BigInt(message.sequence) === cursor + 1n)
      cursor++;
  }
  return String(cursor);
}
