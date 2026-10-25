import { BadRequestException } from '@nestjs/common';
import { isUUID } from 'class-validator';

export function encodeNotificationCursor(
  row: { id: string; createdAt: Date },
  userId: string,
  isRead?: boolean,
): string {
  return Buffer.from(
    JSON.stringify({
      v: 1,
      id: row.id,
      at: row.createdAt.toISOString(),
      userId,
      isRead: isRead ?? null,
    }),
  ).toString('base64url');
}

export function decodeNotificationCursor(
  cursor: string,
  userId: string,
  isRead?: boolean,
): { id: string; createdAt: Date } {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error();
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      value.v !== 1 ||
      typeof value.id !== 'string' ||
      !isUUID(value.id) ||
      value.userId !== userId ||
      value.isRead !== (isRead ?? null) ||
      typeof value.at !== 'string'
    )
      throw new Error();
    const createdAt = new Date(value.at);
    if (createdAt.toISOString() !== value.at) throw new Error();
    return { id: value.id, createdAt };
  } catch {
    throw new BadRequestException(
      'Invalid notification cursor for this user or filter',
    );
  }
}
