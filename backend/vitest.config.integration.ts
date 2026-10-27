import path from 'node:path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  resolve: {
    alias: {
      '@app/common': path.resolve(import.meta.dirname, './libs/common/src/index.ts'),
      '@app/config': path.resolve(import.meta.dirname, './libs/config/src/index.ts'),
      '@app/logger': path.resolve(import.meta.dirname, './libs/logger/src/index.ts'),
      '@app/rabbitmq': path.resolve(import.meta.dirname, './libs/rabbitmq/src/index.ts'),
    },
  },
  test: {
    globals: true,
    root: './',
    include: ['apps/wallet-service/test/integration/**/*.int-spec.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    globalSetup: ['apps/wallet-service/test/integration/global-setup.ts'],
  },
});
