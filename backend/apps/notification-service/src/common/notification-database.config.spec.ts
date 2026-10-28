import { resolveNotificationDatabaseUrl } from './notification-database.config.js';

describe('Notification database configuration', () => {
  const shared =
    'postgresql://user:password@db.example.supabase.co:5432/postgres?sslmode=require';

  it('falls back to the shared Supabase database and adds its own schema', () => {
    const url = new URL(resolveNotificationDatabaseUrl(undefined, shared));
    expect(url.searchParams.get('schema')).toBe('notification_service');
    expect(url.searchParams.get('sslmode')).toBe('require');
    expect(url.hostname).toBe('db.example.supabase.co');
  });

  it.each(['', '   ', undefined])(
    'treats an empty override as absent (%s)',
    (override) => {
      expect(
        new URL(
          resolveNotificationDatabaseUrl(override, shared),
        ).searchParams.get('schema'),
      ).toBe('notification_service');
    },
  );

  it('replaces any other-service schema on the shared URL', () => {
    expect(
      new URL(
        resolveNotificationDatabaseUrl(
          undefined,
          `${shared}&schema=catalog_service`,
        ),
      ).searchParams.get('schema'),
    ).toBe('notification_service');
  });

  it('prioritizes the explicit URL and supplies a missing schema', () => {
    const url = new URL(
      resolveNotificationDatabaseUrl(
        'postgres://local:pass@localhost:5432/override',
        shared,
      ),
    );
    expect(url.pathname).toBe('/override');
    expect(url.searchParams.get('schema')).toBe('notification_service');
  });

  it('preserves an explicitly selected override schema', () => {
    expect(
      new URL(
        resolveNotificationDatabaseUrl(`${shared}&schema=notification_test`),
      ).searchParams.get('schema'),
    ).toBe('notification_test');
  });

  it('fails closed without configuration or for invalid protocols without echoing credentials', () => {
    expect(() => resolveNotificationDatabaseUrl()).toThrow('DATABASE_URL');
    expect(() =>
      resolveNotificationDatabaseUrl('https://user:secret@example.com'),
    ).toThrow('valid PostgreSQL URL');
  });
});
