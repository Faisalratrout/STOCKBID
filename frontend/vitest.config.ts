import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Next.js doesn't run on Vite, so this is a standalone Vitest setup (unlike FSO's vite.config.js
// test block, where the dev server is already Vite). The @ alias mirrors tsconfig.json's paths.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './testSetup.ts',
  },
});
