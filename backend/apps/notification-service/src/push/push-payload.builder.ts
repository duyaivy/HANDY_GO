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
        if (!FCM_RESERVED_DATA_KEYS.has(key) && !(key in data)) {
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

    if (estimateSize() > FCM_MAX_PAYLOAD_BYTES) {
      // Truncate body if payload exceeds 4KB limit
      const excess = estimateSize() - FCM_MAX_PAYLOAD_BYTES + 32; // reserve 32 bytes for safety
      if (body.length > excess) {
        body = body.slice(0, Math.max(0, body.length - excess)) + '...';
      }
    }

    return { title, body, data };
  }
}
