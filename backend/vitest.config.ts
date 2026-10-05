import path from 'node:path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  resolve: {
    alias: {
      '@app/auth': path.resolve(import.meta.dirname, './libs/auth/src/index.ts'),
      '@app/cloudinary': path.resolve(import.meta.dirname, './libs/cloudinary/src/index.ts'),
      '@app/common': path.resolve(import.meta.dirname, './libs/common/src/index.ts'),
      '@app/config': path.resolve(import.meta.dirname, './libs/config/src/index.ts'),
      '@app/database': path.resolve(import.meta.dirname, './libs/database/src/index.ts'),
      '@app/logger': path.resolve(import.meta.dirname, './libs/logger/src/index.ts'),
      '@app/rabbitmq': path.resolve(import.meta.dirname, './libs/rabbitmq/src/index.ts'),
      '@app/redis': path.resolve(import.meta.dirname, './libs/redis/src/index.ts'),
    },
  },
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
  },
});
