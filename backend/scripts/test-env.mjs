import { spawn } from 'node:child_process';
process.loadEnvFile(process.env.PR34_ENV_FILE || '.env');
// CI excludes legacy manual tests that use fixed IDs in shared databases.
// Real database regressions use verify-pr34.mjs and a unique disposable schema.
const child = spawn('pnpm', ['test', ...process.argv.slice(2)], {
  env: { ...process.env, NODE_ENV: 'test', CI: 'true' },
  stdio: 'inherit',
});
child.once('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.once('exit', (code) => {
  process.exitCode = code ?? 1;
});
