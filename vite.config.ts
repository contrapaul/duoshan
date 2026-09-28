import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    port: 5175,
    strictPort: true,
    // `npm run dev:api` runs the Worker (latency probe) on 8788; the pages talk to it as if same-origin.
    proxy: {
      '/api': 'http://localhost:8788',
      '/rt': { target: 'ws://localhost:8788', ws: true },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        latency: resolve(import.meta.dirname, 'latency.html'),
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'worker/**/*.test.ts'],
  },
});
