import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  assetsInclude: ['**/*.wasm'],
  worker: {
    format: 'es', // Required: ES module workers support top-level await + imports
  },
  optimizeDeps: {
    // Emscripten modules have WASM side-effects; exclude from Vite's pre-bundler
    exclude: ['@jitsi/rnnoise-wasm', 'speex-resampler'],
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
})
