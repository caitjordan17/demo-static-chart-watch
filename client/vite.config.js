import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { pdfAssets } from './pdfAssets.js'
import postcssNesting from 'postcss-nesting'
export default defineConfig({
  plugins: [react(), pdfAssets()],
  build: { target: 'esnext' },
  css: { postcss: { plugins: [postcssNesting()] } },
  optimizeDeps: { esbuildOptions: { target: 'esnext' } },
  // Relative assets work at both username.github.io and username.github.io/repo/.
  base: './',
  server: { port: 3000 }
})
