import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `--mode single` bundles everything into one index.html (used for the shareable demo).
export default defineConfig(({ mode }) => ({
  base: process.env.BASE_PATH ?? '/',
  plugins: mode === 'single' ? [react(), viteSingleFile()] : [react()],
}));
