import { defineConfig } from 'vite'
import path from 'path'
import fs from 'fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

const rootDir = path.resolve(__dirname, '../..')
const vendorSrc = path.resolve(__dirname, 'vendor-src')
const localSrc = path.resolve(rootDir, 'src')

// Docker 构建时 vendor-src/ 存在且 ../../src 不存在，自动切换
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
  },
  optimizeDeps: {
    include: ['zustand', 'axios'],
  },
})
