export function migrationUrl(service: string, schema: string): string {
  const suffix = service.toUpperCase().replaceAll('-', '_');
  const direct = process.env[`DIRECT_URL_${suffix}`];
  const migrating = process.env.HANDYGO_MIGRATION === '1' || process.argv.includes('migrate');
  if (process.env.NODE_ENV === 'production' && migrating && !direct) {
    throw new Error(`DIRECT_URL_${suffix} is required for production migrations (DDL-capable endpoint)`);
  }
  const raw = direct || process.env[`DATABASE_URL_${suffix}`] || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/handygo';
  try {
    const url = new URL(raw);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error();
    const configured = url.searchParams.get('schema');
    if (direct && configured && configured !== schema) throw new Error();
    url.searchParams.set('schema', schema);
    return url.toString();
  } catch {
    throw new Error(`Invalid migration URL or schema for ${service}`);
  }
}
