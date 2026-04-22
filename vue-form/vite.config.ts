import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueJsx(),
    vueDevTools(),
  ],
  optimizeDeps: {
    include: ['ag-grid-community', 'ag-grid-vue3']
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    // raise warning threshold slightly and split vendor packages into per-package chunks
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          if (id.includes('/node_modules/zrender/')) {
            return 'zrender-vendor'
          }

          if (id.includes('/node_modules/echarts/')) {
            return 'echarts-misc'
          }

          if (id.includes('/node_modules/ag-grid-community/') || id.includes('/node_modules/ag-grid-vue3/') || id.includes('/node_modules/ag-grid-enterprise/')) {
            return 'ag-grid-vendor'
          }

          if (id.includes('/node_modules/lodash/')) return 'lodash-vendor'
          if (id.includes('/node_modules/vue/') || id.includes('/node_modules/@vue/')) return 'vue-vendor'
          if (id.includes('/node_modules/vue-router/')) return 'router-vendor'
          if (id.includes('/node_modules/pinia/')) return 'pinia-vendor'

          // Fallback: create per-package vendor chunks for better caching and smaller chunk sizes
          try {
            const parts = id.split('/node_modules/')[1].split('/')
            let pkg = parts[0]
            if (pkg && pkg.startsWith('@') && parts.length > 1) {
              pkg = `${pkg}/${parts[1]}`
            }
            return `vendor-${pkg.replace('/', '-')}`
          } catch (e) {
            return 'vendor'
          }
        },
      },
    },
  },
})
