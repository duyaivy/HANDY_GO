import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

let client: Client;

beforeAll(async () => {
  const rawUrl = process.env.PAYMENT_TEST_DATABASE_URL;
  if (!rawUrl) throw new Error('PAYMENT_TEST_DATABASE_URL is required');
  const url = new URL(rawUrl);
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    url.pathname !== '/handygo_hg51_payment_test'
  ) {
    throw new Error(
      'Payment schema tests require the isolated local handygo_hg51_payment_test database',
    );
  }
  url.searchParams.delete('schema');
  client = new Client({ connectionString: url.toString() });
  await client.connect();
});

afterAll(async () => {
  if (client) await client.end();
});

beforeEach(async () => {
  await client.query('BEGIN');
  await client.query('SET LOCAL search_path TO payment_service, pg_catalog');
});

afterEach(async () => {
  await client.query('ROLLBACK');
});

async function createRule(
  from = '2026-01-01T00:00:00Z',
  to: string | null = null,
) {
  const id = randomUUID();
  await client.query(
    `INSERT INTO commission_rules (id, rate_percent, effective_from, effective_to, created_by_user_id)
     VALUES ($1, 5, $2, $3, $4)`,
    [id, from, to, randomUUID()],
  );
  return id;
}

async function createPayment(
  ruleId: string,
  orderId: string,
  fee = '5',
  earning = '95',
) {
  await client.query(
    `INSERT INTO payments
     (id, order_id, customer_user_id, worker_user_id, amount, commission_rule_id,
      commission_rate_percent, platform_fee, worker_earning, updated_at)
     VALUES ($1, $2, $3, $4, 100, $5, 5, $6, $7, now())`,
    [randomUUID(), orderId, randomUUID(), randomUUID(), ruleId, fee, earning],
  );
}

describe('Payment migration', () => {
  it('creates tables in payment_service, not public', async () => {
    const result = await client.query(
      `SELECT to_regclass('payment_service.payments') AS payment_table,
              to_regclass('public.payments') AS public_table`,
    );
    expect(result.rows[0].payment_table).not.toBeNull();
    expect(result.rows[0].public_table).toBeNull();
  });

  it('enforces one payment per order', async () => {
    const rule = await createRule();
    const orderId = randomUUID();
    await createPayment(rule, orderId);
    await expect(createPayment(rule, orderId)).rejects.toMatchObject({
      code: '23505',
    });
  });

  it('rejects allocations that do not sum to the gross amount', async () => {
    const rule = await createRule();
    await expect(
      createPayment(rule, randomUUID(), '5', '96'),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('rejects overlapping active commission rules', async () => {
    await createRule('2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z');
    await expect(createRule('2026-06-01T00:00:00Z')).rejects.toMatchObject({
      code: '23P01',
    });
  });

  it('allows adjacent commission rule intervals', async () => {
    await createRule('2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z');
    await expect(createRule('2027-01-01T00:00:00Z')).resolves.toBeTruthy();
  });

  it.each(['30.01', '100.00'])(
    'rejects commission %s at the database boundary',
    async (rate) => {
      await expect(
        client.query(
          `INSERT INTO commission_rules (id, rate_percent, effective_from, created_by_user_id) VALUES ($1, $2, now(), $3)`,
          [randomUUID(), rate, randomUUID()],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    },
  );

  it.each(['0.00', '30.00'])(
    'accepts commission policy boundary %s',
    async (rate) => {
      await expect(
        client.query(
          `INSERT INTO commission_rules (id, rate_percent, effective_from, created_by_user_id) VALUES ($1, $2, now(), $3)`,
          [randomUUID(), rate, randomUUID()],
        ),
      ).resolves.toBeTruthy();
    },
  );

  it('rejects a zero worker earning even when allocations sum to gross', async () => {
    const rule = await createRule();
    await expect(
      createPayment(rule, randomUUID(), '100', '0'),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('enforces one VND per point for top-ups', async () => {
    await expect(
      client.query(
        `INSERT INTO topup_requests
       (id, user_id, amount_vnd, points_to_credit, provider, idempotency_key, updated_at)
       VALUES ($1, $2, 100, 99, 'sandbox', $3, now())`,
        [randomUUID(), randomUUID(), randomUUID()],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('rejects nonpositive refund amounts', async () => {
    const rule = await createRule();
    const orderId = randomUUID();
    await createPayment(rule, orderId);
    const payment = await client.query(
      'SELECT id FROM payments WHERE order_id = $1',
      [orderId],
    );
    await expect(
      client.query(
        `INSERT INTO refunds (id, payment_id, amount_vnd, reason, idempotency_key, updated_at)
       VALUES ($1, $2, 0, 'test', $3, now())`,
        [randomUUID(), payment.rows[0].id, randomUUID()],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
});
