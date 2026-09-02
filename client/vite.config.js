import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { webcrypto } from 'crypto'

// Polyfill for Node 16
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:5000'
    }
  },
  define: {
    global: 'globalThis'
  }
})
