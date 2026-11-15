import crypto from 'node:crypto';
import fs from 'node:fs';
import pg from 'pg';

// Local sandbox fixture only. Never point this script at a shared/cloud database.
const dbUrl = new URL(process.env.DATABASE_URL_WALLET);
if (!['localhost', '127.0.0.1'].includes(dbUrl.hostname) || dbUrl.port !== '55434' || dbUrl.pathname !== '/handygo_payment_local') {
  throw new Error('Requires the isolated payment-local Docker database');
}
const userId = '11111111-1111-4111-8111-111111111111';
const client = new pg.Client({ connectionString: dbUrl.toString() });
await client.connect();
try {
  await client.query('INSERT INTO wallet_service.wallets (id,user_id,balance,reserved_balance,status,created_at,updated_at) VALUES ($1,$2,0,0,\'active\',NOW(),NOW()) ON CONFLICT (user_id) DO NOTHING', [crypto.randomUUID(), userId]);
} finally { await client.end(); }
const now = Math.floor(Date.now() / 1000);
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const payload = { sub: userId, userId, sid: crypto.randomUUID(), roles: ['Customer'], permissions: [], tokenType: 'access', iss: 'handy-go-auth', aud: 'handy-go-api', jti: crypto.randomUUID(), iat: now, exp: now + 3600 };
const signingInput = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode(payload)}`;
const key = fs.readFileSync('keys/jwt-private.pem');
const token = `${signingInput}.${crypto.sign('RSA-SHA256', Buffer.from(signingInput), key).toString('base64url')}`;
const results = [];
for (const amountVnd of [50000, 100000]) {
  const response = await fetch('http://localhost:3000/api/v1/payments/topups', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amountVnd, idempotencyKey: `local-sit-${crypto.randomUUID()}` }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(body));
  const data = body.data;
  const txnRef = new URL(data.checkoutUrl).searchParams.get('vnp_TxnRef');
  if (!/^\d+$/.test(txnRef)) throw new Error('Expected numeric transaction reference');
  results.push({ amountVnd, txnRef, ...data });
}
fs.mkdirSync('logs', { recursive: true });
fs.writeFileSync('logs/payment-local-links.json', JSON.stringify({ userId, results }, null, 2));
console.log(JSON.stringify({ userId, results }, null, 2));
