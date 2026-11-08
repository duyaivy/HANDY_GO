import { availableParallelism, totalmem } from 'node:os';

// Leave memory for native compilers, Metro, the emulator and other applications.
export function getLocalBuildResources(env = process.env, memory = totalmem(), cpus = availableParallelism()) {
  const ramGiB = Math.floor(memory / 1024 ** 3);
  const profiles = {
    low: { heapMiB: 2048, metaspaceMiB: 768, workers: 2 },
    balanced: { heapMiB: 4096, metaspaceMiB: 1024, workers: 4 },
    fast: { heapMiB: 8192, metaspaceMiB: 2048, workers: 6 },
  };
  const requested = env.LOCAL_BUILD_PROFILE || 'auto';
  if (!['auto', ...Object.keys(profiles)].includes(requested))
    throw new Error('LOCAL_BUILD_PROFILE must be auto, low, balanced or fast');
  const profile = requested === 'auto'
    ? (ramGiB >= 32 ? 'fast' : ramGiB >= 16 ? 'balanced' : 'low')
    : requested;
  return {
    profile,
    ramGiB,
    ...profiles[profile],
    workers: Math.min(profiles[profile].workers, Math.max(1, cpus - 2)),
  };
}

export function configureLocalBuild(env = process.env) {
  const resources = getLocalBuildResources(env);
  const defaults = {
    'org.gradle.jvmargs': `"-Xmx${resources.heapMiB}m -XX:MaxMetaspaceSize=${resources.metaspaceMiB}m -Dfile.encoding=UTF-8"`,
    'org.gradle.workers.max': resources.workers,
    'org.gradle.parallel': resources.workers > 1,
    'org.gradle.caching': true,
  };
  let options = env.GRADLE_OPTS || '';
  for (const [key, value] of Object.entries(defaults)) {
    if (!options.includes(`-D${key}=`))
      options += ` -D${key}=${value}`;
  }
  env.GRADLE_OPTS = options.trim();
  env.LOCAL_BUILD_METRO_WORKERS ||= String(resources.workers);
  return resources;
}
