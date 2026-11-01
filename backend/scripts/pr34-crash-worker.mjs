import amqp from 'amqplib';
import pg from 'pg';
const schema = new URL(process.env.PR34_TEST_DATABASE_URL).searchParams.get(
  'schema',
);
if (!/^pr34_test_[a-f0-9]{32}$/.test(schema))
  throw new Error('Invalid test schema');
const db = new pg.Client({
  connectionString: process.env.PR34_TEST_DATABASE_URL,
});
await db.connect();
const connection = await amqp.connect(process.env.RABBITMQ_URL);
const channel = await connection.createChannel();
await channel.prefetch(1);
const memoryQueue = [];
await channel.consume(
  process.env.PR34_TEST_QUEUE,
  async (message) => {
    if (!message) return;
    memoryQueue.push(message);
    await db.query(
      `UPDATE "${schema}".match_runs SET status='processing', attempt_token=$1,
    lease_expires_at=clock_timestamp()+interval '200 milliseconds' WHERE id=$2`,
      [crypto.randomUUID(), process.env.PR34_TEST_RUN_ID],
    );
    process.send?.('queued-without-ack');
  },
  { noAck: false },
);
