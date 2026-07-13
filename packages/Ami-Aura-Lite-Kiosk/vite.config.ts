import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

const rootDir = path.resolve(__dirname, '../..')
const devHost = process.env.VITE_KIOSK_DEV_HOST || '127.0.0.1'
const devPort = Number(process.env.VITE_KIOSK_DEV_PORT || 5175)
const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8080'

function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig({
  plugins: [
    figmaAssetResolver(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  envDir: rootDir,
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      react: path.resolve(rootDir, 'node_modules/react'),
      'react-dom': path.resolve(rootDir, 'node_modules/react-dom'),
      '@': path.resolve(rootDir, 'src'),
      '@aura': path.resolve(__dirname, './src'),
      '@ami/agent-core': path.resolve(rootDir, 'packages/agent-core/index.ts'),
    },
  },
  server: {
    host: devHost,
    port: devPort,
    watch: {
      ignored: ['**/dist/**'],
    },
    fs: {
      allow: [rootDir],
    },
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: {
    include: ['axios', 'zustand'],
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
