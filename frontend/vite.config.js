import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: [
                'logo.svg',
                'apple-touch-icon.png',
                'pwa-192x192.png',
                'pwa-512x512.png',
                'draco/*.js',
                'draco/*.wasm',
                'models/*.glb',
            ],
            manifest: {
                name: 'JuanQuest: Si Juan Osong',
                short_name: 'JuanQuest',
                description: 'Interaktibong 3D E-SIM para sa Grade 7 Filipino — Kuwentong-Bayang Si Juan Osong',
                theme_color: '#C2410C',
                background_color: '#FAF8F5',
                display: 'standalone',
                start_url: '/login',
                scope: '/',
                lang: 'tl',
                icons: [
                    {
                        src: '/pwa-192x192.png',
                        sizes: '192x192',
                        type: 'image/png',
                        purpose: 'any maskable',
                    },
                    {
                        src: '/pwa-512x512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'any maskable',
                    },
                    {
                        src: '/logo.svg',
                        sizes: 'any',
                        type: 'image/svg+xml',
                        purpose: 'any',
                    },
                ],
            },
            workbox: {
                maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
                globPatterns: ['**/*.{js,css,html,svg,png,wasm,glb}'],
                navigateFallback: '/index.html',
                navigateFallbackDenylist: [/^\/api\//],
                runtimeCaching: [
                    {
                        urlPattern: /^https:\/\/res\.cloudinary\.com\/.*\/image\/upload\/.*/i,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'juanquest-offline-images-v1',
                            expiration: {
                                maxEntries: 120,
                                maxAgeSeconds: 60 * 60 * 24 * 60,
                            },
                            cacheableResponse: {
                                statuses: [0, 200],
                            },
                        },
                    },
                    {
                        urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
                        handler: 'StaleWhileRevalidate',
                        options: {
                            cacheName: 'juanquest-fonts-v1',
                            expiration: {
                                maxEntries: 30,
                                maxAgeSeconds: 60 * 60 * 24 * 365,
                            },
                        },
                    },
                ],
            },
        }),
    ],
    server: {
        port: 5173,
    },
});
