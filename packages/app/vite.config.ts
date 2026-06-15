import { defineConfig } from 'vite'
import path from 'path'
import fs from 'fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

const rootDir = path.resolve(__dirname, '../..')
const vendorSrc = path.resolve(__dirname, 'vendor-src')
const localSrc = path.resolve(rootDir, 'src')
const allowVendorFallback = process.env.ALLOW_VENDOR_SRC_FALLBACK === 'true'

if (!fs.existsSync(localSrc) && !allowVendorFallback) {
  throw new Error('Root src is required. vendor-src fallback is deprecated. Set ALLOW_VENDOR_SRC_FALLBACK=true only for legacy build diagnostics.')
}

const mainSrc = fs.existsSync(localSrc) ? localSrc : vendorSrc

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@app': path.resolve(__dirname, './src'),
      '@': mainSrc,
    },
  },
  server: {
    port: 5174,
    fs: {
      allow: [rootDir],
    },
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:8080',
        changeOrigin: true,
      },
      '/v1': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: {
    include: ['zustand', 'axios'],
  },
})
