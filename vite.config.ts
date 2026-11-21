/* eslint-disable @typescript-eslint/ban-ts-comment */
/// <reference types="vitest" />
// @ts-nocheck - vitest types conflict with vite types (version mismatch in node_modules)
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

// Firebase Hosting answers a missing file with the SPA's index.html (status 200): never cache that as a
// lens script/style, and only cache real HTML for the lens page. (Workbox copies these functions into
// sw.js as text, so each must be self-contained.)
const notHtml = {
  cacheWillUpdate: async ({ response }: { response: Response }) =>
    response && response.status === 200 && !(response.headers.get('content-type') || '').includes('text/html')
      ? response
      : null,
};
const htmlOnly = {
  cacheWillUpdate: async ({ response }: { response: Response }) =>
    response && response.status === 200 && (response.headers.get('content-type') || '').includes('text/html')
      ? response
      : null,
};

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'Testy Akademia Dermatoskopii',
        short_name: 'Dermatoskopia',
        description: 'Aplikacja do nauki dermatoskopii / Dermatoscopy training app',
        theme_color: '#2855B1',
        background_color: '#FFFFFF',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // "Beneath the Lens" (/lens/) is a ~1 MB 3D engine used by logged-in users only: keep it out of
        // the precache every visitor downloads, and cache it at runtime once it is opened (see below).
        globIgnores: ['lens-app/**', 'assets/lens-*'],
        // the iframe at /lens-app/index.html is a page of its own: never answer it with the SPA shell
        navigateFallbackDenylist: [/^\/lens-app\//],
        runtimeCaching: [
          {
            // the lens page: network first so a deploy shows up at once; the cached copy keeps it
            // working on a flaky lecture-room connection
            urlPattern: ({ url }) => url.pathname.startsWith('/lens-app/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'lens-page',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 30 },
              plugins: [htmlOnly],
            },
          },
          {
            // the lens scripts, styles and logo: content-hashed file names, so cache first is safe. No age
            // limit (that would only orphan files a cached page still needs): least recently used go first.
            urlPattern: ({ url }) => /^\/assets\/lens-/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'lens-assets',
              expiration: { maxEntries: 40 },
              plugins: [notHtml],
            },
          },
          {
            // fonts used by the lens
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-css' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-files',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/firebasestorage\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'firebase-images',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
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
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        // "Beneath the Lens": a page of its own, framed by the /lens/ route (src/features/lens)
        lens: path.resolve(__dirname, 'lens-app/index.html'),
      },
      output: {
        // three.js rarely changes: its own chunk stays cached across lens updates
        manualChunks: (id) => (id.includes('/node_modules/three/') ? 'lens-three' : undefined),
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    exclude: ['**/node_modules/**', '**/e2e/**'],
  },
});
