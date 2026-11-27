import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const APP_VERSION = '1.6.8';
const APP_BUILD_ID = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);

function emitVersionJsonPlugin(version, buildId) {
    return {
        name: 'juanquest-version-json',
        generateBundle() {
            this.emitFile({
                type: 'asset',
                fileName: 'version.json',
                source: JSON.stringify({ version, build: buildId }),
            });
        },
    };
}

export default defineConfig({
    define: {
        __APP_VERSION__: JSON.stringify(APP_VERSION),
        __APP_BUILD_ID__: JSON.stringify(APP_BUILD_ID),
    },
    plugins: [
        react(),
        tailwindcss(),
        emitVersionJsonPlugin(APP_VERSION, APP_BUILD_ID),
        VitePWA({
            registerType: 'prompt',
            includeAssets: [
                'logo.svg',
                'apple-touch-icon.png',
                'pwa-192x192.png',
                'pwa-512x512.png',
                'draco/*.js',
                'draco/*.wasm',
                'models/*.glb',
                'audio/*.mp3',
                'audio/tutorial/*.mp3',
                'images/tutorial/*.png',
                'images/characters/*.png',
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
                globPatterns: ['**/*.{js,css,html,svg,png,wasm,glb,mp3}'],
                navigateFallback: '/index.html',
                navigateFallbackDenylist: [/^\/api\//, /^\/version\.json$/],
                runtimeCaching: [
                    {
                        urlPattern: /\/version\.json$/i,
                        handler: 'NetworkOnly',
                    },
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
                        urlPattern: /\/api\/v1\/media\/.*\.(?:png|jpe?g|webp|gif|svg)$/i,
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
    build: {
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (!id.includes('node_modules')) return undefined;
                    if (id.includes('three') || id.includes('@react-three')) return 'three-vendor';
                    if (id.includes('html5-qrcode') || id.includes('qrcode')) return 'qr-vendor';
                    if (id.includes('framer-motion')) return 'motion-vendor';
                    if (id.includes('react-dom') || id.includes('react-router')) return 'react-vendor';
                    return undefined;
                },
            },
        },
    },
    server: {
        port: 5173,
    },
});
