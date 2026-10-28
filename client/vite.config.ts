import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

declare const process: { env: Record<string, string | undefined> }

// The client build label: tools/package.sh sets GUILDIE_BUILD from the VERSION file (+ CI run number).
const build = process.env.GUILDIE_BUILD || 'dev'

// For `npm run dev`: the page calls `api/index.php` next to itself, which Vite forwards to a running
// Guildie API (default: a local server, see docs/deploy.md "Local testing").
const apiTarget = process.env.GUILDIE_API_TARGET || 'http://127.0.0.1:8080'

export default defineConfig({
  plugins: [preact()],
  base: './',   // relative paths: the game is served from /games/guildie/
  define: { __CLIENT_BUILD__: JSON.stringify(build) },
  // The 3D harbor (three.js) is its own chunk of about 140 KB compressed, loaded only in the 3D view,
  // so the usual 500 KB warning doesn't apply to it.
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false, chunkSizeWarningLimit: 700 },
  server: {
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true, rewrite: (p) => '/games/guildie' + p },
    },
  },
})
