import type { MessageSendInput, VerifiedChatMedia } from './types.js';

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sequence = /^(0|[1-9][0-9]{0,18})$/;
const allowedImageMime = new Set(['image/jpeg', 'image/png', 'image/webp']);
const allowedVideoMime = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
]);
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function keys(input: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(input).every((key) => allowed.includes(key));
}
function isId(value: unknown): value is string {
  return typeof value === 'string' && uuid.test(value);
}
function isSequence(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    sequence.test(value) &&
    BigInt(value) <= 9223372036854775807n
  );
}
function limit(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === 'number' &&
      Number.isInteger(value) &&
      value >= 1 &&
      value <= 100)
  );
}
function blockedContact(content: string): boolean {
  const normalized = content.normalize('NFKC');
  return (
    /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(normalized) ||
    /(?:\+?\d[\s().-]*){9,15}/.test(normalized) ||
    /(?:https?:\/\/|www\.)\S+/i.test(normalized) ||
    /(?:^|\s)@[a-z0-9_.]{3,}/i.test(normalized) ||
    /\b(?:zalo|telegram|whatsapp|facebook|instagram|tiktok|wechat|viber|signal|m.me|t.me)\b/i.test(
      normalized,
    ) ||
    /\b(?:pay|payment|transact)\s+(?:me\s+)?(?:outside|off[ -]?platform)\b/i.test(
      normalized,
    )
  );
}
/** Validation only; does not authenticate or check persisted ownership. Reject unknown properties. */
export function validateChatInput(operation: string, input: unknown): boolean {
  if (!record(input)) return false;
  if (operation === 'conversation.create')
    return keys(input, ['bidId']) && isId(input.bidId);
  if (operation === 'conversations.list')
    return (
      keys(input, ['limit', 'cursor']) &&
      limit(input.limit) &&
      (input.cursor === undefined ||
        (typeof input.cursor === 'string' &&
          /^[A-Za-z0-9_-]{1,2048}$/.test(input.cursor)))
    );
  if (operation === 'messages.list')
    return (
      keys(input, ['limit', 'beforeSequence', 'afterSequence']) &&
      limit(input.limit) &&
      !(
        input.beforeSequence !== undefined && input.afterSequence !== undefined
      ) &&
      (input.beforeSequence === undefined ||
        isSequence(input.beforeSequence)) &&
      (input.afterSequence === undefined || isSequence(input.afterSequence))
    );
  if (!isId(input.conversationId)) return false;
  if (
    [
      'conversation.join',
      'conversation.leave',
      'typing.start',
      'typing.stop',
    ].includes(operation)
  )
    return keys(input, ['conversationId']);
  if (operation === 'message.read')
    return (
      keys(input, ['conversationId', 'lastReadSequence']) &&
      isSequence(input.lastReadSequence)
    );
  if (
    operation !== 'message.send' ||
    !keys(input, [
      'conversationId',
      'clientMessageId',
      'messageType',
      'content',
      'replyToId',
      'attachments',
    ]) ||
    !isId(input.clientMessageId)
  )
    return false;
  if (
    typeof input.messageType !== 'string' ||
    !['TEXT', 'IMAGE', 'VIDEO'].includes(input.messageType)
  )
    return false;
  if (input.replyToId !== undefined && !isId(input.replyToId)) return false;
  if (
    input.content !== undefined &&
    (typeof input.content !== 'string' ||
      input.content.length > 4000 ||
      !input.content.trim() ||
      blockedContact(input.content))
  )
    return false;
  const attachments = input.attachments === undefined ? [] : input.attachments;
  if (
    !Array.isArray(attachments) ||
    !attachments.every(
      (asset) =>
        record(asset) &&
        keys(asset, ['storageKey']) &&
        typeof asset.storageKey === 'string' &&
        /^[A-Za-z0-9_/-]{1,512}$/.test(asset.storageKey),
    )
  )
    return false;
  if (
    new Set(
      attachments.map((asset: { storageKey: string }) => asset.storageKey),
    ).size !== attachments.length
  )
    return false;
  return input.messageType === 'TEXT'
    ? typeof input.content === 'string' && attachments.length === 0
    : attachments.length >= 1 &&
        attachments.length <= (input.messageType === 'IMAGE' ? 4 : 1);
}
/** Input must have passed validateChatInput. Metadata is from an authenticated server lookup. */
export function validateMediaReferences(
  input: MessageSendInput,
  verified: VerifiedChatMedia[],
  senderId: string,
): boolean {
  if (!validateChatInput('message.send', input)) return false;
  const references = input.attachments ?? [];
  return references.every(({ storageKey }) => {
    const matches = verified.filter((asset) => asset.storageKey === storageKey);
    if (matches.length !== 1) return false;
    const asset = matches[0]!;
    if (
      !asset.verified ||
      !asset.ready ||
      !asset.private ||
      asset.ownerId !== senderId ||
      asset.mediaType !== input.messageType ||
      !Number.isSafeInteger(asset.sizeBytes) ||
      asset.sizeBytes <= 0
    )
      return false;
    return asset.mediaType === 'IMAGE'
      ? allowedImageMime.has(asset.mimeType) &&
          asset.sizeBytes <= 10 * 1024 * 1024
      : allowedVideoMime.has(asset.mimeType) &&
          asset.sizeBytes <= 100 * 1024 * 1024;
  });
}
