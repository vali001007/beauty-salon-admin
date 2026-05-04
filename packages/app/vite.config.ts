import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

const rootDir = path.resolve(__dirname, '../..')
// 本地开发用主项目 src/，Docker 构建时 VITE_USE_VENDOR_SRC=true 改用本地 vendor-src/
const mainSrc = process.env.VITE_USE_VENDOR_SRC
  ? path.resolve(__dirname, 'vendor-src')
  : path.resolve(rootDir, 'src')

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
