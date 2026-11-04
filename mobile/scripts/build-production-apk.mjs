import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
process.chdir(projectRoot);
// Export local secrets to EAS's temporary build directory; .env is gitignored.
dotenv.config({ path: '.env', quiet: true });
process.env.EXPO_PUBLIC_APP_ENV = 'production';
process.env.STRICT_ENV_VALIDATION = '1';

// EAS regenerates Android in a temporary directory, so configure its daemon
// through the environment instead of editing the ignored android/ directory.
let gradleOpts = process.env.GRADLE_OPTS || '';
if (!gradleOpts.includes('-Dorg.gradle.jvmargs='))
  gradleOpts += ' -Dorg.gradle.jvmargs="-Xmx8192m -XX:MaxMetaspaceSize=2048m -Dfile.encoding=UTF-8"';
if (!gradleOpts.includes('-Dorg.gradle.workers.max='))
  gradleOpts += ' -Dorg.gradle.workers.max=6';
process.env.GRADLE_OPTS = gradleOpts.trim();

mkdirSync('dist', { recursive: true });
const result = spawnSync('pnpm', [
  'dlx',
  'eas-cli',
  'build',
  '--profile',
  'production-apk',
  '--platform',
  'android',
  '--local',
  '--output',
  './dist/handygo-production.apk',
], { cwd: projectRoot, env: process.env, stdio: 'inherit' });

if (result.error)
  console.error(result.error.message);
process.exit(result.status ?? 1);
