import assert from 'node:assert/strict';
import { test } from 'node:test';
import { repairNovember, NOVEMBER_FROM, DECEMBER_FROM } from './hg71-november-payment-repair.mjs';

const actorId = 'd0d78b4a-afc9-4877-aad4-47a249b93a55';
const options = { actorId, operator: 'hducthinh', runId: '1234' };
const env = { NODE_ENV: 'development', PAYOUT_MOCK_ENABLED: 'true' };
function database({ overlap = [], failAudit = false } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, args) {
      calls.push({ sql, args });
      if (sql.includes('AS customer_id')) return { rows: [{ customer_id: actorId }] };
      if (sql.includes('FOR UPDATE')) return { rows: overlap };
      if (sql.includes('SELECT rate_percent')) return { rows: [{ rate_percent: '10.00' }] };
      if (sql.includes('INSERT INTO payment_service.admin_audit_logs') && failAudit) throw new Error('audit unavailable');
      if (sql.includes('WITH parsed')) return { rows: [{ event_id: 'event-1', order_id: 'order-1', event_type: 'order.created', previous_status: 'dead' }] };
      return { rows: [] };
    },
  };
}
test('refuses non-sandbox runtimes and production VNPAY before any database access', async () => {
  for (const unsafe of [{ ...env, NODE_ENV: 'production' }, { ...env, PAYOUT_MOCK_ENABLED: 'false' }, { ...env, VNPAY_PAY_URL: 'https://pay.vnpay.vn' }]) {
    const db = database();
    await assert.rejects(repairNovember(db, options, unsafe));
    assert.equal(db.calls.length, 0);
  }
});
test('dry run exercises SQL but rolls back; apply commits the bounded November repair', async () => {
  assert.equal(NOVEMBER_FROM, '2026-10-31T17:00:00.000Z');
  for (const apply of [false, true]) {
    const db = database();
    const result = await repairNovember(db, { ...options, apply }, env);
    assert.equal(result.applied, apply);
    assert.equal(result.replayScheduled.length, 1);
    assert.equal(db.calls.at(-1).sql, apply ? 'COMMIT' : 'ROLLBACK');
    const insertion = db.calls.find(call => call.sql.includes('INSERT INTO payment_service.commission_rules'));
    assert.deepEqual(insertion.args.slice(1, 5), ['10.00', NOVEMBER_FROM, DECEMBER_FROM, actorId]);
    assert.equal(db.calls.some(call => /UPDATE\s+payment_service\.(payments|commission_rules)/.test(call.sql)), false);
  }
});
test('conflicting rules and audit errors roll back without committing', async () => {
  for (const setup of [{ overlap: [{ rate_percent: '20.90' }] }, { failAudit: true }]) {
    const db = database(setup);
    await assert.rejects(repairNovember(db, { ...options, apply: true }, env));
    assert.equal(db.calls.at(-1).sql, 'ROLLBACK');
    assert.equal(db.calls.some(call => call.sql === 'COMMIT'), false);
  }
});
test('reuses an identical November rule on repeated runs without creating another rule', async () => {
  const db = database({ overlap: [{ id: 'existing', rate_percent: '10.00', effective_from: NOVEMBER_FROM, effective_to: DECEMBER_FROM }] });
  const result = await repairNovember(db, { ...options, apply: true }, env);
  assert.equal(result.ruleId, 'existing');
  assert.equal(result.ruleCreated, false);
  assert.equal(db.calls.some(call => call.sql.includes('INSERT INTO payment_service.commission_rules')), false);
});
