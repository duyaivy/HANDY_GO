import { optionalValue } from '../libs/config/src/optional-env.js';

export function migrationUrl(service: string, schema: string): string {
  const suffix = service.toUpperCase().replaceAll('-', '_');
  const direct = optionalValue(process.env[`DIRECT_URL_${suffix}`])?.trim();
  const migrating = process.env.HANDYGO_MIGRATION === '1' || process.argv.includes('migrate');
  const effective = direct || optionalValue(process.env[`DATABASE_URL_${suffix}`])?.trim() || optionalValue(process.env.DATABASE_URL)?.trim();
  if (!effective && process.env.NODE_ENV === 'production') {
    throw new Error(`DATABASE_URL_${suffix} or DATABASE_URL is required`);
  }
  const raw = effective || 'postgresql://postgres:postgres@localhost:5432/handygo';
  try {
    const url = new URL(raw);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username || !url.pathname.replaceAll('/', '') || url.port === '0') throw new Error();
    const configured = url.searchParams.get('schema');
    if (direct && configured && configured !== schema) throw new Error();
    if (migrating && url.hostname.toLowerCase().endsWith('.pooler.supabase.com') && url.port === '6543') {
      throw new Error();
    }
    url.searchParams.set('schema', schema);
    return url.toString();
  } catch {
    throw new Error(`Invalid migration URL or schema for ${service}; migrations require a direct or session endpoint, not a Supabase transaction pooler`);
  }
}
