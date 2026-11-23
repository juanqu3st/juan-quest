// Lightweight Browser Cache API wrapper for per-map MP4 story videos & audio.
// Streams immediately on first visit while caching locally so reloads & offline play use 0 bandwidth.

export const VIDEO_CACHE_NAME = 'juanquest-story-videos-v2';

// Automatically purge outdated video cache buckets when upgraded videos ship
if (typeof window !== 'undefined' && 'caches' in window) {
    caches
        .keys()
        .then((keys) => {
            keys.forEach((k) => {
                if (k.startsWith('juanquest-story-videos-') && k !== VIDEO_CACHE_NAME) {
                    caches.delete(k).catch(() => {});
                }
            });
        })
        .catch(() => {});
}

export async function hasCachedVideo(rawUrl) {
    if (!rawUrl || typeof window === 'undefined' || !('caches' in window)) return false;
    try {
        const cache = await caches.open(VIDEO_CACHE_NAME);
        const match = await cache.match(rawUrl);
        return Boolean(match);
    } catch {
        return false;
    }
}

export async function resolveCachedVideoUrl(rawUrl) {
    if (!rawUrl || typeof window === 'undefined' || !('caches' in window)) {
        return { url: rawUrl, isObjectUrl: false, fromCache: false };
    }

    try {
        const cache = await caches.open(VIDEO_CACHE_NAME);
        const cached = await cache.match(rawUrl);
        if (cached) {
            const blob = await cached.blob();
            if (blob.size > 0) {
                return { url: URL.createObjectURL(blob), isObjectUrl: true, fromCache: true };
            }
        }

        // Only attempt network caching when online
        if (typeof navigator === 'undefined' || navigator.onLine !== false) {
            fetch(rawUrl, { mode: 'cors' })
                .then((res) => {
                    if (res.ok && res.status === 200) {
                        cache.put(rawUrl, res.clone()).catch(() => {});
                    }
                })
                .catch(() => {});
        }
    } catch {
        // Fallback smoothly to direct streaming URL
    }

    return { url: rawUrl, isObjectUrl: false, fromCache: false };
}
