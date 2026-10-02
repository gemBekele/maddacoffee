import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Environment lives at the repo root, not in apps/web. Without this Vite would
  // only look next to this config and the root .env would be ignored.
  envDir: path.resolve(__dirname, '../..'),
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'MADDA ERP',
        short_name: 'MADDA',
        description: 'Coffee Processing & Export Management',
        theme_color: '#2a3f26',
        background_color: '#f8fafc',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/reference'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'reference-data' },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Consume shared source directly so Vite can tree-shake named exports.
      '@madda/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          query: ['@tanstack/react-query'],
          offline: ['dexie'],
          i18n: ['i18next', 'react-i18next'],
        },
      },
    },
  },
  server: { port: 5173 },
});
