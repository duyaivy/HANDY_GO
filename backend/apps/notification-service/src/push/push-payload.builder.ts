import {
  FCM_MAX_PAYLOAD_BYTES,
  FCM_RESERVED_DATA_KEYS,
} from './push.constants.js';

export interface PushPayloadInput {
  notificationId: string;
  title: string;
  body: string;
  eventType?: string;
  category?: string;
  sourceEntityId?: string | null;
  serviceRequestId?: string | null;
  recipientRole?: string | null;
  customData?: Record<string, unknown> | null;
}

export interface BuiltPushPayload {
  title: string;
  body: string;
  data: Record<string, string>;
}

function isReservedKey(key: string): boolean {
  const lower = key.toLowerCase();
  return (
    FCM_RESERVED_DATA_KEYS.has(key) ||
    FCM_RESERVED_DATA_KEYS.has(lower) ||
    lower.startsWith('google.') ||
    lower.startsWith('gcm.') ||
    lower.startsWith('gcm') ||
    lower === 'from' ||
    lower === 'notification' ||
    lower === 'collapse_key' ||
    lower === 'message_type'
  );
}

export class PushPayloadBuilder {
  static build(input: PushPayloadInput): BuiltPushPayload {
    let title = (input.title || '').trim();
    let body = (input.body || '').trim();

    // Whitelist and format data payload (all values must be strings)
    const data: Record<string, string> = {
      notificationId: input.notificationId,
    };

    if (input.eventType) data.eventType = String(input.eventType);
    if (input.category) data.category = String(input.category);
    if (input.sourceEntityId) data.entityId = String(input.sourceEntityId);
    if (input.serviceRequestId) data.requestId = String(input.serviceRequestId);
    if (input.recipientRole) data.recipientRole = String(input.recipientRole);

    // Merge non-reserved custom data if provided
    if (input.customData && typeof input.customData === 'object') {
      for (const [key, value] of Object.entries(input.customData)) {
        if (!isReservedKey(key) && !(key in data)) {
          if (value !== null && value !== undefined) {
            data[key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
          }
        }
      }
    }

    // Size check & truncation
    const estimateSize = () =>
      Buffer.byteLength(title, 'utf8') +
      Buffer.byteLength(body, 'utf8') +
      Object.entries(data).reduce(
        (acc, [k, v]) => acc + Buffer.byteLength(k, 'utf8') + Buffer.byteLength(v, 'utf8'),
        0,
      );

    if (estimateSize() > FCM_MAX_PAYLOAD_BYTES && body.length > 0) {
      const excess = estimateSize() - FCM_MAX_PAYLOAD_BYTES + 16;
      let cutLength = Math.max(0, body.length - excess);
      while (
        cutLength > 0 &&
        Buffer.byteLength(body.slice(0, cutLength) + '...', 'utf8') >
          Math.max(0, Buffer.byteLength(body, 'utf8') - excess)
      ) {
        cutLength--;
      }
      body = body.slice(0, cutLength) + '...';
    }

    // If still oversized due to huge custom data, drop custom data keys
    const standardKeys = new Set([
      'notificationId',
      'eventType',
      'category',
      'entityId',
      'requestId',
      'recipientRole',
    ]);

    if (estimateSize() > FCM_MAX_PAYLOAD_BYTES) {
      for (const key of Object.keys(data)) {
        if (!standardKeys.has(key)) {
          delete data[key];
          if (estimateSize() <= FCM_MAX_PAYLOAD_BYTES) break;
        }
      }
    }

    // If still oversized (e.g. huge title or body or standard fields)
    while (estimateSize() > FCM_MAX_PAYLOAD_BYTES && body.length > 3) {
      body = body.slice(0, Math.max(0, body.length - 10)) + '...';
    }
    while (estimateSize() > FCM_MAX_PAYLOAD_BYTES && title.length > 3) {
      title = title.slice(0, Math.max(0, title.length - 10)) + '...';
    }

    return { title, body, data };
  }
}
