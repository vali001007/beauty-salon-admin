import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

process.env.VITE_API_MODE = 'mock';

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_API_MODE': JSON.stringify('mock'),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@ami/agent-core': path.resolve(__dirname, './packages/agent-core/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 15000,
    hookTimeout: 15000,
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'packages/Ami-Aura-Lite-Kiosk/src/**/*.{test,spec}.{ts,tsx}',
      'packages/agent-core/**/*.{test,spec}.{ts,tsx}',
    ],
    coverage: {
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/test/**', 'src/types/**', 'src/**/*.d.ts'],
    },
  },
});
