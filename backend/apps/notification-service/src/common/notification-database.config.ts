/** Shared by the Prisma CLI and runtime so migrations and queries use the same schema. */
export function resolveNotificationDatabaseUrl(
  override?: string,
  sharedUrl?: string,
): string {
  const dedicated = override?.trim();
  const raw = dedicated || sharedUrl?.trim();
  if (!raw)
    throw new Error('DATABASE_URL_NOTIFICATION or DATABASE_URL is required');
  try {
    const url = new URL(raw);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error();
    // A shared URL may name another service's schema: always replace it on fallback.
    if (!dedicated || !url.searchParams.get('schema')) {
      url.searchParams.set('schema', 'notification_service');
    }
    return url.toString();
  } catch {
    throw new Error('Notification database URL must be a valid PostgreSQL URL');
  }
}
