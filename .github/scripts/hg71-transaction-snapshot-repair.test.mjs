import assert from 'node:assert/strict';
import { test } from 'node:test';
import { repairSnapshots, VERIFIED_POSTINGS } from './hg71-transaction-snapshot-repair.mjs';

const env = { HG71_VERIFIED_SANDBOX: '1', WALLET_WITHDRAWALS_ENABLED: 'true' };
const options = { operator: 'hducthinh', runId: '123' };
function database(override = {}) {
  const calls = [];
  return { calls, async query(sql, args) {
    calls.push({ sql, args });
    if (sql.includes('SELECT t.id')) {
      const p = VERIFIED_POSTINGS.find(p => p.id === args[0]);
      return { rows: [{ id: p.id, user_id: p.userId, type: p.type, direction: p.direction,
        amount: p.amount, reference_id: '3bc25f00-12e6-4426-a633-88a487b876ac',
        status: 'completed', balance_before: null, balance_after: null, ...override }] };
    }
    return { rows: [] };
  } };
}
test('default dry run rolls back; apply commits two audited metadata repairs only', async () => {
  for (const apply of [false, true]) {
    const db = database();
    const result = await repairSnapshots(db, { ...options, apply }, env);
    assert.equal(result.applied, apply);
    assert.equal(db.calls.at(-1).sql, apply ? 'COMMIT' : 'ROLLBACK');
    assert.equal(db.calls.filter(c => c.sql.includes('INSERT INTO')).length, 2);
    assert.equal(db.calls.filter(c => c.sql.includes('UPDATE wallet_service.wallet_transactions')).length, 2);
    assert.ok(db.calls.every(c => !/UPDATE wallet_service.wallets\b/.test(c.sql)));
  }
});
test('identity mismatch and conflicting snapshots roll back', async () => {
  for (const override of [{ amount: '1' }, { user_id: 'other' }, { reference_id: 'other' }, { balance_before: '1' }]) {
    const db = database(override);
    await assert.rejects(repairSnapshots(db, { ...options, apply: true }, env));
    assert.equal(db.calls.at(-1).sql, 'ROLLBACK');
    assert.equal(db.calls.filter(c => c.sql.includes('UPDATE')).length, 1); // SELECT FOR UPDATE only.
  }
});
test('repeating an exact repair does not rewrite or duplicate its audit', async () => {
  const db = database();
  const query = db.query.bind(db);
  db.query = async (sql, args) => {
    const result = await query(sql, args);
    if (sql.includes('SELECT t.id')) {
      const p = VERIFIED_POSTINGS.find(p => p.id === args[0]);
      Object.assign(result.rows[0], { balance_before: p.before, balance_after: p.after });
    }
    return result;
  };
  const result = await repairSnapshots(db, { ...options, apply: true }, env);
  assert.ok(result.results.every(r => r.alreadyPresent));
  assert.ok(db.calls.every(c => !c.sql.startsWith('UPDATE') && !c.sql.includes('INSERT INTO')));
});
test('sandbox guards reject before opening a transaction', async () => {
  const db = database();
  await assert.rejects(repairSnapshots(db, options, {}));
  assert.equal(db.calls.length, 0);
});
