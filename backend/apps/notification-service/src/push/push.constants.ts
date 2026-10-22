/** Default push worker configuration. All values are overridable via environment. */
export const PUSH_DEFAULTS = {
  /** Milliseconds between poll cycles. */
  POLL_INTERVAL_MS: 3000,
  /** Maximum jobs claimed per poll cycle. */
  BATCH_SIZE: 50,
  /** Maximum concurrent Firebase requests. */
  CONCURRENCY: 10,
  /** Maximum delivery attempts before terminal failure. */
  MAX_RETRY_ATTEMPTS: 5,
  /** Milliseconds before a processing job is considered abandoned. */
  LEASE_TIMEOUT_MS: 120_000,
  /** Firebase sendEach hard limit. */
  FCM_BATCH_LIMIT: 500,
  /** Base delay in milliseconds for exponential backoff. */
  RETRY_BASE_DELAY_MS: 2000,
  /** Maximum backoff delay in milliseconds. */
  RETRY_MAX_DELAY_MS: 300_000,
  /** FCM data key prefix to avoid reserved keys. */
  DATA_KEY_PREFIX: '',
} as const;

/** FCM error codes that indicate the token is permanently invalid. */
export const TOKEN_INVALID_ERROR_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]) as ReadonlySet<string>;

/** FCM error codes that are transient and safe to retry. */
export const TRANSIENT_ERROR_CODES = new Set([
  'messaging/unavailable',
  'messaging/internal-error',
  'messaging/server-unavailable',
  'messaging/quota-exceeded',
  'messaging/too-many-requests',
]) as ReadonlySet<string>;

/**
 * FCM reserved data keys that must not be used.
 * @see https://firebase.google.com/docs/cloud-messaging/concept-options#data_messages
 */
export const FCM_RESERVED_DATA_KEYS = new Set([
  'from',
  'notification',
  'message_type',
  'google.c.a.e',
  'collapse_key',
  'gcm.notification.body',
]) as ReadonlySet<string>;

/** Maximum FCM payload size in bytes. */
export const FCM_MAX_PAYLOAD_BYTES = 4096;
