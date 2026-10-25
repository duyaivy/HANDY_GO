import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const composeFile = 'apps/notification-service/test/compose.events-test.yml';
const project = `handy-go-notification-events-${randomBytes(5).toString('hex')}`;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(' ')} failed (${result.status})`);
}

let stackStarted = false;
let exitCode = 0;
try {
  run('docker', [
    'compose',
    '-p',
    project,
    '-f',
    composeFile,
    'up',
    '-d',
    '--wait',
  ]);
  stackStarted = true;
  // This isolated stack is only for the local regression suite. The cloud smoke
  // test is a separate command and does not start this compose file.
  run('pnpm', ['test', 'apps/notification-service', ...process.argv.slice(2)], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      NOTIFICATION_TEST_DATABASE_URL:
        'postgresql://notification_test:notification_test@127.0.0.1:55438/notification_test',
      NOTIFICATION_TEST_RABBITMQ_URL:
        'amqp://notification_test:notification_test@127.0.0.1:56738/notification_test',
    },
  });
} catch (error) {
  exitCode = 1;
  console.error(
    error instanceof Error ? error.message : 'Notification tests failed',
  );
} finally {
  if (stackStarted) {
    try {
      run('docker', [
        'compose',
        '-p',
        project,
        '-f',
        composeFile,
        'down',
        '--volumes',
      ]);
    } catch (error) {
      exitCode = 1;
      console.error(
        error instanceof Error
          ? error.message
          : 'Could not clean up the isolated test stack',
      );
    }
  }
}
process.exit(exitCode);
