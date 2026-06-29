import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const rpcOrigin = new URL(env.VITE_RPC_URL || 'https://soroban-testnet.stellar.org').origin
  const rpcOriginPattern = new RegExp(`^${escapeRegExp(rpcOrigin)}/`)

  return {
    base: '/',
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        manifestFilename: 'manifest.json',
        includeAssets: ['favicon.ico', 'favicon.svg', 'og-image.png'],
        manifest: {
          name: 'Bimex — Crowdfunding de Impacto Social',
          short_name: 'Bimex',
          description: 'Plataforma de crowdfunding de impacto social. Tu capital siempre es recuperable.',
          theme_color: '#0f172a',
          background_color: '#f7f8fa',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/icons/icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any maskable',
            },
            {
              src: '/icons/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable',
            },
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          navigateFallback: '/index.html',
          globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
          runtimeCaching: [
            {
              urlPattern: ({ request, url }) => request.method === 'GET' && url.origin === self.location.origin,
              handler: 'CacheFirst',
              options: {
                cacheName: 'app-shell-cache',
                expiration: {
                  maxEntries: 64,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: rpcOriginPattern,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'stellar-rpc-read-cache',
                networkTimeoutSeconds: 3,
                expiration: {
                  maxEntries: 16,
                  maxAgeSeconds: 60 * 5,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
      }),
    ],
    define: {
      global: 'globalThis',
    },
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: {
        buffer: 'buffer',
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.js',
      include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
    },
  }
})
