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
    chunkSizeWarningLimit: 900,
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

          if (id.includes('/node_modules/vue/') || id.includes('/node_modules/@vue/')) {
            return 'vue-vendor'
          }

          if (id.includes('/node_modules/vue-router/')) {
            return 'router-vendor'
          }

          if (id.includes('/node_modules/pinia/')) {
            return 'pinia-vendor'
          }

          return 'vendor'
        },
      },
    },
  },
})
