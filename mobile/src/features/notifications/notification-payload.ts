export function notificationIdFromData(data: unknown): string | null {
  if (!data || typeof data !== 'object' || !('notificationId' in data))
    return null;
  const id = data.notificationId;
  return typeof id === 'string' && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(id) ? id : null;
}
