/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Relative base so the build works from any static host sub-path (e.g. GitHub Pages).
export default defineConfig({
  base: './',
  // One bundle (app + exercise library), cached once by the service worker for offline use.
  build: { chunkSizeWarningLimit: 1600 },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Personal Fitness',
        short_name: 'Fitness',
        description: 'Offline workout logger with automatic progression.',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#161616',
        theme_color: '#161616',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Opens the app when the "rest is over" notification is tapped.
        importScripts: ['sw-rest.js'],
        // Exercise photos are fetched when first viewed, then kept for offline use.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/raw\.githubusercontent\.com\/yuhonas\/free-exercise-db\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'exercise-photos',
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
  },
});
