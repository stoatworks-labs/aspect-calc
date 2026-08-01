import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Static SPA, no backend. dist/ is what the Cloudflare Worker serves as assets.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
