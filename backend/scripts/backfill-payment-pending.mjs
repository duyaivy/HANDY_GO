import { readFile, open } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { backfillPaymentPending } from './lib/payment-pending-backfill.ts';

const { values } = parseArgs({
  options: {
    apply: { type: 'boolean', default: false },
    reviewed: { type: 'string' },
    actor: { type: 'string' },
    reason: { type: 'string' },
    cutoff: { type: 'string' },
    after: { type: 'string' },
    'batch-size': { type: 'string' },
    report: { type: 'string' },
    'run-id': { type: 'string' },
  },
});
if (!values.report)
  throw new Error('--report is required to preserve recovery evidence');
if (values.apply && !values.cutoff)
  throw new Error(
    '--apply requires the cutoff from the reviewed dry-run report',
  );
if (!process.env.DATABASE_URL_PAYMENT)
  throw new Error(
    'DATABASE_URL_PAYMENT is required; no fallback database is used',
  );
// Reserve a new writable report before any database mutation.
const reportFile = await open(values.report, 'wx');
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL_PAYMENT,
  max: 2,
  connectionTimeoutMillis: 5000,
  statement_timeout: 15000,
});
const runId = values['run-id'] ?? randomUUID();
try {
  const report = await backfillPaymentPending(pool, {
    apply: values.apply,
    actorId: values.actor,
    reason: values.reason,
    cutoff: new Date(values.cutoff ?? Date.now()),
    after: values.after,
    batchSize: values['batch-size'] ? Number(values['batch-size']) : undefined,
    runId,
    reviewed: values.reviewed
      ? JSON.parse(await readFile(values.reviewed, 'utf8'))
      : undefined,
  });
  await reportFile.writeFile(JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify({ ...report, results: undefined, notSelected: undefined }),
  );
  if (report.counts.failed) process.exitCode = 1;
} catch (error) {
  // Dependency errors can contain credentials. Print only application validation
  // messages or a DB code, never arbitrary connection error objects.
  console.error(
    error?.code
      ? `Recovery failed (${error.code})`
      : 'Recovery failed; verify arguments, manifest and report path',
  );
  await reportFile.writeFile(
    JSON.stringify(
      {
        runId,
        mode: values.apply ? 'apply' : 'dry-run',
        errorCode: error?.code ?? 'INVALID_ARGUMENT_OR_IO',
        aborted: true,
      },
      null,
      2,
    ) + '\n',
  );
  process.exitCode = 1;
} finally {
  await pool.end();
  await reportFile.close();
}
