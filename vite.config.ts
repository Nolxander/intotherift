import { defineConfig } from 'vite';
import path from 'path';
import { roomSavePlugin } from './vite-plugin-room-save';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  plugins: [roomSavePlugin()],
  resolve: {
    alias: {
      // Shared in-browser scene editor from the AGD toolkit. Only imported
      // dynamically in dev mode (see src/main.ts), so Rollup tree-shakes it
      // out of the production bundle.
      'agd-builder': path.resolve(__dirname, '../../agd/builder'),
    },
  },
});
