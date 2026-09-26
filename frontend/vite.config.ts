import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // REACT_APP_ is still accepted so existing Vercel env vars keep working after the CRA → Vite move.
  envPrefix: ['VITE_', 'REACT_APP_'],
  // Inline config so a stray postcss.config.js from the old setup is never picked up.
  css: { postcss: {} },
  resolve: { extensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'] },
  server: { port: 5173 },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
