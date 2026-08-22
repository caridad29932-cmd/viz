import { defineConfig } from 'vite';

// Resolve base path from env; defaults to '/viz/' for the canonical repo URL.
// Set BASE_PATH env var to '/' for a custom-domain root deployment.
const base = process.env.BASE_PATH || '/viz/';

// During `vite build` we still want absolute base paths so asset URLs are
// emitted correctly. During dev the relative ./src/main.js in index.html is
// resolved by the dev server. We rewrite index.html paths here only when
// building so the final dist/ uses absolute asset URLs.
const isBuild = process.env.NODE_ENV === 'production' || process.argv.includes('build');

export default defineConfig({
  base,
  plugins: isBuild ? [{
    name: 'fix-relative-src',
    transformIndexHtml(html) {
      return html
        .replace('src="./src/main.js"', `src="${base}src/main.js"`)
        .replace('src="./coi-serviceworker.js"', `src="${base}coi-serviceworker.js"`);
    }
  }] : [],
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
