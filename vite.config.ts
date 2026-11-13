import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages sert le site sous /<nom-du-dépôt>/ : le workflow fournit VITE_BASE.
const rawBase = process.env.VITE_BASE || '/';
const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: {
        id: base,
        name: 'NEXUS AI — Pink Diamond Edition',
        short_name: 'NEXUS AI',
        description: 'Assistant IA créatif gratuit : chat, voix, images et vidéos.',
        lang: 'fr',
        theme_color: '#180d19',
        background_color: '#160e17',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        categories: ['productivity', 'utilities'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'nexus-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        // Les gros moteurs (PDF, IA locale, Word, Piper) restent chargés à la demande, hors précache.
        globIgnores: ['**/pdf.worker*', '**/transformers*', '**/ort-*', '**/ai.worker*', '**/mammoth*', '**/piper*', '**/pdf-*'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && /\/assets\//.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'nexus-lazy-assets', expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 60 } }
          }
        ]
      }
    })
  ],
  build: { target: 'es2022', chunkSizeWarningLimit: 2500 },
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['@huggingface/transformers'] }
});
