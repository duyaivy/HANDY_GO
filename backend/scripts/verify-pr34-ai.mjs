import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
process.loadEnvFile(process.env.PR34_ENV_FILE || '.env');
const target = new URL(process.env.AI_SERVICE_URL || 'http://localhost:8000');
if (!['localhost', '127.0.0.1'].includes(target.hostname))
  throw new Error('AI runtime verification requires a local AI_SERVICE_URL');
const port = target.port || '8000';
const run = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: process.env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)),
    );
  });
const name = 'handygo-pr34-ai';
try {
  await run('docker', [
    'run',
    '--rm',
    '-d',
    '--name',
    name,
    '-e',
    'INTERNAL_SERVICE_SECRET',
    '-e',
    'DEBUG=false',
    '-e',
    'PORT=8000',
    '-v',
    `${resolve('../ai/app')}:/app/app:ro`,
    '-p',
    `127.0.0.1:${port}:8000`,
    'ai-ai-service:latest',
  ]);
  const deadline = Date.now() + 180000;
  let ready = false;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${target.origin}/ready`, {
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok && (await response.json()).modelLoaded) {
        ready = true;
        break;
      }
    } catch {
      /* startup/model warmup */
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  if (!ready)
    throw new Error('AI model readiness did not succeed within 180 seconds');
  console.log('AI model readiness: passed');
  const response = await fetch(`${target.origin}/internal/ai/matching/rank`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-internal-secret': process.env.INTERNAL_SERVICE_SECRET || '',
    },
    body: JSON.stringify({
      serviceRequestId: crypto.randomUUID(),
      requestRevision: 1,
      serviceId: crypto.randomUUID(),
      requestDescription: 'Sửa máy lạnh không lạnh',
      requestLatitude: 10.77,
      requestLongitude: 106.7,
      topN: 2,
      candidates: [
        {
          workerUserId: crypto.randomUUID(),
          offeringTitle: 'Sửa máy lạnh',
          offeringDescription: 'Sửa máy lạnh không lạnh, nạp gas',
          distanceKm: 1,
          radiusKm: 10,
          averageRating: 4.8,
          ratingCount: 20,
          experienceYears: 5,
        },
        {
          workerUserId: crypto.randomUUID(),
          offeringTitle: 'Điện dân dụng',
          offeringDescription: 'Lắp đặt đèn và ổ điện',
          distanceKm: 2,
          radiusKm: 10,
          averageRating: 4.5,
          ratingCount: 10,
          experienceYears: 3,
        },
      ],
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`AI inference HTTP ${response.status}`);
  const body = await response.json();
  if (body.providerType !== 'real_ai' || body.rankedWorkers?.length !== 2)
    throw new Error('AI inference contract failed');
  console.log(
    `AI real inference: passed (${body.rankedWorkers.length} workers, ${body.modelVersion})`,
  );
} finally {
  await run('docker', ['stop', name]);
}
