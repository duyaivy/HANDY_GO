import { randomUUID } from 'node:crypto';

// Observed immediately before/after the native sandbox payment of ORD-20261120-D38M.
// Other historical entries remain unknown: current balance cannot reconstruct history.
export const VERIFIED_POSTINGS = [
  { id: 'e98e8280-0ba0-4bc5-92c9-6974942f8522', userId: 'd0d78b4a-afc9-4877-aad4-47a249b93a55', type: 'payment_debit', direction: 'debit', amount: '555555', before: '5000000', after: '4444445' },
  { id: '30173e93-1e99-4c07-be31-f98d49a84c3f', userId: '12aa6893-43f9-4f0a-b23e-0ebd1e5099aa', type: 'worker_earning', direction: 'credit', amount: '499999', before: '5200000', after: '5699999' },
];
const PAYMENT = '3bc25f00-12e6-4426-a633-88a487b876ac';

export async function repairSnapshots(db, { apply = false, operator, runId }, env = process.env) {
  if (env.HG71_VERIFIED_SANDBOX !== '1' || env.WALLET_WITHDRAWALS_ENABLED !== 'true')
    throw new Error('Verified sandbox receipt and wallet sandbox are required');
  if (!/^[A-Za-z0-9-]+$/.test(operator || '') || !/^\d+$/.test(runId || ''))
    throw new Error('Workflow operator and run ID are required');
  await db.query('BEGIN');
  try {
    const results = [];
    for (const proof of VERIFIED_POSTINGS) {
      const result = await db.query(`
        SELECT t.id, w.user_id::text, t.type, t.direction, t.amount::text,
          t.reference_id, t.status::text, t.balance_before::text, t.balance_after::text
        FROM wallet_service.wallet_transactions t
        JOIN wallet_service.wallets w ON w.id = t.wallet_id
        WHERE t.id = $1::uuid FOR UPDATE OF w, t`, [proof.id]);
      const row = result.rows[0];
      if (!row || row.user_id !== proof.userId || row.type !== proof.type
        || row.direction !== proof.direction || row.amount !== proof.amount
        || row.reference_id !== PAYMENT || row.status !== 'completed')
        throw new Error('Verified posting identity changed');
      const existing = row.balance_before === proof.before && row.balance_after === proof.after;
      if (!existing && (row.balance_before !== null || row.balance_after !== null))
        throw new Error('Existing snapshot conflicts with verified evidence');
      if (!existing) {
        await db.query(`UPDATE wallet_service.wallet_transactions
          SET balance_before = $2::bigint, balance_after = $3::bigint WHERE id = $1::uuid`,
        [proof.id, proof.before, proof.after]);
        await db.query(`INSERT INTO wallet_service.wallet_audit_logs
          (id, actor_id, target_user_id, action, reason, metadata)
          VALUES ($1::uuid, $2::uuid, $3::uuid, 'transaction.sandbox_snapshot_restored', $4, $5::jsonb)`,
        [randomUUID(), VERIFIED_POSTINGS[0].userId, proof.userId,
          'Restore only observed native sandbox payment snapshots; balances and amounts unchanged',
          JSON.stringify({ transactionId: proof.id, paymentId: PAYMENT, balanceBefore: proof.before,
            balanceAfter: proof.after, operator, runId, evidence: 'HG71 native payment 2026-11-20; NOVEMBER-PAYMENT-RECOVERY.md' })]);
      }
      results.push({ transactionId: proof.id, balanceBefore: proof.before, balanceAfter: proof.after, alreadyPresent: existing });
    }
    await db.query(apply ? 'COMMIT' : 'ROLLBACK');
    return { applied: apply, results };
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

if (process.env.HG71_SNAPSHOTS_RUN === '1') {
  const { Client } = await import('pg');
  const db = new Client({ connectionString: process.env.DATABASE_URL_WALLET || process.env.DATABASE_URL,
    connectionTimeoutMillis: 10000, statement_timeout: 20000 });
  try {
    await db.connect();
    console.log(JSON.stringify(await repairSnapshots(db, {
      apply: process.env.HG71_REPAIR_APPLY === '1', operator: process.env.HG71_REPAIR_OPERATOR,
      runId: process.env.HG71_REPAIR_RUN_ID,
    })));
  } catch (error) {
    console.error('Sandbox snapshot repair rolled back:', error.code || error.name, error.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}
