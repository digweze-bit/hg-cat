import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        cacheId: 'hgcat-1783848589',  // Changes on every build = forces cache clear
        // Precache the app shell — everything needed to render the UI
        // Exclude heavy chunks that are only needed occasionally
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        globIgnores: [
          '**/assets-*.js',       // logo/sig base64 — 731KB, only needed for COA/Forms
          '**/pdf-tools-*.js',    // jsPDF/html2canvas — 608KB, only needed for Forms
          '**/xlsx-*.js',         // Excel export — 282KB, only needed for exports
          '**/assets/*.map',
        ],

        runtimeCaching: [
          {
            // Heavy optional chunks — cache when first used, then instant
            urlPattern: /\/assets\/(assets|pdf-tools|xlsx)-.*\.js$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'heavy-chunks',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Supabase REST API — cache with short TTL
            // StaleWhileRevalidate: shows cached data instantly, refreshes in background
            urlPattern: /^https:\/\/gmukkxnxyvmywgrbkwnr\.supabase\.co\/rest\/v1\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'supabase-api',
              expiration: {
                maxEntries: 150,
                maxAgeSeconds: 60 * 5, // 5 min — short enough to see fresh data
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Supabase storage — artwork images, COA PDFs etc
            urlPattern: /^https:\/\/gmukkxnxyvmywgrbkwnr\.supabase\.co\/storage\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'supabase-storage',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Exchange rates — cache 1 hour
            urlPattern: /^https:\/\/api\.exchangerate-api\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'exchange-rates',
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Google Fonts — cache forever
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],

        // SPA routing — serve index.html for all navigation
        navigateFallback: 'index.html',
        // Don't intercept Supabase auth calls — they must always be fresh
        navigateFallbackDenylist: [
          /^\/auth\//,
          /^\/rest\/v1\/auth/,
          /^https:\/\/.*\.supabase\.co\/auth\//,
        ],

        skipWaiting: true,       // New SW activates immediately
        clientsClaim: true,      // Take control of all open tabs immediately
        cleanupOutdatedCaches: true,
      },

      manifest: {
        name: 'Hourglass Gallery',
        short_name: 'HG Cat',
        description: 'Hourglass Gallery management platform',
        theme_color: '#1a1714',
        background_color: '#faf8f5',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },

      devOptions: {
        enabled: false, // Don't run SW in dev — it interferes with hot reload
      },
    }),
  ],

  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Heavy optional chunks — only load when page is visited
          if (id.includes('/src/lib/assets')) return 'assets'
          if (id.includes('jspdf') || id.includes('html2canvas') || id.includes('signature_pad')) return 'pdf-tools'
          if (id.includes('xlsx')) return 'xlsx'
          if (id.includes('qrcode')) return 'qrcode'
          // Supabase stays in its own chunk but loads with the app
          if (id.includes('@supabase')) return 'supabase'
        }
      }
    },
    chunkSizeWarningLimit: 800,
  }
})
