/// <reference types="vitest" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  optimizeDeps: { exclude: ['@babylonjs/havok'] },
  build: { chunkSizeWarningLimit: 6000 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'shared/**/*.test.ts', 'server/**/*.test.ts', 'mcp/**/*.test.ts'],
    passWithNoTests: true,
    testTimeout: 15000,
  },
});
