import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

const rootDir = path.resolve(__dirname, '../..')

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@app': path.resolve(__dirname, './src'),
      '@': path.resolve(rootDir, 'src'),
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
