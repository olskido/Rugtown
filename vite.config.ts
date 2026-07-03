import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 3000, host: true },
  build: {
    rollupOptions: {
      output: {
        // Phaser is ~1.5 MB — keep it in its own cached chunk so the React
        // shell loads first and the engine can be preloaded on auth/outfit.
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
  },
});
