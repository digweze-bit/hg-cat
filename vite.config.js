import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          // Heavy assets only loaded when needed
          'assets':     ['./src/lib/assets.js'],
          // PDF/signing tools only on those pages
          'pdf-tools':  ['jspdf', 'html2canvas', 'signature_pad'],
          // Spreadsheet tools
          'xlsx':       ['xlsx'],
          // QR code
          'qrcode':     ['qrcode'],
          // Supabase
          'supabase':   ['@supabase/supabase-js'],
        }
      }
    },
    // Warn if any chunk exceeds 600kb
    chunkSizeWarningLimit: 600,
  }
})
