import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // Cache all JS/CSS/HTML — app shell loads instantly from cache
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],

        // Cache strategies per resource type
        runtimeCaching: [
          {
            // Supabase API — stale-while-revalidate
            // Shows cached data instantly, updates in background
            urlPattern: /^https:\/\/gmukkxnxyvmywgrbkwnr\.supabase\.co\/rest\/v1\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'supabase-api',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24, // 24 hours
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Artwork images — cache for 7 days
            urlPattern: /^https:\/\/.*\.(png|jpg|jpeg|webp|gif|svg)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'artwork-images',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Google Fonts
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
            },
          },
          {
            // Exchange rate API — cache for 1 hour
            urlPattern: /^https:\/\/api\.exchangerate-api\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'exchange-rates',
              expiration: {
                maxEntries: 5,
                maxAgeSeconds: 60 * 60, // 1 hour
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],

        // Don't cache Supabase auth endpoints — always needs to be fresh
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/rest\/v1\/auth/],
      },

      // App manifest — makes it installable on desktop/mobile
      manifest: {
        name: 'Hourglass Gallery',
        short_name: 'HG Cat',
        description: 'Hourglass Gallery management platform',
        theme_color: '#1a1714',
        background_color: '#faf8f5',
        display: 'standalone',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          'assets':    ['./src/lib/assets.js'],
          'pdf-tools': ['jspdf', 'html2canvas', 'signature_pad'],
          'xlsx':      ['xlsx'],
          'qrcode':    ['qrcode'],
          'supabase':  ['@supabase/supabase-js'],
        }
      }
    },
    chunkSizeWarningLimit: 600,
  }
})
