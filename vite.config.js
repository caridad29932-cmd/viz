import { defineConfig } from 'vite';

// Resolve base path from env; defaults to '/Viz/' for the canonical repo.
// Set BASE_PATH env var to '/' for a custom domain deployment.
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  base,
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          ffmpeg: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
        },
      },
    },
  },
});
